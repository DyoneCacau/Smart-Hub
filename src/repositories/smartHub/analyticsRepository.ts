import { supabase } from '@/integrations/supabase/client';
import type {
  ListQueryParams,
  PaginatedResult,
  SmartHubClick,
  SmartHubDashboardMetrics,
  SmartHubEvent,
  SmartHubStatus,
  SmartHubVisit,
} from '@/types/smartHub';
import { paginateRange } from './base';

export const analyticsRepository = {
  async listVisits(
    hubId: string,
    clinicId: string,
    params: Omit<ListQueryParams, 'clinicId'> = {}
  ): Promise<PaginatedResult<SmartHubVisit>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    const { from, to } = paginateRange(page, pageSize);

    const { data, error, count } = await supabase
      .from('smart_hub_visits')
      .select('*', { count: 'exact' })
      .eq('hub_id', hubId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order(params.orderBy ?? 'created_at', { ascending: params.ascending ?? false })
      .range(from, to);

    if (error) throw error;

    return {
      data: (data || []) as SmartHubVisit[],
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async listClicks(
    hubId: string,
    clinicId: string,
    params: Omit<ListQueryParams, 'clinicId'> = {}
  ): Promise<PaginatedResult<SmartHubClick>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    const { from, to } = paginateRange(page, pageSize);

    const { data, error, count } = await supabase
      .from('smart_hub_clicks')
      .select('*', { count: 'exact' })
      .eq('hub_id', hubId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order(params.orderBy ?? 'created_at', { ascending: params.ascending ?? false })
      .range(from, to);

    if (error) throw error;

    return {
      data: (data || []) as SmartHubClick[],
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async listEvents(
    hubId: string,
    clinicId: string,
    params: Omit<ListQueryParams, 'clinicId'> = {}
  ): Promise<PaginatedResult<SmartHubEvent>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    const { from, to } = paginateRange(page, pageSize);

    let query = supabase
      .from('smart_hub_events')
      .select('*', { count: 'exact' })
      .eq('hub_id', hubId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null);

    if (params.search) {
      query = query.or(`event_type.ilike.%${params.search}%,event_name.ilike.%${params.search}%`);
    }

    const { data, error, count } = await query
      .order(params.orderBy ?? 'created_at', { ascending: params.ascending ?? false })
      .range(from, to);

    if (error) throw error;

    return {
      data: (data || []) as SmartHubEvent[],
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async getDashboardMetrics(
    hubId: string,
    clinicId: string,
    status: SmartHubStatus,
    publicUrl: string
  ): Promise<SmartHubDashboardMetrics> {
    const [visitsRes, visitsSampleRes, clicksRes, eventsRes, buttonsRes] = await Promise.all([
      supabase
        .from('smart_hub_visits')
        .select('id', { count: 'exact', head: true })
        .eq('hub_id', hubId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null),
      supabase
        .from('smart_hub_visits')
        .select('created_at, device_type, referrer, utm_source, utm_campaign')
        .eq('hub_id', hubId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('smart_hub_clicks')
        .select('button_id, target_url, metadata')
        .eq('hub_id', hubId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('smart_hub_events')
        .select('event_type')
        .eq('hub_id', hubId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .in('event_type', ['form_submitted', 'form_duplicate', 'booking_confirmed'])
        .limit(5000),
      supabase.from('smart_hub_buttons').select('id, title').eq('hub_id', hubId),
    ]);

    if (visitsRes.error) throw visitsRes.error;
    if (clicksRes.error) throw clicksRes.error;
    if (eventsRes.error) throw eventsRes.error;

    const visitRows = (visitsSampleRes.data || []) as Array<{
      created_at: string;
      device_type: string | null;
      referrer: string | null;
      utm_source: string | null;
      utm_campaign: string | null;
    }>;
    // Etapas do assistente de agendamento também são gravadas como cliques (booking:*);
    // apenas booking_started corresponde a um clique real no botão.
    const clickRows = (
      (clicksRes.data || []) as Array<{
        button_id: string | null;
        target_url: string | null;
        metadata: Record<string, unknown> | null;
      }>
    ).filter(
      (c) => !c.target_url?.startsWith('booking:') || c.target_url === 'booking:booking_started'
    );
    const eventTypes = ((eventsRes.data || []) as Array<{ event_type: string }>).map(
      (e) => e.event_type
    );
    const buttonTitles = new Map(
      ((buttonsRes.data || []) as Array<{ id: string; title: string }>).map(
        (b) => [b.id, b.title] as const
      )
    );

    const views = visitsRes.count ?? 0;
    const clicks = clickRows.length;
    const ctr = views > 0 ? Number(((clicks / views) * 100).toFixed(2)) : 0;

    const formsSubmitted = eventTypes.filter((t) => t === 'form_submitted').length;
    const formsDuplicate = eventTypes.filter((t) => t === 'form_duplicate').length;
    const appointments = eventTypes.filter((t) => t === 'booking_confirmed').length;
    const formsOpened = clickRows.filter((c) => c.target_url === 'form:open').length;
    const conversions = formsSubmitted + formsDuplicate + appointments;

    const whatsappClicks = clickRows.filter(
      (c) =>
        c.metadata?.click_action === 'whatsapp' ||
        c.metadata?.button_type === 'whatsapp' ||
        (c.target_url && /wa\.me|whatsapp/i.test(c.target_url))
    ).length;

    const mode = (values: Array<string | null | undefined>) => {
      const map = new Map<string, number>();
      for (const v of values) {
        if (!v) continue;
        map.set(v, (map.get(v) || 0) + 1);
      }
      let best: string | null = null;
      let n = 0;
      for (const [k, c] of map) {
        if (c > n) {
          n = c;
          best = k;
        }
      }
      return best;
    };

    const topButton = mode(
      clickRows.map((c) => {
        const title = c.metadata?.button_title;
        if (typeof title === 'string' && title) return title;
        if (c.button_id && buttonTitles.has(c.button_id)) return buttonTitles.get(c.button_id);
        return c.target_url === 'booking:booking_started' ? 'Agendamento online' : c.target_url;
      })
    );

    return {
      publicUrl,
      status,
      online: status === 'published',
      views,
      clicks,
      leads: formsSubmitted,
      appointments,
      conversions,
      ctr,
      topButton,
      mainOrigin: mode(visitRows.map((v) => v.utm_source || v.referrer || 'Direto')),
      mainDevice: mode(visitRows.map((v) => v.device_type)),
      mainCampaign: mode(visitRows.map((v) => v.utm_campaign)),
      lastVisitAt: visitRows[0]?.created_at ?? null,
      whatsappClicks,
      formsOpened,
      formsSubmitted,
      leadsUpdated: formsDuplicate,
      submitRate: formsOpened > 0 ? Number(((formsSubmitted / formsOpened) * 100).toFixed(1)) : 0,
      conversionRate: views > 0 ? Number(((conversions / views) * 100).toFixed(1)) : 0,
    };
  },

  async trackVisit(hubId: string, payload: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await supabase.rpc('track_smart_hub_visit' as never, {
      p_hub_id: hubId,
      p_payload: payload,
    } as never);
    if (error) throw error;
    return data as string;
  },

  async trackClick(
    hubId: string,
    buttonId: string | null,
    payload: Record<string, unknown> = {}
  ): Promise<string> {
    const { data, error } = await supabase.rpc('track_smart_hub_click' as never, {
      p_hub_id: hubId,
      p_button_id: buttonId,
      p_payload: payload,
    } as never);
    if (error) throw error;
    return data as string;
  },
};
