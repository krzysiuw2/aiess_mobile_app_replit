import { useQuery } from '@tanstack/react-query';
import { getFeatureFlag, type FeatureFlagKey } from '@/lib/feature-flags';

/**
 * Resolve a remote feature flag. Returns `false` while loading and on any
 * error, so consumers always start on (and fall back to) the legacy path.
 */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const { data } = useQuery({
    queryKey: ['featureFlag', key],
    queryFn: () => getFeatureFlag(key),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  return data === true;
}
