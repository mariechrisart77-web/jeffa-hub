import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs';
import { minorRisk, scrubYouth } from '../src/imgsvc-core.js';
import { spanishTeacherProfile, SPANISH_LEVELS } from '../apps/chat/es-teacher.js';
test('v65 Spanischlehrerin clearly adult', () => {
  const p = spanishTeacherProfile();
  assert.equal(p.persona.look.age, 26); assert.equal(p.name, 'Lucía'); assert.equal(Object.keys(SPANISH_LEVELS).length, 3);
  assert.ok(!minorRisk(p, { identity: p.persona.look.typ, look: p.outfitText }));
  assert.equal(scrubYouth(p.persona.look.typ), p.persona.look.typ);
  assert.ok(!/teen|kindlich|jugendlich|schoolgirl|girl\b/i.test(JSON.stringify(p)));
  assert.ok(/Kastilisch/.test(p.systemPrompt) && /Übersetzung/.test(p.systemPromptAdult));
  assert.ok(fs.readFileSync('apps/chat/profiles.js', 'utf8').includes('add-es-btn'));
});
