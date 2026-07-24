import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * send-push — Expo push notification sender + telemetry alert engine.
 *
 * Actions (POST JSON body):
 *   { action: "notify", site_id, title, body, data? }
 *     Sends a push to every user with access to the device at site_id.
 *     Callable with a user JWT (app events, e.g. override issued/released)
 *     or the cron secret. If data.type maps to a known alert type, users who
 *     muted that type in alert_prefs are skipped.
 *
 *   { action: "offline_check" }
 *     Compares InfluxDB last-seen per site against OFFLINE_THRESHOLD_MIN and
 *     notifies device users on offline/back-online transitions. State is kept
 *     in public.device_offline_state. Cron-secret only.
 *
 *   { action: "alert_check" }
 *     Telemetry alert engine: evaluates soc_low, battery_temp_high, bms_fault,
 *     grid_import_high, grid_export_high, moc_zamowiona_high against per-site alert_rules with
 *     hysteresis; fires pushes only on state transitions (public.alert_state)
 *     with a re-fire cooldown. Cron-secret only.
 *
 * Auth: either header `x-push-secret: <PUSH_FN_SECRET>` (cron / triggers)
 * or a valid Supabase user JWT in Authorization (app-originated notify).
 *
 * All paths funnel through tokensForSite(), which also skips users currently
 * inside their quiet-hours window (public.notification_prefs).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUSH_FN_SECRET = Deno.env.get("PUSH_FN_SECRET") ?? "";
const INFLUX_URL = Deno.env.get("INFLUX_URL") ?? "";
const INFLUX_ORG = Deno.env.get("INFLUX_ORG") ?? "";
const INFLUX_TOKEN = Deno.env.get("INFLUX_TOKEN") ?? "";

const OFFLINE_THRESHOLD_MIN = 10;
// Suppress a repeated "active" push for the same (site, type) within this window.
const ALERT_COOLDOWN_MIN = 30;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-push-secret",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Alert catalog (must stay in sync with lib/alerts.ts in the app)
// ---------------------------------------------------------------------------

interface AlertDef {
  /** Default trigger threshold (meaning depends on type). */
  defaultThreshold: number | null;
  /** Enabled by default at the site level. */
  defaultEnabled: boolean;
  /**
   * Evaluate active state with hysteresis.
   * `wasActive` lets the clear threshold differ from the trigger threshold.
   */
  evaluate: (
    fields: TelemetrySnapshot,
    threshold: number | null,
    wasActive: boolean,
  ) => { active: boolean; value: number | null } | null;
}

interface TelemetrySnapshot {
  soc?: number;
  grid_power?: number;
  max_cell_temp_c?: number;
  active_fault_count?: number;
}

const ALERT_DEFS: Record<string, AlertDef> = {
  soc_low: {
    defaultThreshold: 15,
    defaultEnabled: true,
    evaluate: (f, th, was) => {
      if (f.soc === undefined || th === null) return null;
      // Hysteresis: clear only once SoC recovers 5 points above the threshold.
      const active = was ? f.soc < th + 5 : f.soc < th;
      return { active, value: f.soc };
    },
  },
  battery_temp_high: {
    defaultThreshold: 45,
    defaultEnabled: true,
    evaluate: (f, th, was) => {
      if (f.max_cell_temp_c === undefined || th === null) return null;
      const active = was ? f.max_cell_temp_c > th - 5 : f.max_cell_temp_c > th;
      return { active, value: f.max_cell_temp_c };
    },
  },
  bms_fault: {
    defaultThreshold: null,
    defaultEnabled: true,
    evaluate: (f) => {
      if (f.active_fault_count === undefined) return null;
      return { active: f.active_fault_count > 0, value: f.active_fault_count };
    },
  },
  grid_import_high: {
    defaultThreshold: null, // seeded from site config by the app; null = disabled
    defaultEnabled: true,
    evaluate: (f, th, was) => {
      if (f.grid_power === undefined || th === null || th <= 0) return null;
      const active = was ? f.grid_power > th * 0.9 : f.grid_power > th;
      return { active, value: f.grid_power };
    },
  },
  grid_export_high: {
    defaultThreshold: null,
    defaultEnabled: false,
    evaluate: (f, th, was) => {
      if (f.grid_power === undefined || th === null || th <= 0) return null;
      const exportKw = -f.grid_power; // export is negative grid power
      const active = was ? exportKw > th * 0.9 : exportKw > th;
      return { active, value: exportKw };
    },
  },
  // Contracted demand power (moc zamówiona) — exceeding it triggers penalty
  // tariffs in Poland. Threshold seeded from financial settings by the app.
  moc_zamowiona_high: {
    defaultThreshold: null,
    defaultEnabled: true,
    evaluate: (f, th, was) => {
      if (f.grid_power === undefined || th === null || th <= 0) return null;
      const active = was ? f.grid_power > th * 0.9 : f.grid_power > th;
      return { active, value: f.grid_power };
    },
  },
};

/** Map push data.type values to alert_prefs alert_type for mute filtering. */
const DATA_TYPE_TO_ALERT_TYPE: Record<string, string> = {
  device_offline: "device_offline",
  device_online: "device_offline",
  override_issued: "override",
  override_released: "override",
  rollback_alert: "agent_alerts",
  agent_notification: "agent_alerts",
  soc_low: "soc_low",
  soc_recovered: "soc_low",
  battery_temp_high: "battery_temp_high",
  battery_temp_normal: "battery_temp_high",
  bms_fault: "bms_fault",
  bms_fault_cleared: "bms_fault",
  grid_import_high: "grid_import_high",
  grid_import_normal: "grid_import_high",
  grid_export_high: "grid_export_high",
  grid_export_normal: "grid_export_high",
  moc_zamowiona_high: "moc_zamowiona_high",
  moc_zamowiona_normal: "moc_zamowiona_high",
};

// ---------------------------------------------------------------------------
// Quiet hours (per-user do-not-disturb window from public.notification_prefs)
// ---------------------------------------------------------------------------

interface QuietHoursPrefs {
  user_id: string;
  quiet_hours_enabled: boolean;
  quiet_start_min: number;
  quiet_end_min: number;
  timezone: string;
}

/** Minutes since midnight in the given IANA timezone (falls back to UTC). */
function minutesOfDayIn(timezone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return (hour % 24) * 60 + minute;
  } catch {
    return at.getUTCHours() * 60 + at.getUTCMinutes();
  }
}

/** True when `at` falls inside the user's quiet window (handles overnight wrap). */
function isInQuietHours(prefs: QuietHoursPrefs, at: Date): boolean {
  if (!prefs.quiet_hours_enabled) return false;
  const start = prefs.quiet_start_min;
  const end = prefs.quiet_end_min;
  if (start === end) return false; // degenerate window: never quiet
  const now = minutesOfDayIn(prefs.timezone, at);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

// ---------------------------------------------------------------------------
// Token resolution + Expo send
// ---------------------------------------------------------------------------

/**
 * Expo push tokens for every user with access to the given site.
 * When alertType is provided, users who disabled it in alert_prefs are skipped.
 */
async function tokensForSite(siteId: string, alertType?: string): Promise<string[]> {
  const { data: device } = await admin
    .from("devices")
    .select("id")
    .eq("site_id", siteId)
    .maybeSingle();
  if (!device) return [];

  const { data: users } = await admin
    .from("device_users")
    .select("user_id")
    .eq("device_id", device.id);
  let userIds = (users ?? []).map((u: { user_id: string }) => u.user_id);
  if (userIds.length === 0) return [];

  if (alertType) {
    const { data: muted } = await admin
      .from("alert_prefs")
      .select("user_id")
      .eq("alert_type", alertType)
      .eq("enabled", false)
      .in("user_id", userIds);
    const mutedSet = new Set((muted ?? []).map((m: { user_id: string }) => m.user_id));
    userIds = userIds.filter((id) => !mutedSet.has(id));
    if (userIds.length === 0) return [];
  }

  // Quiet hours: drop users currently inside their do-not-disturb window.
  const { data: quietPrefs } = await admin
    .from("notification_prefs")
    .select("user_id, quiet_hours_enabled, quiet_start_min, quiet_end_min, timezone")
    .in("user_id", userIds)
    .eq("quiet_hours_enabled", true);
  if (quietPrefs && quietPrefs.length > 0) {
    const now = new Date();
    const quietSet = new Set(
      (quietPrefs as QuietHoursPrefs[])
        .filter((p) => isInQuietHours(p, now))
        .map((p) => p.user_id),
    );
    userIds = userIds.filter((id: string) => !quietSet.has(id));
    if (userIds.length === 0) return [];
  }

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token")
    .in("user_id", userIds);
  return (tokens ?? []).map((t: { token: string }) => t.token);
}

async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (tokens.length === 0) return;
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100).map((to) => ({
      to,
      title,
      body,
      sound: "default",
      data: data ?? {},
    }));
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error("[send-push] Expo API error:", res.status, await res.text());
    }
  }
}

// ---------------------------------------------------------------------------
// InfluxDB queries
// ---------------------------------------------------------------------------

/** Last telemetry timestamp per site from InfluxDB (single Flux query). */
async function influxLastSeen(siteIds: string[]): Promise<Record<string, number>> {
  const filter = siteIds.map((id) => `r.site_id == "${id}"`).join(" or ");
  const query = `
    from(bucket: "aiess_v1")
      |> range(start: -24h)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => ${filter})
      |> filter(fn: (r) => r._field == "soc")
      |> group(columns: ["site_id"])
      |> last()
  `;
  const csv = await fluxQuery(query);
  const result: Record<string, number> = {};
  for (const row of parseCsv(csv)) {
    const site = row["site_id"];
    const t = Date.parse(row["_time"] ?? "");
    if (site && !isNaN(t)) result[site] = t;
  }
  return result;
}

/** Last value of the alert-relevant fields per site (single Flux query). */
async function influxAlertSnapshot(
  siteIds: string[],
): Promise<Record<string, TelemetrySnapshot>> {
  const siteFilter = siteIds.map((id) => `r.site_id == "${id}"`).join(" or ");
  const fields = ["soc", "grid_power", "max_cell_temp_c", "active_fault_count"];
  const fieldFilter = fields.map((f) => `r._field == "${f}"`).join(" or ");
  const query = `
    from(bucket: "aiess_v1")
      |> range(start: -15m)
      |> filter(fn: (r) => r._measurement == "energy_telemetry")
      |> filter(fn: (r) => ${siteFilter})
      |> filter(fn: (r) => ${fieldFilter})
      |> group(columns: ["site_id", "_field"])
      |> last()
  `;
  const csv = await fluxQuery(query);
  const result: Record<string, TelemetrySnapshot> = {};
  for (const row of parseCsv(csv)) {
    const site = row["site_id"];
    const field = row["_field"];
    const value = parseFloat(row["_value"] ?? "");
    if (!site || !field || isNaN(value)) continue;
    result[site] = result[site] ?? {};
    (result[site] as Record<string, number>)[field] = value;
  }
  return result;
}

async function fluxQuery(query: string): Promise<string> {
  const res = await fetch(`${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${INFLUX_TOKEN}`,
      "Content-Type": "application/vnd.flux",
      Accept: "application/csv",
    },
    body: query,
  });
  return await res.text();
}

/** Parse annotated Influx CSV into row objects (header repeats per table). */
function parseCsv(csv: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let header: string[] | null = null;
  for (const raw of csv.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cols = line.split(",").map((c) => c.trim());
    // Header rows contain the literal column names.
    if (cols.includes("_time") && cols.includes("_value")) {
      header = cols;
      continue;
    }
    if (!header || cols.length !== header.length) continue;
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cols[i]));
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Offline check (unchanged behavior)
// ---------------------------------------------------------------------------

async function handleOfflineCheck(): Promise<Response> {
  const { data: devices } = await admin
    .from("devices")
    .select("id, name, site_id")
    .not("site_id", "is", null);
  if (!devices || devices.length === 0) return json(200, { checked: 0 });

  const siteIds = devices.map((d: { site_id: string }) => d.site_id);
  const lastSeen = await influxLastSeen(siteIds);
  const now = Date.now();
  const thresholdMs = OFFLINE_THRESHOLD_MIN * 60 * 1000;

  const { data: states } = await admin.from("device_offline_state").select("*");
  const stateMap = new Map(
    (states ?? []).map((s: { site_id: string; offline: boolean }) => [s.site_id, s]),
  );

  let notified = 0;
  for (const device of devices) {
    const seen = lastSeen[device.site_id];
    const isOffline = seen === undefined || now - seen > thresholdMs;
    const prev = stateMap.get(device.site_id);
    const wasOffline = prev?.offline ?? false;

    if (isOffline !== wasOffline) {
      const tokens = await tokensForSite(device.site_id, "device_offline");
      if (isOffline) {
        await sendExpoPush(
          tokens,
          `${device.name}: offline`,
          `No telemetry for over ${OFFLINE_THRESHOLD_MIN} minutes.`,
          { type: "device_offline", site_id: device.site_id },
        );
      } else {
        await sendExpoPush(
          tokens,
          `${device.name}: back online`,
          "Telemetry has resumed.",
          { type: "device_online", site_id: device.site_id },
        );
      }
      notified++;
    }

    await admin.from("device_offline_state").upsert({
      site_id: device.site_id,
      offline: isOffline,
      last_seen: seen !== undefined ? new Date(seen).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  }

  return json(200, { checked: devices.length, transitions: notified });
}

// ---------------------------------------------------------------------------
// Telemetry alert engine
// ---------------------------------------------------------------------------

function fmtValue(type: string, value: number | null): string {
  if (value === null) return "";
  switch (type) {
    case "soc_low":
      return `${value.toFixed(0)}%`;
    case "battery_temp_high":
      return `${value.toFixed(1)} °C`;
    case "bms_fault":
      return `${value.toFixed(0)} fault(s)`;
    case "grid_import_high":
    case "grid_export_high":
    case "moc_zamowiona_high":
      return Math.abs(value) >= 1000
        ? `${(value / 1000).toFixed(2)} MW`
        : `${value.toFixed(1)} kW`;
    default:
      return `${value}`;
  }
}

function alertMessages(
  type: string,
  deviceName: string,
  value: number | null,
  active: boolean,
): { title: string; body: string; dataType: string } {
  const v = fmtValue(type, value);
  switch (type) {
    case "soc_low":
      return active
        ? { title: `${deviceName}: battery low`, body: `State of charge is ${v}.`, dataType: "soc_low" }
        : { title: `${deviceName}: battery recovered`, body: `State of charge is back at ${v}.`, dataType: "soc_recovered" };
    case "battery_temp_high":
      return active
        ? { title: `${deviceName}: high battery temperature`, body: `Max cell temperature is ${v}.`, dataType: "battery_temp_high" }
        : { title: `${deviceName}: battery temperature normal`, body: `Max cell temperature is back at ${v}.`, dataType: "battery_temp_normal" };
    case "bms_fault":
      return active
        ? { title: `${deviceName}: BMS fault`, body: `Battery reports ${v} active.`, dataType: "bms_fault" }
        : { title: `${deviceName}: BMS fault cleared`, body: "No active battery faults.", dataType: "bms_fault_cleared" };
    case "grid_import_high":
      return active
        ? { title: `${deviceName}: high grid import`, body: `Grid import is ${v}.`, dataType: "grid_import_high" }
        : { title: `${deviceName}: grid import normal`, body: `Grid import is back at ${v}.`, dataType: "grid_import_normal" };
    case "grid_export_high":
      return active
        ? { title: `${deviceName}: high grid export`, body: `Grid export is ${v}.`, dataType: "grid_export_high" }
        : { title: `${deviceName}: grid export normal`, body: `Grid export is back at ${v}.`, dataType: "grid_export_normal" };
    case "moc_zamowiona_high":
      return active
        ? { title: `${deviceName}: contracted power exceeded`, body: `Grid import is ${v} — above contracted demand power, penalty tariffs may apply.`, dataType: "moc_zamowiona_high" }
        : { title: `${deviceName}: contracted power OK`, body: `Grid import is back at ${v}, below the contracted demand power.`, dataType: "moc_zamowiona_normal" };
    default:
      return { title: deviceName, body: v, dataType: type };
  }
}

async function handleAlertCheck(): Promise<Response> {
  const { data: devices } = await admin
    .from("devices")
    .select("id, name, site_id")
    .not("site_id", "is", null);
  if (!devices || devices.length === 0) return json(200, { checked: 0 });

  const siteIds = devices.map((d: { site_id: string }) => d.site_id);
  const [snapshots, rulesRes, statesRes] = await Promise.all([
    influxAlertSnapshot(siteIds),
    admin.from("alert_rules").select("*").in("site_id", siteIds),
    admin.from("alert_state").select("*").in("site_id", siteIds),
  ]);

  const rules = rulesRes.data ?? [];
  const ruleMap = new Map(
    rules.map((r: { site_id: string; alert_type: string }) => [
      `${r.site_id}:${r.alert_type}`,
      r,
    ]),
  );
  const states = statesRes.data ?? [];
  const stateMap = new Map(
    states.map((s: { site_id: string; alert_type: string }) => [
      `${s.site_id}:${s.alert_type}`,
      s,
    ]),
  );

  const now = Date.now();
  const cooldownMs = ALERT_COOLDOWN_MIN * 60 * 1000;
  let transitions = 0;

  for (const device of devices) {
    const snapshot = snapshots[device.site_id];
    if (!snapshot) continue; // offline sites are handled by offline_check

    for (const [type, def] of Object.entries(ALERT_DEFS)) {
      const key = `${device.site_id}:${type}`;
      const rule = ruleMap.get(key) as
        | { enabled: boolean; threshold: number | null }
        | undefined;
      const enabled = rule ? rule.enabled : def.defaultEnabled;
      if (!enabled) continue;
      const threshold = rule?.threshold ?? def.defaultThreshold;

      const state = stateMap.get(key) as
        | { active: boolean; last_notified_at: string | null }
        | undefined;
      const wasActive = state?.active ?? false;

      const result = def.evaluate(snapshot, threshold, wasActive);
      if (result === null) continue; // field missing or rule not configured

      const { active, value } = result;
      const nowIso = new Date().toISOString();

      if (active !== wasActive) {
        let shouldNotify = true;
        // Cooldown applies only to new "active" alerts; recovery is always sent.
        if (active && state?.last_notified_at) {
          const last = Date.parse(state.last_notified_at);
          if (!isNaN(last) && now - last < cooldownMs) shouldNotify = false;
        }

        if (shouldNotify) {
          const msg = alertMessages(type, device.name, value, active);
          const tokens = await tokensForSite(device.site_id, type);
          await sendExpoPush(tokens, msg.title, msg.body, {
            type: msg.dataType,
            site_id: device.site_id,
            value,
          });
          transitions++;
        }

        await admin.from("alert_state").upsert({
          site_id: device.site_id,
          alert_type: type,
          active,
          value,
          last_transition_at: nowIso,
          ...(shouldNotify && active ? { last_notified_at: nowIso } : {}),
          updated_at: nowIso,
        });
      } else {
        await admin.from("alert_state").upsert({
          site_id: device.site_id,
          alert_type: type,
          active,
          value,
          updated_at: nowIso,
        });
      }
    }
  }

  return json(200, { checked: devices.length, transitions });
}

// ---------------------------------------------------------------------------
// HTTP entrypoint
// ---------------------------------------------------------------------------

async function isAuthorized(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-push-secret");
  if (secret && PUSH_FN_SECRET && secret === PUSH_FN_SECRET) return true;

  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const { data } = await admin.auth.getUser(auth.slice(7));
    return !!data?.user;
  }
  return false;
}

function isCronSecret(req: Request): boolean {
  const secret = req.headers.get("x-push-secret");
  return !!secret && secret === PUSH_FN_SECRET;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  if (!(await isAuthorized(req))) return json(401, { error: "Unauthorized" });

  try {
    const payload = await req.json();

    if (payload.action === "offline_check") {
      // Cron-only: don't let ordinary users trigger fleet-wide checks.
      if (!isCronSecret(req)) return json(403, { error: "Forbidden" });
      return await handleOfflineCheck();
    }

    if (payload.action === "alert_check") {
      if (!isCronSecret(req)) return json(403, { error: "Forbidden" });
      return await handleAlertCheck();
    }

    if (payload.action === "notify") {
      const { site_id, title, body, data } = payload;
      if (!site_id || !title || !body) {
        return json(400, { error: "site_id, title and body are required" });
      }
      const alertType = data?.type ? DATA_TYPE_TO_ALERT_TYPE[data.type] : undefined;
      const tokens = await tokensForSite(site_id, alertType);
      await sendExpoPush(tokens, title, body, data);
      return json(200, { sent: tokens.length });
    }

    return json(400, { error: "Unknown action" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[send-push] Error:", message);
    return json(500, { error: message });
  }
});
