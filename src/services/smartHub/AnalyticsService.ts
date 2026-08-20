import {
  analyticsRepository,
  domainRepository,
  templateRepository,
  pageRepository,
  hubRepository,
} from '@/repositories/smartHub';
import { supabase } from '@/integrations/supabase/client';
import type {
  ListQueryParams,
  PaginatedResult,
  SmartHubClick,
  SmartHubDashboardMetrics,
  SmartHubDomain,
  SmartHubEvent,
  SmartHubPage,
  SmartHubStatus,
  SmartHubTemplate,
  SmartHubVisit,
} from '@/types/smartHub';

async function resolveWorkspaceIdFromHub(hubId: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from('smart_hubs')
    .select('workspace_id,clinic_id')
    .eq('id', hubId)
    .maybeSingle();

  if (error) {
    // Ambientes em transição podem ainda não possuir workspace_id.
    const { data: legacy } = await (supabase as any)
      .from('smart_hubs')
      .select('clinic_id')
      .eq('id', hubId)
      .maybeSingle();
    return legacy?.clinic_id ?? null;
  }

  return data?.workspace_id ?? data?.clinic_id ?? null;
}

async function mirrorSmartHubEvent(
  hubId: string,
  eventName: 'smart_hub_visit' | 'click',
  payload: Record<string, unknown> = {},
  buttonId?: string | null,
) {
  try {
    const workspaceId = await resolveWorkspaceIdFromHub(hubId);
    if (!workspaceId) return;

    const read = (key: string) => {
      const value = payload[key];
      return typeof value === 'string' && value.trim() ? value : null;
    };

    await (supabase as any).from('funnel_events').insert({
      workspace_id: workspaceId,
      event_name: eventName,
      visitor_id: read('visitor_id'),
      session_id: read('session_id'),
      source: read('source') || read('utm_source') || 'smart_hub',
      medium: read('medium') || read('utm_medium'),
      campaign: read('campaign') || read('utm_campaign'),
      utm_source: read('utm_source'),
      utm_medium: read('utm_medium'),
      utm_campaign: read('utm_campaign'),
      utm_content: read('utm_content'),
      utm_term: read('utm_term'),
      properties: {
        ...payload,
        hub_id: hubId,
        ...(buttonId ? { button_id: buttonId } : {}),
      },
    });
  } catch (error) {
    // O tracking central nunca deve impedir a experiência pública do Smart Hub.
    console.warn('Unable to mirror Smart Hub event to funnel_events', error);
  }
}

export const AnalyticsService = {
  listVisits(
    hubId: string,
    clinicId: string,
    params?: Omit<ListQueryParams, 'clinicId'>
  ): Promise<PaginatedResult<SmartHubVisit>> {
    return analyticsRepository.listVisits(hubId, clinicId, params);
  },

  listClicks(
    hubId: string,
    clinicId: string,
    params?: Omit<ListQueryParams, 'clinicId'>
  ): Promise<PaginatedResult<SmartHubClick>> {
    return analyticsRepository.listClicks(hubId, clinicId, params);
  },

  listEvents(
    hubId: string,
    clinicId: string,
    params?: Omit<ListQueryParams, 'clinicId'>
  ): Promise<PaginatedResult<SmartHubEvent>> {
    return analyticsRepository.listEvents(hubId, clinicId, params);
  },

  getDashboardMetrics(
    hubId: string,
    clinicId: string,
    status: SmartHubStatus,
    publicUrl: string
  ): Promise<SmartHubDashboardMetrics> {
    return analyticsRepository.getDashboardMetrics(hubId, clinicId, status, publicUrl);
  },

  async trackVisit(hubId: string, payload: Record<string, unknown> = {}): Promise<string> {
    const result = await analyticsRepository.trackVisit(hubId, payload);
    void mirrorSmartHubEvent(hubId, 'smart_hub_visit', payload);
    return result;
  },

  async trackClick(
    hubId: string,
    buttonId: string | null,
    payload: Record<string, unknown> = {}
  ): Promise<string> {
    const result = await analyticsRepository.trackClick(hubId, buttonId, payload);
    void mirrorSmartHubEvent(hubId, 'click', payload, buttonId);
    return result;
  },
};

export const TemplateService = {
  list(): Promise<SmartHubTemplate[]> {
    return templateRepository.list();
  },

  async apply(hubId: string, templateId: string): Promise<{ ok: boolean }> {
    const raw = await hubRepository.applyTemplate(hubId, templateId);
    const data = (raw || {}) as { ok?: boolean };
    return { ok: Boolean(data.ok) };
  },
};

export const DomainService = {
  listByHub(hubId: string, clinicId: string): Promise<SmartHubDomain[]> {
    return domainRepository.listByHub(hubId, clinicId);
  },

  create(
    payload: Partial<SmartHubDomain> & {
      clinic_id: string;
      hub_id: string;
      domain: string;
    },
    userId?: string | null
  ): Promise<SmartHubDomain> {
    return domainRepository.create({
      ...payload,
      created_by: userId ?? null,
      updated_by: userId ?? null,
    });
  },

  softDelete(id: string, clinicId: string, userId?: string | null): Promise<void> {
    return domainRepository.softDelete(id, clinicId, userId);
  },
};

export const PageService = {
  listByHub(hubId: string, clinicId: string): Promise<SmartHubPage[]> {
    return pageRepository.listByHub(hubId, clinicId);
  },

  create(
    payload: Partial<SmartHubPage> & {
      clinic_id: string;
      hub_id: string;
      title: string;
    },
    userId?: string | null
  ): Promise<SmartHubPage> {
    return pageRepository.create({
      ...payload,
      created_by: userId ?? null,
      updated_by: userId ?? null,
    });
  },

  update(
    id: string,
    clinicId: string,
    payload: Partial<SmartHubPage>,
    userId?: string | null
  ): Promise<SmartHubPage> {
    return pageRepository.update(id, clinicId, {
      ...payload,
      updated_by: userId ?? null,
    });
  },
};
