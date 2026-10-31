import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MODULES, IMAGE_MODULE_MODELS, moduleChoice, moduleChain, moduleBody, setModuleChoice,
} from '../apps/shared/module-models.js';
import { validComposerModel, upstreamUrl } from '../src/model-allow.js';
import { normalizeMix, mixCost, mixBackgroundPrompt, mixBackgroundNegative, mixPersonPrompt, MIX_DEFAULT } from '../src/imgsvc-mix.js';
import { runwareTask, parseRunwareImage, RUNWARE_MODEL } from '../src/runware.js';
import { parseRunware } from '../src/balance-parse.js';
import { MODEL_TABLE, routeModel } from '../src/imgsvc-core.js';
import { MODELS, needsApproval, PRESETS } from '../apps/shared/models.js';
import { costOf, buildBody } from '../apps/bild/core.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('module-models: kein Body ohne Wahl, Body mit Wahl', () => {
  assert.deepEqual(moduleBody({}, 'comic_text', { adult: true }), {});
  const s = { moduleModels: { comic_text: { normal: ['venice-uncensored-1-2'] } } };
  assert.deepEqual(moduleBody(s, 'comic_text', {}), { model: 'venice-uncensored-1-2', modelChain: ['venice-uncensored-1-2', 'gemini-3.5-flash-lite'] });
  assert.deepEqual(moduleChain(s, 'comic_text', { adult: true }), ['venice-uncensored-1-2', 'venice-uncensored-1-2'].slice(0, 1));
});

test('module-models: Bild-Module filtern unbekannte Modelle', () => {
  const s = { moduleModels: { comic_image: { normal: ['chroma', 'gpt-9', 'z-image-turbo'] } } };
  assert.deepEqual(moduleChoice(s, 'comic_image', false), ['z-image-turbo']);
  assert.deepEqual(moduleChoice({ moduleModels: { comic_image: { adult: ['lustify-v8'] } } }, 'comic_image', true), ['lustify-v8']);
});

test('module-models: setModuleChoice rein, leere Liste löscht', () => {
  const orig = { moduleModels: { comic_text: { normal: ['gemini-3.5-flash'] } } };
  const snap = JSON.stringify(orig);
  const next = setModuleChoice(orig, 'comic_text', false, []);
  assert.equal(JSON.stringify(orig), snap);
  assert.equal(next.moduleModels, undefined);
  const again = setModuleChoice(orig, 'bot_turn', false, ['venice-uncensored-1-2']);
  assert.deepEqual(again.moduleModels.bot_turn.normal, ['venice-uncensored-1-2']);
});

test('module-models: 7 IDs und kein chat', () => {
  const ids = MODULES.map((m) => m.id);
  for (const id of ['comic_text', 'comic_image', 'bot_triage', 'bot_turn', 'bot_moderate', 'refs', 'image_composer']) assert.ok(ids.includes(id), id);
  assert.equal(ids.includes('chat'), false);
  assert.ok(IMAGE_MODULE_MODELS.normal.length >= 3);
});

test('Text-Smokes: Aufrufer nutzen die Wrapper', () => {
  assert.match(read('apps/hub/comic.js'), /getModuleBody\('comic_text'/);
  assert.match(read('apps/hub/comic.js'), /getModuleChain\('comic_image'/);
  const bot = read('apps/hub/bot.js');
  assert.match(bot, /getModuleBody\('bot_triage'/);
  assert.match(bot, /getModuleBody\('bot_turn'/);
  assert.match(bot, /getModuleBody\('bot_moderate'/);
  assert.match(read('apps/chat/refs.js'), /getModuleBody\('refs'\)/);
  const st = read('apps/hub/settings.js');
  assert.match(st, /module-models/);
  assert.match(st, /#s-mix/);
  const img = read('src/imgsvc-image.ts');
  assert.match(img, /validComposerModel/);
  assert.match(img, /normalizeMix/);
  assert.match(img, /genAny\(/);
  assert.match(img, /genRunware\(/);
  assert.equal(/await genOne\(route/.test(img), false);
});

test('validComposerModel', () => {
  for (const ok of ['venice-uncensored-1-2', 'gemini-3.5-flash', 'groq:openai/gpt-oss-20b', 'grok-4.3', 'x/y:free']) assert.equal(validComposerModel(ok), ok, ok);
  for (const bad of ['"; drop', 'http://x', 'openai/gpt-5', 'a'.repeat(81)]) assert.equal(validComposerModel(bad), '', bad);
});

test('imgsvc-mix: Allowlist, Kosten, Prompts', () => {
  assert.equal(normalizeMix(null), null);
  assert.deepEqual(normalizeMix({ bg: 'nope', fg: 'nope' }, false), { bg: MIX_DEFAULT.bg, fg: MIX_DEFAULT.fg, cost: mixCost(MIX_DEFAULT.bg, MIX_DEFAULT.fg) });
  const a = normalizeMix({ bg: 'chroma', fg: 'qwen-image-2-1-turbo-edit' }, true);
  assert.equal(a.fg, 'qwen-edit-uncensored');
  assert.equal(mixCost('z-image-turbo', 'qwen-image-2-1-turbo-edit'), 0.03);
  const bg = mixBackgroundPrompt({ background: 'a woman in a cafe', scene: 'man at the bar', lighting: 'warm evening light' }, 'real');
  assert.equal(/woman|man\b/i.test(bg), false);
  assert.match(bg, /no people/);
  assert.match(bg, /warm evening light/);
  assert.equal(mixBackgroundNegative().includes('watermark'), true);
  const f = mixPersonPrompt({ parts: { outfit: 'blue dress', pose: 'standing' }, identity: 'long dark hair' });
  assert.match(f, /adult woman/);
  assert.match(mixPersonPrompt({ parts: {}, identity: '', male: true }), /adult man/);
  assert.ok(mixPersonPrompt({ parts: { pose: 'x'.repeat(3000) }, identity: 'y'.repeat(3000) }).length <= 1400);
});

test('runware: Task-Felder + Parsing', () => {
  const [t] = runwareTask({ prompt: 'a cat', negative: '', width: 1000, height: 2048, seed: 7, uuid: 'u1' });
  assert.equal(t.taskType, 'imageInference');
  assert.equal(t.outputType, 'base64Data');
  assert.equal(t.outputFormat, 'WEBP');
  assert.equal(t.includeCost, true);
  assert.equal(t.checkNSFW, true);
  assert.equal(t.width, 1024);
  assert.equal(t.height, 2048);
  assert.equal('negativePrompt' in t, false);
  assert.equal(runwareTask({ prompt: 'xy', adult: true, uuid: 'u' })[0].checkNSFW, false);
  assert.equal(RUNWARE_MODEL, 'runware:100@1');
  assert.deepEqual(parseRunwareImage({ data: [{ imageBase64Data: 'AAA', cost: 0.0013, seed: 3 }] }), { b64: 'AAA', cost: 0.0013, seed: 3, nsfw: false });
  assert.equal(parseRunwareImage({ data: [{ imageDataURI: 'data:image/webp;base64,BBB' }] }).b64, 'BBB');
  assert.throws(() => parseRunwareImage({ errors: [{ code: 'insufficient', message: 'no balance' }] }), /runware insufficient/);
  assert.throws(() => parseRunwareImage({ data: [] }), /runware no image/);
});

test('parseRunware: Zahlen- und Objektformat, kein Key-Leak', () => {
  const key = 'secret-runware-key-123';
  const flat = parseRunware({ data: [{ balance: 1.5, apiKeys: [key] }] });
  assert.equal(flat.balanceUsd, 1.5);
  assert.equal(flat.unit, 'USD');
  const obj = parseRunware({ data: [{ balance: { amount: 1, freeBalance: 0.5, currency: 'USD', apiKeys: [key] } }] });
  assert.equal(obj.balanceUsd, 1.5);
  assert.equal(JSON.stringify(flat).includes(key), false);
  assert.equal(JSON.stringify(obj).includes(key), false);
});

test('upstreamUrl: grok + andere Provider', () => {
  assert.equal(upstreamUrl('grok', 'https://api.x.ai', 'v1/chat/completions'), 'https://api.x.ai/v1/chat/completions');
  const gw = upstreamUrl('grok', 'https://gateway.ai.cloudflare.com/v1/acc/gw/grok', 'v1/chat/completions');
  assert.equal(gw, 'https://gateway.ai.cloudflare.com/v1/acc/gw/grok/v1/chat/completions');
  assert.equal((gw.match(/\/grok\//g) || []).length, 1);
  assert.equal(upstreamUrl('openrouter', 'R', 'v1/chat/completions'), 'R/openrouter/v1/chat/completions');
  assert.equal(upstreamUrl('google', 'R', 'v1beta/x'), 'R/google/v1beta/x');
  assert.equal(upstreamUrl('venice', 'R', 'v1/chat/completions'), 'R/v1/chat/completions');
  assert.equal(upstreamUrl('groq', 'R', 'v1/chat/completions'), 'R/v1/chat/completions');
  assert.equal(upstreamUrl('mistral', 'R', 'v1/chat/completions'), 'R/v1/chat/completions');
});

test('models.js: grok-Einträge, needsApproval, PRESETS, chat.ts', () => {
  for (const id of ['grok-4.3', 'grok-4.20-0309-non-reasoning', 'grok-4.7']) assert.ok(MODELS.some((m) => m.id === id), id);
  assert.equal(needsApproval('grok-4.3'), false);
  const presets = JSON.stringify(PRESETS);
  assert.equal(presets.includes('grok'), false);
  assert.match(read('functions/api/chat.ts'), /isFreeModel[^\n]*grok-/);
});

test('runware-Qualität in MODEL_TABLE/routeModel/costOf + byte-gleicher Body', () => {
  assert.equal(MODEL_TABLE.runware.safe.model, 'runware:100@1');
  assert.equal(MODEL_TABLE.runware.adult.model, 'runware:100@1');
  assert.equal(routeModel({ quality: 'runware', adult: true, explicit: true }).model, 'runware:100@1');
  assert.equal(costOf('single', 'runware'), 0.002);
  const body = buildBody({ mode: 'single', profile: 'p1', style: 'real', quality: 'single', seed: 'zufall', scene: '', ownScene: 'a beach', adult: false, panels: 2, format: 'hoch' });
  assert.equal('mix' in body, false);
  assert.equal('composerModel' in body, false);
  const withMod = buildBody({ mode: 'single', profile: 'p1', style: 'real', quality: 'single', seed: 'zufall', scene: '', ownScene: 'a beach', adult: false, panels: 2, format: 'hoch', composerModel: 'gemini-3.5-flash', mix: { bg: 'z-image-turbo', fg: 'qwen-image-2-1-turbo-edit' } });
  assert.equal(withMod.composerModel, 'gemini-3.5-flash');
  assert.deepEqual(withMod.mix, { bg: 'z-image-turbo', fg: 'qwen-image-2-1-turbo-edit' });
});
