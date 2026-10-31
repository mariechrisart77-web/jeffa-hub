import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs';
import { scrubYouth, minorRisk } from '../src/imgsvc-core.js';
test('v61 autofill output scrubbed of youth wording', () => {
  const t = scrubYouth('teen girl look, schoolgirl uniform, 17 years old, jugendliche Ausstrahlung, red dress');
  assert.ok(!/teen|schoolgirl|17 years|jugendlich/i.test(t)); assert.ok(/red dress/.test(t));
});
test('v61 age gate still active', () => { assert.ok(minorRisk({ persona: { look: { age: 17 } } }, {})); assert.ok(!minorRisk({ persona: { look: { age: 18 } } }, {})); assert.ok(!minorRisk({ persona: { look: { age: 28 } } }, {})); });
test('v61 autofill UI only on button press', () => {
  const s = fs.readFileSync(new URL('../apps/chat/profiles.js', import.meta.url), 'utf8');
  assert.ok(s.includes('✨ Automatisch ausfüllen') && s.includes('🔄 Neu erzeugen') && s.includes('↩️ Rückgängig'));
  const h = fs.readFileSync(new URL('../src/bild/imagefb-handler.ts', import.meta.url), 'utf8');
  assert.ok(/18 or older/.test(h) && /scrubYouth/.test(h) && /not_adult/.test(h));
});
