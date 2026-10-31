// v75: gezielte Fix-Runde – SFW für nicht-18+ (a), Identitäts-Filter (b), Story-Ort (c),
// applyFixes-Reihenfolge/kein Stacking (d), Modell-Routing (e), Outfit-Note-Widerspruch (f).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePlan, routeModel, fsk18Family } from '../src/imgsvc-core.js';
import { applyFixes } from '../src/imgsvc-checkparse.js';
import { abgleich } from '../src/imgsvc-abgleich.js';
import { buildIdentity, resolveAge } from '../src/promptapp/identity.js';
import { detectScene, detectStoryPose } from '../src/promptapp/scene-map.js';
import { sfwText, SFW_NEGATIVES, isFsk18Segment } from '../src/promptapp/sfw.js';

const say = (content, role = 'assistant') => ({ role, content });
const plan = (o = {}) => buildImagePlan({ rnd: () => 0.4, ...o });

// ---------------- Fixtures ----------------
// Seraphina-artig: profil adult === false (SFW-Pfad), gespeicherte FSK18-Pose, Garten/Bank-Story
const SERA_PROFILE = {
  id: 'p-sera',
  name: 'Seraphina',
  adult: false,
  persona: { look: { age: 48, hair: 'long black hair in a high sleek ponytail' } },
  photo: { quality: 'mittel' },
  seed: 42,
};
const SERA_RESOLVED = {
  identity: 'Seraphina, adult woman, 48 years old, long black hair in a high sleek ponytail, fair skin, green eyes',
  look: 'Seraphina, adult woman, 48 years old, long black hair in a high sleek ponytail, fair skin, green eyes',
  defaults: { outfit: 'simple summer sundress', expression: 'warm smile' },
  photo: { pose: 'sitting on the edge of the bed, legs spread, leaning back on both hands, relaxed and inviting' },
};

// Lena-artig: Profil-Identität voll mit Kamera-Junk, deutschen Fragmenten, Anatomie, Fremd-Personen
const LENA_PROFILE = {
  id: 'p-lena',
  name: 'Lena',
  adult: true,
  persona: { look: { age: 28, hair: 'long black hair', skin: 'fair skin' } },
  photo: { quality: 'auto' },
  seed: 7,
};
const LENA_RESOLVED = {
  identity: 'Lena, sie hat schwarze Haare, 8k, 85mm, Raw, male hand entering frame, visible veins, goosebumps, photorealistic glamour photo, adult woman 28 years old, green eyes, fair skin',
  look: 'Lena, sie hat schwarze Haare, 8k, 85mm, Raw, male hand entering frame, visible veins, goosebumps, photorealistic glamour photo, adult woman 28 years old, green eyes, fair skin',
  defaults: { outfit: 'casual summer blouse' },
  photo: {},
};

// ---------------- (a) SFW für nicht-18+ ----------------
const FSK_WORDS = [
  'legs spread', 'spread legs', 'upskirt', 'lingerie', 'nude', 'topless', 'sideboob', 'underboob',
  'cleavage focus', 'crotch', 'cameltoe', 'labia', 'nipples', 'aroused', 'seductive', 'sultry',
  'bedroom eyes', 'lying on the bed', 'see-through',
];
function assertSfwPrompt(prompt) {
  for (const w of FSK_WORDS) assert.ok(!new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(prompt), `FSK18-Wort "${w}" im Prompt: ${prompt}`);
  assert.ok(!/\bbed\b/i.test(prompt), 'Wort "bed" im Prompt: ' + prompt);
}

test('(a) seraphina adult:false, gespeicherte Bett-Pose, Garten/Bank-Story → SFW, kein "bed"', async () => {
  const msgs = [say('Wir sitzen auf der Bank im Garten, die Rosen blühen.', 'user'), say('Wir sitzen auf der Bank im Garten, die Rosen blühen.')];
  const p = await plan({ profile: SERA_PROFILE, resolved: SERA_RESOLVED, body: { adult: false, dryRun: true, context: { messages: msgs } } });
  assert.ok(!p.error, JSON.stringify(p.error));
  assertSfwPrompt(p.prompt);
  // Story-Pose hat die Bett-Pose ersetzt
  assert.match(p.prompt, /bench|garden/i);
});

test('(a) SFW-Negatives für nicht-adult; preview liefert Notizen', async () => {
  const msgs = [say('Wir sitzen auf der Bank im Garten.')];
  const p = await plan({ profile: SERA_PROFILE, resolved: SERA_RESOLVED, body: { adult: false, dryRun: true, preview: true, context: { messages: msgs } } });
  assert.ok(!p.error, JSON.stringify(p.error));
  assertSfwPrompt(p.prompt);
  for (const w of ['nsfw', 'nude', 'cleavage', 'upskirt', 'spread legs', 'lingerie', 'see-through']) {
    assert.ok(p.negative.toLowerCase().includes(w), `SFW-Negativ "${w}" fehlt in: ${p.negative}`);
  }
  assert.ok((p.abgleich || []).length >= 1, 'preview notes fehlen');
});

test('(a) sfwText/isFsk18Segment: Bett-Wort nur in Schlafzimmer-Szene erlaubt', () => {
  assert.equal(isFsk18Segment('sitting on the bed'), true);
  assert.equal(isFsk18Segment('sitting on the bed', { allowBed: true }), false);
  assert.equal(isFsk18Segment('legs spread'), true);
  assert.equal(isFsk18Segment('legs spread', { allowBed: true }), true); // legs spread ist IMMER FSK18
  { const t = sfwText('sitting on the edge of the bed, legs spread'); assert.ok(!/bed|spread/i.test(t), t); }
});

// ---------------- (b) Identitäts-Filter ----------------
test('(b) Lena-Karte: Junk/Fremdperson/Deutsch raus, Haarfarbe bleibt', () => {
  const r = buildIdentity({ profile: LENA_PROFILE, resolved: LENA_RESOLVED, adult: true });
  const id = r.identity;
  assert.match(id, /black hair/i);
  for (const bad of ['sie', ' hat ', '8k', '85mm', 'Raw', 'male hand', 'goosebumps', 'visible veins', 'photorealistic glamour', 'schwarze']) {
    assert.ok(!id.toLowerCase().includes(bad.toLowerCase()), `Identität enthält "${bad}": ${id}`);
  }
});

test('(b) doppeltes Alter (28 vs "middle-aged") → nur das numerische Alter', () => {
  const profile = { id: 'x', adult: true, persona: { look: { age: 28 } } };
  const resolved = { identity: 'middle-aged woman, 28 years old, long brown hair, green eyes, fair skin' };
  const r = buildIdentity({ profile, resolved, adult: true });
  assert.ok(!/middle[- ]aged/i.test(r.identity), r.identity);
  assert.match(r.identity, /28 years old/);
});

// ---------------- (c) Story-Ort ----------------
test('(c) Parkdeck/Auto/Strand/Büro werden übersetzt', () => {
  const hit = detectScene('Wir stehen auf dem Parkdeck im Parkhaus.');
  assert.ok(hit && /rooftop parking deck/i.test(hit.scene), JSON.stringify(hit));
  assert.ok(detectScene('Ich sitze im Auto auf dem Beifahrersitz.'));
  assert.match(detectScene('Ich sitze im Auto auf dem Beifahrersitz.').scene, /inside a car/);
  assert.ok(detectScene('Wir laufen am Strand entlang.').scene.includes('beach'));
  assert.ok(detectScene('Im Büro am Schreibtisch.').scene.includes('office'));
  assert.equal(detectScene(''), null);
  assert.equal(detectScene('irgendwas ohne Ort'), null);
});

test('(c) Story-Pose ersetzt Stored-Pose (Beifahrersitz) und landet im Prompt', async () => {
  const profile = { id: 'p-adult', name: 'Ava', persona: { look: { age: 28 } }, seed: 1 };
  const resolved = { identity: 'adult woman, 28 years old, long black hair, green eyes', defaults: { outfit: 'casual summer blouse' }, photo: { pose: 'sitting on the edge of the bed, legs spread' } };
  const msgs = [say('Ich sitze seitlich auf dem Beifahrersitz, ein Bein draußen.')];
  const p = await plan({ profile, resolved, body: { adult: false, dryRun: true, context: { messages: msgs } } });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.match(p.prompt, /passenger seat/i);
  assert.ok(!/\bleds\s+spread\b/i.test(p.prompt), p.prompt);
  assert.ok(!/\bbed\b/i.test(p.prompt), p.prompt);
});

test('(c) Story-Ort "Parkdeck" landet im Prompt', async () => {
  const msgs = [say('Wir stehen auf dem Parkdeck, die Lichter der Stadt glitzern.')];
  const p = await plan({ profile: LENA_PROFILE, resolved: LENA_RESOLVED, body: { adult: true, dryRun: true, context: { messages: msgs } } });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.match(p.prompt, /parking deck|rooftop/i);
  assert.ok(!/in the described scene$/i.test(p.prompt));
});

// ---------------- (d) applyFixes ----------------
test('(d) applyFixes: Framing bleibt erste Section, Face-Hint vor Outfit-Hint, kein Stacking', () => {
  const prompt = 'Framing: full body shot, entire face and head in frame, looking at camera. The woman: adult woman, 28 years old, long black hair. Outfit: red bikini. Camera and pose: standing.';
  const fixed = applyFixes(prompt, 'generic negative', { fix_hints: 'top worn, both triangles on, full body shot, entire face and head in frame', fix_negative: 'topless, bare breasts' });
  assert.match(fixed.prompt, /^(Framing:\s*)?full body shot/, fixed.prompt);
  assert.ok(!/^Framing:\s*full body shot[\s\S]*Framing:/i.test(fixed.prompt), 'Framing doppelt: ' + fixed.prompt);
  assert.match(fixed.negative, /topless/);
  // FACE-Hint steht VOR Outfit-Hint im Ergebnis
  const iFace = fixed.prompt.indexOf('entire face and head in frame');
  const iOutfit = fixed.prompt.indexOf('top worn');
  assert.ok(iFace >= 0 && (iOutfit === -1 || iFace < iOutfit), fixed.prompt);
});

test('(d) applyFixes: prose ohne "Framing:"-Label beginnt trotzdem mit "full body shot"', () => {
  const prompt = 'full body shot, entire face and head in frame, looking at camera. The woman: adult woman. Outfit: red bikini.';
  const fixed = applyFixes(prompt, 'neg', { fix_hints: 'top worn, both triangles on', fix_negative: 'topless' });
  assert.match(fixed.prompt, /^(Framing:\s*)?full body shot/, fixed.prompt);
  const wieder = applyFixes(fixed.prompt, fixed.negative, { fix_hints: 'top worn, both triangles on', fix_negative: 'topless' });
  const count = (wieder.prompt.match(/full body shot/gi) || []).length;
  assert.equal(count, 1, 'Framing wurde gestapelt: ' + wieder.prompt);
});

// ---------------- (e) Routing ----------------
test('(e) fsk18Family erkennt Sheer/Micro/Lingerie/Latex, nicht casual', () => {
  for (const t of ['sheer black bodysuit', 'micro bikini', 'lingerie set', 'latex catsuit', 'see-through blouse']) assert.ok(fsk18Family(t), t);
  for (const t of ['casual summer blouse', 'red dress', 'simple neutral outfit', '']) assert.ok(!fsk18Family(t), t);
});

test('(e) adult + sheer + keine Modellwahl → chroma; explizit lustify bleibt', async () => {
  const sheer = { ...LENA_RESOLVED, photo: { outfit: 'sheer black bodysuit' } };
  const autoRoute = await plan({ profile: { ...LENA_PROFILE, photo: { quality: 'lustify' } }, resolved: sheer, body: { adult: true, dryRun: true, context: { messages: [say('Ich trage ein durchsichtiges Bodysuit.')] } } });
  assert.ok(!autoRoute.error, JSON.stringify(autoRoute.error));
  assert.equal(autoRoute.route.model, 'chroma', `erzwungen: ${autoRoute.route.model}`);
  const explicitRoute = await plan({ profile: LENA_PROFILE, resolved: sheer, body: { adult: true, dryRun: true, quality: 'lustify', context: { messages: [say('Ich trage ein durchsichtiges Bodysuit.')] } } });
  assert.ok(!explicitRoute.error, JSON.stringify(explicitRoute.error));
  assert.equal(explicitRoute.route.model, 'lustify-v8', `explizit: ${explicitRoute.route.model}`);
});

test('(e) routeModel ist bei expliziter Wahl unverändert; auto-Param überschreibt nicht ohne fsk18Sheer', () => {
  assert.equal(routeModel({ quality: 'lustify', adult: true, explicit: false, fsk18Sheer: false }).model, 'lustify-v8');
  assert.equal(routeModel({ quality: 'lustify', adult: true, explicit: false, fsk18Sheer: true }).model, 'chroma');
  assert.equal(routeModel({ quality: 'lustify', adult: true, explicit: true, fsk18Sheer: true }).model, 'lustify-v8');
});

// ---------------- (f) Outfit-Note-Widerspruch ----------------
test('(f) Outfit-Notiz fällt weg, wenn beide Seiten normalisiert gleich sind', () => {
  const profile = { id: 'p', persona: { look: { age: 28 } } };
  const resolved = { identity: 'adult woman 28, long black hair', photo: { outfit: 'Red Bikini' } };
  const parts = { scene: '', pose: 'standing', action: '', camera: '', lighting: '', outfit: 'red bikini', outfit_state: '', expression: '', background: '' };
  const out = abgleich({ profile, resolved, photo: { outfit: 'Red Bikini' }, parts, story: { outfit: 'red  bikini' }, adult: true, msgs: [] });
  const hasOutfitWarn = out.warnings.some((w) => /Kleidung: Auswahl/.test(w));
  assert.ok(!hasOutfitWarn, 'Widerspruchsnotiz trotz gleichem Text: ' + out.warnings.join(' | '));
});

// ---------------- Alters-Fix (v74-Regression) ----------------
test('v74-Regression: resolveAge meldet Widerspruch "in her 20s" vs 48', () => {
  const profile = { persona: { look: { age: 48 } } };
  const resolved = { identity: 'Seraphina, woman in her 20s, looks about 48, long black hair' };
  const r = resolveAge(profile, resolved);
  assert.equal(r.age, 48);
  assert.match(r.note, /Alter widersprüchlich/);
});

import { isCleanIdentityFragment as _icf } from '../src/promptapp/decheck.js';
import { detectStoryPose as _dsp } from '../src/promptapp/scene-map.js';
import _t from 'node:test'; import _a from 'node:assert/strict';
_t('v75b: englische Haar-Phrase mit "in" bleibt erhalten', () => {
  _a.equal(_icf('long black hair in a high sleek ponytail'), true);
  _a.equal(_icf('sie hat lange Haare'), false);
});
_t('v75b: Ortswechsel ohne Pose verwirft ältere Story-Pose; "setzt sich" = sitzen', () => {
  _a.equal(_dsp(['*Sie geht den Gartenweg entlang.*', '*Sie kommt in die Küche.*']), null);
  const p = _dsp(['*Sie geht den Gartenweg entlang.*', '*Sie setzt sich auf die alte Holzbank.*']);
  _a.ok(p && /sit/i.test(p));
});
import { detectScene as _ds } from '../src/promptapp/scene-map.js';
_t('v75b: Parkdecks (Genitiv), Café, Betonwand erkannt', () => {
  _a.match(_ds(['*Sie lehnt am Geländer des Parkdecks.*']).scene, /parking deck/);
  _a.match(_ds(['*Sie sitzt im kleinen Café.*']).scene, /café/);
  _a.match(_ds(['*Sie stellt sich vor die graue Betonwand.*']).scene, /concrete/);
});
