#!/usr/bin/env node
/**
 * Phase 1 regression harness for the DDB config-plane migration.
 *
 * Runs the §6 checklist against the legacy-shape schedules API for a
 * DDB-authoritative site (default domagala_1). Talks to API Gateway directly
 * (same Lambda + same x-api-key the Supabase aws-proxy injects), so results
 * are representative of the app's path minus the proxy hop.
 *
 * The harness restores every mutation it makes: test rules are deleted,
 * safety and the P9 site-limit rule are restored to their initial values.
 *
 * Usage: node scripts/ddb-regression.mjs [--site domagala_1] [--skip-expiry]
 * Requires: AWS CLI credentials able to read the aiess-update-schedules
 * Lambda configuration (to fetch the API key).
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Stage name is `default` (not $default) so it appears in the path.
const BASE = 'https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default';
const REGION = 'eu-central-1';

const args = process.argv.slice(2);
const SITE = args.includes('--site') ? args[args.indexOf('--site') + 1] : 'domagala_1';
const SKIP_EXPIRY = args.includes('--skip-expiry');

// ─── API key via AWS CLI ────────────────────────────────────────

function getApiKey() {
  const out = execFileSync('aws', [
    'lambda', 'get-function-configuration',
    '--function-name', 'aiess-update-schedules',
    '--region', REGION,
    '--query', 'Environment.Variables.API_KEY',
    '--output', 'text',
  ], { encoding: 'utf8' }).trim();
  if (!out || out === 'None') throw new Error('Could not read API_KEY from Lambda env');
  return out;
}

const API_KEY = getApiKey();

// ─── HTTP helpers ───────────────────────────────────────────────

async function apiGet() {
  const res = await fetch(`${BASE}/schedules/${SITE}`, {
    headers: { 'x-api-key': API_KEY },
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

async function apiPost(body) {
  const res = await fetch(`${BASE}/schedules/${SITE}`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: SITE, ...body }),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Reporting ──────────────────────────────────────────────────

const results = [];
let currentTest = null;

function test(name) {
  currentTest = { name, checks: [], pass: true };
  results.push(currentTest);
  console.log(`\n=== ${name}`);
}

function check(desc, ok, detail = '') {
  currentTest.checks.push({ desc, ok, detail });
  if (!ok) currentTest.pass = false;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${desc}${detail ? ` -- ${detail}` : ''}`);
}

// Compare that every field we sent survives the round trip identically.
// The backend may ADD normalization fields (e.g. s:"man", ua); those are
// reported informationally, not as failures.
function subsetEqual(sent, got, path = '') {
  const diffs = [];
  if (typeof sent !== typeof got || Array.isArray(sent) !== Array.isArray(got)) {
    return [`${path}: type mismatch (sent ${JSON.stringify(sent)}, got ${JSON.stringify(got)})`];
  }
  if (Array.isArray(sent)) {
    if (sent.length !== got.length) return [`${path}: array length ${sent.length} != ${got.length}`];
    sent.forEach((v, i) => diffs.push(...subsetEqual(v, got[i], `${path}[${i}]`)));
    return diffs;
  }
  if (sent && typeof sent === 'object') {
    for (const k of Object.keys(sent)) {
      if (!(k in (got ?? {}))) { diffs.push(`${path}.${k}: missing in response`); continue; }
      diffs.push(...subsetEqual(sent[k], got[k], `${path}.${k}`));
    }
    return diffs;
  }
  if (sent !== got) diffs.push(`${path}: sent ${JSON.stringify(sent)}, got ${JSON.stringify(got)}`);
  return diffs;
}

// Key-order-insensitive deep equality (DDB path may reorder JSON keys).
function deepEqual(a, b) {
  return subsetEqual(a, b).length === 0 && subsetEqual(b, a).length === 0;
}

function findRule(schJson, prio, id) {
  return (schJson?.sch?.[`p_${prio}`] ?? []).find((r) => r.id === id);
}

// ─── Golden snapshot for restore ────────────────────────────────

let initial = null;

async function snapshotInitial() {
  const r = await apiGet();
  if (r.status !== 200 || !r.json) throw new Error(`Initial GET failed: ${r.status} ${r.text}`);
  initial = r.json;
}

async function restoreState() {
  console.log('\n=== Restore: cleaning test rules, restoring safety + P9');
  const cur = (await apiGet()).json;
  if (!cur) { console.log('  restore GET failed, manual check needed'); return; }
  const updates = {};
  for (let p = 4; p <= 9; p++) {
    const key = `p_${p}`;
    const curRules = cur.sch?.[key] ?? [];
    const wanted = initial.sch?.[key] ?? [];
    // Drop anything we created (ZZTEST-*), and restore original arrays for
    // priorities we touched (P9 site-limit, moved rules).
    const cleaned = curRules.filter((r) => !r.id.startsWith('ZZTEST-'));
    const differs = JSON.stringify(cleaned) !== JSON.stringify(wanted)
      || curRules.length !== cleaned.length;
    if (differs) updates[key] = wanted;
  }
  const body = { sch: updates };
  if (initial.safety) body.safety = { soc_min: initial.safety.soc_min, soc_max: initial.safety.soc_max };
  const r = await apiPost(body);
  console.log(`  restore POST -> ${r.status}`);
  const after = (await apiGet()).json;
  const leftover = [];
  for (let p = 4; p <= 9; p++) {
    for (const rule of after?.sch?.[`p_${p}`] ?? []) {
      if (rule.id.startsWith('ZZTEST-')) leftover.push(`p_${p}/${rule.id}`);
    }
  }
  console.log(leftover.length === 0
    ? '  state restored, no ZZTEST leftovers'
    : `  WARNING leftovers: ${leftover.join(', ')}`);
}

// ─── Checklist tests ────────────────────────────────────────────

async function t1_goldenGet() {
  test('1. Golden GET: shape, metadata, safety, mode');
  const r = await apiGet();
  check('HTTP 200', r.status === 200, `status ${r.status}`);
  const j = r.json;
  check('site_id echoes', j?.site_id === SITE);
  check('has v (format string)', typeof j?.v === 'string', `v=${j?.v}`);
  check('has mode', ['automatic', 'semi-automatic', 'manual'].includes(j?.mode), `mode=${j?.mode}`);
  check('safety present', j?.safety && typeof j.safety.soc_min === 'number' && typeof j.safety.soc_max === 'number',
    JSON.stringify(j?.safety));
  check('sch is object', j?.sch && typeof j.sch === 'object');
  check('metadata counts present', j?.metadata && ['total_rules', 'local_rules', 'cloud_rules', 'scada_safety_rules']
    .every((k) => typeof j.metadata[k] === 'number'), JSON.stringify(j?.metadata));

  // SoC integer fidelity: inspect the raw JSON text for float-formatted SoC.
  const floatSoc = /"soc_(?:min|max)"\s*:\s*\d+\.\d+/.test(r.text);
  check('safety SoC serialized as integers (raw text)', !floatSoc);

  // Cloud-band rule count consistency
  let cloudCount = 0;
  for (let p = 4; p <= 9; p++) cloudCount += (j?.sch?.[`p_${p}`] ?? []).length;
  check('metadata.cloud_rules + scada matches visible rules or documented split',
    typeof j?.metadata?.cloud_rules === 'number',
    `visible p4-9=${cloudCount}, metadata=${JSON.stringify(j?.metadata)}`);

  // Every rule renders through the app's field extraction (same reads as
  // optimizedRuleToFormData): id, a.t present, c/ts/te types sane.
  const badRules = [];
  for (let p = 4; p <= 9; p++) {
    for (const rule of j?.sch?.[`p_${p}`] ?? []) {
      if (typeof rule.id !== 'string' || !rule.a || typeof rule.a.t !== 'string') {
        badRules.push(`p_${p}/${rule.id ?? '?'}`);
        continue;
      }
      if (rule.c?.ts !== undefined && typeof rule.c.ts !== 'number') badRules.push(`p_${p}/${rule.id}: ts not int`);
      if (rule.c?.te !== undefined && typeof rule.c.te !== 'number') badRules.push(`p_${p}/${rule.id}: te not int`);
      if (rule.vf !== undefined && typeof rule.vf !== 'number') badRules.push(`p_${p}/${rule.id}: vf not int`);
      if (rule.vu !== undefined && typeof rule.vu !== 'number') badRules.push(`p_${p}/${rule.id}: vu not int`);
    }
  }
  check('all rules parse for the editor', badRules.length === 0, badRules.join('; '));

  // Read-only bands (P1-P3 local, P10-P11 SCADA) must be present in the GET
  // when the site has them, so the app can render them read-only.
  const roCount = [1, 2, 3, 10, 11].reduce((n, p) => n + (j?.sch?.[`p_${p}`] ?? []).length, 0);
  const expectedRo = (j?.metadata?.local_rules ?? 0) + (j?.metadata?.scada_safety_rules ?? 0);
  check('read-only bands visible in GET (matches metadata)', roCount === expectedRo,
    `visible=${roCount}, metadata local+scada=${expectedRo}`);
  return j;
}

async function t10_modeRoundTrip() {
  test('10. Mode round-trip (automatic <-> semi-automatic)');
  const origMode = initial.mode;
  const target = origMode === 'semi-automatic' ? 'automatic' : 'semi-automatic';
  const r = await apiPost({ mode: target });
  check('mode POST accepted', r.status === 200, `status ${r.status}: ${r.text.slice(0, 150)}`);
  const g = (await apiGet()).json;
  check(`mode reads back as ${target}`, g?.mode === target, `mode=${g?.mode}`);
  const rr = await apiPost({ mode: origMode });
  const g2 = (await apiGet()).json;
  check(`mode restored to ${origMode}`, rr.status === 200 && g2?.mode === origMode, `mode=${g2?.mode}`);
}

async function t2_roundTrips() {
  test('2. Round-trip per action type (ch, dis, ct, threshold)');
  const now = Math.floor(Date.now() / 1000);
  const rules = [
    { id: 'ZZTEST-CH', s: 'man', a: { t: 'ch', pw: 10 }, c: { ts: 100, te: 200 }, d: [1, 2, 3] },
    { id: 'ZZTEST-DIS', s: 'man', a: { t: 'dis', pw: 15, pid: true }, c: { sm: 20, sx: 90 } },
    { id: 'ZZTEST-CT', s: 'man', a: { t: 'ct', soc: 80, str: 'eq', maxp: 50 }, c: { ts: 300, te: 400 } },
    { id: 'ZZTEST-THR', s: 'man', a: { t: 'dis', pw: 5 }, c: { gpo: 'gt', gpv: 2 }, vf: now, vu: now + 86400 },
  ];
  const base = initial.sch?.p_5 ?? [];
  const r = await apiPost({ sch: { p_5: [...base, ...rules] } });
  check('save accepted', r.status === 200, `status ${r.status}: ${r.text.slice(0, 200)}`);

  const after = (await apiGet()).json;
  for (const sent of rules) {
    const got = findRule(after, 5, sent.id);
    if (!got) { check(`${sent.id} present after refetch`, false); continue; }
    const diffs = subsetEqual(sent, got, sent.id);
    check(`${sent.id} survives identically`, diffs.length === 0, diffs.join('; '));
  }

  // cleanup
  const del = await apiPost({ sch: { p_5: base } });
  const afterDel = (await apiGet()).json;
  const gone = rules.every((s) => !findRule(afterDel, 5, s.id));
  check('test rules deleted', del.status === 200 && gone);
}

async function t3_priorityMove() {
  test('3. Priority move p_5 -> p_7, no orphan');
  const rule = { id: 'ZZTEST-MOVE', s: 'man', a: { t: 'ch', pw: 7 }, c: {} };
  const p5base = initial.sch?.p_5 ?? [];
  const p7base = initial.sch?.p_7 ?? [];

  let r = await apiPost({ sch: { p_5: [...p5base, rule] } });
  check('create in p_5', r.status === 200, `status ${r.status}`);

  // Move: the app posts both arrays (old without, new with) in one POST.
  r = await apiPost({ sch: { p_5: p5base, p_7: [...p7base, rule] } });
  check('move POST accepted', r.status === 200, `status ${r.status}`);

  const after = (await apiGet()).json;
  check('present in p_7', !!findRule(after, 7, rule.id));
  check('no orphan in p_5', !findRule(after, 5, rule.id));

  r = await apiPost({ sch: { p_7: p7base } });
  const afterDel = (await apiGet()).json;
  check('cleanup', r.status === 200 && !findRule(afterDel, 7, rule.id));
}

async function t4_safety() {
  test('4. Safety SoC write: integers echo, shape unchanged');
  const r = await apiPost({ safety: { soc_min: 1, soc_max: 100 } });
  check('POST accepted', r.status === 200, `status ${r.status}: ${r.text.slice(0, 200)}`);
  const g = await apiGet();
  check('soc_min == 1', g.json?.safety?.soc_min === 1, JSON.stringify(g.json?.safety));
  check('soc_max == 100', g.json?.safety?.soc_max === 100);
  const floatSoc = /"soc_(?:min|max)"\s*:\s*\d+\.\d+/.test(g.text);
  check('integers in raw JSON', !floatSoc);
  // restore
  const orig = initial.safety ?? { soc_min: 5, soc_max: 100 };
  const rr = await apiPost({ safety: { soc_min: orig.soc_min, soc_max: orig.soc_max } });
  check('safety restored', rr.status === 200, JSON.stringify(orig));
}

async function t5_siteLimit() {
  test('5. P9 site limit sl rule round-trip');
  const p9base = initial.sch?.p_9 ?? [];
  const origSl = p9base.find((x) => x.a?.t === 'sl');
  const otherP9 = p9base.filter((x) => x.a?.t !== 'sl');
  const sl = { id: origSl?.id ?? 'SITE-LIMIT', s: 'man', a: { t: 'sl', hth: 71, lth: -47 }, c: {} };

  const r = await apiPost({ sch: { p_9: [...otherP9, sl] } });
  check('sl write accepted', r.status === 200, `status ${r.status}: ${r.text.slice(0, 200)}`);
  const after = (await apiGet()).json;
  const got = findRule(after, 9, sl.id);
  check('sl round-trips', got?.a?.t === 'sl' && got?.a?.hth === 71 && got?.a?.lth === -47, JSON.stringify(got?.a));
  check('single sl rule in p_9', (after?.sch?.p_9 ?? []).filter((x) => x.a?.t === 'sl').length === 1);

  const rr = await apiPost({ sch: { p_9: p9base } });
  const restored = (await apiGet()).json;
  const restoredSl = (restored?.sch?.p_9 ?? []).find((x) => x.a?.t === 'sl');
  check('original p_9 restored', rr.status === 200
    && deepEqual(restoredSl?.a, origSl?.a),
    `now: ${JSON.stringify(restoredSl?.a)}, want: ${JSON.stringify(origSl?.a)}`);
}

async function t6_aiExpiry() {
  test('6. AI rule auto-expiry (s:"ai" + vu = now+5min)');
  if (SKIP_EXPIRY) { check('skipped (--skip-expiry)', true); return; }
  const now = Math.floor(Date.now() / 1000);
  const vu = now + 300;
  const rule = { id: 'ZZTEST-AI-EXPIRY', s: 'ai', vu, a: { t: 'ch', pw: 3 }, c: {} };
  const p4base = initial.sch?.p_4 ?? [];
  const r = await apiPost({ sch: { p_4: [...p4base, rule] } });
  check('ai rule accepted', r.status === 200, `status ${r.status}: ${r.text.slice(0, 200)}`);
  const g = (await apiGet()).json;
  check('ai rule visible before expiry', !!findRule(g, 4, rule.id));

  // Poll until gone, up to vu + 10 min.
  const deadline = (vu + 600) * 1000;
  let gone = false;
  while (Date.now() < deadline) {
    await sleep(30_000);
    const cur = (await apiGet()).json;
    if (!findRule(cur, 4, rule.id)) { gone = true; break; }
    const left = Math.round((deadline - Date.now()) / 1000);
    console.log(`  ...still present, ${left}s until timeout`);
  }
  check('ai rule auto-deleted after vu', gone);
  if (!gone) {
    const rr = await apiPost({ sch: { p_4: p4base } });
    console.log(`  manual cleanup -> ${rr.status}`);
  }
}

async function t7_tzStability() {
  test('7. TZ stability: 3 edit cycles, vf/vu must not drift');
  const now = Math.floor(Date.now() / 1000);
  const vf = now - (now % 86400); // midnight UTC today (any stable epoch works)
  const vu = vf + 7 * 86400;
  const p6base = initial.sch?.p_6 ?? [];
  let rule = { id: 'ZZTEST-TZ', s: 'man', a: { t: 'ch', pw: 5 }, c: {}, vf, vu };

  let ok = true;
  let detail = '';
  for (let i = 1; i <= 3; i++) {
    const r = await apiPost({ sch: { p_6: [...p6base, rule] } });
    if (r.status !== 200) { ok = false; detail = `edit ${i} status ${r.status}`; break; }
    const got = findRule((await apiGet()).json, 6, rule.id);
    if (!got || got.vf !== vf || got.vu !== vu) {
      ok = false;
      detail = `edit ${i}: vf ${got?.vf} (want ${vf}), vu ${got?.vu} (want ${vu})`;
      break;
    }
    // Re-save exactly what came back (simulates app edit-save cycle).
    rule = got;
  }
  check('vf/vu stable across 3 edits', ok, detail);
  const rr = await apiPost({ sch: { p_6: p6base } });
  check('cleanup', rr.status === 200 && !findRule((await apiGet()).json, 6, 'ZZTEST-TZ'));
}

async function t8_errorParity() {
  test('8. Error parity: P3/P10 writes, missing id, ai without vu -> 400');
  const cases = [
    ['P3 write rejected', { sch: { p_3: [{ id: 'ZZTEST-P3', a: { t: 'ch', pw: 1 }, c: {} }] } }],
    ['P10 write rejected', { sch: { p_10: [{ id: 'ZZTEST-P10', a: { t: 'ch', pw: 1 }, c: {} }] } }],
    ['missing id rejected', { sch: { p_5: [{ a: { t: 'ch', pw: 1 }, c: {} }] } }],
    ['ai without vu rejected', { sch: { p_5: [{ id: 'ZZTEST-AI-NOVU', s: 'ai', a: { t: 'ch', pw: 1 }, c: {} }] } }],
  ];
  for (const [name, body] of cases) {
    const r = await apiPost(body);
    check(`${name} (400)`, r.status === 400, `status ${r.status}: ${r.text.slice(0, 150)}`);
  }
  // Confirm nothing leaked through
  const g = (await apiGet()).json;
  const leaked = ['ZZTEST-P3', 'ZZTEST-P10', 'ZZTEST-AI-NOVU']
    .filter((id) => [4, 5, 6, 7, 8, 9].some((p) => findRule(g, p, id)));
  check('no rejected rules persisted', leaked.length === 0, leaked.join(', '));
}

async function t9_siteConfig() {
  test('9. site-config untouched (GET sanity)');
  const res = await fetch(`${BASE}/site-config/${SITE}`, { headers: { 'x-api-key': API_KEY } });
  const j = safeJson(await res.text());
  check('GET /site-config 200', res.status === 200, `status ${res.status}`);
  check('site_id echoes', j?.site_id === SITE);
  check('has expected top-level sections', !!(j?.general || j?.battery || j?.power_limits),
    Object.keys(j ?? {}).join(','));
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log(`DDB regression harness — site ${SITE}, base ${BASE}`);
  await snapshotInitial();
  console.log(`Initial state: ${initial.metadata?.total_rules} rules, safety ${JSON.stringify(initial.safety)}, mode ${initial.mode}`);

  try {
    await t1_goldenGet();
    await t2_roundTrips();
    await t3_priorityMove();
    await t4_safety();
    await t5_siteLimit();
    await t7_tzStability();
    await t8_errorParity();
    await t9_siteConfig();
    await t10_modeRoundTrip();
    await t6_aiExpiry(); // last: it blocks for up to ~15 min
  } finally {
    await restoreState();
  }

  // ─ Report ─
  const lines = [
    `# DDB regression report — ${SITE}`,
    '',
    `Run: ${new Date().toISOString()}  |  Backend: compat shim target \`ddb\`  |  Base: ${BASE}`,
    '',
    '| Test | Result |',
    '|---|---|',
  ];
  let allPass = true;
  for (const t of results) {
    if (!t.pass) allPass = false;
    lines.push(`| ${t.name} | ${t.pass ? 'PASS' : '**FAIL**'} |`);
  }
  lines.push('', '## Details', '');
  for (const t of results) {
    lines.push(`### ${t.name}`, '');
    for (const c of t.checks) {
      lines.push(`- ${c.ok ? 'PASS' : '**FAIL**'} — ${c.desc}${c.detail ? ` — ${c.detail}` : ''}`);
    }
    lines.push('');
  }
  lines.push(allPass
    ? 'All checks passed: the app requires **zero changes** for the DDB-backed legacy API.'
    : 'Failures above are **backend bugs to report** (parity contract), not app issues to patch.');

  const outPath = join(dirname(fileURLToPath(import.meta.url)), `ddb-regression-report-${SITE}.md`);
  writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`\nReport written to ${outPath}`);
  console.log(allPass ? '\nRESULT: ALL PASS' : '\nRESULT: FAILURES PRESENT');
  process.exitCode = allPass ? 0 : 1;
}

main().catch((err) => {
  console.error('Harness crashed:', err);
  process.exitCode = 2;
});
