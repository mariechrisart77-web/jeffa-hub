import test from 'node:test'; import assert from 'node:assert/strict';
import { resolveLayers, buildRulePrompt, composeInput, pickAngle } from '../src/imgsvc-core.js';
const scene = 'two women at a pool at night, one sitting on the edge';
test('remembered defaults are not locked, scene comes first', () => {
  const L = resolveLayers({ resolved: { look: 'X, evening dress', identity: 'X', defaults: { outfit: 'evening dress', place: 'bedroom', pose: 'kneeling' }, photo: {} }, scene });
  assert.equal(L.identity, 'X'); assert.equal(L.defaults.place, ''); assert.equal(L.defaults.pose, '');
  const p = buildRulePrompt(L, { angle: 'wide shot' }).prompt; assert.ok(p.replace(/^Framing: [^.]*\. /, '').startsWith('Scene: two women at a pool') && !/:1\.\d/.test(p)); // v68: keine Gewichte
  assert.ok(!/LOCKED[^]*evening dress[^]*CONTEXT/.test(composeInput(L, {})));
});
test('photo dropdowns still win and stay locked', () => {
  const L = resolveLayers({ resolved: { identity: 'X', defaults: { outfit: 'dress' }, photo: { outfit: 'red bikini', scene: 'beach' } }, scene });
  assert.equal(L.outfit, 'red bikini'); assert.equal(L.defaults.outfit, ''); assert.match(composeInput(L, {}).split('CONTEXT')[0], /red bikini/);
});
test('old synced profiles (no identity) keep working', () => {
  assert.equal(resolveLayers({ resolved: { look: 'Y' }, scene }).identity, 'Y');
});
test('random framing is weighted to the whole scene', () => {
  let n = 0; for (let i = 0; i < 2000; i++) if (/whole scene|wide shot/.test(pickAngle('hello'))) n++;
  assert.ok(n > 1200, String(n));
});
