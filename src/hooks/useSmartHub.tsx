import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useClinic } from '@/hooks/useClinic';
import {
  HubService,
  ThemeService,
  PageService,
  TemplateService,
  DomainService,
  ButtonService,
} from '@/services/smartHub';
import type {
  PublicSmartHubPayload,
  SmartHubUpdate,
  SmartHubValidationResult,
} from '@/types/smartHub';

function invalidateSmartHubQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  clinicId: string | null | undefined,
  hubId?: string | null,
  _slug?: string | null
) {
  if (clinicId) {
    queryClient.invalidateQueries({ queryKey: ['smart-hub', clinicId] });
    queryClient.invalidateQueries({ queryKey: ['smart-hub-pages', clinicId] });
    queryClient.invalidateQueries({ queryKey: ['smart-hub-theme', clinicId] });
    queryClient.invalidateQueries({ queryKey: ['smart-hub-analytics-metrics', clinicId] });
    queryClient.invalidateQueries({ queryKey: ['smart-hub-buttons', clinicId] });
    queryClient.invalidateQueries({ queryKey: ['smart-hub-visits', clinicId] });
    queryClient.invalidateQueries({ queryKey: ['smart-hub-clicks', clinicId] });
  }
  if (hubId) {
    queryClient.invalidateQueries({ queryKey: ['smart-hub-preview', hubId] });
  }
  queryClient.invalidateQueries({ queryKey: ['public-smart-hub'] });
}

export function useSmartHub() {
  const { clinicId } = useClinic();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lastValidation, setLastValidation] = useState<SmartHubValidationResult | null>(null);

  const hubQuery = useQuery({
    queryKey: ['smart-hub', clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      return HubService.getByClinicId(clinicId);
    },
    enabled: !!clinicId,
  });

  const pagesQuery = useQuery({
    queryKey: ['smart-hub-pages', clinicId, hubQuery.data?.id],
    queryFn: async () => {
      if (!clinicId || !hubQuery.data?.id) return [];
      return PageService.listByHub(hubQuery.data.id, clinicId);
    },
    enabled: !!clinicId && !!hubQuery.data?.id,
  });

  const themeQuery = useQuery({
    queryKey: ['smart-hub-theme', clinicId, hubQuery.data?.id],
    queryFn: async () => {
      if (!clinicId || !hubQuery.data?.id) return null;
      return ThemeService.getByHubId(hubQuery.data.id, clinicId);
    },
    enabled: !!clinicId && !!hubQuery.data?.id,
  });

  const templatesQuery = useQuery({
    queryKey: ['smart-hub-templates'],
    queryFn: () => TemplateService.list(),
  });

  const domainsQuery = useQuery({
    queryKey: ['smart-hub-domains', clinicId, hubQuery.data?.id],
    queryFn: async () => {
      if (!clinicId || !hubQuery.data?.id) return [];
      return DomainService.listByHub(hubQuery.data.id, clinicId);
    },
    enabled: !!clinicId && !!hubQuery.data?.id,
  });

  const invalidateHub = () => {
    invalidateSmartHubQueries(
      queryClient,
      clinicId,
      hubQuery.data?.id,
      hubQuery.data?.slug
    );
  };

  const createHub = useMutation({
    mutationFn: async (input: { title: string; slug?: string }) => {
      if (!clinicId) throw new Error('Selecione uma clínica.');
      return HubService.create(clinicId, { ...input, userId: user?.id });
    },
    onSuccess: () => {
      invalidateHub();
      toast.success('Smart Hub criado com sucesso.');
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao criar Smart Hub.'),
  });

  const updateHub = useMutation({
    mutationFn: async (payload: SmartHubUpdate) => {
      if (!clinicId || !hubQuery.data?.id) throw new Error('Hub não encontrado.');
      return HubService.update(hubQuery.data.id, clinicId, payload, user?.id);
    },
    onSuccess: () => {
      invalidateHub();
      if (hubQuery.data?.status === 'published') {
        toast.success('Alterações salvas e atualizadas na página pública.');
      } else {
        toast.success('Alterações salvas na prévia.');
      }
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao atualizar Smart Hub.'),
  });

  const checkSlug = useMutation({
    mutationFn: async (slug: string) => {
      return HubService.isSlugAvailable(slug, hubQuery.data?.id);
    },
  });

  const validateHub = useMutation({
    mutationFn: async (): Promise<SmartHubValidationResult> => {
      if (!hubQuery.data?.id) throw new Error('Hub não encontrado.');
      return HubService.validateForPublish(hubQuery.data.id);
    },
    onSuccess: (result) => {
      setLastValidation(result);
      invalidateHub();
      if (result.ok) {
        toast.success('Smart Hub validado e pronto para publicação.');
      } else {
        const first = result.errors[0]?.message || 'Corrija as pendências antes de publicar.';
        toast.error(first);
      }
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Erro ao validar Smart Hub.';
      toast.error(message || 'Erro ao validar Smart Hub.');
      setLastValidation({
        ok: false,
        errors: [{ code: 'rpc_error', message: message || 'Erro ao validar.' }],
        warnings: [],
      });
    },
  });

  const publishHub = useMutation({
    mutationFn: async () => {
      if (!hubQuery.data?.id) throw new Error('Hub não encontrado.');
      return HubService.publish(hubQuery.data.id);
    },
    onSuccess: (result) => {
      if (result.validation) setLastValidation(result.validation);
      invalidateHub();
      if (result.ok) toast.success('Smart Hub publicado.');
      else toast.error(result.validation?.errors[0]?.message || 'Não foi possível publicar.');
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao publicar.'),
  });

  const pauseHub = useMutation({
    mutationFn: async () => {
      if (!hubQuery.data?.id) throw new Error('Hub não encontrado.');
      return HubService.pause(hubQuery.data.id);
    },
    onSuccess: () => {
      invalidateHub();
      toast.success('Smart Hub pausado (offline).');
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao pausar.'),
  });

  const revertToDraft = useMutation({
    mutationFn: async () => {
      if (!hubQuery.data?.id) throw new Error('Hub não encontrado.');
      return HubService.revertToDraft(hubQuery.data.id);
    },
    onSuccess: () => {
      setLastValidation(null);
      invalidateHub();
      toast.success('Hub voltou para rascunho.');
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao reverter.'),
  });

  const applyTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      if (!hubQuery.data?.id) throw new Error('Hub não encontrado.');
      return TemplateService.apply(hubQuery.data.id, templateId);
    },
    onSuccess: () => {
      setLastValidation(null);
      invalidateHub();
      toast.success('Template aplicado.');
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao aplicar template.'),
  });

  return {
    clinicId,
    hub: hubQuery.data ?? null,
    pages: pagesQuery.data ?? [],
    theme: themeQuery.data ?? null,
    templates: templatesQuery.data ?? [],
    domains: domainsQuery.data ?? [],
    isLoading: hubQuery.isLoading,
    isLoadingPages: pagesQuery.isLoading,
    publicUrl: hubQuery.data ? HubService.getPublicUrl(hubQuery.data.slug) : null,
    lastValidation,
    createHub,
    updateHub,
    checkSlug,
    validateHub,
    publishHub,
    pauseHub,
    revertToDraft,
    applyTemplate,
    refetch: hubQuery.refetch,
  };
}

export function usePublicSmartHub(slug: string | undefined) {
  return useQuery({
    queryKey: ['public-smart-hub', slug],
    queryFn: async () => {
      if (!slug) return null;
      return HubService.getPublicBySlug(slug);
    },
    enabled: !!slug,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Prévia administrativa: tenta RPC get_preview_smart_hub;
 * se falhar, monta payload autenticado (hub + theme + botões) para rascunho.
 */
export function usePreviewSmartHub(hubId: string | undefined) {
  const { clinicId } = useClinic();

  return useQuery({
    queryKey: ['smart-hub-preview', hubId, clinicId],
    queryFn: async (): Promise<PublicSmartHubPayload | null> => {
      if (!hubId || !clinicId) return null;

      try {
        const fromRpc = await HubService.getPreviewById(hubId);
        if (fromRpc?.hub) {
          if (import.meta.env.DEV) {
            console.debug('[smart-hub preview]', {
              source: 'rpc',
              buttons: fromRpc.buttons?.length ?? 0,
              status: fromRpc.hub.status,
            });
          }
          return fromRpc;
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.debug('[smart-hub preview] RPC falhou, usando fallback autenticado', err);
        }
      }

      const [hub, theme, buttonsPage] = await Promise.all([
        HubService.getById(hubId, clinicId),
        ThemeService.getByHubId(hubId, clinicId),
        ButtonService.listByHub(hubId, clinicId, { page: 1, pageSize: 100 }),
      ]);

      if (!hub) return null;

      const buttons = (buttonsPage.data || []).filter(
        (b) => b.visible && b.status === 'active' && !b.deleted_at
      );

      if (import.meta.env.DEV) {
        console.debug('[smart-hub preview]', {
          source: 'fallback',
          buttons: buttons.length,
          status: hub.status,
        });
      }

      return {
        hub,
        theme,
        buttons,
        page: null,
        assets: [],
        preview: true,
      };
    },
    enabled: !!hubId && !!clinicId,
    staleTime: 5_000,
  });
}
