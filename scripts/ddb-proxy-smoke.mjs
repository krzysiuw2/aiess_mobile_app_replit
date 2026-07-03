#!/usr/bin/env node
/**
 * Smoke test for the deployed aws-config-proxy edge function — emulates the
 * app's flag-on useSchedules cycle against a site:
 *   1. GET shared.schedules + shared.site_limits (read model)
 *   2. PUT shared.schedules with identical payload + If-Match (no-op write)
 *   3. Stale If-Match PUT → expect 412
 * Uses the Supabase anon key as bearer (platform JWT check only; the proxy
 * does not require a user session for this test).
 *
 * Usage: node scripts/ddb-proxy-smoke.mjs [--site domagala_1]
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const anon = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(\S+)/)?.[1];
const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(\S+)/)?.[1];
if (!anon || !url) throw new Error('Supabase env not found in .env');

const args = process.argv.slice(2);
const SITE = args.includes('--site') ? args[args.indexOf('--site') + 1] : 'domagala_1';

async function proxy(body) {
  const res = await fetch(`${url}/functions/v1/aws-config-proxy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${anon}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const sched = await proxy({ path: `/devices/${SITE}/sections/shared.schedules`, method: 'GET' });
const limits = await proxy({ path: `/devices/${SITE}/sections/shared.site_limits`, method: 'GET' });
console.log('GET shared.schedules ', sched.status, 'version', sched.json?.version);
console.log('GET shared.site_limits', limits.status, 'version', limits.json?.version);
if (sched.status !== 200 || limits.status !== 200) process.exit(1);

// App read-model assembly sanity: cloud band arrays exist
const cloud = ['p_4', 'p_5', 'p_6', 'p_7', 'p_8', 'p_9'].map(k => `${k}:${(sched.json.payload.sch[k] ?? []).length}`);
console.log('cloud band', cloud.join(' '));

// No-op PUT with correct If-Match (replaces payload with itself)
const put = await proxy({
  path: `/devices/${SITE}/sections/shared.schedules`,
  method: 'PUT',
  body: { payload: sched.json.payload },
  headers: { 'If-Match': sched.json.etag },
});
console.log('no-op PUT             ', put.status, 'new version', put.json?.version, put.json?.etag === sched.json.etag ? '(etag unchanged)' : '(ETAG CHANGED!)');
if (put.status !== 200) process.exit(1);

// Stale etag → 412
const stale = await proxy({
  path: `/devices/${SITE}/sections/shared.schedules`,
  method: 'PUT',
  body: { payload: sched.json.payload },
  headers: { 'If-Match': 'sha256:stale' },
});
console.log('stale PUT             ', stale.status, stale.status === 412 ? '(412 as expected)' : '(UNEXPECTED)');
process.exit(stale.status === 412 ? 0 : 1);
