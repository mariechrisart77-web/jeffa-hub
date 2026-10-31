import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildImagePlan } from '../src/imgsvc-core.js';

const src = fs.readFileSync(new URL('../apps/chat/photoopts.js', import.meta.url), 'utf8');

test('v70/v74: neue FSK18-Presets vorhanden, nur 18+, keine Duplikate', () => {
  // Pose-Presets (allows trailing comma in array literal, no negative string required)
  for (const id of ['piercings1', 'o_haube', 'o_bett', 'o_liege']) {
    const re = new RegExp(`\\['${id}', '[^']*', '[^']*', 1(, '[^']*')?\\]`);
    assert.ok(re.test(src), id + ' fehlt oder nicht 18+');
  }
  assert.equal((src.match(/thumb hooked in bikini string/g) || []).length, 1);
  assert.ok(/\['bikini', '[^']*Christians Look\)', '[^']*Wicked Weasel[^']*', 1, /.test(src), 'christianlook = bikini 18+');
  assert.ok(/christianlook: 'bikini'/.test(src));
  assert.ok(/koerper: KOERPER/.test(src) && /out\.koerper/.test(src));
});

test('v70: Nässe verfällt bei Ortswechsel', async () => {
  const llm = async () => JSON.stringify({ scene: 'hotel room', pose: 'sitting on the bed', background: 'hotel room', outfit_state: 'wet', story: { location: 'hotel room', outfit_state: 'wet' } });
  const p = await buildImagePlan({ profile: { persona: { look: { age: 25 } } }, resolved: { identity: 'Lora, adult woman, looks about 25' }, prevStory: { location: 'pool', outfit_state: 'wet', updatedAt: 1 },
    body: { adult: true, context: { messages: [{ role: 'assistant', content: 'Später am Abend im Hotelzimmer.' }] } }, composeLLM: llm, rnd: () => 0.4 });
  assert.ok(!/soaking wet/.test(p.prompt), p.prompt);
});

test('v70/v74: Dropdown-Outfit-Text mit Piercings bleibt im Prompt (Dropdown schlägt Alles)', async () => {
  const outfit = 'grey micro bikini, straight barbell nipple piercings with small silver balls, christina piercing';
  const p = await buildImagePlan({ profile: { adult: true, persona: { look: { age: 25 } } }, resolved: { identity: 'Lora, adult woman, looks about 25' },
    body: { adult: true, photoOverride: { outfit }, context: { messages: [{ role: 'assistant', content: 'Am Pool.' }] } }, rnd: () => 0.4 });
  assert.match(p.prompt, /christina piercing/);
});

test('v70: Regel 7 kürzt keine Dropdown-Texte (Outfit/Pose)', async () => {
  const p = await buildImagePlan({ profile: { persona: { look: { age: 25 } } }, resolved: { identity: 'Lora, adult woman, looks about 25' },
    body: { adult: true, photoOverride: { outfit: 'grey latex micro bikini clinging like a second skin, red hat', pose: 'kneeling on bed, hands on thighs' }, context: { messages: [{ role: 'assistant', content: 'Im Hotel.' }] } }, rnd: () => 0.4 });
  assert.match(p.prompt, /second skin/); assert.match(p.prompt, /hands on thighs/);
});
