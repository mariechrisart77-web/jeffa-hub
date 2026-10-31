// v74 Prompt-App: Identität, Reconcile-Prioritäten, Garments, Modell-Formatierung, CheckSpec, non-18+, keine Lora-Hacks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIdentity, resolveAge, collectDefaultOutfitSegs, collectIdentitySegs } from '../src/promptapp/identity.js';
import { classifyOutfit, specFor, activeGarmentBits, GARMENT_SPECS } from '../src/promptapp/garments.js';
import { reconcile, guardAdult, buildPromptPlan } from '../src/promptapp/index.js';
import { formatOf, framingFor, formatPrompt, FRAMING, truncateSections, buildSections } from '../src/promptapp/format.js';
import { makeCheckSpec, parseVisionJson, verdictForVision } from '../src/promptapp/check-spec.js';
import { parseSpecVision } from '../src/imgsvc-checkparse.js';
import { intensityDefaults } from '../src/imgsvc-formulate.js';
import { buildImagePlan } from '../src/imgsvc-core.js';

// ---------- Fixtures (aus den echten Profil-JSONs gekürzt) ----------
const LORA = {
  id: 'lora', name: 'Lora', adult: true,
  persona: {
    look: { typ: 'Frau', age: 25, hair: 'lange blonde Haare', style: 'erwachsene Frau, Mitte 20', special: ['Sommersprossen'] },
    figur: { groesse: '165', statur: 'zierlich', kurven: 2, oberweite: 1 },
  },
  photo: { quality: 'spar', outfit: 'christianlook', knapp: 9 },
};
const LENA = {
  id: 'lena', name: 'Lena', adult: true,
  persona: {
    look: { typ: 'Frau', age: 28, hair: 'lange schwarze Haare', style: '', special: ['Piercing'],
      details: 'Sie hat Nippel Piercing, zeigt sich gern. male hand entering frame resting on her hip' },
    figur: { groesse: '166 cm', statur: 'zierlich', kurven: 2, oberweite: 5 },
  },
  photo: { quality: 'spar', knapp: 9 },
};
const SERA = {
  id: 'seraphina', name: 'Seraphina', adult: false,
  persona: {
    look: { typ: 'woman in her 20s, fair glowing skin, dark defined brows, full lips', age: 48, hair: 'long black hair in a high sleek ponytail', style: 'elegant', special: ['Brille'] },
    figur: { groesse: '180 cm', statur: 'curvy hourglass figure', kurven: 6, oberweite: 4 },
  },
  photo: { quality: 'spar', outfit: 'body', knapp: 7 },
};

const say = (content, role = 'assistant') => ({ role, content });

// ---------- Identität ----------
test('v74 identity lora: blond, petite, small bust, freckles, 21+ line, keine Kleidung', () => {
  const { identity, age } = buildIdentity({ profile: LORA, resolved: { identity: 'Lora, adult woman, looks about 25, lange blonde Haare, Sommersprossen, 165 cm tall, petite delicate build, small A-cup bust' } });
  assert.equal(age, 25);
  assert.match(identity, /adult woman, looks exactly 25 years old/);
  assert.match(identity, /blonde/i);
  assert.match(identity, /freckles/i);
  assert.match(identity, /petite/i);
  assert.match(identity, /A-cup/i);
  assert.ok(!/bikini|latex|kimono|dress/i.test(identity), identity);
});

test('v74 identity lena: schwarze Haare, DD-cup, anders als Lora (Bodies bleiben verschieden)', () => {
  const l = buildIdentity({ profile: LORA, resolved: { identity: 'Lora, long blonde hair, petite, small A-cup bust' } }).identity;
  const n = buildIdentity({ profile: LENA, resolved: { identity: 'Lena, long black hair, petite, DD-cup bust, nipple piercings' } }).identity;
  assert.ok(!/black hair/i.test(l) && !/blonde/i.test(n), `l=${l} n=${n}`);
  assert.match(n, /DD-cup/i);
  assert.ok(!/A-cup/i.test(n));
  assert.match(n, /black hair/i);
});

test('v74 identity seraphina: "in her 20s" + 48 → 48 gewinnt, Widerspruch als note', () => {
  const { age, identity, notes } = buildIdentity({
    profile: SERA,
    resolved: { identity: 'Seraphina, woman in her 20s, fair glowing skin, adult woman, looks about 48, long black hair, elegant, Brille, 180 cm tall, curvy hourglass figure, full D-cup bust' },
  });
  assert.equal(age, 48);
  assert.match(identity, /48 years old/);
  assert.ok(!/in her 20s/i.test(identity), identity);
  assert.ok(notes.some((n) => /Alter widersprüchlich/.test(n)), JSON.stringify(notes));
});

test('v74 identity: clothing words im profile style landen NICHT im identity-Block', () => {
  const p = { ...LORA, persona: { ...LORA.persona, look: { ...LORA.persona.look, details: 'trägt grauen Latex-Bikini, lange Haare' } } };
  const segs = collectIdentitySegs(p, {});
  const joined = segs.join(' | ');
  assert.ok(!/latex|bikini/i.test(joined), joined);
  assert.match(joined, /hair/i);
});

test('v74 identity: 21+-Regel – Profil ohne age bekommt 21, nie weniger', () => {
  const { age, identity } = buildIdentity({ profile: { name: 'X', persona: { look: {} } }, resolved: {} });
  assert.equal(age, 21);
  assert.match(identity, /21 years old/);
});

test('v74 identity: profile.age < 18 → auf 21 geliftet', () => {
  const { age } = resolveAge({ persona: { look: { age: 17 } } }, {});
  assert.equal(age, 21);
});

test('v74 identity: collectDefaultOutfitSegs findet nur Kleidungs-Phrasen', () => {
  const out = collectDefaultOutfitSegs({ persona: { look: { style: 'summer dress, warm smile' } } }, {});
  assert.ok(out.some((s) => /dress/i.test(s)));
  assert.ok(!out.some((s) => /smile/i.test(s)), JSON.stringify(out));
});

// ---------- Garments ----------
test('v74 garments: bikini aktiv → top-Tag + topless-Negativ', () => {
  const spec = specFor('tiny string bikini');
  assert.equal(spec.kind, 'micro_bikini');
  const bits = activeGarmentBits(spec);
  assert.ok(bits.tags.includes('bikini top worn, both triangles on'));
  assert.ok(bits.negatives.includes('topless'));
});

test('v74 garments: nude → keine Kleidungs-Negatives', () => {
  const spec = specFor('nude');
  const bits = activeGarmentBits(spec);
  assert.equal(spec.kind, 'nude');
  assert.equal(bits.negatives.length, 0);
});

test('v74 garments: dress → Negativ "bikini"', () => {
  const spec = specFor('elegant red dress');
  const bits = activeGarmentBits(spec);
  assert.equal(spec.kind, 'dress');
  assert.ok(bits.negatives.includes('bikini'));
});

test('v74 garments: latex → negative metallic/silver/chrome', () => {
  const spec = specFor('glossy smoke-grey latex outfit');
  assert.equal(spec.kind, 'latex');
  const bits = activeGarmentBits(spec);
  for (const w of ['metallic', 'silver', 'chrome']) assert.ok(bits.negatives.includes(w), w);
});

test('v74 garments: keine Michel-Bikini-Prüfung bei Klasse "other"', () => {
  const spec = specFor('fancy purple hat');
  assert.equal(spec.kind, 'other');
  assert.equal(activeGarmentBits(spec).tags.length, 0);
});

test('v74 garments: christianlook ist generisch (keine piercings im Spec)', () => {
  // Specs enthalten keine piercing-Erwähnungen mehr
  const all = Object.values(GARMENT_SPECS).flatMap((g) => g.activeTags.concat(g.activeNegatives)).join(' | ');
  assert.ok(!/piercing/i.test(all), all);
});

// ---------- Modell-Formatierung ----------
test('v74 format: lustify-v8 = tags, ≤1500, Framing zuerst, Identität/Outfit geschützt', () => {
  const prompt = formatPrompt('lustify-v8', {
    framing: framingFor(''),
    identity: 'adult woman, 25 years old, blonde hair, freckles, petite',
    outfitText: 'grey latex micro bikini',
    garmentTags: ['bikini top worn, both triangles on'],
    pose: 'standing, arms relaxed',
    scene: 'beach at sunset',
    light: 'golden hour',
    mood: 'playful',
    quality: 'high detail, sharp focus',
  }, { negative: 'bad anatomy' });
  assert.ok(prompt.prompt.length <= 1500);
  assert.ok(prompt.prompt.startsWith('full body shot'), prompt.prompt);
  assert.match(prompt.prompt, /adult woman, 25 years old/);
  assert.match(prompt.prompt, /grey latex micro bikini/);
  assert.match(prompt.prompt, /bikini top worn/);
});

test('v74 format: chroma = prose, ≤3000, endet mit Punkt', () => {
  const { prompt } = formatPrompt('chroma', {
    framing: framingFor(''), identity: 'adult woman, 25 years old, blonde hair', outfitText: 'grey latex micro bikini',
    pose: 'standing', scene: 'beach at sunset', quality: 'high detail',
  }, { negative: '' });
  assert.ok(prompt.length <= 3000);
  assert.match(prompt, /\.\s*$/);
  assert.ok(prompt.length > 40);
});

test('v74 format: Truncation schneidet Quality → Background → Mood zuerst, nicht Framing/Identität/Outfit', () => {
  const secs = buildSections({
    framing: 'FRAMING_MARK', identity: 'IDENT_MARK', outfitText: 'OUTFIT_MARK',
    scene: 'SCENE_MARK ' + 'x'.repeat(2000), mood: 'MOOD_MARK', quality: 'QUALITY_MARK ' + 'y'.repeat(1000),
  });
  const cut = truncateSections(secs, 500).join(' | ');
  assert.match(cut, /FRAMING_MARK/);
  assert.match(cut, /IDENT_MARK/);
  assert.match(cut, /OUTFIT_MARK/);
  assert.ok(cut.length <= 500 + 100);
});

test('v74 format: framingFor close-up behält Kopf/Gesicht, Framing immer voll', () => {
  assert.match(framingFor(''), /entire face and head in frame/);
  assert.match(framingFor('close-up shot'), /close-up shot, entire head and face in frame/);
});

// ---------- Reconcile-Prioritäten ----------
test('v74 reconcile: Dropdown schlägt Story-Outfit + Note', () => {
  const out = reconcile({
    resolved: { photo: { outfit: 'red bikini' } },
    parts: { outfit: 'blue silk dress' }, story: {},
  });
  assert.equal(out.parts.outfit, 'red bikini');
  assert.ok(out.notes.some((n) => /Dropdown-Kleidung überschreibt Story/.test(n)), JSON.stringify(out.notes));
});

test('v74 reconcile: Story-Outfit schlägt Profil-Default', () => {
  const out = reconcile({ resolved: { photo: {}, defaults: { outfit: 'casual' } }, parts: { outfit: 'red dress' }, story: {} });
  assert.equal(out.parts.outfit, 'red dress');
});

test('v74 reconcile: Story-State-Outfit wenn parts leer', () => {
  const out = reconcile({ resolved: {}, parts: {}, story: { outfit: 'white towel' } });
  assert.equal(out.parts.outfit, 'white towel');
});

test('v74 reconcile: Profile-Default-Outfit wenn Story leer', () => {
  const out = reconcile({ resolved: { photo: {}, defaults: { outfit: 'grey bikini' } }, parts: {}, story: {} });
  assert.equal(out.parts.outfit, 'grey bikini');
});

test('v74 reconcile: Dropdown-Pose überschreibt Story + Note', () => {
  const out = reconcile({ resolved: { photo: { pose: 'kneeling on bed' } }, parts: { pose: 'standing in water' }, story: {} });
  assert.equal(out.parts.pose, 'kneeling on bed');
  assert.ok(out.notes.some((n) => /Pose: Auswahl/.test(n)));
});

// ---------- Auto-Outfit aus Story ----------
test('v74 auto: story dress → keine Bikini-Tags/Negatives', () => {
  const plan = buildPromptPlan({
    profile: LORA, resolved: { identity: 'adult woman, 25 years old, blonde hair, freckles, petite', photo: { outfit: '' } },
    photoOverride: {}, story: { outfit: 'red dress' }, msgs: [say('Ich ziehe mir ein rotes Kleid an.')],
    adult: true, model: 'chroma', body: {},
  });
  assert.ok(!/bikini/i.test(plan.prompt), plan.prompt);
  assert.match(plan.prompt, /red dress/i);
  assert.ok(!/topless/i.test(plan.negative), plan.negative);
});

test('v74 auto: story nude → kein Bikini-Negativ', () => {
  const plan = buildPromptPlan({
    profile: LORA, resolved: { identity: 'adult woman, 25 years old, blonde hair', photo: { outfit: '' } },
    photoOverride: {}, story: {}, msgs: [say('Ich bin jetzt völlig nackt.')], adult: true, model: 'chroma', body: {},
  });
  assert.ok(!/bikini top/i.test(plan.prompt), plan.prompt);
  assert.ok(!/topless/i.test(plan.negative), plan.negative);
});

// ---------- Garment-Negatives nur bei aktivem Outfit ----------
test('v74 garment-neg: bikini aktiv → topless im Negativ; story dress → nicht', () => {
  const bik = buildPromptPlan({ profile: LORA, resolved: { identity: 'adult woman, 25 years old', photo: {} },
    photoOverride: { outfit: 'tiny string bikini' }, story: {}, msgs: [say('Sie steht am Strand.')], adult: true, model: 'chroma', body: {} });
  assert.match(bik.negative, /topless/);
  const dress = buildPromptPlan({ profile: LORA, resolved: { identity: 'adult woman, 25 years old', photo: {} },
    photoOverride: { outfit: 'red evening dress' }, story: {}, msgs: [say('Sie steht am Strand.')], adult: true, model: 'chroma', body: {} });
  assert.ok(!/topless/i.test(dress.negative), dress.negative);
  assert.match(dress.negative, /bikini/);
});

// ---------- Non-18+-Pfad ----------
test('v81 non-18+: adult-Profilflag stuft adult-Anfrage nicht mehr herab', () => {
  const notes = [];
  const ph = { intensity: 'stark', koerper: 'piercings1' };
  const { effectiveAdult } = guardAdult({ profile: SERA, adult: true, ph, notes });
  assert.equal(effectiveAdult, true);
  assert.equal(ph.intensity, 'stark');
  assert.equal(ph.koerper, 'piercings1');
  assert.ok(!notes.some((n) => /FSK18-Preset/.test(n)));
});

test('v81 non-18+: FSK18-Presets werden nur im jugendfreien Modus ignoriert', () => {
  const notes = [];
  const ph = { intensity: 'stark', koerper: 'piercings1' };
  const { effectiveAdult } = guardAdult({ profile: SERA, adult: false, ph, notes });
  assert.equal(effectiveAdult, false);
  assert.ok(!ph.intensity && !ph.koerper);
  assert.ok(notes.some((n) => /FSK18-Preset/.test(n)));
  assert.ok(notes.some((n) => /Modus jugendfrei/.test(n)));
});

test('v81 non-18+: Bikini-Outfit wird im jugendfreien Modus ohne Ersatzwert geloescht', () => {
  const notes = [];
  const ph = { outfit: 'micro bikini latex' };
  guardAdult({ profile: SERA, adult: false, ph, notes });
  assert.equal(ph.outfit, '');
  assert.ok(notes.some((n) => /FSK18-Details aus der Auswahl/.test(n)));
  assert.ok(!notes.some((n) => /casual summer outfit|Dropdown-Kleidung/.test(n)));
});

// ---------- minor-risk ----------
test('v74 minor-risk: buildImagePlan blockt Profil mit age<21 auf adult-Pfad', async () => {
  const out = await buildImagePlan({
    profile: { adult: true, persona: { look: { age: 19 } } },
    resolved: { identity: 'adult woman' }, body: { adult: true, context: { messages: [] } }, rnd: () => 0.4,
  });
  assert.ok(out.error, JSON.stringify(out));
  assert.equal(out.error.status, 403);
});

// ---------- keine Lora-Hacks ----------
test('v74 keine Lora-Hacks: "lora" im src/ wird nicht mehr benutzt (nur noch in Kommentar/Test)', () => {
  const files = ['src/imgsvc-formulate.js', 'src/imgsvc-plan.js'];
  for (const f of files) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    // kein aktives String-Literal "lora" mehr in einer Prüfung
    const active = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/['"]lora['"]/.test(active), f + ' hat noch ein lora-Literal');
  }
});

test('v74 intensityDefaults: kein Namens-Fallback mehr, nur photo.intensity', () => {
  assert.equal(intensityDefaults({ profile: { id: 'lora', name: 'Lora' }, body: { adult: true } }), '');
  assert.equal(intensityDefaults({ profile: { photo: { intensity: 'stark' } }, body: { adult: true } }), 'stark');
  assert.equal(intensityDefaults({ profile: { photo: { intensity: 'stark' } }, body: { adult: false } }), '');
});

// ---------- CheckSpec + Vision ----------
test('v74 checkSpec bikini: topRequired + scene + kein extra_people; fail bei top_worn=false', () => {
  const spec = makeCheckSpec({ framing: FRAMING, garment: specFor('bikini'), sceneText: 'beach at sunset' });
  assert.equal(spec.framing, 'face_in_frame');
  assert.equal(spec.garment.kind, 'bikini');
  assert.equal(spec.garment.topRequired, true);
  const v = verdictForVision(spec, { eyes_visible: true, top_of_head_visible: true, garment: 'bikini', top_worn: false, bottom_worn: true, nipples_covered: false, scene_ok: true, extra_people: false });
  assert.equal(v.pass, false);
  assert.match(v.fix_hints, /both triangles on/);
  assert.match(v.fix_negative, /topless/);
});

test('v74 checkSpec nude: nudeExpected, fail wenn bekleidet', () => {
  const spec = makeCheckSpec({ framing: FRAMING, garment: specFor('nude'), sceneText: 'shower' });
  assert.equal(spec.nudeExpected, true);
  const v = verdictForVision(spec, { eyes_visible: true, top_of_head_visible: true, garment: 'bikini', top_worn: true, bottom_worn: true, nipples_covered: true, scene_ok: true, extra_people: false });
  assert.equal(v.pass, false);
  assert.match(v.fix_negative, /clothes/);
});

test('v74 checkSpec dress: fail bei bikini im Bild', () => {
  const spec = makeCheckSpec({ framing: FRAMING, garment: specFor('elegant red evening dress'), sceneText: 'bar' });
  assert.equal(spec.garment.kind, 'dress');
  const v = verdictForVision(spec, { eyes_visible: true, top_of_head_visible: true, garment: 'bikini', top_worn: true, bottom_worn: true, nipples_covered: true, scene_ok: true, extra_people: false });
  assert.equal(v.pass, false);
});

test('v74 checkSpec extra_people / scene_ok', () => {
  const spec = makeCheckSpec({ framing: FRAMING, garment: specFor('bikini'), sceneText: 'beach' });
  const v1 = verdictForVision(spec, { eyes_visible: true, top_of_head_visible: true, garment: 'bikini', top_worn: true, bottom_worn: true, nipples_covered: true, scene_ok: true, extra_people: true });
  assert.equal(v1.pass, false);
  assert.match(v1.fix_hints, /only one woman/);
});

test('v74 parseSpecVision: nipples_covered=false + top_worn=true → fail', () => {
  const spec = makeCheckSpec({ framing: FRAMING, garment: specFor('bikini'), sceneText: 'beach' });
  const json = '{"eyes_visible":true,"top_of_head_visible":true,"garment":"bikini","top_worn":true,"bottom_worn":true,"nipples_covered":false,"scene_ok":true,"extra_people":false}';
  const v = parseSpecVision(json, spec);
  assert.equal(v.pass, false);
  assert.match(v.fix_hints, /both nipples covered/);
});

test('v74 parseVisionJson: robust (Fences, Prosa)', () => {
  const ok = parseVisionJson('```json\n{"eyes_visible":true,"top_of_head_visible":true,"garment":"bikini","top_worn":true,"bottom_worn":true,"nipples_covered":true,"scene_ok":true,"extra_people":false}\n```');
  assert.equal(ok.garment, 'bikini');
  assert.equal(parseVisionJson('no json'), null);
});

// ---------- christianlook generisch ----------
test('v74 christianlook-Preset enthält kein piercing/belly/pubic im Outfit-Text', () => {
  const src = fs.readFileSync(new URL('../apps/chat/photoopts.js', import.meta.url), 'utf8');
  const _c = src.match(/\['bikini', '([^']*)', '([^']*)', 1, '([^']*)'\]/);
  const m = _c && [`['christianlook', '${_c[1]}', '${_c[2]}', 1, '${_c[3]}']`];
  assert.ok(m, 'christianlook fehlt');
  const promptPart = m[0].match(/'([^']*smoke-grey[^']*)'/)?.[1] || '';
  assert.ok(!/belly button piercing|christina piercing/i.test(promptPart), promptPart);
  assert.match(promptPart, /micro string bikini/i);
  assert.match(promptPart, /smoke-grey/i);
});

// ---------- Format-Integration buildImagePlan ----------
test('v74 plan: checkSpec im output + framing zuerst', async () => {
  const p = await buildImagePlan({
    profile: LORA, resolved: { identity: 'adult woman, 25 years old, blonde hair, petite' },
    body: { adult: true, photoOverride: { outfit: 'grey bikini' }, context: { messages: [say('Am Strand.')] } },
    rnd: () => 0.4,
  });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.ok(p.checkSpec, 'checkSpec fehlt');
  assert.equal(p.checkSpec.garment?.kind, 'bikini');
  // Framing steht zuerst; im Prose-Stil mit Section-Label "Framing: full body shot, ..."
  assert.match(p.prompt, /^(Framing: )?full body shot/);
});

import { buildIdentity as _bi74b } from '../src/promptapp/identity.js';
test('v74b identity: kein Name, keine Doppel-"adult woman"', () => {
  const r = _bi74b({ profile: { name: 'Lora', adult: true, persona: { look: { typ: 'Frau', age: 25, hair: 'lange blonde Haare' } } }, resolved: { look: 'Lora, Frau, adult woman, looks about 25, lange blonde Haare' }, adult: true });
  assert.ok(!/\bLora\b/.test(r.identity), r.identity);
  assert.equal((r.identity.match(/adult woman/g) || []).length, 1, r.identity);
});
