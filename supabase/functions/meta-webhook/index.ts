import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') || 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) {
    difference |= (left[index] || 0) ^ (right[index] || 0)
  }
  return difference === 0
}

async function hasValidMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  const match = signatureHeader?.match(/^sha256=([a-f0-9]{64})$/i)
  if (!match) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const digest = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  )
  return constantTimeEqual(digest, hexToBytes(match[1]))
}

interface FlowNode {
  id: string
  type: 'message' | 'menu' | 'handoff' | 'condition'
  text?: string
  options?: { id: string; label: string; next_node_id?: string }[]
  next_node_id?: string
}

interface FlowDefinition {
  version: number
  nodes: FlowNode[]
  edges: { id: string; from: string; to: string }[]
}

function getNextNodeId(definition: FlowDefinition, currentId: string): string | null {
  const edge = definition.edges.find((e) => e.from === currentId)
  if (edge) return edge.to
  const node = definition.nodes.find((n) => n.id === currentId)
  return node?.next_node_id || null
}

async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  body: string
): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  })
  const json = await res.json()
  if (!res.ok) {
    console.error('Meta send error', { status: res.status })
    return null
  }
  return json.messages?.[0]?.id || null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') || ''
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const appSecret = Deno.env.get('META_APP_SECRET')
    if (!appSecret) {
      console.error('[SECURITY] META_APP_SECRET is not configured')
      return new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawBody = await req.text()
    const signatureIsValid = await hasValidMetaSignature(
      rawBody,
      req.headers.get('x-hub-signature-256'),
      appSecret
    )
    if (!signatureIsValid) {
      console.warn('[SECURITY] Invalid Meta webhook signature')
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const payload = JSON.parse(rawBody)
    if (payload.object !== 'whatsapp_business_account') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value
        if (!value?.messages?.length) continue

        const phoneNumberId = value.metadata?.phone_number_id
        if (!phoneNumberId) continue

        const { data: channel } = await supabase
          .from('chat_channels')
          .select('*')
          .eq('phone_number_id', phoneNumberId)
          .eq('status', 'active')
          .maybeSingle()

        if (!channel?.access_token) {
          console.warn('Canal não encontrado ou sem token:', phoneNumberId)
          continue
        }

        for (const msg of value.messages) {
          if (msg.type !== 'text' || !msg.text?.body) continue

          const contactPhone = msg.from
          const contactName = value.contacts?.[0]?.profile?.name || null
          const body = msg.text.body.trim()

          let { data: conversation } = await supabase
            .from('chat_conversations')
            .select('*')
            .eq('channel_id', channel.id)
            .eq('external_contact_id', contactPhone)
            .maybeSingle()

          if (!conversation) {
            const { data: created } = await supabase
              .from('chat_conversations')
              .insert({
                clinic_id: channel.clinic_id,
                channel_id: channel.id,
                external_contact_id: contactPhone,
                contact_phone: contactPhone,
                contact_name: contactName,
                status: 'pending',
                last_message_preview: body.slice(0, 120),
                unread_count: 1,
              })
              .select('*')
              .single()
            conversation = created
          } else {
            await supabase
              .from('chat_conversations')
              .update({
                contact_name: contactName || conversation.contact_name,
                last_message_at: new Date().toISOString(),
                last_message_preview: body.slice(0, 120),
                unread_count: (conversation.unread_count || 0) + 1,
                status: conversation.status === 'closed' ? 'pending' : conversation.status,
                updated_at: new Date().toISOString(),
              })
              .eq('id', conversation.id)
          }

          if (!conversation) continue

          await supabase.from('chat_messages').insert({
            conversation_id: conversation.id,
            clinic_id: channel.clinic_id,
            direction: 'inbound',
            body,
            message_type: 'text',
            external_id: msg.id,
            status: 'received',
          })

          if (['waiting_human', 'open'].includes(conversation.status) && conversation.assigned_to) {
            continue
          }

          const { data: activeFlow } = await supabase
            .from('chat_flows')
            .select('*')
            .eq('clinic_id', channel.clinic_id)
            .eq('is_active', true)
            .order('is_default', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!activeFlow?.definition) continue

          const definition = activeFlow.definition as FlowDefinition

          const { data: session } = await supabase
            .from('chat_flow_sessions')
            .select('*')
            .eq('conversation_id', conversation.id)
            .eq('is_active', true)
            .maybeSingle()

          if (!session) {
            const startNode = definition.nodes[0]
            if (!startNode) continue

            await supabase.from('chat_flow_sessions').insert({
              conversation_id: conversation.id,
              flow_id: activeFlow.id,
              current_node_id: startNode.id,
              is_active: true,
            })

            if (startNode.text) {
              const extId = await sendWhatsAppText(
                channel.phone_number_id!,
                channel.access_token,
                contactPhone,
                startNode.text
              )
              await supabase.from('chat_messages').insert({
                conversation_id: conversation.id,
                clinic_id: channel.clinic_id,
                direction: 'outbound',
                body: startNode.text,
                message_type: 'text',
                external_id: extId,
                status: extId ? 'sent' : 'failed',
              })
            }

            const nextId = getNextNodeId(definition, startNode.id)
            if (nextId) {
              const nextNode = definition.nodes.find((n) => n.id === nextId)
              if (nextNode?.type === 'menu' && nextNode.text) {
                const menuText =
                  nextNode.text +
                  '\n\n' +
                  (nextNode.options?.map((o, i) => `${i + 1}. ${o.label}`).join('\n') || '')
                const extId = await sendWhatsAppText(
                  channel.phone_number_id!,
                  channel.access_token,
                  contactPhone,
                  menuText
                )
                await supabase.from('chat_messages').insert({
                  conversation_id: conversation.id,
                  clinic_id: channel.clinic_id,
                  direction: 'outbound',
                  body: menuText,
                  message_type: 'text',
                  external_id: extId,
                  status: extId ? 'sent' : 'failed',
                })
                await supabase
                  .from('chat_flow_sessions')
                  .update({ current_node_id: nextId, updated_at: new Date().toISOString() })
                  .eq('conversation_id', conversation.id)
                  .eq('is_active', true)
              }
            }
            continue
          }

          const currentNode = definition.nodes.find((n) => n.id === session.current_node_id)
          if (currentNode?.type === 'menu' && currentNode.options?.length) {
            const choiceIndex = parseInt(body, 10) - 1
            const matched =
              currentNode.options[choiceIndex] ||
              currentNode.options.find(
                (o) => o.label.toLowerCase() === body.toLowerCase() || o.id === body
              )

            const targetId = matched?.next_node_id || 'handoff'
            const targetNode = definition.nodes.find((n) => n.id === targetId)

            if (targetNode?.type === 'handoff') {
              const handoffText =
                targetNode.text || 'Transferindo você para um atendente. Aguarde um momento.'
              await sendWhatsAppText(
                channel.phone_number_id!,
                channel.access_token,
                contactPhone,
                handoffText
              )
              await supabase.from('chat_messages').insert({
                conversation_id: conversation.id,
                clinic_id: channel.clinic_id,
                direction: 'system',
                body: handoffText,
                message_type: 'system',
                status: 'sent',
              })
              await supabase
                .from('chat_conversations')
                .update({ status: 'waiting_human', updated_at: new Date().toISOString() })
                .eq('id', conversation.id)
              await supabase
                .from('chat_flow_sessions')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', session.id)
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('meta-webhook error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
