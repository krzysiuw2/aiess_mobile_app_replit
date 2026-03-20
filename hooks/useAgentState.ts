import { useQuery } from '@tanstack/react-query';
import { useDevices } from '@/contexts/DeviceContext';
import { getAgentState } from '@/lib/aws-agent';
import type { AgentState } from '@/types/ai-agent';

export function useAgentState() {
  const { selectedDevice } = useDevices();
  const siteId = selectedDevice?.device_id ?? null;

  const stateQuery = useQuery<AgentState | null>({
    queryKey: ['agentState', siteId],
    queryFn: async () => {
      if (!siteId) return null;
      return getAgentState(siteId);
    },
    enabled: !!siteId,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  });

  return {
    agentState: stateQuery.data ?? null,
    isLoading: stateQuery.isLoading,
    isError: stateQuery.isError,
    error: stateQuery.error,
    refetch: stateQuery.refetch,
  };
}
