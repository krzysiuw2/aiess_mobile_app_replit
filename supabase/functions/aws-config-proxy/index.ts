// aws-config-proxy — Supabase edge function for the AIESS DDB config-plane API.
//
// ============================================================================
// DELIVERABLE — NOT YET DEPLOYED.
// The /devices/* routes of the config-plane API Gateway (CloudFormation stack
// `aiess-config-plane`, eu-central-1) use AWS_IAM auth (SigV4), which the
// legacy `aws-proxy` (x-api-key injection) cannot satisfy. This function
// SigV4-signs forwarded requests using a scoped IAM user restricted to
// `execute-api:Invoke` on that API.
//
// Deployment prerequisites (ops):
//   1. Create an IAM user/role with a policy allowing only
//      execute-api:Invoke on the aiess-config-plane API.
//   2. supabase secrets set:
//        CONFIG_API_ENDPOINT=https://<api-id>.execute-api.eu-central-1.amazonaws.com[/stage]
//        CONFIG_AWS_ACCESS_KEY_ID=...
//        CONFIG_AWS_SECRET_ACCESS_KEY=...
//   3. supabase functions deploy aws-config-proxy
//   4. Only then flip the `use_ddb_config_plane` feature flag.
//
// Request envelope from the app (same shape as aws-proxy, plus headers):
//   POST { path, method, body?, headers? }
// `headers` may carry `If-Match` for optimistic-concurrency PUTs; 412/400
// responses are passed through verbatim so the app can handle conflicts.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const CONFIG_API_ENDPOINT = Deno.env.get('CONFIG_API_ENDPOINT') ?? '';
const AWS_ACCESS_KEY_ID = Deno.env.get('CONFIG_AWS_ACCESS_KEY_ID') ?? '';
const AWS_SECRET_ACCESS_KEY = Deno.env.get('CONFIG_AWS_SECRET_ACCESS_KEY') ?? '';
const AWS_REGION = Deno.env.get('CONFIG_AWS_REGION') ?? 'eu-central-1';

const FETCH_TIMEOUT_MS = 45_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Only these forwarded headers are honored; everything else is dropped.
const ALLOWED_FORWARD_HEADERS = new Set(['if-match']);

// Only config-plane device routes may be proxied.
const ALLOWED_PATH = /^\/devices\/[A-Za-z0-9_-]+(\/(manifest|sections\/[A-Za-z0-9_.-]+))?$/;
const ALLOWED_METHODS = new Set(['GET', 'PUT']);

const RATE_LIMIT = 60;
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
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!CONFIG_API_ENDPOINT || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return jsonError('Config-plane API not configured on server', 500);
  }

  try {
    const { path, method, body, headers: forwardedHeaders } = await req.json();

    if (!path || typeof path !== 'string' || !ALLOWED_PATH.test(path)) {
      return jsonError('Invalid or disallowed "path"', 400);
    }

    const httpMethod = (method || 'GET').toUpperCase();
    if (!ALLOWED_METHODS.has(httpMethod)) {
      return jsonError(`Method ${httpMethod} not allowed`, 405);
    }

    const userId = getUserIdFromJwt(req);
    if (!checkRateLimit(userId)) {
      return jsonError('Rate limit exceeded. Please wait a moment.', 429);
    }

    const headers: Record<string, string> = {};
    if (forwardedHeaders && typeof forwardedHeaders === 'object') {
      for (const [k, v] of Object.entries(forwardedHeaders)) {
        if (ALLOWED_FORWARD_HEADERS.has(k.toLowerCase()) && typeof v === 'string') {
          headers[k] = v;
        }
      }
    }

    const init: RequestInit = { method: httpMethod, headers };
    if (body !== undefined && httpMethod === 'PUT') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const aws = new AwsClient({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: AWS_REGION,
      service: 'execute-api',
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    init.signal = controller.signal;

    try {
      const awsRes = await aws.fetch(`${CONFIG_API_ENDPOINT}${path}`, init);
      clearTimeout(timeout);
      const responseBody = await awsRes.text();

      // Pass 412 (If-Match conflict) and 400 (validation details[]) through
      // verbatim — the app relies on both.
      return new Response(responseBody, {
        status: awsRes.status,
        headers: {
          ...corsHeaders,
          'Content-Type': awsRes.headers.get('Content-Type') || 'application/json',
        },
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        return jsonError(`Config-plane request timed out after ${FETCH_TIMEOUT_MS / 1000}s`, 504);
      }
      throw fetchErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(message, 500);
  }
});
