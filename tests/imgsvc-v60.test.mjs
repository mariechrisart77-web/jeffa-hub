import test from 'node:test'; import assert from 'node:assert';
import { minorRisk, addCues } from '../src/imgsvc-core.js';
test('v60 age gate', () => {
  assert.equal(minorRisk({ persona: { look: { age: 17 } } }, {}), true);
  assert.equal(minorRisk({ persona: { look: { age: 18 } } }, {}), false); // v84: Grenze 18
  assert.equal(minorRisk({ persona: { look: { age: 25 } } }, { identity: 'adult woman, Jugendlich' }), true);
  assert.equal(minorRisk({ persona: { look: { age: 25 } } }, { identity: 'adult woman, mid-20s' }), false);
});
test('v60 outfit first, plain', () => {
  const p = addCues('scene, no text, no letters', { outfit: 'wet clinging white T-shirt' }, '');
  assert.ok(p.startsWith('She is wearing wet clinging white T-shirt. The clothes are visibly soaked')); assert.ok(!p.includes(':1.3'));
});
