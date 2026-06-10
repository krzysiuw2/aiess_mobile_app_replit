import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const AWS_ENDPOINT = Deno.env.get('AWS_ENDPOINT') ?? '';
const AWS_API_KEY = Deno.env.get('AWS_API_KEY') ?? '';

const FETCH_TIMEOUT_MS = 45_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const userBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, path: string): boolean {
  if (!path.startsWith('/chat')) return true;
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!AWS_ENDPOINT || !AWS_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'AWS API not configured on server' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { path, method, body } = await req.json();

    if (!path || typeof path !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing "path" field' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = getUserIdFromJwt(req);
    if (!checkRateLimit(userId, path)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const httpMethod = (method || 'GET').toUpperCase();
    const headers: Record<string, string> = { 'x-api-key': AWS_API_KEY };
    const fetchOpts: RequestInit = { method: httpMethod, headers };

    if (body && (httpMethod === 'POST' || httpMethod === 'PUT' || httpMethod === 'PATCH')) {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    fetchOpts.signal = controller.signal;

    try {
      const awsRes = await fetch(`${AWS_ENDPOINT}${path}`, fetchOpts);
      clearTimeout(timeout);
      const responseBody = await awsRes.text();

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
        return new Response(
          JSON.stringify({ error: `AWS request timed out after ${FETCH_TIMEOUT_MS / 1000}s` }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      throw fetchErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
