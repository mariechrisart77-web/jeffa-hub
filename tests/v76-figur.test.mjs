import test from 'node:test'; import assert from 'node:assert/strict';
import { buildIdentity } from '../src/promptapp/identity.js';
const P = (f) => ({ id: 'x', name: 'X', adult: true, persona: { age: 30, figur: f } });
test('v76: Figur-Skalen wie UI – Oberweite 6 = F (nicht G), 7 = G; Kurven = Hüfte, keine Sanduhr', () => {
  assert.match(buildIdentity({ profile: P({ oberweite: 6, kurven: 5 }), resolved: {}, adult: true }).identity, /F-cup/);
  assert.match(buildIdentity({ profile: P({ oberweite: 7 }), resolved: {}, adult: true }).identity, /G-cup/);
  const k = buildIdentity({ profile: P({ kurven: 5 }), resolved: {}, adult: true }).identity;
  assert.match(k, /average hips and waist/); assert.doesNotMatch(k, /hourglass/);
});
