import {
  analyticsRepository,
  domainRepository,
  templateRepository,
  pageRepository,
  hubRepository,
} from '@/repositories/smartHub';
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

  trackVisit(hubId: string, payload?: Record<string, unknown>): Promise<string> {
    return analyticsRepository.trackVisit(hubId, payload);
  },

  trackClick(
    hubId: string,
    buttonId: string | null,
    payload?: Record<string, unknown>
  ): Promise<string> {
    return analyticsRepository.trackClick(hubId, buttonId, payload);
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
