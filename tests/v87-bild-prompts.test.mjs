// v87: Bild-Prompt-Fixes (Solo-Negative, Comic-Stil, Nackt/Bikini-Widerspruch, Porträt-Pose, Spar-Mix, Default-Negatives, flux-2-pro, Größen-Parameter)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePlan, sparMixModel, MODEL_TABLE } from '../src/imgsvc-core.js';
import { buildPromptPlan } from '../src/promptapp/index.js';
import { sizeParamsFor } from '../src/venice-size.js';

const FIX = {
  profile: {
    id: 'seraphina', name: 'Seraphina', adult: false,
    traits: 'Warm, freundlich, geduldig, aufmerksam, hilfsbereit',
    persona: {
      look: {
        typ: 'woman in her 20s, fair glowing skin, dark defined brows, full lips',
        age: 34,
        hair: 'long black hair in a high sleek ponytail',
        style: 'elegant',
        special: ['Brille'],
        details: 'gebräunte Haut',
      },
      figur: { groesse: '185 cm', statur: 'curvy hourglass figure', kurven: 6, oberweite: 1 },
    },
  },
  resolved: {
    identity: 'Seraphina, woman in her 20s, fair glowing skin, dark defined brows, full lips, adult woman, looks exactly 34 years old, long black hair in a high sleek ponytail, elegant refined fashion, tailored fitted pieces, graceful, Brille, gebräunte Haut, 185 cm tall, curvy hourglass figure, softly rounded hips, small A-cup bust',
    defaults: { expression: 'warm smile' },
    photo: {
      outfit: 'nude, tiny micro bikini top, tiny string micro bikini, thong string bottom, glossy latex sheen, separate top and bottom',
      pose: '',
      intensity: '',
      frame: '',
      scene: '',
    },
  },
};

const say = (content, role = 'assistant') => ({ role, content });
const plan = async (body, prevStory = null, composeLLM = null) => buildImagePlan({ profile: FIX.profile, resolved: FIX.resolved, prevStory, body: { profile: 'seraphina', conversationId: 't', seedMode: 'same', preview: true, ...body }, composeLLM, rnd: () => 0.5 });
// Partner kommt im Hub aus der Story (LLM-Composer bzw. gespeicherte Story) – hier als gespeicherte Story
const WITH_MARC = { location: 'living room', time_of_day: '', present: ['the woman', 'Marc'], outfit: 'nude', outfit_state: 'nude', action: 'Marc kissing her neck on the sofa', updatedAt: 1 };

const PORTRAIT_SCENE = 'Porträt von Seraphina: Nahaufnahme von Kopf und Schultern, sie lächelt in die Kamera, weiches Fensterlicht in ihrer Wohnung';

test('1) Solo → negative enthält second person; Partner-Szene → kein man/second person, Prompt nennt Marc', async () => {
  const solo = await plan({ style: 'real', adult: true, quality: 'spar', context: { scene: PORTRAIT_SCENE, messages: [say('Ich stehe am Fenster und lächle dich an.')] } });
  assert.ok(!solo.error, JSON.stringify(solo.error));
  assert.match(solo.negative, /second person/);
  const msgs = [say('Marc setzt sich zu dir aufs Sofa.', 'user'), say('Ich ziehe Marc zu mir aufs Sofa, zusammen mit ihm, er küsst meinen Hals und ich bin ganz nackt.')];
  const withPartner = await plan({ style: 'real', adult: true, quality: 'spar', context: { scene: 'Seraphina zusammen mit Marc auf dem Sofa', messages: msgs } }, WITH_MARC);
  assert.equal(withPartner.route.model, 'chroma');
  assert.ok(!withPartner.error, JSON.stringify(withPartner.error));
  assert.ok(!/second person/.test(withPartner.negative), withPartner.negative);
  assert.ok(!/,\s*man,/.test(withPartner.negative), withPartner.negative);
  assert.match(withPartner.prompt, /Marc/);
});

test('2) Comic-Stil: Prompt nennt comic/ink, kein cartoon im Negativ, photorealistic negiert', async () => {
  const p = await plan({ style: 'comic', adult: true, quality: 'spar', context: { scene: 'Comic-Panel: Seraphina nachts allein im Büro', messages: [say('Ich sitze nachts auf dem Schreibtisch im Büro.')] } });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.match(p.prompt, /comic book|ink/i);
  assert.ok(!/\bcartoon\b/i.test(p.negative), p.negative);
  assert.match(p.negative, /photorealistic/);
  assert.match(p.prompt, /no speech bubbles/);
});

test('3) nude-Outfit: kein bikini top worn, kein nude/topless im Negativ; Bikini genau 1×', async () => {
  const nude = await buildPromptPlan({ profile: FIX.profile, resolved: { identity: 'adult woman, looks exactly 34 years old', photo: {} }, adult: true, model: 'qwen-image-3', quality: 'qualitaet', body: { parts: { outfit: 'nude', outfit_state: 'nude', pose: 'sitting' }, style: 'real' } });
  assert.match(nude.prompt, /nude, no clothes/i);
  assert.ok(!/bikini top worn/i.test(nude.prompt), nude.prompt);
  assert.ok(!/(^|,)\s*(nude|topless)(,|$)/i.test(nude.negative), nude.negative);
  const bik = await buildPromptPlan({ profile: FIX.profile, resolved: { identity: 'adult woman, looks exactly 34 years old', photo: {} }, adult: true, model: 'qwen-image-3', quality: 'qualitaet', body: { parts: { outfit: 'red bikini', outfit_state: '', pose: 'standing' }, style: 'real' } });
  const hits = (bik.prompt.match(/bikini top worn/gi) || []).length;
  assert.equal(hits, 1, bik.prompt);
});

test('4) Porträt-Wunsch überschreibt gespeicherte Pose; LLM-close-up ohne Wunsch ergibt volles Bild', async () => {
  const p = await plan({ style: 'real', adult: true, quality: 'spar', photoOverride: { pose: 'sitting on the edge of the bed, legs spread' }, context: { scene: PORTRAIT_SCENE, messages: [say('Ich stehe am Fenster.')], story: { location: 'apartment', present: ['the woman'], outfit: '', outfit_state: '', action: 'smiling at the camera', pose: 'standing' } } });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.ok(!/legs spread/i.test(p.prompt), p.prompt);
  assert.ok(!/edge of the bed/i.test(p.prompt), p.prompt);
  assert.match(p.prompt, /close-up/i);
  assert.match(p.prompt, /head and shoulders, facing the camera/i);
  // LLM-Kamera close-up, aber kein Porträt-Wunsch → close-up wird entfernt, Framing full body
  const llm = async () => JSON.stringify({ scene: 'bedroom', action: 'smiling', pose: 'kneeling on the bed', camera: 'close-up', lighting: 'warm lamps', outfit: '', outfit_state: '', background: '', expression: 'warm smile', story: { location: 'bedroom', present: ['the woman'] } });
  const free = await plan({ style: 'real', adult: true, quality: 'spar', context: { scene: 'Seraphina kniet auf dem Bett', messages: [say('Ich knie auf dem Bett.')] } }, null, llm);
  assert.ok(!free.error, JSON.stringify(free.error));
  assert.equal(free.composer, 'llm');
  assert.match(free.prompt, /full body shot/i);
  assert.ok(!/head and shoulders, facing the camera/i.test(free.prompt), free.prompt);
});

test('5) sparMixModel-Tabelle + buildImagePlan wählt das Modell', async () => {
  assert.deepEqual(sparMixModel({ adult: true, quality: 'spar' }), { model: 'z-image-turbo', cost: 0.01 });
  assert.deepEqual(sparMixModel({ adult: true, quality: 'spar', partner: true }), { model: 'chroma', cost: 0.01 });
  assert.deepEqual(sparMixModel({ adult: true, quality: 'mittel' }), { model: 'qwen-image-2-1-turbo', cost: 0.02 });
  assert.deepEqual(sparMixModel({ adult: true, quality: 'qualitaet' }), { model: 'qwen-image-3', cost: 0.04 });
  assert.equal(sparMixModel({ adult: false, quality: 'spar' }), null);
  assert.equal(MODEL_TABLE.qualitaet.safe.model, 'flux-2-pro');
  assert.equal(MODEL_TABLE.hq.safe.model, 'flux-2-pro');
  const solo = await plan({ style: 'real', adult: true, quality: 'spar', context: { messages: [say('Ich stehe am Fenster.')] } });
  assert.equal(solo.route.model, 'z-image-turbo');
  const mittel = await plan({ style: 'real', adult: true, quality: 'mittel', context: { messages: [say('Ich stehe am Fenster.')] } });
  assert.equal(mittel.route.model, 'qwen-image-2-1-turbo');
  const safeQ = await plan({ style: 'real', adult: false, quality: 'qualitaet', context: { messages: [say('Ich lese ein Buch.')] } });
  assert.equal(safeQ.route.model, 'flux-2-pro');
  const safeHq = await plan({ style: 'real', adult: false, quality: 'hq', context: { messages: [say('Ich lese ein Buch.')] } });
  assert.equal(safeHq.route.model, 'flux-2-pro');
});

test('6) Default-Negatives früh + innerhalb 800 Zeichen; Navel-Ausnahme; chroma-Prompt hat natural hands', async () => {
  const p = await plan({ style: 'real', adult: true, quality: 'spar', context: { scene: PORTRAIT_SCENE, messages: [say('Ich stehe am Fenster.')] } });
  const head = p.negative.slice(0, 800);
  for (const w of ['broken hands', 'broken fingers', 'bad teeth', 'navel piercing', 'duplicate person']) assert.ok(head.includes(w), `fehlt: ${w} / ${head}`);
  // chroma (Partner) → positive Kurzform
  const msgs = [say('Er ist bei mir.', 'user'), say('Ich liege mit ihm auf dem Sofa, zusammen mit ihm.')];
  const ch = await plan({ style: 'real', adult: true, quality: 'spar', context: { scene: 'Seraphina mit Marc', messages: msgs } }, WITH_MARC);
  assert.equal(ch.route.model, 'chroma');
  assert.match(ch.prompt, /natural hands with five fingers/);
  // Navel-Piercing in der Identität → kein navel-Negativ
  const nav = await buildPromptPlan({ profile: FIX.profile, resolved: { identity: 'adult woman, looks exactly 34 years old, navel piercing', photo: {} }, adult: true, model: 'qwen-image-3', quality: 'qualitaet', body: { parts: { outfit: 'red dress', pose: 'standing' }, style: 'real' } });
  assert.ok(!/navel piercing/i.test(nav.negative), nav.negative);
});

test('7) sizeParamsFor: qwen → aspect_ratio+1K, flux → nur aspect_ratio, chroma → width/height', () => {
  const q = sizeParamsFor('qwen-image-3', 1024, 1024);
  assert.equal(q.aspect_ratio, '1:1'); assert.equal(q.resolution, '1K'); assert.equal('width' in q, false);
  const qt = sizeParamsFor('qwen-image-2-1-turbo', 768, 1024);
  assert.equal(qt.aspect_ratio, '3:4'); assert.equal(qt.resolution, '1K');
  const f = sizeParamsFor('flux-2-pro', 1024, 1024);
  assert.equal(f.aspect_ratio, '1:1'); assert.equal('width' in f, false); assert.equal('resolution' in f, false);
  const c = sizeParamsFor('chroma', 768, 1024);
  assert.equal(c.width, 768); assert.equal(c.height, 1024);
});

test('8) A-cup rückt hinter das Alter, Negative large breasts; Szenen-Alter wird entfernt', async () => {
  const p = await buildPromptPlan({ profile: FIX.profile, resolved: FIX.resolved, adult: true, model: 'qwen-image-3', quality: 'qualitaet', body: { parts: { outfit: 'red dress', pose: 'standing', scene: 'a woman in her 20s on a beach' }, style: 'real' } });
  assert.match(p.negative, /large breasts/);
  const idLine = (p.prompt.match(/The woman: [^.]+/) || [''])[0];
  const segs = idLine.replace(/^The woman: /, '').split(/,\s*/);
  const ageIdx = segs.findIndex((s) => /looks exactly \d+ years old/i.test(s));
  assert.ok(ageIdx >= 0, idLine);
  assert.match(segs[ageIdx + 1] || '', /A-cup|small breasts/i, idLine);
  assert.ok(!/in her 20s/i.test(p.prompt), p.prompt);
});

test('9) dropNegativeConflicts entfernt widersprechende Negatives', async () => {
  const { dropNegativeConflicts } = await import('../src/promptapp/util.js');
  const out = dropNegativeConflicts('bad anatomy, nude, topless, watermark', 'nude, no clothes');
  assert.ok(!/(^|,)\s*nude(,|$)/.test(out), out);
  assert.match(out, /bad anatomy/);
});

test('10) jugendfrei: Nacktheits-Negatives bleiben früh stehen (auch bei nacktem Dropdown-Outfit)', async () => {
  const p = await plan({ style: 'real', adult: false, quality: 'qualitaet', context: { messages: [say('Ich lese ein Buch in der Bibliothek.')] } });
  assert.ok(!p.error, JSON.stringify(p.error));
  assert.equal(p.route.model, 'flux-2-pro');
  const head = p.negative.slice(0, 800);
  for (const w of ['nsfw', 'nude', 'topless']) assert.ok(new RegExp(`(^|, )${w}(,|$)`).test(head), `fehlt: ${w} / ${head}`);
  assert.ok(!/legs spread|micro bikini/i.test(p.prompt), p.prompt);
});

test('11) Venice-Größe: Hub-genOne und Bild-App nutzen sizeParamsFor (kein width/height für qwen/flux)', async () => {
  const fs = await import('node:fs');
  const hub = fs.readFileSync('src/imgsvc-image.ts', 'utf8');
  const bild = fs.readFileSync('src/bild/image-handler.ts', 'utf8');
  assert.match(hub, /\.\.\.sizeParamsFor\(model,/);
  assert.match(bild, /\.\.\.sizeParamsFor\(model, width, height\)/);
  assert.ok(!/hide_watermark: true, width, height/.test(bild));
  assert.ok(!/["']qwen-image-3["'], prompt, NEG/.test(bild), 'Bild-App HQ jugendfrei darf nicht qwen-image-3 nutzen');
});

test('12) Mann-Profil solo: Negativ verbietet keinen Mann', async () => {
  const male = { ...FIX.profile, id: 'tom', name: 'Tom', persona: { look: { typ: 'man in his 30s', age: 35, gender: 'male' } }, gender: 'male' };
  const p = await buildPromptPlan({ profile: male, resolved: { identity: 'adult man, looks exactly 35 years old', photo: {} }, adult: true, model: 'qwen-image-3', quality: 'qualitaet', body: { parts: { outfit: 'jeans and t-shirt', pose: 'standing' }, style: 'real' } });
  assert.match(p.prompt, /The man:/);
  assert.ok(!/(^|, )man(,|$)/.test(p.negative), p.negative);
});
