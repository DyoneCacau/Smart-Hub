import { hubRepository, pageRepository, themeRepository } from '@/repositories/smartHub';
import type {
  ListQueryParams,
  PaginatedResult,
  PublicSmartHubPayload,
  SmartHub,
  SmartHubInsert,
  SmartHubPublishResult,
  SmartHubUpdate,
  SmartHubValidationResult,
} from '@/types/smartHub';
import {
  buildPublicHubUrl,
  generateSlugFromTitle,
  normalizeSlug,
  validateSlug,
} from './slugUtils';

function asValidationResult(raw: unknown): SmartHubValidationResult {
  // PostgREST pode devolver JSON já parseado ou string
  const parsed =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return {};
          }
        })()
      : ((raw || {}) as Record<string, unknown>);

  const errorsRaw = parsed.errors;
  const warningsRaw = parsed.warnings;

  const normalizeIssues = (value: unknown): SmartHubValidationResult['errors'] => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      if (typeof item === 'string') return { code: 'custom', message: item };
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        return {
          code: String(obj.code || 'custom'),
          message: String(obj.message || obj.msg || JSON.stringify(item)),
        };
      }
      return { code: 'custom', message: String(item) };
    });
  };

  // Aceita tanto `ok` quanto `valid` (compat)
  const ok =
    typeof parsed.ok === 'boolean'
      ? parsed.ok
      : typeof parsed.valid === 'boolean'
        ? parsed.valid
        : false;

  return {
    ok,
    errors: normalizeIssues(errorsRaw),
    warnings: normalizeIssues(warningsRaw),
    visible_buttons:
      typeof parsed.visible_buttons === 'number' ? parsed.visible_buttons : undefined,
  };
}

function asPublishResult(raw: unknown): SmartHubPublishResult {
  const data = (raw || {}) as Record<string, unknown>;
  return {
    ok: Boolean(data.ok),
    status: String(data.status || 'draft'),
    validation: data.validation ? asValidationResult(data.validation) : undefined,
  };
}

export const HubService = {
  list(params: ListQueryParams): Promise<PaginatedResult<SmartHub>> {
    return hubRepository.list(params);
  },

  getByClinicId(clinicId: string): Promise<SmartHub | null> {
    return hubRepository.getByClinicId(clinicId);
  },

  getById(id: string, clinicId: string): Promise<SmartHub | null> {
    return hubRepository.getById(id, clinicId);
  },

  getPublicBySlug(slug: string): Promise<PublicSmartHubPayload | null> {
    return hubRepository.getPublicBySlug(normalizeSlug(slug));
  },

  getPreviewById(hubId: string): Promise<PublicSmartHubPayload | null> {
    return hubRepository.getPreviewById(hubId);
  },

  async isSlugAvailable(slug: string, excludeHubId?: string | null): Promise<boolean> {
    const check = validateSlug(slug);
    if (!check.valid) return false;
    return hubRepository.isSlugAvailable(normalizeSlug(slug), excludeHubId);
  },

  async create(
    clinicId: string,
    input: { title: string; slug?: string; userId?: string | null }
  ): Promise<SmartHub> {
    const rawSlug = input.slug?.trim() ? input.slug : generateSlugFromTitle(input.title);
    const slugCheck = validateSlug(rawSlug);
    if (!slugCheck.valid) {
      throw new Error(slugCheck.error);
    }

    const slug = normalizeSlug(rawSlug);
    const available = await hubRepository.isSlugAvailable(slug);
    if (!available) {
      throw new Error('Este slug já está em uso. Escolha outro.');
    }

    const hub = await hubRepository.create({
      clinic_id: clinicId,
      title: input.title,
      slug,
      status: 'draft',
      layout_blocks: ['banner', 'header', 'logo', 'description', 'buttons', 'footer'],
      validation_errors: [],
      style_preset: 'clean',
      visual_config: {},
      capture_config: {},
      created_by: input.userId ?? null,
      updated_by: input.userId ?? null,
    } as SmartHubInsert);

    await Promise.all([
      pageRepository.create({
        clinic_id: clinicId,
        hub_id: hub.id,
        title: 'Página principal',
        slug: 'home',
        is_home: true,
        status: 'draft',
        created_by: input.userId ?? null,
        updated_by: input.userId ?? null,
      }),
      themeRepository.upsert(
        clinicId,
        hub.id,
        {
          theme_name: 'default',
          primary_color: hub.primary_color,
          secondary_color: hub.secondary_color,
          font_family: hub.font_family,
        },
        input.userId
      ),
    ]);

    return hub;
  },

  async update(
    id: string,
    clinicId: string,
    payload: SmartHubUpdate,
    userId?: string | null
  ): Promise<SmartHub> {
    const next: SmartHubUpdate = {
      ...payload,
      updated_by: userId ?? payload.updated_by ?? null,
    };

    if (payload.slug) {
      const slugCheck = validateSlug(payload.slug);
      if (!slugCheck.valid) {
        throw new Error(slugCheck.error);
      }
      const slug = normalizeSlug(payload.slug);
      const available = await hubRepository.isSlugAvailable(slug, id);
      if (!available) {
        throw new Error('Este slug já está em uso. Escolha outro.');
      }
      next.slug = slug;
    }

    return hubRepository.update(id, clinicId, next);
  },

  softDelete(id: string, clinicId: string, userId?: string | null): Promise<void> {
    return hubRepository.softDelete(id, clinicId, userId);
  },

  getPublicUrl(slug: string): string {
    return buildPublicHubUrl(slug);
  },

  async validateForPublish(hubId: string): Promise<SmartHubValidationResult> {
    const raw = await hubRepository.validateForPublish(hubId);
    return asValidationResult(raw);
  },

  async publish(hubId: string): Promise<SmartHubPublishResult> {
    const raw = await hubRepository.publish(hubId);
    return asPublishResult(raw);
  },

  async pause(hubId: string): Promise<SmartHubPublishResult> {
    const raw = await hubRepository.pause(hubId);
    return asPublishResult(raw);
  },

  async revertToDraft(hubId: string): Promise<SmartHubPublishResult> {
    const raw = await hubRepository.revertToDraft(hubId);
    return asPublishResult(raw);
  },

  async applyTemplate(hubId: string, templateId: string): Promise<{ ok: boolean }> {
    const raw = await hubRepository.applyTemplate(hubId, templateId);
    const data = (raw || {}) as { ok?: boolean };
    return { ok: Boolean(data.ok) };
  },
};
