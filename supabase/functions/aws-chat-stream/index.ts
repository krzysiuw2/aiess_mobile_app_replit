import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Function URL is public (AuthType NONE); x-api-key is the secret (shared AWS_API_KEY).
const AWS_CHAT_STREAM_URL =
  Deno.env.get("AWS_CHAT_STREAM_URL") ??
  "https://jaz4zf3grbvwpfywnx32moip6a0yukei.lambda-url.eu-central-1.on.aws/";
const AWS_API_KEY = Deno.env.get("AWS_API_KEY") ?? "";

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const userBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  let bucket = userBuckets.get(userId);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    userBuckets.set(userId, bucket);
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT;
}

function getUserIdFromJwt(req: Request): string {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub ?? "unknown";
  } catch {
    return "unknown";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!AWS_CHAT_STREAM_URL || !AWS_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Streaming chat not configured on server" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const userId = getUserIdFromJwt(req);
    if (!checkRateLimit(userId)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();

    if (!body?.session_id) {
      return new Response(
        JSON.stringify({ error: 'Missing "session_id" field' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const awsRes = await fetch(AWS_CHAT_STREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": AWS_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!awsRes.ok || !awsRes.body) {
      const errText = awsRes.body ? await awsRes.text() : "Upstream error";
      return new Response(
        JSON.stringify({ error: errText }),
        {
          status: awsRes.status || 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(awsRes.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": awsRes.headers.get("Content-Type") || "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
