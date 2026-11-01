import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLayers, buildRulePrompt, routeModel, enforceLocked, stripConflicts, pickAngle } from '../src/imgsvc-core.js';

const profile = { persona: { look: { hair: 'long red hair', age: 30 }, figur: { statur: 'slim' } } };
const resolved = { look: 'adult woman, long red hair, slim', outfitKeyword: 'Kleid', outfitText: 'green silk dress', outfitNeg: 'jeans' };

test('locked hair: contradicting scene words are stripped and recorded', () => {
  const L = resolveLayers({ profile, resolved, scene: 'a blonde woman in a café, 22 years old' });
  assert.ok(!/blonde/i.test(L.scene) && !/22 years/.test(L.scene));
  assert.deepEqual(L.conflicts.map((c) => c.slot).sort(), ['age', 'hair']);
  assert.equal(L.conflicts.find((c) => c.slot === 'hair').source, 'profile');
});
test('agreeing words are kept; unlocked slots are not touched', () => {
  assert.equal(stripConflicts('red hair and blue eyes', { hair: { text: 'red hair' } }).text, 'red hair and blue eyes');
});
test('photo dropdown outfit beats outfit rule beats card', () => {
  const card = { data: { extensions: { jeffa: { outfit: 'leather jacket', look: { hair: 'black hair' } } } } };
  assert.equal(resolveLayers({ profile, resolved, card, scene: 'im Kleid' }).outfit, 'green silk dress');
  assert.equal(resolveLayers({ profile, resolved: { ...resolved, photo: { outfit: 'white bikini' } }, card, scene: 'im Kleid' }).outfit, 'white bikini');
  assert.equal(resolveLayers({ profile, resolved, card, scene: 'Kleid ausziehen' }).outfit, 'leather jacket');
  assert.ok(!resolveLayers({ profile, resolved, card }).identity.includes('black hair'), 'profile hair wins over card');
});
test('scene defaults to last assistant message; fixed choices listed', () => {
  const L = resolveLayers({ profile, resolved: { ...resolved, photo: { pose: 'kneeling', light: 'golden hour' } }, context: { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Ich sitze am Strand' }] } });
  assert.equal(L.scene, 'Ich sitze am Strand');
  assert.match(L.fixed, /pose: kneeling; lighting: golden hour/);
});
test('rule prompt: scene first, no text, negatives', () => {
  const L = resolveLayers({ profile, resolved, scene: 'im Kleid am Strand' });
  const r = buildRulePrompt(L, { style: 'real', angle: 'wide shot' });
  assert.ok(r.prompt.replace(/^Framing: [^.]*\. /, '').startsWith('Scene: im Kleid am Strand') && !/:1\.\d/.test(r.prompt)); // v68: keine Gewichte
  assert.match(r.prompt, /green silk dress/); assert.match(r.prompt, /no text, no letters/); assert.match(r.negative, /jeans/);
  assert.match(buildRulePrompt(L, { style: 'comicpage' }).prompt, /^comic book page/);
});
test('routing and costs', () => {
  assert.deepEqual([routeModel().cost, routeModel({ quality: 'mittel' }).model, routeModel({ quality: 'qualitaet' }).cost], [0.01, 'qwen-image-2-1-turbo', 0.03]); // v87: jugendfrei qualitaet → flux-2-pro $0.03
  assert.equal(routeModel({ refMode: 'full', hasRef: true }).kind, 'gen'); assert.equal(routeModel({ refMode: 'figur', hasRef: true, adult: true }).model, 'chroma'); // v68: Referenzbild nur noch als Look-Text (refLook), kein Edit-Routing mehr über refMode
  assert.equal(routeModel({ refMode: 'face', hasRef: false }).kind, 'gen');
  assert.equal(routeModel({ refMode: 'face', hasRef: true, style: 'comicpage' }).kind, 'gen');
  assert.equal(routeModel({ style: 'manhwa' }).cost, 0.02);
});
test('enforceLocked strips contradictions and appends missing identity', () => {
  const L = resolveLayers({ profile, resolved, scene: 'blonde girl' });
  const p = enforceLocked('blonde woman on a beach', L);
  assert.ok(!/blonde/.test(p)); assert.match(p, /adult woman, long red hair/); assert.match(p, /no text/);
});
test('pickAngle deterministic for mirror', () => assert.equal(pickAngle('Selfie im Spiegel', () => 0), 'mirror reflection, side view'));

// v38: chat clothing beats a remembered Kleidung dropdown
import { useScene as _us, resolveLayers as _rl, routeModel as _rm } from '../src/imgsvc-core.js';
test('v73 useScene: explicit dropdown outfit always wins; rule outfit yields to the chat', () => {
  const L = _rl({ resolved: { identity: 'adult woman', photo: { outfit: 'grey latex micro bikini' } } });
  assert.equal(L.outfit, 'grey latex micro bikini');
  assert.equal(_us(L, 'Sie liegt im grauen Latex-Catsuit auf der Motorhaube').outfit, undefined);
  const R = _rl({ resolved: { identity: 'adult woman', outfitKeyword: 'pool', outfitText: 'grey latex micro bikini' }, scene: 'am pool' });
  assert.equal(R.outfit, 'grey latex micro bikini');
  const u = _us(R, 'Am Pool, sie trägt jetzt ein rotes Kleid');
  assert.equal(u.outfit, ''); assert.ok(!String(u.fixed).includes('clothing'));
  assert.deepEqual(_us(L, 'Sie lacht und schaut aufs Meer'), {});
});
test('v38 FSK18 spar routes to chroma', () => { assert.equal(_rm({ adult: true }).model, 'chroma'); });
import { sceneVariation as _sv } from '../src/imgsvc-core.js';
test('v38 scene-driven image keeps only the lens variation', () => {
  assert.equal(_sv('hand touching her hair, 85mm lens', 'The woman kneels'), '85mm lens');
  assert.equal(_sv('hand touching her hair, 85mm lens', ''), 'hand touching her hair, 85mm lens');
});
test('AP6: Bildstil preset replaces the render piece in the prompt', () => {
  const L = resolveLayers({ profile, resolved: { ...resolved, photo: { render: 'black and white film noir, hard shadows' } }, scene: 'im Café' });
  assert.match(buildRulePrompt(L, { style: 'real' }).prompt, /film noir/);
  const L0 = resolveLayers({ profile, resolved, scene: 'im Café' });
  assert.doesNotMatch(buildRulePrompt(L0, { style: 'real' }).prompt, /film noir/);
});

test('v48 useScene strips clothing from own style text when the chat decides clothes', () => {
  const L = _rl({ resolved: { identity: 'adult woman', styleText: 'full bust, very skimpy micro bikini or tight grey latex outfit, glossy latex, shiny surface with light reflections' } });
  const u = _us(L, 'Lena steht völlig nackt vor dem Spiegel');
  assert.equal(u.styleText, 'full bust');
  assert.deepEqual(_us(L, 'Sie lacht und schaut aufs Meer'), {});
});

test('v49 cup slider is the only bust source (refLook/style duplicates removed)', () => {
  const L = _rl({ resolved: { identity: 'photo of a curvy adult woman with a very large full bust, black hair, 165 cm tall, medium C-cup bust', refLook: 'photo of a curvy adult woman with a very large full bust', styleText: 'full bust, micro bikini' } });
  assert.ok(L.identity.includes('medium C-cup bust'));
  assert.ok(!/very large|full bust/.test(L.identity), L.identity);
  assert.equal(L.styleText, 'micro bikini');
});
