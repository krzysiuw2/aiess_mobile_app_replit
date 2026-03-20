import { useQuery } from '@tanstack/react-query';
import { getAgentForecast } from '@/lib/aws-agent';
import { useSiteConfig } from '@/hooks/useSiteConfig';

export function useAgentForecast() {
  const { siteConfig } = useSiteConfig();
  const siteId = siteConfig?.site_id;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['agentForecast', siteId],
    queryFn: () => getAgentForecast(siteId!),
    enabled: !!siteId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  return {
    forecast: data?.forecast ?? null,
    selectedStrategy: data?.selected_strategy ?? null,
    forecastTimestamp: data?.timestamp ?? null,
    isLoading,
    isError,
    error,
    refetch,
  };
}
