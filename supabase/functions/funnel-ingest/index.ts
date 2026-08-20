import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const ingestKey = req.headers.get('x-ingest-key')?.trim();
    if (!ingestKey) return json({ error: 'missing_ingest_key' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'server_not_configured' }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const keyHash = await sha256(ingestKey);
    const { data: keyRow, error: keyError } = await admin
      .from('workspace_ingest_keys')
      .select('id,workspace_id,is_active')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .is('revoked_at', null)
      .maybeSingle();

    if (keyError) throw keyError;
    if (!keyRow) return json({ error: 'invalid_ingest_key' }, 401);

    const payload = await req.json().catch(() => ({}));
    const source = typeof payload.source === 'string' ? payload.source : 'api';
    const medium = typeof payload.medium === 'string' ? payload.medium : null;
    const campaign = typeof payload.campaign === 'string' ? payload.campaign : null;

    const { data: lead, error: leadError } = await admin.rpc('ingest_lead', {
      p_workspace_id: keyRow.workspace_id,
      p_name: payload.name ?? null,
      p_phone: payload.phone ?? null,
      p_email: payload.email ?? null,
      p_source: source,
      p_medium: medium,
      p_campaign: campaign,
      p_utm_source: payload.utm_source ?? null,
      p_utm_medium: payload.utm_medium ?? null,
      p_utm_campaign: payload.utm_campaign ?? null,
      p_utm_content: payload.utm_content ?? null,
      p_utm_term: payload.utm_term ?? null,
      p_integration_id: payload.integration_id ?? null,
      p_external_lead_id: payload.external_lead_id ?? null,
      p_visitor_id: payload.visitor_id ?? null,
      p_metadata: {
        ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
        ingest_key_id: keyRow.id,
      },
    });

    if (leadError) throw leadError;

    await admin
      .from('workspace_ingest_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRow.id);

    await admin.from('funnel_events').insert({
      workspace_id: keyRow.workspace_id,
      event_name: 'integration_received',
      lead_id: lead?.id ?? null,
      visitor_id: payload.visitor_id ?? null,
      source,
      medium,
      campaign,
      utm_source: payload.utm_source ?? null,
      utm_medium: payload.utm_medium ?? null,
      utm_campaign: payload.utm_campaign ?? null,
      utm_content: payload.utm_content ?? null,
      utm_term: payload.utm_term ?? null,
      properties: {
        endpoint: 'funnel-ingest',
        external_lead_id: payload.external_lead_id ?? null,
      },
    });

    return json({ ok: true, lead });
  } catch (error) {
    console.error(error);
    return json({ error: 'ingestion_failed' }, 500);
  }
});
