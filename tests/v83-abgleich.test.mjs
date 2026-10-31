// v83: Prompt-App gleicht ALLE Daten ab – ein Wert pro Merkmal, Wunsch-Szene gewinnt, Pose passt zur Szene,
// jugendfrei mit echtem Ersatz-Outfit, hemmungslos ohne alte FSK-Filter. Alle Personen fiktiv und erwachsen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentity } from '../src/promptapp/identity.js';
import { buildPromptPlan, fitPoseToScene, resolveSceneTarget, SFW_NEGATIVES } from '../src/promptapp/index.js';
import { buildImagePlan, clearComposerCache, storyStep } from '../src/imgsvc-plan.js';
import { reconcileOutfitNudity } from '../src/promptapp/garments.js';

const say = (content, role = 'assistant') => ({ role, content });
const SERA = {
  id: 'seraphina', name: 'Seraphina', adult: false,
  persona: { gender: 'female', look: { age: 34, typ: 'woman in her 20s, fair glowing skin', hair: 'lange schwarze Haare', details: 'gebräunte Haut, Brille' }, figur: { groesse: 185 } },
};
const SERA_RES = { identity: 'Seraphina, adult woman, looks about 25, long black hair, fair glowing skin, 170 cm tall' };
const LORA = { id: 'lora', name: 'Lora', adult: true, persona: { gender: 'female', look: { age: 25, hair: 'lange blonde Haare' }, figur: { groesse: 165, oberweite: 1 } } };

// ---------- 1. Widersprüche: genau EIN Wert pro Merkmal ----------
test('v83 (1) Seraphina: Alter 34 aus dem Einstellungsfeld, kein „20s“/„25“, ein Hautton, eine Größe', () => {
  const { age, identity, notes } = buildIdentity({ profile: SERA, resolved: SERA_RES });
  assert.equal(age, 34);
  assert.match(identity, /looks exactly 34 years old/);
  assert.ok(!/20s|\b25\b|looks about/i.test(identity), identity);
  assert.match(identity, /tanned skin/);
  assert.ok(!/fair glowing skin/i.test(identity), identity);
  assert.match(identity, /185 cm/);
  assert.ok(!/170 cm/.test(identity), identity);
  assert.ok(notes.some((n) => /^Alter widersprüchlich/.test(n)), JSON.stringify(notes));
  assert.ok(notes.some((n) => /^Hautton:/.test(n)) && notes.some((n) => /^Größe:/.test(n)), JSON.stringify(notes));
});

test('v83 (1) Haarfarbe: Einstellungsfeld schlägt Freitext', () => {
  const { identity } = buildIdentity({ profile: LORA, resolved: { identity: 'Lora, long black hair, freckles' } });
  assert.match(identity, /blonde/i);
  assert.ok(!/black hair/i.test(identity), identity);
});

test('v83 (1) Jugendschutz bleibt: Einstellungsfeld < 21 wird nie übernommen, 21+-Sperre greift', async () => {
  const { age } = buildIdentity({ profile: { persona: { look: { age: 17 } } }, resolved: { identity: 'looks about 17' } });
  assert.ok(age >= 21);
  const p = await buildImagePlan({ profile: { ...LORA, persona: { look: { age: 19 } } }, resolved: {}, body: { adult: true, dryRun: true, context: { scene: 'am Strand' } }, rnd: () => 0.5 });
  assert.equal(p.error?.code, 'not_adult');
  const q = await buildImagePlan({ profile: LORA, resolved: {}, body: { adult: true, dryRun: true, context: { scene: 'teen girl am Strand' } }, rnd: () => 0.5 });
  assert.equal(q.error?.code, 'not_adult');
});

test('v83 (1) buildImagePlan meldet den Alters-Widerspruch nur EINMAL', async () => {
  clearComposerCache();
  const p = await buildImagePlan({ profile: SERA, resolved: SERA_RES, body: { adult: false, dryRun: true, context: { messages: [say('Sie liest im Wohnzimmer.')] } }, rnd: () => 0.5 });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.equal(p.abgleich.filter((n) => /^Alter widersprüchlich/.test(n)).length, 1, JSON.stringify(p.abgleich));
});

// ---------- 2. Wunsch-Szene schlägt Story und Dropdown-Szene ----------
test('v83 (2) Bibliothek-Wunsch schlägt alte Café-Story und gespeicherte Szene; Story-Ort wird aktualisiert', async () => {
  clearComposerCache();
  const prevStory = { location: 'café', action: 'drinking coffee', pose: 'sitting', outfit: '', updatedAt: 1 };
  const p = await buildImagePlan({
    profile: SERA, resolved: { ...SERA_RES, photo: { scene: 'cozy café by the window' } },
    body: { adult: false, dryRun: true, context: { scene: 'Seraphina in der Bibliothek, sie steht zwischen den Bücherregalen und liest ein Buch', messages: [say('Sie sitzt im Café am Fenster und trinkt einen Kaffee.')] } },
    prevStory, rnd: () => 0.5,
  });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.match(p.prompt, /Scene: [^.]*librar/i);
  assert.ok(!/café|cafe|coffee/i.test(p.prompt), p.prompt);
  assert.match(p.prompt, /standing between the bookshelves/);
  assert.equal(p.story.location, 'library');
});

test('v83 (2) storyStep kennt die Bibliothek und verwirft die alte Pose beim Ortswechsel', () => {
  const st = storyStep({ location: 'bar', pose: 'sitting', action: 'holding a drink', updatedAt: 1 }, 'Wir gehen in die Bibliothek.');
  assert.equal(st.location, 'library');
  assert.equal(st.pose, '');
});

test('v83 (2) einmalige Szenen-Auswahl (photoOverride) schlägt den Wunsch', () => {
  const t = resolveSceneTarget({ wish: 'in der Bibliothek', override: 'rooftop terrace at night' });
  assert.equal(t.source, 'override');
  assert.equal(t.scene, 'rooftop terrace at night');
});

// ---------- 3. Pose/Requisiten passend zur Szene ----------
test('v83 (3) Motorhaube am Strand ohne Auto wird ersetzt (beide Modi)', () => {
  for (const adult of [false, true]) {
    const plan = buildPromptPlan({
      profile: LORA, resolved: { photo: { pose: 'sitting sideways on the hood of a car, leaning back on her hands' } },
      adult, body: { wish: 'Lora am Strand bei Sonnenuntergang', parts: { scene: 'the woman at the beach', background: 'sandy beach by the sea' } },
    });
    assert.ok(!/car|hood/i.test(plan.parts.pose), plan.parts.pose);
    assert.match(plan.parts.pose, /sand/);
    assert.ok(plan.abgleich.some((n) => /Pose an Szene „beach“ angepasst/.test(n)), plan.abgleich.join(' | '));
  }
});

test('v83 (3) Requisit bleibt, wenn die Szene es nennt; Segment ohne Haltung fällt weg', () => {
  const keep = fitPoseToScene({ pose: 'sitting on the hood of a car', location: 'beach', sceneText: 'beach parking lot with a red car' });
  assert.match(keep.pose, /hood of a car/);
  const drop = fitPoseToScene({ pose: 'standing on the sand, hand on the car hood', location: 'beach', sceneText: 'sandy beach' });
  assert.equal(drop.pose, 'standing on the sand');
});

test('v83 (3) keine Zusatzpersonen: Personen-Negativ bleibt im Prompt-Plan', () => {
  const plan = buildPromptPlan({ profile: LORA, resolved: {}, adult: false, body: { wish: 'Lora am Strand', parts: { scene: 'the woman at the beach' } } });
  assert.match(plan.negative, /extra people/);
});

// ---------- 4. jugendfrei: echtes Ersatz-Outfit statt Rest-Phrasen ----------
test('v83 (4) jugendfrei: komplett gefiltertes Dropdown-Outfit → Wunsch-Outfit statt Resten', () => {
  const plan = buildPromptPlan({
    profile: LORA, adult: false,
    resolved: { photo: { outfit: 'micro string bikini in sheer latex, maximally skimpy, barely concealed, separate top and bottom, visible waistline' } },
    body: { wish: 'Lora am Strand im roten Sommerkleid', parts: { scene: 'the woman at the beach' } },
  });
  assert.equal(plan.parts.outfit, 'red summer dress');
  assert.ok(!/skimpy|concealed|waistline|bikini|latex/i.test(plan.prompt), plan.prompt);
  assert.ok(plan.abgleich.some((n) => /komplett gefiltert/.test(n)));
});

test('v83 (4) jugendfrei ohne Wunsch-Outfit → Story-Outfit, sonst szenenpassender Standard', () => {
  const withStory = buildPromptPlan({ profile: LORA, adult: false, story: { location: 'beach', outfit: 'blue denim shorts and white t-shirt' }, resolved: { photo: { outfit: 'micro bikini, tiny string' } }, body: { parts: { scene: 'the woman at the beach' } } });
  assert.match(withStory.parts.outfit, /denim shorts/);
  const plain = buildPromptPlan({ profile: LORA, adult: false, resolved: { photo: { outfit: 'micro bikini, tiny string' } }, body: { wish: 'Lora am Strand', parts: { scene: 'the woman at the beach' } } });
  assert.equal(plain.parts.outfit, 'light summer dress');
});

test('v83 (4) v73-Regel bleibt: jugendfreies Dropdown-Outfit gewinnt gegen Story', () => {
  const plan = buildPromptPlan({ profile: LORA, adult: false, story: { outfit: 'jeans' }, resolved: { photo: { outfit: 'elegant red dress' } }, body: { parts: { scene: 'the woman in the living room' } } });
  assert.match(plan.parts.outfit, /red dress/);
});

// ---------- 5. hemmungslos: keine alten FSK-Filter ----------
test('v83 (5) hemmungslos: Outfit und Pose ungefiltert, keine SFW-Negatives, keine Jugendfrei-Notizen', () => {
  const outfit = 'tiny micro bikini, sheer latex';
  const plan = buildPromptPlan({
    profile: { ...LORA, adult: false }, adult: true,
    resolved: { photo: { outfit, pose: 'sitting on the edge of the bed, legs spread' } },
    body: { wish: 'Lora im Schlafzimmer', parts: { scene: 'the woman in the bedroom' } },
  });
  assert.equal(plan.adult, true);
  assert.match(plan.parts.outfit, /micro bikini/);
  assert.match(plan.parts.pose, /legs spread/);
  assert.ok(!plan.negative.includes(SFW_NEGATIVES), plan.negative);
  assert.ok(!plan.abgleich.some((n) => /jugendfrei|SFW|FSK18/.test(n)), plan.abgleich.join(' | '));
});

test('v83 (5) hemmungslos: Szene/Pose werden genauso abgeglichen (Bett-Pose in der Bibliothek), explizite Details bleiben', () => {
  const plan = buildPromptPlan({
    profile: SERA, adult: true, resolved: { photo: { pose: 'sitting on the edge of the bed, legs spread' } },
    body: { wish: 'Seraphina in der Bibliothek', parts: { scene: 'the woman in the library' } },
  });
  assert.ok(!/\bbed\b/i.test(plan.parts.pose), plan.parts.pose);
  assert.match(plan.parts.pose, /legs spread/);
  assert.match(plan.prompt, /librar/i);
});

test('v83 (5) adult:never sperrt weiterhin', () => {
  const plan = buildPromptPlan({ profile: { ...LORA, adult: 'never' }, adult: true, resolved: { photo: { outfit: 'micro bikini' } }, body: { parts: { scene: 'the woman at the beach' } } });
  assert.equal(plan.adult, false);
  assert.ok(!/micro bikini/i.test(plan.parts.outfit), plan.parts.outfit);
});

test('v83 nude + Kleidungsstück: Kleidungsstück gewinnt', () => {
  const r = reconcileOutfitNudity('nude, tiny micro bikini top, string bottom');
  assert.deepEqual(r.removed, ['nude']);
  assert.ok(!/nude/.test(r.text));
});
