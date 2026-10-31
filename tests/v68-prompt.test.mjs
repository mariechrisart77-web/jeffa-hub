// v68 Prompt-Paket: ein Serverpfad, Seed pro Szene, keine Gewichte, feste Reihenfolge, Outfit-Zustand, keine Extra-Personen, 21+, Modelltabelle, Story-Kontinuität
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  sceneSeed, resolveSeed, buildImagePlan, ruleComposer, filterPeople, MODEL_TABLE, assemblePrompt, compactIdentity,
  minorRisk, parseComposerJson, mergeStory, stripWeights, routeModel, composeNegative, buildRulePrompt, modelLabel,
} from '../src/imgsvc-core.js';

const PROFILE = { id: 'p-adult', name: 'Ava', persona: { look: { age: 28, hair: 'long auburn hair' } }, photo: { quality: 'mittel' }, seed: 12345 };
const RESOLVED = { identity: 'adult woman, looks about 28, long auburn hair, green eyes, curvy, tall' };
const WEIGHT = /\(\s*[^()]*?\s*:\s*\d+(\.\d+)?\s*\)/;
const plan = (body, extra = {}) => buildImagePlan({ profile: PROFILE, resolved: RESOLVED, body: { profile: 'p-adult', ...body }, rnd: () => 0.4, ...extra });
const say = (content, role = 'assistant') => ({ role, content });

test('Seed: pro Szene verschieden, gleiche Szene gleich, Modus same hält den Seed', async () => {
  assert.equal(sceneSeed(1000, 'beach|wet'), sceneSeed(1000, 'beach|wet'));
  assert.notEqual(sceneSeed(1000, 'beach|wet'), sceneSeed(1000, 'bedroom|wet'));
  const a = await plan({ context: { messages: [say('Wir sind am Strand.')] } });
  const a2 = await plan({ context: { messages: [say('Wir sind am Strand.')] } });
  const b = await plan({ context: { messages: [say('Nachts im Büro am Schreibtisch.')] } });
  assert.equal(a.seed, a2.seed); assert.notEqual(a.seed, b.seed);
  const same = await plan({ seedMode: 'same', seed: 777, context: { messages: [say('Nachts im Büro.')] } });
  assert.equal(same.seed, 777);
  assert.notEqual(resolveSeed({ profile: { seedVary: true }, rnd: () => 0.1, sceneKey: 'x' }), resolveSeed({ profile: { seedVary: true }, rnd: () => 0.9, sceneKey: 'x' }));
});

test('keine Gewichtssyntax in Plan-, Assemble- und Regel-Prompts', async () => {
  const { prompt, negative } = assemblePrompt({ scene: 'beach (shot:1.3)', outfit: 'white shirt', outfit_state: 'wet' }, { styleText: 'soft (mood:1.2)', identity: 'adult woman' });
  assert.ok(!WEIGHT.test(prompt) && !WEIGHT.test(negative), prompt);
  const r = buildRulePrompt({ identity: 'x', scene: 'y', outfit: '', outfitNeg: '', defaults: {}, corrections: { positive: '', negative: '' } }, { style: 'real' });
  assert.ok(!WEIGHT.test(r.prompt), r.prompt);
  const p = await plan({ context: { messages: [say('Am Strand (wet:1.4)')] } });
  assert.ok(!WEIGHT.test(p.prompt), p.prompt);
  assert.equal(stripWeights('a (b:1.4) c'), 'a b c');
});

test('feste Reihenfolge Szene → Kamera/Pose → Outfit → Identität → Stil → Qualität; Identität ≤ 300', () => {
  const { prompt } = assemblePrompt({ scene: 'SCENEMARK', pose: 'POSEMARK', outfit: 'OUTFITMARK' }, { identity: 'IDENTMARK, ' + 'x'.repeat(50) + ', ' + 'long hair, '.repeat(60), styleText: 'STYLEMARK' });
  const idx = ['SCENEMARK', 'POSEMARK', 'OUTFITMARK', 'IDENTMARK', 'STYLEMARK', 'Quality:'].map((k) => prompt.indexOf(k));
  assert.ok(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), prompt);
  assert.ok(compactIdentity('a, '.repeat(400) + 'long auburn hair', 300).length <= 300);
});

test('Outfit-Zustand nass ist explizit, Negativ enthält trockene Kleidung + Generik + Feedback', () => {
  const { prompt, negative } = assemblePrompt({ scene: 'pool', outfit: 'white shirt', outfit_state: 'wet' }, { corrections: { negative: 'FEEDBACKNEG' }, outfitNeg: 'OUTFITNEG' });
  assert.match(prompt, /soaking wet white shirt clinging/);
  assert.match(negative, /dry clothes/); assert.match(negative, /bad anatomy/); assert.match(negative, /FEEDBACKNEG/); assert.match(negative, /OUTFITNEG/);
  assert.match(composeNegative({ outfit_state: 'wet' }), /dry clothes/);
});

test('keine Extra-Personen: Filter im Plan + Solo-Negativ; erlaubt nur wenn Chat es ausdrücklich sagt', async () => {
  const solo = filterPeople({ action: 'she sits on the bed, a man watches her, crowd behind', background: 'bedroom' }, false);
  assert.ok(!/\bman\b|crowd/i.test(solo.action), solo.action);
  const p = await plan({ context: { messages: [say('Im Büro, ihr Kollege ist schon gegangen.')] } });
  assert.match(p.negative, /extra people/); assert.deepEqual(p.story.present, ['the woman']);
  const LLM = async () => JSON.stringify({ scene: 'the woman with her boyfriend in a bar', action: 'a man hands her a drink', pose: '', camera: '', lighting: '', outfit: 'red dress', outfit_state: '', background: 'bar, crowd', expression: '', story: { location: 'bar' } });
  const q = await plan({ context: { messages: [say('Sie sitzt allein an der Bar.')] } }, { composeLLM: LLM });
  assert.equal(q.composer, 'llm');
  assert.ok(!/\b(man|boyfriend|crowd)\b/i.test(q.prompt), q.prompt);
});

test('21+-Sperre auf dem einzigen Pfad (auch dryRun) + Jugend-Wörter werden entfernt', async () => {
  const young = { ...PROFILE, persona: { look: { age: 19 } } };
  assert.equal(minorRisk(young, {}), true);
  const r = await buildImagePlan({ profile: young, resolved: { identity: 'adult woman' }, body: { adult: true, dryRun: true, context: { messages: [] } } });
  assert.equal(r.error.status, 403); assert.match(r.error.message, /21\+/);
  const r2 = await plan({ adult: true, context: { scene: 'schoolgirl outfit' } });
  assert.equal(r2.error?.status, 403);
  const h = fs.readFileSync('src/bild/image-handler.ts', 'utf8');
  assert.match(h, /if \(\(body as any\)\.profile\) return imageNewMode/);
});

test('Modelltabelle: jeder Dropdown-Wert gemappt, FSK18 nur unzensierte Modelle, Labels aus der Tabelle', () => {
  const hub = fs.readFileSync('apps/hub/settings.js', 'utf8');
  const vals = [...hub.matchAll(/value="([a-z-]+)"/g)].map((m) => m[1]).filter((v) => ['single', 'mix', 'lustify', 'hq', 'refine', 'refine-firered', 'krea'].includes(v));
  for (const q of [...new Set([...vals, 'auto', 'spar', 'mittel', 'qualitaet'])]) {
    assert.ok(MODEL_TABLE[q], q);
    const s = routeModel({ quality: q }), a = routeModel({ quality: q, adult: true });
    assert.ok(s.model && a.model, q);
    assert.ok(['chroma', 'lustify-v8', 'qwen-edit-uncensored', 'firered-image-edit'].includes(a.model), `${q} -> ${a.model}`);
    assert.ok(modelLabel(q, true));
  }
  assert.equal(routeModel({ quality: 'quatsch' }).q, 'single');
  assert.equal(routeModel({ quality: 'hq', adult: true }).steps, 50);
  assert.equal(routeModel({ quality: 'hq' }).model, 'qwen-image-3');
});

test('chat.js baut keine Prompts mehr; Bildcode wird bei Bedarf geladen', () => {
  const c = fs.readFileSync('apps/chat/chat.js', 'utf8');
  assert.ok(!/NEG_SINGLE|NEG_COMIC|function generateImageInChat|const ANGLES|imagefb\/scene|imagefb\/compose|:1\.\d/.test(c));
  assert.match(c, /import\('\.\/image-client\.js'\)/);
  const ic = fs.readFileSync('apps/chat/image-client.js', 'utf8');
  assert.match(ic, /conversationId/); assert.ok(!/negative:\s*NEG|prompt:\s*full/.test(ic));
  const core = fs.readFileSync('src/imgsvc-image.ts', 'utf8');
  assert.ok(!/imgp:/.test(core), 'imgp-Cache entfernt');
});

test('Pose-Dropdown gewinnt; "automatisch" → Pose/Ort aus der Szene', async () => {
  const LLM = async () => JSON.stringify({ scene: 'beach', pose: 'standing in the water', outfit: 'shirt', outfit_state: 'wet', background: 'beach', story: { location: 'beach' } });
  const p = await plan({ photoOverride: { pose: 'sitting on the sand' }, context: { messages: [say('Am Strand')] } }, { composeLLM: LLM });
  assert.equal(p.parts.pose, 'sitting on the sand');
  const auto = await plan({ context: { messages: [say('Ich setze mich nachts im Büro an den Schreibtisch.')] } });
  assert.match(auto.parts.pose, /sitting at the desk/); assert.match(auto.prompt, /office/);
});

test('Story über 3 Schritte: Strand nass → Schlafzimmer (noch nass) → setzt sich aufs Bett', async () => {
  const msgs = [say('Wir sind am Strand, ich trage ein weißes T-Shirt. Die Wellen spritzen mich nass, ich lache.')];
  const s1 = await plan({ dryRun: true, context: { messages: msgs } });
  assert.match(s1.prompt, /beach/); assert.match(s1.prompt, /soaking wet white t-shirt/);
  msgs.push(say('Es wird Abend. Wir gehen zurück ins Hotel und ins Schlafzimmer.', 'user'));
  const s2 = await plan({ dryRun: true, context: { messages: msgs } }, { prevStory: s1.story });
  assert.equal(s2.story.location, 'bedroom'); assert.equal(s2.story.outfit_state, 'wet');
  assert.match(s2.prompt, /bedroom/); assert.match(s2.prompt, /soaking wet/); assert.ok(!/beach/.test(s2.prompt), s2.prompt);
  msgs.push(say('Ich setze mich aufs Bett.'));
  const s3 = await plan({ dryRun: true, context: { messages: msgs } }, { prevStory: s2.story });
  assert.match(s3.prompt, /sitting on the edge of the bed/); assert.match(s3.prompt, /bedroom/); assert.match(s3.prompt, /soaking wet/); assert.match(s3.prompt, /evening/);
  assert.notEqual(s1.seed, s3.seed);
  msgs.push(say('Ich habe mich abgetrocknet und umgezogen, jetzt trage ich einen blauen Pyjama.'));
  const s4 = await plan({ context: { messages: msgs } }, { prevStory: s3.story });
  assert.ok(!/soaking wet/.test(s4.prompt), s4.prompt); assert.match(s4.prompt, /blue pyjamas/);
});

test('Composer-JSON robust; mergeStory behält nass, Ortswechsel übernimmt', () => {
  const o = parseComposerJson('Hier:\n```json\n{"scene":"beach","story":{"location":"beach","outfit_state":"wet"}}\n```');
  assert.equal(o.scene, 'beach'); assert.equal(o.story.outfit_state, 'wet');
  const m = mergeStory({ location: 'beach', outfit_state: 'wet', outfit: 'shirt' }, { location: 'bedroom' });
  assert.equal(m.location, 'bedroom'); assert.equal(m.outfit_state, 'wet');
  assert.equal(mergeStory(m, { outfit_state: 'dry' }).outfit_state, '');
  const r = ruleComposer({}, null, [say('Im Pool')]); assert.equal(r.story.location, 'pool');
});

test('v68b: freier Prompt für alle (mit 21+), Verschlüsselung Standard aus + Migration', () => {
  const h = fs.readFileSync('src/bild/image-handler.ts', 'utf8');
  assert.ok(!/prompt_admin_only/.test(h)); assert.match(h, /youthRisk\(String\(prompt\)\)/);
  const c = fs.readFileSync('apps/shared/crypto.js', 'utf8');
  assert.match(c, /encDefaultOff68/); assert.match(c, /encrypt: false/); assert.match(c, /Bild-App keinen Story-Kontext/);
  const chat = fs.readFileSync('apps/chat/chat.js', 'utf8');
  assert.match(chat, /parsed\.ct \? await decryptJSON/); assert.match(chat, /parsed\.ct && !isEncryptOn\(\)\) await persist\(true\)/);
  for (const f of ['apps/chat/app.js', 'apps/hub/settings.js']) assert.match(fs.readFileSync(f, 'utf8'), /ENCRYPT_WARN/);
});
