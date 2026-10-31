import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCardToProfile, readPngCard, normalizeCard } from '../apps/chat/card.js';
const card = { spec: 'chara_card_v2', data: { name: 'Lena', extensions: { jeffa: { look: { hair: 'lange blonde Haare', age: 27, eyes: 'green eyes' }, figur: { statur: 'schlank', kurven: 12, oberweite: 3 }, traits: ['witty'], outfit: 'red dress' } } } };
test('maps to nested persona fields without mutating the profile', () => {
  const profile = { persona: { look: { hair: 'kurze schwarze Haare', details: 'freckles' }, figur: { kurven: 5 } } };
  const snap = JSON.stringify(profile);
  const { patch, changes } = mapCardToProfile(card, profile);
  assert.equal(JSON.stringify(profile), snap);
  assert.equal(patch.persona.look.hair, 'lange blonde Haare');
  assert.equal(patch.persona.look.age, 27);
  assert.equal(patch.persona.figur.kurven, 10);
  assert.equal(patch.persona.figur.statur, 'schlank');
  assert.match(patch.persona.look.details, /^freckles; Augen: green eyes; Eigenschaften: witty; Outfit: red dress/);
  assert.ok(changes.some((c) => c.field === 'persona.figur.oberweite'));
});
test('reads tEXt chara chunk from PNG', () => {
  const json = JSON.stringify(card), b64 = Buffer.from(json).toString('base64');
  const data = Buffer.concat([Buffer.from('chara\0', 'latin1'), Buffer.from(b64)]);
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); return Buffer.concat([l, Buffer.from(t), d, Buffer.alloc(4)]); };
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.alloc(13)), chunk('tEXt', data), chunk('IEND', Buffer.alloc(0))]);
  assert.equal(readPngCard(png).data.name, 'Lena');
  assert.equal(readPngCard(Buffer.from('nope')), null);
});
test('normalizes V1 cards', () => assert.equal(normalizeCard({ name: 'X', description: 'y' }).spec, 'chara_card_v2'));
