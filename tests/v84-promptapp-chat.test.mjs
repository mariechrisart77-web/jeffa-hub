// v84 Auftrag A: Prompt-App (Chat-Teil), Modellwahl, Ablehnungs-Fallback, Geschlecht, Emojis, Stimme, Bild-Takt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
globalThis.localStorage ??= { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = v; } };
const PA = await import('../apps/shared/promptapp/chat.js');
const API = await import('../src/promptapp/api.js');
const M = await import('../apps/shared/models.js');
const { applyModeToSystem, SFW_RULE, normalizeChatMode } = await import('../src/mode-server.js');
const evSrc = readFileSync('apps/chat/profiles.js', 'utf8').match(/export const EDGE_VOICES = (\[[\s\S]*?\n\]);/);
const EDGE_VOICES = new Function('return ' + evSrc[1])(); // profiles.js braucht window → Liste direkt aus dem Quelltext
const src = (p) => readFileSync(p, 'utf8');

test('v84 P1: ein Einstieg für Chat und Bild', async () => {
  for (const k of ['buildImagePrompt', 'buildPromptPlan', 'guardAdult', 'buildChatSystem', 'genderOf', 'emojiStyle', 'pickChatModels', 'isRefusal', 'refusalFallback', 'autoImageDecision', 'CHAT_AGE_RULE'])
    assert.ok(k in API, k);
  assert.equal(API.buildChatSystem, PA.buildChatSystem);
  assert.match(src('apps/chat/sysprompt.js'), /from '\.\/shared\/promptapp\/chat\.js'/);
  if (existsSync('dist/hub/sysprompt.js')) { const SP = await import('../dist/hub/sysprompt.js'); for (const k of ['capSystem', 'castLine', 'identityAnchor', 'otherProfileNames']) assert.equal(typeof SP[k], 'function', k); }
  assert.match(src('apps/chat/chat.js'), /buildChatSystem\(/);
  assert.match(src('functions/api/chat.ts'), /promptapp/);
});

test('v84 P1/P4/P5: buildChatSystem – Figur, männlicher Coder, hemmungslos', () => {
  const her = { id: 'lena', name: 'Lena', systemPrompt: 'Du bist Lena.', persona: { base: 'verspielt' } };
  const a = PA.buildChatSystem({ profile: her, adult: false, me: { name: 'Max' }, allProfiles: [her] }).system;
  assert.match(a, /^Du bist Lena\./); assert.match(a, /Max/); assert.match(a, /weiblich/); assert.match(a, /😜/); assert.match(a, /\[FOTO:/);
  assert.doesNotMatch(a, /FSK18-Modus/);
  const coder = { id: 'coder', name: 'Coder', systemPrompt: 'Du bist ein Coder.', persona: { gender: 'm' } };
  const c = PA.buildChatSystem({ profile: coder, adult: false }).system;
  assert.match(c, /männlich/); assert.doesNotMatch(c, /weiblich/); assert.doesNotMatch(c, /💕|💋|🥰/);
  const adultHer = { ...her, systemPromptAdult: 'Du bist Lena (18+).', persona: { base: 'selbstbewusst', temperament: [{ id: 'g1', value: 3 }] } };
  const h = PA.buildChatSystem({ profile: adultHer, adult: true }).system;
  assert.match(h, /^Du bist Lena \(18\+\)/); assert.match(h, /FSK18-Modus aktiv/);
  const hm = PA.buildChatSystem({ profile: { ...adultHer, persona: { ...adultHer.persona, gender: 'm' } }, adult: true }).system;
  assert.doesNotMatch(hm, /\bwoman\b|💋/);
});

test('v84 Altersgrenze Chat 18+: CHAT_AGE_RULE, hemmungslos ohne SFW-Regel, keine 21 mehr', () => {
  assert.match(PA.CHAT_AGE_RULE, /mindestens 18/);
  const j = applyModeToSystem('Basis.', 'jugendfrei'), h = applyModeToSystem('Basis. ' + SFW_RULE, 'hemmungslos');
  assert.ok(j.includes(SFW_RULE) && j.includes(PA.CHAT_AGE_RULE));
  assert.ok(!h.includes(SFW_RULE) && h.includes(PA.CHAT_AGE_RULE) && h.startsWith('Basis.'));
  assert.equal(applyModeToSystem('X', undefined), 'X');
  for (const v of ['hemmungslos', 'Hemmungslos', 'HEMMUNGSLOS', ' hemmungslos ', 'adult', 'fsk18', '18+']) assert.equal(PA.normalizeMode(v), 'hemmungslos', v);
  for (const v of ['jugendfrei', 'sfw', '']) assert.notEqual(PA.normalizeMode(v), 'hemmungslos', v);
  assert.equal(normalizeChatMode('Hemmungslos'), 'hemmungslos');
  assert.doesNotMatch(src('apps/shared/promptapp/chat.js'), /\b21\b/);
});

test('v84 P2: Automatik-Wunschliste, Handwahl, Mistral als Gratis-Ersatz, 💲 nie ohne Freigabe', () => {
  const ad = M.resolveChain({ adult: true, paidAllowed: false, mode: 'auto' });
  assert.ok(PA.isUncensoredModel(ad[0]), ad[0]); assert.ok(ad.every(m => !M.needsApproval(m)));
  const n = M.resolveChain({ adult: false, paidAllowed: false, mode: 'auto' });
  assert.ok(n.every(m => !M.needsApproval(m)));
  for (const c of [ad, n]) { assert.equal(c.at(-1), M.MISTRAL_FALLBACK); assert.ok(c.length <= 7); }
  assert.equal(M.MISTRAL_FALLBACK, 'mistral:mistral-small-latest');
  assert.ok(M.isFree(M.MISTRAL_FALLBACK) && !M.needsApproval(M.MISTRAL_FALLBACK));
  assert.match(M.modelInfo(M.MISTRAL_FALLBACK).desc, /Tresor/);
  assert.equal(M.resolveChain({ chatModel: M.MISTRAL_FALLBACK, adult: false, paidAllowed: false })[0], M.MISTRAL_FALLBACK);
  const paid = M.resolveChain({ chatModel: 'openai/gpt-5', adult: false, paidAllowed: true });
  assert.equal(paid.at(-1), 'openai/gpt-5'); assert.ok(paid.indexOf(M.MISTRAL_FALLBACK) < paid.indexOf('openai/gpt-5'));
  assert.equal(M.resolveChain({ chatModel: 'gemini-3.5-flash', adult: false, paidAllowed: false, mode: 'auto' })[0], 'gemini-3.5-flash');
  assert.equal(PA.pickChatModels({ profile: { teacher: 'es' } })[0], 'groq:qwen/qwen3.8-27b');
  assert.equal(PA.pickChatModels({ profile: { id: 'coder', name: 'Coder' } })[0], 'gemini-3.5-flash');
  assert.equal(PA.pickChatModels({ hasImages: true })[0], 'nvidia/nemotron-3.5-super-vl:free');
  assert.equal(PA.pickChatModels({ adult: true, route: ['gemini-3.5-flash'] })[0], 'venice-uncensored-1-2');
  assert.ok(src('src/providers.ts').includes('mistral'));
});

test('v84 P3: Ablehnungen erkennen (und normale Antworten nicht)', () => {
  const yes = ['Ich kann dabei leider nicht helfen.', 'Es tut mir leid, aber ich kann diese Anfrage nicht erfüllen.', 'Als KI kann ich keine expliziten Inhalte schreiben.',
    'Das ist leider nicht angemessen.', 'Ich kann keine sexuellen Inhalte erstellen.', "I can't help with that.", 'I’m sorry, but I can’t continue this.',
    'As an AI language model, I cannot write that.', 'I am unable to create that content.', "I won't write that.", 'This violates the content policy.', 'Das verstößt gegen meine Richtlinien.'];
  const no = ['Hallo Schatz, schön dass du da bist 😘', 'Ich kann es kaum erwarten, dich zu sehen!', 'Ich kann nicht genug von dir bekommen.', 'Tut mir leid, dass du warten musstest – hier bin ich.',
    'Als Kind wollte ich Pilotin werden.', 'Sure, here is the story you asked for.', "I can't wait to see you tonight.", 'Ich werde dir gleich ein Foto schicken.', ''];
  for (const t of yes) assert.ok(PA.isRefusal(t), 'sollte Ablehnung sein: ' + t);
  for (const t of no) assert.ok(!PA.isRefusal(t), 'keine Ablehnung: ' + t);
});

const sse = (d) => `data: ${JSON.stringify({ delta: d })}\n\n`;
test('v84 P3: Stream-Gate – Puffer in Reihenfolge, danach Durchreichen, Ablehnung bleibt zurück', async () => {
  let out = '';
  const g = PA.createRefusalGate({ minChars: 20, onFlush: (t) => { out += t; } });
  await g.write(sse('Hallo du, '));
  assert.equal(out, ''); assert.equal(g.decided, false);
  await g.write(new TextEncoder().encode(sse('schön dich zu sehen!')));
  assert.ok(g.decided && !g.refused); assert.equal(out, sse('Hallo du, ') + sse('schön dich zu sehen!'));
  await g.write(sse(' Noch was.')); assert.ok(out.endsWith(sse(' Noch was.')));
  assert.equal(await g.finish(), true); assert.equal(g.flushedChars, out.length);
  // in Stücke zerteilte data:-Zeile
  let o2 = ''; const g2 = PA.createRefusalGate({ minChars: 500, onFlush: (t) => { o2 += t; } });
  const line = sse('Tut mir leid, aber ich kann das nicht schreiben.');
  await g2.write(line.slice(0, 15)); await g2.write(line.slice(15));
  assert.equal(await g2.finish(), false); assert.ok(g2.refused); assert.equal(o2, '');
  assert.match(g2.visible, /Tut mir leid/);
  await g2.release(); assert.equal(o2, line);
});

test('v84 P3: refusalFallback – nächstes unzensiertes, nie doppelt', () => {
  const u = ['gemini-3.5-flash', 'groq:x', 'venice-uncensored-1-2', 'venice:gemma-4-uncensored', M.MISTRAL_FALLBACK];
  assert.equal(PA.refusalFallback(u, ['gemini-3.5-flash']), 'venice-uncensored-1-2');
  assert.equal(PA.refusalFallback(u, ['gemini-3.5-flash', 'venice-uncensored-1-2'], { refused: ['gemini-3.5-flash', 'venice-uncensored-1-2'] }), 'venice:gemma-4-uncensored');
  assert.equal(PA.refusalFallback(['gemini-3.5-flash'], ['gemini-3.5-flash']), 'venice-uncensored-1-2');
  assert.equal(PA.refusalFallback([], ['venice-uncensored-1-2', 'venice:gemma-4-uncensored']), '');
  const ct = src('functions/api/chat.ts');
  assert.match(ct, /createRefusalGate\(/); assert.match(ct, /refused\.length < 2/); assert.match(ct, /hat abgelehnt/); assert.match(ct, /console\.warn/);
});

test('v84 P4: Geschlecht', () => {
  assert.equal(PA.genderOf({ persona: { gender: 'm' } }), 'm');
  assert.equal(PA.genderOf({ gender: 'male' }), 'm');
  assert.equal(PA.genderOf({ persona: { gender: 'w' } }), 'w');
  assert.equal(PA.genderOf({ voice: { voiceName: 'de-DE-FlorianMultilingualNeural' } }), 'm');
  assert.equal(PA.genderOf({ name: 'Anwalt' }), 'm');
  assert.equal(PA.genderOf({ name: 'Assistent', voice: { voiceName: 'de-DE-SeraphinaMultilingualNeural' } }), '');
  assert.equal(PA.genderOf({ persona: {} }), 'w');
  assert.equal(PA.genderOf({}), '');
  {
    const maleLabelled = EDGE_VOICES.flatMap(g => g.voices).filter(([, l]) => /männlich/.test(l)).map(([id]) => id);
    for (const id of PA.MALE_VOICES) assert.ok(maleLabelled.includes(id), id);
    for (const id of maleLabelled) assert.ok(PA.MALE_VOICES.includes(id), 'fehlt in MALE_VOICES: ' + id);
  }
  assert.equal(PA.genderize('Erwachsene, dominante Frau: sagt was sie will', 'm'), 'Erwachsener, dominanter Mann: sagt was er will');
  assert.equal(PA.genderize('Erwachsene Verführerin', 'm'), 'Erwachsener Verführer');
  assert.equal(PA.genderize('a confident woman, she is', 'm', 'en'), 'a confident man, he is');
  assert.equal(PA.genderize('Erwachsene Frau', 'w'), 'Erwachsene Frau');
  assert.match(src('src/promptapp/identity.js'), /pg === 'mann'/);
  assert.match(src('apps/chat/persona.js'), /archetypeText\(p\.archetypen, true, genderOf\(profile\)\)/);
});

test('v84 P5: Emojis passend zur Persönlichkeit', () => {
  assert.match(PA.emojiStyle({ persona: { base: 'verspielt' } }), /😜/);
  assert.match(PA.emojiStyle({ persona: { base: 'selbstbewusst' } }, { adult: true }), /💋/);
  assert.doesNotMatch(PA.emojiStyle({ persona: { base: 'selbstbewusst' } }, { adult: false }), /💋/);
  assert.doesNotMatch(PA.emojiStyle({ persona: { base: 'herzlich', gender: 'm' } }), /💕|🥰/);
  assert.match(PA.emojiStyle({ persona: { emojis: 'aus' } }), /keine Emojis/);
  assert.match(PA.emojiStyle({ id: 'coder', name: 'Coder' }), /sparsam/);
  assert.match(PA.emojiStyle({ teacher: 'es' }), /🇪🇸/);
});

test('v84 C2: Stimme im Chatkopf', () => {
  assert.equal(PA.voiceShortName('de-DE-SeraphinaMultilingualNeural', EDGE_VOICES), 'Seraphina');
  assert.equal(PA.voiceShortName('x', []), '');
  const c = src('apps/chat/chat.js');
  assert.match(c, /hdr-voice/); assert.match(c, /pickVoice\(/);
  assert.match(src('apps/hub/app.css'), /\.hdr-voice/);
});

test('v84 B1: Bild-Takt – jugendfrei nur etwa jede 5.–10. Antwort, hemmungslos wie bisher', () => {
  const D = PA.autoImageDecision;
  assert.equal(D({ mode: 'jugendfrei', userAsked: true }).fire, true);
  assert.equal(D({ mode: 'hemmungslos', fotoTag: true }).fire, true);
  assert.equal(D({ mode: 'hemmungslos', freq: 'every' }).fire, true);
  assert.equal(D({ mode: 'hemmungslos', freq: '3', nReplies: 3 }).fire, true);
  assert.equal(D({ mode: 'hemmungslos', freq: '3', nReplies: 4 }).fire, false);
  assert.equal(D({ mode: 'hemmungslos', freq: 'off', fotoTag: true }).fire, false);
  assert.equal(D({ mode: 'hemmungslos', freq: 'off', profileAuto: true }).fire, true);
  const w = D({ mode: 'jugendfrei', fotoTag: true, conv: { repliesSinceImg: 2 }, sfwEvery: '5-10', rnd: () => 0 });
  assert.equal(w.fire, false); assert.equal(w.nextAt, 5);
  const f = D({ mode: 'jugendfrei', fotoTag: true, conv: { repliesSinceImg: 5, nextImgAt: 5 }, sfwEvery: '5-10', rnd: () => 0.99 });
  assert.equal(f.fire, true); assert.equal(f.nextAt, 10);
  assert.equal(D({ mode: 'jugendfrei', fotoTag: true, conv: { repliesSinceImg: 99 }, sfwEvery: 'request' }).fire, false);
  assert.equal(D({ mode: 'jugendfrei', fotoTag: true, conv: { repliesSinceImg: 3 }, sfwEvery: '3' }).fire, true);
  assert.equal(D({ mode: 'jugendfrei', conv: { repliesSinceImg: 99 } }).fire, false);
  for (let i = 0; i < 50; i++) { const r = D({ mode: 'jugendfrei', fotoTag: true, conv: {}, sfwEvery: '5-10' }); assert.ok(r.nextAt >= 5 && r.nextAt <= 10); }
  assert.match(src('apps/hub/settings.js'), /s-imgevery/);
  assert.match(src('apps/chat/chat.js'), /imageEverySfw/);
});

test('v84 Tresor/UI: VNAIPro als Claude Gateway beschriftet', () => {
  for (const f of ['apps/hub/tresor.js', 'apps/waechter/waechter.js', 'src/costs.js']) assert.match(src(f), /Claude Gateway \(VNAIPro\)/, f);
});
