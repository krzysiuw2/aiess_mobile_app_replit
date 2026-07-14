import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * send-push — Expo push notification sender.
 *
 * Actions (POST JSON body):
 *   { action: "notify", site_id, title, body, data? }
 *     Sends a push to every user with access to the device at site_id.
 *     Callable with a user JWT (app events, e.g. override issued/released)
 *     or the cron secret.
 *
 *   { action: "offline_check" }
 *     Compares InfluxDB last-seen per site against OFFLINE_THRESHOLD_MIN and
 *     notifies device users on offline/back-online transitions. State is kept
 *     in public.device_offline_state. Cron-secret only.
 *
 * Auth: either header `x-push-secret: <PUSH_FN_SECRET>` (cron / triggers)
 * or a valid Supabase user JWT in Authorization (app-originated notify).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUSH_FN_SECRET = Deno.env.get("PUSH_FN_SECRET") ?? "";
const INFLUX_URL = Deno.env.get("INFLUX_URL") ?? "";
const INFLUX_ORG = Deno.env.get("INFLUX_ORG") ?? "";
const INFLUX_TOKEN = Deno.env.get("INFLUX_TOKEN") ?? "";

const OFFLINE_THRESHOLD_MIN = 10;
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

/** Expo push tokens for every user with access to the given site. */
async function tokensForSite(siteId: string): Promise<string[]> {
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
  const userIds = (users ?? []).map((u: { user_id: string }) => u.user_id);
  if (userIds.length === 0) return [];

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
  const res = await fetch(`${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${INFLUX_TOKEN}`,
      "Content-Type": "application/vnd.flux",
      Accept: "application/csv",
    },
    body: query,
  });
  const csv = await res.text();
  const result: Record<string, number> = {};
  const lines = csv.split("\n").filter((l) => l && !l.startsWith("#"));
  if (lines.length < 2) return result;
  const header = lines[0].split(",").map((h) => h.trim());
  const timeIdx = header.indexOf("_time");
  const siteIdx = header.indexOf("site_id");
  if (timeIdx === -1 || siteIdx === -1) return result;
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const site = cols[siteIdx]?.trim();
    const t = Date.parse(cols[timeIdx]?.trim() ?? "");
    if (site && !isNaN(t)) result[site] = t;
  }
  return result;
}

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
      const tokens = await tokensForSite(device.site_id);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  if (!(await isAuthorized(req))) return json(401, { error: "Unauthorized" });

  try {
    const payload = await req.json();

    if (payload.action === "offline_check") {
      // Cron-only: don't let ordinary users trigger fleet-wide checks.
      const secret = req.headers.get("x-push-secret");
      if (!secret || secret !== PUSH_FN_SECRET) return json(403, { error: "Forbidden" });
      return await handleOfflineCheck();
    }

    if (payload.action === "notify") {
      const { site_id, title, body, data } = payload;
      if (!site_id || !title || !body) {
        return json(400, { error: "site_id, title and body are required" });
      }
      const tokens = await tokensForSite(site_id);
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
