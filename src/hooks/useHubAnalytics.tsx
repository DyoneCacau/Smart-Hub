import { useQuery } from '@tanstack/react-query';
import { useClinic } from '@/hooks/useClinic';
import { AnalyticsService, HubService } from '@/services/smartHub';
import type { SmartHub } from '@/types/smartHub';

/**
 * Hook de analytics — estrutura pronta; agregações avançadas na próxima fase.
 */
export function useHubAnalytics(hub?: SmartHub | null) {
  const { clinicId } = useClinic();

  const metricsQuery = useQuery({
    queryKey: ['smart-hub-analytics-metrics', clinicId, hub?.id],
    queryFn: async () => {
      if (!clinicId || !hub) return null;
      return AnalyticsService.getDashboardMetrics(
        hub.id,
        clinicId,
        hub.status,
        HubService.getPublicUrl(hub.slug)
      );
    },
    enabled: !!clinicId && !!hub?.id,
  });

  const visitsQuery = useQuery({
    queryKey: ['smart-hub-visits', clinicId, hub?.id],
    queryFn: async () => {
      if (!clinicId || !hub) return { data: [], total: 0, page: 1, pageSize: 20 };
      return AnalyticsService.listVisits(hub.id, clinicId, { page: 1, pageSize: 20 });
    },
    enabled: !!clinicId && !!hub?.id,
  });

  const clicksQuery = useQuery({
    queryKey: ['smart-hub-clicks', clinicId, hub?.id],
    queryFn: async () => {
      if (!clinicId || !hub) return { data: [], total: 0, page: 1, pageSize: 20 };
      return AnalyticsService.listClicks(hub.id, clinicId, { page: 1, pageSize: 20 });
    },
    enabled: !!clinicId && !!hub?.id,
  });

  return {
    metrics: metricsQuery.data ?? null,
    visits: visitsQuery.data?.data ?? [],
    clicks: clicksQuery.data?.data ?? [],
    isLoading: metricsQuery.isLoading,
    isLoadingDetails: visitsQuery.isLoading || clicksQuery.isLoading,
  };
}
