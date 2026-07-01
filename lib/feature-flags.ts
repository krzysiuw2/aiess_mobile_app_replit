import { supabase } from '@/lib/supabase';

/**
 * Remote feature flags stored in the Supabase `app_feature_flags` table
 * (read-only for clients; toggled by ops). Unknown keys and any fetch
 * error resolve to `false`, so a failure always falls back to the
 * legacy code path.
 */

export type FeatureFlagKey = 'use_ddb_config_plane';

export async function getFeatureFlag(key: FeatureFlagKey): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_feature_flags')
      .select('enabled')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.warn('[FeatureFlags] Fetch error, defaulting to false:', error.message);
      return false;
    }
    return data?.enabled === true;
  } catch (err) {
    console.warn('[FeatureFlags] Unexpected error, defaulting to false:', err);
    return false;
  }
}
