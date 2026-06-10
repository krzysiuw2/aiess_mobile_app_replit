import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    'Authorization': `Bearer ${token}`,
    'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    'Content-Type': 'application/json',
  };
}

export async function callInfluxProxy(query: string): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/influx-proxy`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`influx-proxy error ${res.status}: ${text}`);
  }
  return res.text();
}

const AWS_PROXY_TIMEOUT_MS = 45_000;

export async function callAwsProxy(
  path: string,
  method: string = 'GET',
  body?: unknown,
): Promise<Response> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AWS_PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/aws-proxy`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path, method, body }),
      signal: controller.signal,
    });
    return res;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Request to ${path} timed out after ${AWS_PROXY_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
