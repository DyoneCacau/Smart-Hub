import { supabase } from '@/integrations/supabase/client';

export type FunnelEventName =
  | 'page_view'
  | 'smart_hub_visit'
  | 'click'
  | 'form_view'
  | 'form_started'
  | 'form_submitted'
  | 'lead_created'
  | 'lead_updated'
  | 'booking_started'
  | 'booking_completed'
  | 'whatsapp_clicked'
  | 'checkout_started'
  | 'purchase'
  | 'crm_stage_changed'
  | 'integration_received'
  | 'integration_sent';

export interface TrackFunnelEventInput {
  workspaceId: string;
  event: FunnelEventName;
  visitorId?: string | null;
  sessionId?: string | null;
  leadId?: string | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  properties?: Record<string, unknown>;
}

export async function trackFunnelEvent(input: TrackFunnelEventInput) {
  const payload = {
    workspace_id: input.workspaceId,
    event_name: input.event,
    visitor_id: input.visitorId ?? null,
    session_id: input.sessionId ?? null,
    lead_id: input.leadId ?? null,
    source: input.source ?? null,
    medium: input.medium ?? null,
    campaign: input.campaign ?? null,
    utm_source: input.utmSource ?? null,
    utm_medium: input.utmMedium ?? null,
    utm_campaign: input.utmCampaign ?? null,
    utm_content: input.utmContent ?? null,
    utm_term: input.utmTerm ?? null,
    properties: input.properties ?? {},
  };

  const { error } = await (supabase as any).from('funnel_events').insert(payload);
  if (error) throw error;
}

export function createAnonymousTrackingIds() {
  return {
    visitorId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
  };
}
