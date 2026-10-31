import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textToControls, syncProfileText, stripBody } from '../apps/chat/profilesync.js';

test('AP9-1 textToControls moves clothing/light/place out of identity', () => {
  const r = textToControls('long black hair, wearing grey latex micro bikini, soft studio light, background: bed, green eyes');
  assert.equal(r.controls.outfit, 'bikini'); assert.equal(r.controls.scene, 'schlafzimmer');
  assert.equal(r.text, 'long black hair, green eyes');
  assert.doesNotMatch(r.text, /bikini|light|bed/);
});
test('AP9-2/3 bust and build words removed from free text, rest unchanged', () => {
  assert.equal(stripBody('glamour photo of a curvy adult woman with a very large full bust, confident smile'), 'glamour photo of an adult woman, confident smile');
  assert.equal(stripBody('medium bust, freckles'), 'freckles');
  assert.equal(textToControls('Sie steht auf Parkplatzsex, Piercing').text, 'Sie steht auf Parkplatzsex, Piercing');
});
test('AP9 syncProfileText fills only empty controls', () => {
  const p = { persona: { look: { details: 'red hair, wearing an evening dress, golden hour light' } }, looks: {}, photo: { light: 'neon' } };
  syncProfileText(p);
  assert.equal(p.persona.look.details, 'red hair'); assert.equal(p.photo.outfit, 'abendkleid'); assert.equal(p.photo.light, 'neon');
});
test('AP9-5 one control per aspect in look tab', () => {
  const s = readFileSync('apps/chat/look.js', 'utf8');
  assert.doesNotMatch(s, /name="look-style"/); assert.match(s, /\['render', 'Bildstil/);
  assert.match(readFileSync('apps/chat/profiles.js', 'utf8'), /st\.pose && !ph\.pose/);
});
