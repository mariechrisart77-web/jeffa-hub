// v69 Abgleich: Konsistenz-Prüfung zwischen Dropdown, Story und Profil-Defaults (Alter, FSK18, Kleidung, Pose, Hände, Szene)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePlan } from '../src/imgsvc-core.js';
import { abgleich } from '../src/imgsvc-abgleich.js';

// Profil wie aus dem Task (Seraphina, Lora) – Alter 48 auf dem Profil, Identität widersprüchlich
const SERA_PROFILE = {
  id: 'p-sera',
  persona: { look: { age: 48, hair: 'long black hair' } },
  photo: { quality: 'mittel' },
  seed: 42,
};
const SERA_RESOLVED = {
  identity: 'Seraphina, woman in her 20s, fair glowing skin, dark defined brows, full lips, adult woman, looks about 48, long black hair in a high sleek ponytail, elegant, Brille, 180 cm tall, curvy hourglass figure, softly rounded hips, full D-cup bust',
  look: 'Seraphina, woman in her 20s, fair glowing skin, dark defined brows, full lips, adult woman, looks about 48, long black hair in a high sleek ponytail, elegant, Brille, 180 cm tall, curvy hourglass figure, softly rounded hips, full D-cup bust',
  defaults: { expression: 'warm smile' },
  styleCustom: false,
  presetTexts: { kleidung: 'black lace bodysuit, fine floral lace pattern, small bikini top showing sideboob and a hint of underboob' },
};
const LORA_PROFILE = { id: 'p-lora', persona: { look: { age: 25 } }, photo: { quality: 'mittel' } };
const LORA_RESOLVED = {
  identity: 'Lora, woman, adult woman, looks about 25, long blonde hair, adult woman, mid 20s, freckles, 165 cm tall, petite delicate build, slim hips, small A-cup bust',
  defaults: { expression: 'playful mischievous look' },
  outfitKeyword: 'kimono',
  outfitText: 'traditioneller Seidenkimono, pastellfarben, zarte Blumenmuster, breiter Gürtel, Holzschuhe, schlichte Accessoires',
  photo: { outfit: '', pose: '', scene: '', light: '', frame: '', mood: '', render: '' },
};

const WEIGHT = /\(\s*[^()]*?\s*:\s*\d+(\.\d+)?\s*\)/;
const say = (content, role = 'assistant') => ({ role, content });

test('Seraphina: „woman in her 20s“ + „looks about 48“ → 48 gewinnt, Warnung; kein „in her 20s“ im Prompt', async () => {
  const p = await buildImagePlan({
    profile: SERA_PROFILE, resolved: SERA_RESOLVED,
    body: { adult: true, dryRun: true, context: { messages: [say('Sie wärmt sich am Kamin im Wohnzimmer auf.')] } },
    rnd: () => 0.4,
  });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.ok(Array.isArray(p.abgleich) && p.abgleich.length >= 1, 'abgleich array fehlt');
  assert.ok(p.abgleich.some((w) => /Alter widersprüchlich/.test(w)), p.abgleich.join(' | '));
  assert.ok(!/\bin her 20s\b/i.test(p.prompt), p.prompt);
  assert.match(p.prompt, /48 years old|looks about 48/);
});

test('Adult-Pfad mit nur „in her 20s“ und ohne numerisches Alter ≥18 → block not_adult', async () => {
  const profile = { ...LORA_PROFILE, persona: { look: { age: 0 } } };
  const resolved = { identity: 'Lora, woman in her 20s, long blonde hair, small A-cup bust' };
  const p = await buildImagePlan({
    profile, resolved,
    body: { adult: true, dryRun: true, context: { messages: [say('Sie liegt im Bett.')] } },
    rnd: () => 0.4,
  });
  assert.ok(p.error, 'erwartet Block');
  assert.equal(p.error.status, 403);
  assert.equal(p.error.code, 'not_adult');
  assert.match(p.error.message, /18\+/);
});

test('Nicht-18+-Pfad entfernt FSK18-Details aus Identität und Outfit', async () => {
  const profile = { ...SERA_PROFILE, persona: { look: { age: 48 } } };
  const resolved = {
    ...SERA_RESOLVED,
    photo: { outfit: 'black lace bodysuit with sideboob and underboob, full D-cup bust', pose: '', scene: '', light: '', frame: '', mood: '', render: '' },
  };
  const p = await buildImagePlan({
    profile, resolved,
    body: { adult: false, dryRun: true, context: { messages: [say('Sie sitzt im Wohnzimmer auf dem Sofa.')] } },
    rnd: () => 0.4,
  });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.ok(!/full D-cup bust/i.test(p.prompt), p.prompt);
  assert.ok(!/sideboob/i.test(p.prompt), p.prompt);
  assert.ok(!/underboob/i.test(p.prompt), p.prompt);
  assert.ok(p.abgleich.some((w) => /FSK18-Details/.test(w)), p.abgleich.join(' | '));
});

test('Dropdown-Outfit schlägt Story-Outfit + Warnung', async () => {
  const LLM = async () => JSON.stringify({
    scene: 'bedroom', pose: 'standing', outfit: 'silk blouse', outfit_state: '', background: 'bedroom', expression: '',
    story: { location: 'bedroom', outfit: 'silk blouse' },
  });
  const resolved = { ...LORA_RESOLVED, photo: { ...LORA_RESOLVED.photo, outfit: 'red bikini' } };
  const p = await buildImagePlan({
    profile: LORA_PROFILE, resolved,
    body: { adult: true, dryRun: true, context: { messages: [say('Ich ziehe mir eine Seidenbluse an.')] } },
    composeLLM: LLM, rnd: () => 0.4,
  });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.ok(p.abgleich.some((w) => /Kleidung: Auswahl/.test(w)), p.abgleich.join(' | '));
  assert.match(p.prompt, /red bikini/);
  assert.ok(!/silk blouse/.test(p.prompt), p.prompt);
});

test('Dropdown-Pose + Composer-Action mit widersprüchlicher Handplatzierung → nur eine Hand-Phrase + Warnung', async () => {
  const LLM = async () => JSON.stringify({
    scene: 'bedroom', pose: 'kneeling on bed, hands on thighs',
    action: 'hugging her legs, hand on knee', outfit: 'white slip dress', outfit_state: '', background: 'bedroom', expression: '',
    story: { location: 'bedroom' },
  });
  const resolved = { ...LORA_RESOLVED, photo: { ...LORA_RESOLVED.photo, pose: 'kneeling on bed, hands on thighs' } };
  const p = await buildImagePlan({
    profile: LORA_PROFILE, resolved,
    body: { adult: true, dryRun: true, context: { messages: [say('Ich knie auf dem Bett.')] } },
    composeLLM: LLM, rnd: () => 0.4,
  });
  assert.ok(!p.error, JSON.stringify(p.error));
  // genau EINE Handplatzierung im Prompt
  const handMatches = p.prompt.match(/\bhands?\b[^.]{0,40}\b(on|at|in)\b/gi) || [];
  assert.ok(handMatches.length <= 1, 'zu viele Handplatzierungen: ' + handMatches.join(' / '));
  assert.ok(p.abgleich.some((w) => /Pose: Auswahl/.test(w) || /Hände: nur eine/.test(w)), p.abgleich.join(' | '));
});

test('„falling onto sofa“ + „lying down“ → eine statische Position, kein Bewegungsverb', async () => {
  const LLM = async () => JSON.stringify({
    scene: 'living room', pose: 'lying down', action: 'falling onto sofa', outfit: 'black blouse', outfit_state: 'wet', background: 'living room', expression: '',
    story: { location: 'living room' },
  });
  const p = await buildImagePlan({
    profile: LORA_PROFILE, resolved: LORA_RESOLVED,
    body: { adult: true, dryRun: true, context: { messages: [say('Ich falle aufs Sofa.')] } },
    composeLLM: LLM, rnd: () => 0.4,
  });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.ok(!/\bfalling\b/i.test(p.prompt), p.prompt);
  assert.match(p.prompt, /\blying\b/i);
});

test('Abgleich als pure Funktion (direkt aufrufbar): identisch zu buildImagePlan-Warnungen', () => {
  const out = abgleich({
    profile: SERA_PROFILE, resolved: SERA_RESOLVED,
    photo: {}, parts: { scene: 'x', pose: 'standing', action: 'walking', camera: '', lighting: '', outfit: '', outfit_state: '', expression: '', background: '' },
    story: { location: 'living room' }, adult: true, msgs: [],
  });
  assert.equal(out.block, null);
  assert.ok(out.warnings.some((w) => /Alter widersprüchlich/.test(w)));
  assert.ok(!/in her 20s/i.test(out.identity));
});

test('Negativ enthält die Anatomie-Begriffe, keine Gewichtssyntax', async () => {
  const p = await buildImagePlan({
    profile: LORA_PROFILE, resolved: LORA_RESOLVED,
    body: { adult: true, dryRun: true, context: { messages: [say('Am Strand, ich bin im Wasser.')] } },
    rnd: () => 0.4,
  });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.match(p.negative, /extra hands/);
  assert.match(p.negative, /extra fingers/);
  assert.match(p.negative, /three hands/);
  assert.ok(!WEIGHT.test(p.negative), p.negative);
  assert.ok(!WEIGHT.test(p.prompt), p.prompt);
  assert.ok(p.negative.length < 1000, 'negativ zu lang: ' + p.negative.length);
});

test('Dropdown-Szene gewinnt gegen Story-Ort mit Warnung', async () => {
  const resolved = { ...LORA_RESOLVED, photo: { ...LORA_RESOLVED.photo, scene: 'rooftop terrace at night' } };
  const p = await buildImagePlan({
    profile: LORA_PROFILE, resolved,
    body: { adult: true, dryRun: true, context: { messages: [say('Wir sind im Wohnzimmer auf dem Sofa.')] } },
    rnd: () => 0.4,
  });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.ok(p.abgleich.some((w) => /Szene: Auswahl/.test(w)), p.abgleich.join(' | '));
  assert.match(p.prompt, /rooftop terrace/);
});
