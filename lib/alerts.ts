/**
 * Alert catalog + Supabase helpers for the notifications settings screen.
 *
 * Three layers (see aiess-architecture: mobile-push-notifications):
 * - `alert_rules`  — per-site config (enabled + threshold), owner/admin write.
 * - `alert_prefs`  — per-user mutes (missing row = enabled).
 * - `alert_state`  — engine state, service-role only (not read here).
 *
 * The evaluation itself (hysteresis, cooldown) runs in the `send-push`
 * Supabase edge function on a 5-minute pg_cron. The catalog below must stay
 * in sync with ALERT_DEFS in supabase/functions/send-push/index.ts.
 */

import { supabase } from '@/lib/supabase';

export type AlertType =
  | 'device_offline'
  | 'override'
  | 'soc_low'
  | 'battery_temp_high'
  | 'bms_fault'
  | 'grid_import_high'
  | 'grid_export_high'
  | 'agent_alerts';

export interface AlertCatalogEntry {
  type: AlertType;
  /** Has a site-level numeric threshold editable by owner/admin. */
  threshold: null | {
    unit: '%' | '°C' | 'kW';
    default: number | null;
    min: number;
    max: number;
  };
  /** Enabled by default at the site level. */
  defaultEnabled: boolean;
  /** Evaluated by the cron alert engine (vs. event-driven pushes). */
  telemetry: boolean;
}

export const ALERT_CATALOG: AlertCatalogEntry[] = [
  { type: 'device_offline', threshold: null, defaultEnabled: true, telemetry: false },
  { type: 'override', threshold: null, defaultEnabled: true, telemetry: false },
  {
    type: 'soc_low',
    threshold: { unit: '%', default: 15, min: 1, max: 90 },
    defaultEnabled: true,
    telemetry: true,
  },
  {
    type: 'battery_temp_high',
    threshold: { unit: '°C', default: 45, min: 25, max: 70 },
    defaultEnabled: true,
    telemetry: true,
  },
  { type: 'bms_fault', threshold: null, defaultEnabled: true, telemetry: true },
  {
    type: 'grid_import_high',
    threshold: { unit: 'kW', default: null, min: 1, max: 100000 },
    defaultEnabled: true,
    telemetry: true,
  },
  {
    type: 'grid_export_high',
    threshold: { unit: 'kW', default: null, min: 1, max: 100000 },
    defaultEnabled: false,
    telemetry: true,
  },
  { type: 'agent_alerts', threshold: null, defaultEnabled: true, telemetry: false },
];

export interface AlertRule {
  site_id: string;
  alert_type: AlertType;
  enabled: boolean;
  threshold: number | null;
}

export interface AlertPref {
  alert_type: AlertType;
  enabled: boolean;
}

/** Site-level rules; missing rows fall back to catalog defaults. */
export async function fetchAlertRules(siteId: string): Promise<Map<AlertType, AlertRule>> {
  const { data, error } = await supabase
    .from('alert_rules')
    .select('site_id, alert_type, enabled, threshold')
    .eq('site_id', siteId);
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => [
      r.alert_type as AlertType,
      { ...r, threshold: r.threshold === null ? null : Number(r.threshold) } as AlertRule,
    ]),
  );
}

/** Upsert a site rule (RLS allows owner/admin only). */
export async function saveAlertRule(rule: AlertRule): Promise<void> {
  const { error } = await supabase.from('alert_rules').upsert(
    { ...rule, updated_at: new Date().toISOString() },
    { onConflict: 'site_id,alert_type' },
  );
  if (error) throw error;
}

/** Per-user mutes; missing rows mean enabled. */
export async function fetchAlertPrefs(userId: string): Promise<Map<AlertType, boolean>> {
  const { data, error } = await supabase
    .from('alert_prefs')
    .select('alert_type, enabled')
    .eq('user_id', userId);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.alert_type as AlertType, p.enabled]));
}

export async function saveAlertPref(
  userId: string,
  alertType: AlertType,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase.from('alert_prefs').upsert(
    {
      user_id: userId,
      alert_type: alertType,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,alert_type' },
  );
  if (error) throw error;
}
