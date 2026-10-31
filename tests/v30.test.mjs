import test from 'node:test'; import assert from 'node:assert';
import { resolveLayers, effectiveRefMode, buildEditPrompt, pickVariation, composeInput, routeModel, shortModel, buildRulePrompt } from '../src/imgsvc-core.js';
test('full ref -> face when scene names place/pose/clothes', () => {
  const L = resolveLayers({ scene: 'Sie sitzt am Pool im Bikini' });
  assert.equal(effectiveRefMode('full', L), 'figur');
  assert.equal(effectiveRefMode('full', resolveLayers({ scene: 'sie lächelt' })), 'figur');
  assert.equal(effectiveRefMode('face', L), 'face');
});
test('edit prompt: scene first, soft outfit', () => {
  const p = buildEditPrompt('at the beach, wide shot', true);
  assert.ok(p.startsWith('New photo – SCENE'));
  assert.match(p, /body type \/ figure/); assert.match(p, /never from the reference image/);
  assert.doesNotMatch(p, /keep her outfit/);
});
test('variation differs across shots and respects pose dropdown', () => {
  const L = resolveLayers({ scene: 'x' });
  const set = new Set(Array.from({ length: 20 }, () => pickVariation(L)));
  assert.ok(set.size > 5);
  const Lp = resolveLayers({ resolved: { photo: { pose: 'standing', frame: 'close-up' } }, scene: 'x' });
  assert.equal(pickVariation(Lp), '');
  assert.match(buildRulePrompt(L, { variation: 'VARX' }).prompt, /VARX/);
});
test('composer input carries writer scene + variation', () => {
  const s = composeInput(resolveLayers({ scene: 'x' }), { llmScene: 'SCENEW', variation: 'VARY' });
  assert.match(s, /SCENEW/); assert.match(s, /VARY/);
});
test('short model label', () => {
  const r = routeModel({ refMode: 'face', hasRef: true });
  assert.equal(shortModel(r.model, r.label), 'z-image-turbo');
});
