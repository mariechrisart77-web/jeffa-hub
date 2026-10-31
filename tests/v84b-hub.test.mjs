import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { applyTabOrder, moveId, TAB_ORDER_KEY } from '../apps/shared/taborder.js';
import { balanceLabel } from '../apps/shared/balance.js';
import { rpIdFor, mergeCredIds } from '../src/webauthn-util.js';
import { webauthnErrorText } from '../apps/shared/auth.js';
import { parseOpenRouter, parseVenice, parseVnaipro, parseRunware, NO_BALANCE_API } from '../src/balance-parse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// ---------- H1: taborder ----------
test('H1 applyTabOrder: gespeicherte Reihenfolge, Unbekanntes, Neue, Duplikate', () => {
  const ids = ['chat', 'bot', 'comic', 'settings'];
  assert.deepEqual(applyTabOrder(ids, ['settings', 'chat']), ['settings', 'chat', 'bot', 'comic']);
  assert.deepEqual(applyTabOrder(ids, ['gibtsnicht', 'comic', 'comic', 42]), ['comic', 'chat', 'bot', 'settings']);
  assert.deepEqual(applyTabOrder(ids, []), ids);
  assert.deepEqual(applyTabOrder(ids, null), ids);
  assert.deepEqual(applyTabOrder(ids, ['bot', 'bot', 'settings', 'settings']), ['bot', 'settings', 'chat', 'comic']);
  assert.equal(TAB_ORDER_KEY, 'jeffa.tabOrder');
});

test('H1 moveId: vor, zurück, Ränder', () => {
  const l = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveId(l, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveId(l, 3, 1), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveId(l, 0, -5), l); // Ziel <0 → auf 0 begrenzt
  assert.deepEqual(moveId(l, 0, 99), ['b', 'c', 'd', 'a']); // Ziel >n → ans Ende
  assert.deepEqual(moveId(l, 9, 1), l);
  assert.deepEqual(moveId([], 0, 1), []);
  assert.deepEqual(l, ['a', 'b', 'c', 'd']);
});

test('H1 app.js/app.css Smoke', () => {
  const app = read('apps/hub/app.js');
  for (const s of ['applyTabOrder', 'TAB_ORDER_KEY', 'pointerdown', 'pointercancel']) assert.ok(app.includes(s), s);
  const css = read('apps/hub/app.css');
  assert.ok(css.includes('.tab-btn.dragging'));
  assert.ok(/-webkit-touch-callout:\s*none/.test(css));
});

// ---------- H2: webauthn ----------
test('H2 rpIdFor', () => {
  assert.equal(rpIdFor('preview-v84.jeffa-hub.pages.dev'), 'jeffa-hub.pages.dev');
  assert.equal(rpIdFor('jeffa-hub.pages.dev'), 'jeffa-hub.pages.dev');
  assert.equal(rpIdFor('localhost'), 'localhost');
  assert.equal(rpIdFor('example.com', 'jeffa-hub.pages.dev'), 'jeffa-hub.pages.dev');
});

test('H2 mergeCredIds', () => {
  assert.deepEqual(mergeCredIds(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(mergeCredIds(null, undefined), []);
  assert.deepEqual(mergeCredIds(['a'], ['a']), ['a']);
});

test('H2 webauthnErrorText', () => {
  assert.match(webauthnErrorText({ name: 'NotAllowedError' }), /Face ID abgebrochen/);
  assert.match(webauthnErrorText({ name: 'InvalidStateError' }), /schon eingerichtet/);
  assert.match(webauthnErrorText({ name: 'SecurityError' }), /https:\/\/jeffa-hub\.pages\.dev/);
  assert.equal(webauthnErrorText({ name: 'OtherError', message: 'kaputt' }), 'kaputt');
});

test('H2 auth.js/api.js Smoke', () => {
  const auth = read('apps/shared/auth.js');
  assert.ok(auth.includes('prefetchWebAuthn'));
  assert.ok(!/await registerWebAuthn\(\);\s*\n\s*await loginWebAuthn\(\)/.test(auth));
  assert.ok(/\.webauthn-btn'?\)?\s*;?\s*\n?\s*if \(/.test(auth) || auth.includes("modal.querySelector('.webauthn-btn')"));
  const apiJs = read('apps/shared/api.js');
  assert.ok(apiJs.includes('faceId !== false'));
});

test('H2 webauthn.ts/route Smoke', () => {
  const wa = read('src/webauthn.ts');
  assert.ok(wa.includes('residentKey'));
  assert.ok(/userId\s*=\s*crypto\.getRandomValues\(new Uint8Array\(16\)\)/.test(wa)); // zufällige user.id statt Nullen
  assert.ok(wa.includes('auth:credidx'));
  const route = read('functions/api/auth/[[route]].ts');
  assert.ok(route.includes('rpIdFor'));
  const verifyBlock = route.slice(route.indexOf('/webauthn/register/verify'), route.indexOf('/webauthn/login/options'));
  assert.ok(verifyBlock.includes('token'));
});

// ---------- B: balances ----------
test('B parseOpenRouter', () => {
  const r = parseOpenRouter({ data: { usage: 3, limit: 10 } }, { data: { total_credits: 10, total_usage: 3.5 } });
  assert.equal(r.balanceUsd, 6.5);
  assert.equal(r.usedUsd, 3);
  assert.equal(r.limitUsd, 10);
  assert.equal(r.unit, 'USD');
});

test('B parseVenice USD und DIEM', () => {
  const usd = parseVenice({ data: { balances: { USD: 12.34 } } });
  assert.deepEqual(usd, { unit: 'USD', balanceUsd: 12.34 });
  const diem = parseVenice({ data: { balances: { DIEM: 123.4 } } });
  assert.deepEqual(diem, { unit: 'DIEM', balanceUsd: 123.4 });
  assert.equal(parseVenice({}), null);
  assert.equal(parseVenice(null), null);
});

test('B parseVnaipro limit/used → balance', () => {
  const r = parseVnaipro({ hard_limit_usd: 20 }, { total_usage: 1234 });
  assert.equal(r.limitUsd, 20);
  assert.equal(r.usedUsd, 12.34);
  assert.equal(r.balanceUsd, 7.66);
  assert.equal(r.unit, 'USD');
  assert.equal(parseVnaipro(null, null), null);
});

test('B parseRunware: kein apiKeys im Ergebnis', () => {
  const fakeKey = 'sk-runware-SECRET-xyz';
  const json = { data: [{ balance: { amount: 5, freeBalance: 2.5, currency: 'USD' }, apiKeys: [{ key: fakeKey }] }] };
  const r = parseRunware(json);
  assert.equal(r.balanceUsd, 7.5);
  assert.equal(r.unit, 'USD');
  const dumped = JSON.stringify(r);
  assert.ok(!dumped.includes(fakeKey));
  assert.ok(!/apiKey/i.test(dumped));
});

test('B kaputte Eingaben → null (available:false)', () => {
  assert.equal(parseOpenRouter(null, null), null);
  assert.equal(parseRunware({}), null);
  assert.equal(parseRunware({ data: [] }), null);
  assert.ok(NO_BALANCE_API.includes('gemini') && NO_BALANCE_API.includes('mistral'));
});

test('B balanceLabel', () => {
  assert.equal(balanceLabel({ unit: 'USD', balanceUsd: 12.34 }), '$12.34');
  assert.equal(balanceLabel({ unit: 'DIEM', balanceUsd: 123.4 }), '123.4 DIEM');
  assert.equal(balanceLabel({ unit: 'USD', usedUsd: 3, limitUsd: 10 }), '$3.00 von $10.00 genutzt');
  assert.equal(balanceLabel({ available: false, note: 'Guthaben nicht abrufbar' }), 'Guthaben nicht abrufbar');
  assert.equal(balanceLabel(null), 'Guthaben nicht abrufbar');
  assert.equal(balanceLabel({ balanceUsd: -5 }), '$0.00');
});

test('B balances.ts Smoke', () => {
  const b = read('functions/api/balances.ts') + read('src/balance-parse.js');
  for (const p of ['gemini', 'openrouter', 'venice', 'hf', 'xai', 'vnaipro', 'groq', 'mistral', 'runware']) assert.ok(b.includes(p), p);
  assert.ok(b.includes('balances:v84'));
  assert.ok(b.includes('Guthaben nicht abrufbar'));
});

// ---------- QA-Ergänzungen (Bot) ----------
test('QA H1: Touch-Zieh-Modus blockiert natives Scrollen, Autoscroll nutzt aktuelle Position', () => {
  const app = read('apps/hub/app.js');
  assert.match(app, /addEventListener\('touchmove'[^\n]*preventDefault\(\)[^\n]*passive: false/);
  assert.ok(app.includes('autoScroll(drag.lastX)'));
});
test('QA H2: register/verify mit Schranke, Settings-Knopf ohne await vor create()', () => {
  const route = read('functions/api/auth/[[route]].ts');
  const i = route.indexOf("'/webauthn/register/verify'");
  const seg = route.slice(i, route.indexOf("'/webauthn/login/options'"));
  assert.ok(seg.includes("getAuthState") && seg.includes("forbidden"), 'Schranke in register/verify');
  assert.ok(seg.indexOf('forbidden') < seg.indexOf('createSession'));
  const wa = read('src/webauthn.ts');
  assert.ok(wa.includes("kind: 'register'") && wa.includes("kind: 'login'"));
  assert.ok(wa.includes('let pos = 37 + 16;'), 'AAGUID wird übersprungen');
  const st = read('apps/hub/settings.js');
  assert.ok(st.includes("prefetchWebAuthn('register')"));
  const auth = read('apps/shared/auth.js');
  const reg = auth.slice(auth.indexOf('export async function registerWebAuthn'), auth.indexOf('export async function loginWebAuthn'));
  assert.ok(reg.indexOf('navigator.credentials.create') > 0);
  assert.ok(!/await[^\n]*\n[\s\S]*navigator\.credentials\.create/.test(reg.slice(0, reg.indexOf('navigator.credentials.create')).replace(/await navigator/, '')), 'kein await vor create()');
});
test('QA Bild 18+: Grenze 18, Jugendschutz unter 18 bleibt', async () => {
  const core = await import('../src/imgsvc-core.js');
  const src = read('src/imgsvc-core.js');
  assert.ok(!/age\s*<\s*21/.test(src));
  assert.ok(/age\s*<\s*18/.test(src));
  assert.equal(core.minorRisk({ look: { age: 17 } }), true);
  assert.equal(core.minorRisk({ look: { age: 18 } }), false);
  assert.equal(core.minorRisk({ look: { age: 30 }, description: 'looks about 16' }), true);
  assert.ok(!/\b16\b/.test(core.scrubYouth('woman, looks about 16, red dress')));
});
