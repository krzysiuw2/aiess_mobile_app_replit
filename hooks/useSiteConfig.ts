import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useDevices } from '@/contexts/DeviceContext';
import { getSiteConfig, updateSiteConfig } from '@/lib/aws-site-config';
import type { SiteConfig } from '@/types';

export function useSiteConfig() {
  const { selectedDevice } = useDevices();
  const queryClient = useQueryClient();
  const siteId = selectedDevice?.device_id ?? null;

  const configQuery = useQuery({
    queryKey: ['siteConfig', siteId],
    queryFn: async () => {
      if (!siteId) return null;
      return getSiteConfig(siteId);
    },
    enabled: !!siteId,
    staleTime: 1000 * 60 * 2,
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<SiteConfig>) => {
      if (!siteId) throw new Error('No site selected');
      await updateSiteConfig(siteId, patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siteConfig', siteId] });
    },
  });

  const updateConfig = useCallback(
    (patch: Partial<SiteConfig>) => updateMutation.mutateAsync(patch),
    [updateMutation]
  );

  const siteConfig = configQuery.data ?? null;

  const siteConfigComplete =
    !!siteConfig?.general?.description?.trim() &&
    siteConfig?.power_limits?.max_charge_kw !== undefined &&
    siteConfig?.power_limits?.max_discharge_kw !== undefined;

  return {
    siteConfig,
    siteConfigComplete,
    isLoading: configQuery.isLoading,
    isError: configQuery.isError,
    error: configQuery.error,
    updateConfig,
    isUpdating: updateMutation.isPending,
    refetch: configQuery.refetch,
  };
}
