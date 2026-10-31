// v82: Chat-Paket – C1 Vorlesen Start/Stopp (+P6 Text säubern), C3 Identität, C4 Verlauf.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanForTTS } from '../apps/shared/tts-clean.js';
import { castLine, otherProfileNames, identityAnchor, capSystem } from '../apps/shared/promptapp/chat.js';
import { mentionsName, scopeForFact, filterForProfile } from '../src/memory-scope.js';
import { liteCopy, mergeStores, pickConvForProfile, idbGet, idbSet } from '../apps/chat/convstore.js';

// ---- P6 cleanForTTS
test('P6 cleanForTTS: Emojis, Flaggen, Regie, Markdown, Foto-Zeile, Code', () => {
  assert.equal(cleanForTTS('Hallo 😊🇪🇸 du 👍🏽!'), 'Hallo du !');
  assert.equal(cleanForTTS('*lächelt verschmitzt* Na du.'), 'Na du.');
  assert.equal(cleanForTTS('_zwinkert_ Hey'), 'Hey');
  assert.equal(cleanForTTS('Das ist **wichtig**.'), 'Das ist wichtig.');
  assert.equal(cleanForTTS('# Titel\nText'), 'Titel\nText');
  assert.equal(cleanForTTS('Siehe [Link](https://x.y/z) und https://a.b/c'), 'Siehe Link und (Link)');
  assert.equal(cleanForTTS('Gern!\n[FOTO: woman on a beach, sunset]'), 'Gern!');
  assert.equal(cleanForTTS('Hola (Hallo), ¿qué tal? (wie geht\'s?)'), 'Hola (Hallo), ¿qué tal? (wie geht\'s?)');
  assert.equal(cleanForTTS('So:\n```js\nconst a = 1;\n```\nfertig'), 'So:\n(Codebeispiel)\nfertig');
  assert.equal(cleanForTTS('- eins\n- zwei\n> Zitat'), 'eins\nzwei\nZitat');
});
test('P6 cleanForTTS: snake_case, Rechnungen und `code` bleiben lesbar', () => {
  assert.equal(cleanForTTS('Nutze my_var_name und other_var.'), 'Nutze my_var_name und other_var.');
  assert.equal(cleanForTTS('2 * 3 * 4 = 24'), '2 * 3 * 4 = 24');
  assert.equal(cleanForTTS('Ruf `foo()` auf.'), 'Ruf foo() auf.');
  assert.equal(cleanForTTS('🎉🎉'), '');
});

// ---- C1 tts.js Start/Stopp mit Fake-Globals
function fakeEnv() {
  const saved = {};
  for (const k of ['fetch', 'Audio', 'speechSynthesis', 'SpeechSynthesisUtterance', 'window', 'CustomEvent']) saved[k] = globalThis[k];
  const savedURL = { c: URL.createObjectURL, r: URL.revokeObjectURL };
  const audios = []; const events = []; let release = null; let fetchCalls = 0;
  class FakeAudio { constructor(src) { this.src = src; this.paused = true; this.played = false; audios.push(this); } play() { this.paused = false; this.played = true; return Promise.resolve(); } pause() { this.paused = true; } }
  globalThis.Audio = FakeAudio;
  globalThis.speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [] };
  globalThis.window = { dispatchEvent: (e) => { events.push(e.detail); return true; } };
  globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
  URL.createObjectURL = () => 'blob:fake'; URL.revokeObjectURL = () => {};
  let gate = null;
  globalThis.fetch = async (url, opts) => {
    if (url === '/api/tts') {
      fetchCalls++;
      if (gate) await gate;
      if (opts?.signal?.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
      return { ok: true, json: async () => ({ dataUrl: 'data:audio/mp3;base64,AAAA' }) };
    }
    return { blob: async () => ({}) };
  };
  return {
    audios, events, get fetchCalls() { return fetchCalls; },
    hold() { gate = new Promise((r) => { release = r; }); },
    release() { gate = null; release?.(); },
    restore() { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } URL.createObjectURL = savedURL.c; URL.revokeObjectURL = savedURL.r; },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const edge = { provider: 'edge', voiceName: 'de-DE-KatjaNeural' };

test('C1 tts: Edge-Wiedergabe ist stoppbar, Zustand sichtbar', async () => {
  const env = fakeEnv();
  try {
    const tts = await import('../apps/shared/tts.js');
    const seen = []; const off = tts.onTtsChange((s) => seen.push(s));
    const p = tts.speak('Hallo *lächelt* 😊', edge, 'de', { id: 'm1' });
    await tick();
    assert.equal(tts.isSpeaking(), true); assert.equal(tts.speakingId(), 'm1');
    assert.equal(env.audios.length, 1); assert.equal(env.audios[0].played, true);
    tts.stopSpeaking();
    await p; // löst auf, lehnt nicht ab
    assert.equal(env.audios[0].paused, true);
    assert.equal(tts.isSpeaking(), false); assert.equal(tts.speakingId(), null);
    assert.ok(seen.some((s) => s.speaking && s.id === 'm1') && !seen.at(-1).speaking);
    assert.ok(env.events.some((d) => d.speaking === true && d.id === 'm1'), 'jeffa:tts-Event');
    off();
  } finally { env.restore(); }
});
test('C1 tts: Stopp während /api/tts lädt → danach spielt nichts', async () => {
  const env = fakeEnv();
  try {
    const tts = await import('../apps/shared/tts.js');
    env.hold();
    const p = tts.speak('Langer Text', edge, 'de', { id: 'm2' });
    await tick();
    assert.equal(tts.isSpeaking(), true);
    tts.stopSpeaking();
    env.release();
    await p; await tick();
    assert.equal(env.audios.length, 0, 'kein Audio nach Stopp');
    assert.equal(tts.isSpeaking(), false);
  } finally { env.restore(); }
});
test('C1 tts: zweites Vorlesen stoppt das erste (nie zwei gleichzeitig)', async () => {
  const env = fakeEnv();
  try {
    const tts = await import('../apps/shared/tts.js');
    tts.speak('Eins', edge, 'de', { id: 'a' });
    await tick();
    tts.speak('Zwei', edge, 'de', { id: 'b' });
    await tick();
    assert.equal(env.audios.length, 2);
    assert.equal(env.audios[0].paused, true); assert.equal(env.audios[1].paused, false);
    assert.equal(tts.speakingId(), 'b');
    tts.stopSpeaking();
    assert.equal(tts.speakingId(), null);
    // nur Emojis → nichts vorlesen
    await tts.speak('😊', edge, 'de', { id: 'c' });
    assert.equal(env.fetchCalls, 2);
  } finally { env.restore(); }
});

// ---- C3 Identität
const P = {
  coder: { id: 'coder', name: 'Coder', description: 'Programmierhilfe', persona: null },
  lena: { id: 'lena', name: 'Lena', persona: {} },
  lora: { id: 'lora', name: 'Lora', persona: {} },
};
const getP = (id) => P[id];
test('C3 castLine: Coder bekommt keine Besetzung, Figuren nur die anderen', () => {
  assert.equal(castLine(P.coder, ['lena'], getP), '');
  const l = castLine(P.lora, ['lena', 'lora'], getP);
  assert.match(l, /Lena/); assert.ok(!/Lora/.test(l)); assert.match(l, /nicht du/);
  assert.equal(castLine(P.lena, ['lena'], getP), '');
});
test('C3 identityAnchor + otherProfileNames', () => {
  const others = otherProfileNames(P.coder, Object.values(P));
  assert.deepEqual(others, ['Lena', 'Lora']);
  const a = identityAnchor(P.coder, others);
  assert.match(a, /Du bist Coder – Programmierhilfe\. Bleib immer Coder\./);
  assert.match(a, /Lena, Lora sind andere Figuren dieser App, nicht du/);
  assert.ok(!/ {2}/.test(a));
});
test('C3 capSystem behält Anfang (Identität) und Ende (Anker/Foto-Regel)', () => {
  const s = 'Du bist Coder.' + 'x'.repeat(6000) + '[Identität: Du bist Coder.] FOTO-Regel';
  const c = capSystem(s);
  assert.ok(c.length <= 4000);
  assert.ok(c.startsWith('Du bist Coder.')); assert.ok(c.endsWith('[Identität: Du bist Coder.] FOTO-Regel'));
  assert.equal(capSystem('kurz'), 'kurz');
  assert.ok(capSystem(s, 3000).length <= 3000);
});
test('C3 Gedächtnis: KI-/Figuren-Fakten landen im Profil, nicht global', () => {
  const ctx = { profileId: 'coder', profileName: 'Coder', otherNames: ['Lena', 'Lora'] };
  assert.equal(scopeForFact('user', 'Der Nutzer nennt mich Lena', ctx), 'p:coder');
  assert.equal(scopeForFact('user', 'Nutzer heißt Christian und wohnt in Spanien', ctx), 'user');
  assert.equal(scopeForFact('profile', 'Mag Tapas', {}), 'user');
  assert.equal(scopeForFact('profile', 'Mag Tapas', ctx), 'p:coder');
  const mem = [
    { scope: 'user', fact: 'Lena ist die Freundin des Nutzers' },
    { scope: 'user', fact: 'Nutzer wohnt in Spanien' },
    { scope: 'p:coder', fact: 'Arbeitet an Jeffa-Hub' },
    { scope: 'p:lena', fact: 'Liebt Strandspaziergänge' },
  ];
  assert.deepEqual(filterForProfile(mem, ctx).map((m) => m.fact), ['Nutzer wohnt in Spanien', 'Arbeitet an Jeffa-Hub']);
});
test('C3 mentionsName: ganze Wörter, Akzente, case-insensitiv', () => {
  assert.equal(mentionsName('Hallo lena!', ['Lena']), true);
  assert.equal(mentionsName('Lenas Buch', ['Lena']), false);
  assert.equal(mentionsName('Magdalena', ['Lena']), false);
  assert.equal(mentionsName('Clase con Lucía', ['Lucía']), true);
  assert.equal(mentionsName('Lucia', ['Lucía']), false);
  assert.equal(mentionsName('x', ['A']), false);
});

// ---- C4 Verlauf
const big = 'data:image/webp;base64,' + 'A'.repeat(200000);
const conv = (id, pid, upd, msgs) => ({ id, profileId: pid, title: 't', updatedAt: upd, messages: msgs });
test('C4 liteCopy: Binärdaten raus, Text bleibt, Original unverändert', () => {
  const src = [conv('c1', 'spanischlehrerin', '2026-10-31T10:00:00Z', [
    { id: 'u1', role: 'user', content: 'Hola', images: [{ mime: 'image/jpeg', data: 'B'.repeat(50000) }] },
    { id: 'a1', role: 'assistant', content: '', generated: true, imageUrl: big, gen: { seed: 1 } },
    { id: 'a2', role: 'assistant', content: '¡Muy bien! (Sehr gut!)' },
  ])];
  const lite = liteCopy(src);
  assert.ok(JSON.stringify(lite).length < JSON.stringify(src).length / 50);
  assert.equal(lite[0].messages[0].content, 'Hola'); assert.equal(lite[0].messages[0].images, undefined); assert.equal(lite[0].messages[0].stripped, true);
  assert.equal(lite[0].messages[1].imageUrl, undefined); assert.equal(lite[0].messages[1].gen.seed, 1);
  assert.equal(lite[0].messages[2].stripped, undefined);
  assert.equal(src[0].messages[1].imageUrl, big, 'Original unverändert');
  assert.equal(src[0].messages[0].images.length, 1);
});
test('C4 mergeStores: neuere Version gewinnt, Bilder werden ergänzt, keine Duplikate', () => {
  const idb = [conv('c1', 'p', '2026-10-31T10:00:00Z', [{ id: 'a1', role: 'assistant', imageUrl: big }]), conv('c2', 'p', '2026-10-30T10:00:00Z', [])];
  const ls = liteCopy([conv('c1', 'p', '2026-10-31T11:00:00Z', [{ id: 'a1', role: 'assistant', imageUrl: big }, { id: 'u2', role: 'user', content: 'neu' }])]).concat([conv('c3', 'q', '2026-10-29T10:00:00Z', [])]);
  const m = mergeStores(idb, ls);
  assert.deepEqual(m.map((c) => c.id).sort(), ['c1', 'c2', 'c3']);
  const c1 = m.find((c) => c.id === 'c1');
  assert.equal(c1.messages.length, 2, 'neuere (LS) Version');
  assert.equal(c1.messages[0].imageUrl, big, 'Bild aus IndexedDB ergänzt');
  assert.equal(c1.messages[0].stripped, undefined);
  assert.equal(mergeStores([], ls).length, 2);
  assert.equal(mergeStores(idb, []).length, 2);
});
test('C4 pickConvForProfile', () => {
  const list = [conv('x1', 'lucia', '2026-10-30T10:00:00Z', []), conv('x2', 'lucia', '2026-10-31T10:00:00Z', []), conv('y1', 'coder', '2026-10-31T12:00:00Z', [])];
  assert.equal(pickConvForProfile(list, 'lucia', 'x1').id, 'x1');
  assert.equal(pickConvForProfile(list, 'lucia', 'y1').id, 'x2', 'fremder Chat → neuester eigener');
  assert.equal(pickConvForProfile(list, 'lucia', null).id, 'x2');
  assert.equal(pickConvForProfile(list, 'lena', null), null);
});
test('C4 idbGet/idbSet ohne IndexedDB: null/false, keine Exception', async () => {
  assert.equal(typeof indexedDB, 'undefined');
  assert.equal(await idbGet('conversations'), null);
  assert.equal(await idbSet('conversations', []), false);
});

// ---- Quelltext-Checks (Verdrahtung)
const C = readFileSync('apps/chat/chat.js', 'utf8');
const PR = readFileSync('apps/chat/profiles.js', 'utf8');
const CT = readFileSync('functions/api/chat.ts', 'utf8');
const MT = readFileSync('src/memory.ts', 'utf8');
const PA = readFileSync('apps/shared/promptapp/chat.js', 'utf8'); // v84 P1: Systemprompt-Aufbau liegt in der Prompt-App
test('v82 Verdrahtung chat.js', () => {
  for (const s of ['visibilitychange', 'capSystem(', 'buildChatSystem(', 'id="tts-stop"', 'toggleSpeak(', 'jeffa.currentConv', 'jeffa.lastConvByProfile', 'idbSet(IDB_KEY', 'liteCopy(convCache)']) assert.ok(C.includes(s), s);
  assert.ok(!C.includes('system.slice(-4000)') && !C.includes('system.slice(0, 3000)'));
  for (const s of ['identityAnchor(p, otherNames)', 'castLine(p, cast, getProfile)']) assert.ok(PA.includes(s), s);
  assert.ok(!/In Geschichten vorkommende Figuren/.test(C + PA), 'alter globaler Cast-Block entfernt');
  assert.ok(!/^import .*(me\.js|tts\.js)/m.test(C), 'TTS bleibt lazy (v63)');
  // nie leeren Stand schreiben: erst mergen, dann v68-Neuspeicherung
  assert.ok(C.indexOf('convCache = mergeStores(idbConvs, lsConvs)') < C.indexOf('parsed.ct && !isEncryptOn()) await persist(true)'));
});
test('v82 Verdrahtung profiles.js / Server', () => {
  assert.match(PR, /card\.addEventListener\('click'[\s\S]{0,120}onOpenLastChat/);
  assert.match(PR, /new-chat-btn[\s\S]{0,400}onStartChat/);
  assert.match(CT, /relevantMemories\(.*700, otherNames\)/);
  assert.match(CT, /nicht über dich/);
  assert.match(MT, /scopeForFact\(/); assert.match(MT, /filterForProfile\(/);
});
test('v82 Jugendschutz-Bausteine unverändert vorhanden', () => {
  assert.match(C, /effectiveAdult\(conv, profile\)/);
  assert.match(C, /mode: chatMode\(conv, profile\)/);
  assert.match(CT, /applyModeToSystem\(systemPrompt, chatModeNorm\)/); assert.match(CT, /chatModeNorm = normalizeChatMode\(body\.mode\)/);
});
