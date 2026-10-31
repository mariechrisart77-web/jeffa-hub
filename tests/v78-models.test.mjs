import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage ??= { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = v; } };
const M = await import('../apps/shared/models.js');
test('v78 Modelle: kostenlos zuerst, bezahlt nur mit Freigabe, 💲 markiert', () => {
  assert.ok(M.isFree('nvidia/nemotron-3-ultra-550b-a55b:free') && !M.needsApproval('gemini-3.5-flash-lite') && !M.needsApproval('venice-uncensored-1-2') && M.needsApproval('openai/gpt-5'));
  for (const adult of [false, true]) {
    const c = M.resolveChain({ adult, paidAllowed: false });
    assert.ok(c.length && c.every(x => !M.needsApproval(x)), JSON.stringify(c));
    assert.ok(M.isFree(c[0]));
  }
  // v79: SFW Gemini weit oben, 18+ Gemini weit unten / Venice oben
  const n = M.PRESETS.normal.Standard, ad = M.PRESETS.adult.Standard;
  assert.ok(n.indexOf('gemini-3.5-flash-lite') <= 1);
  assert.ok(!ad.slice(0, 4).some(x => x.startsWith('gemini')) && ad.indexOf('venice-uncensored-1-2') <= 1);
  assert.deepEqual(M.resolveChain({ chatModel: 'venice-uncensored-1-2', adult: true, paidAllowed: false })[0], 'venice-uncensored-1-2');
  assert.ok(!M.resolveChain({ chatModel: 'openai/gpt-5', adult: true, paidAllowed: false }).includes('openai/gpt-5'));
  assert.equal(M.resolveChain({ chatModel: 'openai/gpt-5', adult: true, paidAllowed: true }).at(-1), 'openai/gpt-5');
  assert.match(M.modelInfo('venice:gemma-4-uncensored').desc, /\$\/Nachricht/);
  assert.equal(M.getPaidAllowed(), false);
  assert.match(M.modelInfo('openai/gpt-5').label, /^💲/);
  assert.doesNotMatch(M.modelInfo('gemini-3.5-flash-lite').label, /💲/);
  assert.doesNotMatch(M.modelInfo('dots-studio/dots-3-note-preview:free').label, /💲/);
});
