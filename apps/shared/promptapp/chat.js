// v84 P1/P3/P4/P5/B1: Chat-Teil der Prompt-App (Browser + Server). Rein, ohne DOM/localStorage.
// Nutzt nur shared-Code (./mode.js, ../persona-terms.js) und wird über src/promptapp/api.js
// und apps/chat/chat.js eingebunden. Kein Import aus apps/chat/ (shared darf nicht nach oben schauen).
import { personaChatText } from '../persona-terms.js';

// ---- P7/C5: Altersregel (auch serverseitig in src/mode-server.js)
export const CHAT_AGE_RULE = 'Alle Figuren sind fiktive Erwachsene, mindestens 18 Jahre alt. Niemals Minderjährige oder kindliche Darstellungen – auch nicht auf Wunsch.';

// ---- P1: aus apps/chat/sysprompt.js hierher verschoben (dort jetzt Re-Export)
function isFigureProfile(profile) {
  if (!profile) return false;
  return !!(profile.persona || profile.teacher || profile.geschichte);
}

export function castLine(profile, castIds, getProfile) {
  if (!profile || !isFigureProfile(profile)) return '';
  const ids = Array.isArray(castIds) ? castIds : [];
  const names = ids
    .filter((id) => id && id !== profile.id)
    .map((id) => (typeof getProfile === 'function' ? getProfile(id)?.name : ''))
    .filter(Boolean);
  if (!names.length) return '';
  return `\n\nIn Geschichten können außerdem diese ANDEREN Figuren vorkommen (das bist nicht du): ${names.join(', ')}.`;
}

export function otherProfileNames(profile, allProfiles) {
  const self = profile ? String(profile.name || profile.id || '') : '';
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(allProfiles) ? allProfiles : []) {
    if (!p || !p.name) continue;
    const n = String(p.name).slice(0, 40);
    if (!n || n === self || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= 12) break;
  }
  return out;
}

export function identityAnchor(profile, otherNames) {
  const name = profile && (profile.name || profile.id) ? String(profile.name || profile.id) : 'die KI';
  const desc = profile && profile.description ? String(profile.description).replace(/\s+/g, ' ').trim() : '';
  const others = (Array.isArray(otherNames) ? otherNames : []).filter(Boolean);
  const otherTxt = others.length ? `${others.join(', ')} sind andere Figuren dieser App, nicht du – übernimm nie deren Namen, Rolle oder Erinnerungen.` : '';
  const body = `[Identität: Du bist ${name}${desc ? ' – ' + desc : ''}. Bleib immer ${name}. ${otherTxt}]`;
  return `\n\n${body.replace(/ +/g, ' ')}`;
}

export function capSystem(system, max = 4000) {
  const s = String(system ?? '');
  if (s.length <= max) return s;
  const head = Math.min(1600, Math.max(0, max - 10));
  const tailLen = Math.max(0, max - head - 3);
  return s.slice(0, head) + '\n…\n' + s.slice(-tailLen);
}

// ---- P2: Modus-Normalisierung
export function normalizeMode(mode) {
  const m = String(mode ?? '').trim().toLowerCase();
  if (!m) return undefined;
  if (/^(hemmungslos|adult|fsk18|18\+|nsfw|unzensiert|uncensored)$/.test(m)) return 'hemmungslos';
  if (/^(jugendfrei|sfw|safe|sfw-?only)$/.test(m)) return 'jugendfrei';
  return undefined;
}

// ---- P4: Geschlecht
/** Männliche Edge-Stimmen (Quelle: EDGE_VOICES in apps/chat/profiles.js, Label „männlich“). */
export const MALE_VOICES = [
  'de-DE-FlorianMultilingualNeural', 'de-DE-ConradNeural', 'de-DE-KillianNeural',
  'de-AT-JonasNeural', 'de-CH-JanNeural',
  'en-US-AndrewMultilingualNeural', 'en-US-BrianMultilingualNeural',
  'fr-FR-RemyMultilingualNeural', 'it-IT-GiuseppeMultilingualNeural',
  'en-US-GuyNeural', 'en-GB-RyanNeural',
];

const MALE_ROLE_RX = /\b(anwalt|professor|coder|assistent|lehrer|herr|mann|butler|freund|begleiter|arzt|ingenieur|soldat|pilot)\b/i;
const FEMALE_ROLE_RX = /\b(anwältin|professorin|assistentin|lehrerin|begleiterin|freundin|ärztin)\b/i;

/** 'm' | 'w' | 'd' | '' (unbekannt) */
export function genderOf(profile) {
  const p = profile || {};
  const raw = String(p.persona?.gender || p.gender || '').trim().toLowerCase();
  if (/^(m|male|mann|maennlich|männlich)$/.test(raw)) return 'm';
  if (/^(w|f|female|frau|weiblich)$/.test(raw)) return 'w';
  if (/^(d|divers|nonbinary|non-binary)$/.test(raw)) return 'd';
  const vn = String(p.voice?.voiceName || '');
  if (vn && MALE_VOICES.includes(vn)) return 'm';
  const typ = String(p.persona?.look?.typ || p.look?.typ || '').toLowerCase();
  if (/\b(man|mann|male|herr)\b/.test(typ)) return 'm';
  if (/\b(woman|frau|female)\b/.test(typ)) return 'w';
  const text = `${p.name || ''} ${p.description || ''}`;
  if (FEMALE_ROLE_RX.test(text)) return p.persona ? 'w' : '';
  // Rollennomen (Anwalt, Professor …) nur, wenn keine weibliche Stimme gewählt ist (z. B. „Assistent“ mit Seraphina → keine Annahme)
  if (MALE_ROLE_RX.test(text) && !vn) return 'm';
  if (p.persona) return 'w'; // alle bisherigen Figuren sind weiblich
  return '';
}

export function genderLine(profile) {
  const g = genderOf(profile);
  if (g === 'm') return '\n\n[Du bist männlich: sprich von dir immer in der männlichen Form (z. B. „ich bin bereit“, „ich bin dein Begleiter“; Spanisch „estoy listo“, „soy tu profesor“).]';
  if (g === 'w' && profile?.persona) return '\n\n[Du bist weiblich: sprich von dir immer in der weiblichen Form (z. B. „ich bin bereit“, „ich bin deine Begleiterin“).]';
  return '';
}

/** Feminine Bezeichnungen für 'm' in männliche Form bringen; sonst unverändert. */
export function genderize(text, gender, lang = 'de') {
  const s = String(text ?? '');
  if (gender !== 'm' || !s) return s;
  if (lang === 'en') {
    return s.replace(/\bfemme fatale\b/gi, 'homme fatale').replace(/\bgirly\b/gi, 'boyish')
      .replace(/\bwoman\b/gi, 'man').replace(/\bshe\b/gi, 'he').replace(/\bher\b/gi, 'his');
  }
  return s
    .replace(/Erwachsene, ([a-zäöüß]+)e Frau/g, 'Erwachsener, $1er Mann')
    .replace(/Erwachsene Frau/g, 'Erwachsener Mann')
    .replace(/Erwachsene Verf[üu]hrerin/g, 'Erwachsener Verführer')
    .replace(/Verf[üu]hrerin/g, 'Verführer')
    .replace(/\bBegleiterin\b/g, 'Begleiter')
    .replace(/\bFreundin\b/g, 'Freund')
    .replace(/\bFrau\b/g, 'Mann')
    .replace(/\bsagt was sie will\b/g, 'sagt was er will')
    .replace(/\bsie\b/g, 'er');
}

// ---- P5: Emoji-Stil
export function emojiStyle(profile, { adult = false } = {}) {
  const p = profile || {};
  const pref = p.persona?.emojis;
  if (pref === 'aus') return '\n\n[Verwende keine Emojis.]';
  if (p.teacher === 'es') return '\n\n[Emojis: 🇪🇸✅🙂, höchstens 2 pro Antwort.]';
  const noPersona = !p.persona;
  if (noPersona && /coder|lawyer|anwalt|professor|assistant|assistent/i.test(`${p.id || ''} ${p.name || ''}`)) {
    return '\n\n[Emojis nur sparsam und sachlich (✅💡⚠️), meist keine.]';
  }
  const base = String(p.persona?.base || '').toLowerCase();
  const g = genderOf(p);
  let line;
  if (base === 'verspielt') line = 'Emojis: verspielt und reichlich (😜😄✨🙈), 1–3 pro Antwort';
  else if (base === 'herzlich') line = 'Emojis: warm (🥰😊💕), 0–2 pro Antwort';
  else if (base === 'selbstbewusst') line = adult ? 'Emojis: sparsam und selbstbewusst (😏💋🔥), höchstens 1–2 pro Antwort' : 'Emojis: sparsam und selbstbewusst (😏✨), höchstens 1–2 pro Antwort';
  else if (base === 'ruhig' || base === 'intellektuell') line = 'Emojis: kaum, höchstens 1 (🙂📚)';
  else if (base === 'abenteuerlustig') line = 'Emojis: abenteuerlustig (🌍⛰️🔥), 1–2 pro Antwort';
  else if (g === 'm') line = 'Emojis: sparsam, keine Herz- oder Kuss-Emojis, eher 😎👊😉';
  else if (g === 'w') line = 'Emojis: passend zur Persona, höchstens 2 pro Antwort';
  else return '';
  if (g === 'm' && /💕|💋|🥰/.test(line)) line = line.replace(/[💕💋🥰]/g, '').replace(/\s+/g, ' ');
  if (pref === 'wenig') line += ' (wenig)';
  else if (pref === 'viel') line += ' (viel)';
  return `\n\n[${line}.]`;
}

// ---- P1: Systemprompt
const LEVEL_TEXT = {
  anfaenger: 'Niveau: Anfänger – sehr einfache, kurze spanische Sätze, immer übersetzen, langsam steigern.',
  mittel: 'Niveau: Mittel – etwa die Hälfte der Antwort auf Spanisch, Übersetzung nur für schwierigere Teile.',
  fortgeschritten: 'Niveau: Fortgeschritten – überwiegend Spanisch, Redewendungen und Umgangssprache aus Spanien, Deutsch nur für Erklärungen.',
};

/** Baut den Chat-Systemprompt. Signatur: { profile, adult, me, cast, getProfile, allProfiles, spanishLevels? } */
export function buildChatSystem({ profile, adult = false, me, cast, getProfile, allProfiles, spanishLevels } = {}) {
  const p = profile || {};
  let system = (adult && p.systemPromptAdult) || p.systemPrompt || '';
  if (p.teacher === 'es') {
    const levels = spanishLevels || LEVEL_TEXT;
    system += ' ' + (levels[p.spanishLevel] || '');
  }
  system += castLine(p, cast, getProfile);
  const otherNames = otherProfileNames(p, allProfiles);
  if (me?.name) system += `\nDer Nutzer heißt ${me.name}.`;
  if (adult) system += `\n\n[FSK18-Modus aktiv: Der Nutzer ist volljährig und hat Erwachseneninhalte freigeschaltet. Bleib in deiner Rolle und folge deiner Persona-Beschreibung.]`;
  { const pt = personaChatText(p.persona, adult); const gen = genderize(pt, genderOf(p), 'en'); if (gen) system += `\n\n[${gen}]`; }
  system += emojiStyle(p, { adult });
  if (p.beispielPersona) system += `\n\n[Stilvorlage des Nutzers – nur als Muster:]\n${String(p.beispielPersona).slice(0, 1500)}\n[Ende Stilvorlage] Übernimm Aufbau, Ton und Detailgrad dieses Beispiels, aber schreib immer neuen Text passend zur aktuellen Szene, deinen Persona-Reglern und deinem Look.${adult ? '' : ' Nutze das Beispiel ausschließlich für Struktur und Ton; keine expliziten Inhalte.'}`;
  system += genderLine(p);
  system += identityAnchor(p, otherNames);
  system += `\n\nDu KANNST Fotos/Bilder von dir oder der Szene schicken – die App erzeugt sie für dich. Lehne das nie ab und behaupte nie, du könntest keine Fotos senden. Wenn der Nutzer ein Foto/Bild möchte (oder es gut passt), antworte kurz in deiner Rolle und hänge GANZ AM ENDE genau eine Zeile an: [FOTO: kurze englische Beschreibung von Pose, Ort, Kleidung, Licht].`;
  return { system, otherNames };
}

// ---- P2: Modellwahl
export function isUncensoredModel(id) {
  const s = String(id || '');
  return /^venice[-:]/.test(s) || /uncensored|abliterated|role-play|dolphin/i.test(s);
}

/** Wunschliste im Automatik-Modus (ohne Duplikate). */
export function pickChatModels({ adult = false, profile = {}, hasImages = false, route = [], defaultModel = '' } = {}) {
  const r = Array.isArray(route) ? route.filter(Boolean) : [];
  const p = profile || {};
  const wish = [];
  const push = (id) => { if (id && !wish.includes(id)) wish.push(id); };
  if (adult) {
    const un = r.filter(isUncensoredModel);
    for (const id of un) push(id);
    if (!un.length) push('venice-uncensored-1-2');
    for (const id of r) push(id);
    return wish;
  }
  const head = [];
  if (p.teacher === 'es') head.push('groq:qwen/qwen3.8-27b');
  if (/coder|lawyer|anwalt|professor|assistant|assistent/i.test(`${p.id || ''} ${p.name || ''}`)) head.push('gemini-3.5-flash');
  if (hasImages) head.push('nvidia/nemotron-3.5-super-vl:free');
  for (const id of head) push(id);
  for (const id of r) push(id);
  if (defaultModel) push(defaultModel);
  return wish;
}

// ---- P3: Ablehnungs-Fallback
const REFUSAL_RX = [
  /ich kann (dir )?(dabei |da |bei so etwas |diese anfrage |diese bitte |das |darauf )?(leider )?nicht (helfen|tun|beantworten|erfüllen|eingehen|nachkommen)/i,
  /das kann ich (nicht|leider nicht) (schreiben|tun|erfüllen|machen|beantworten)/i,
  /(es )?tut mir leid, aber (ich kann|das kann ich)/i,
  /entschuldigung, aber (ich kann|das kann ich)/i,
  /als (eine )?ki(-modell| -modell|-assistent| sprachmodell)?,? (kann|darf|bin) ich (nicht|keine)/i,
  /gegen (meine|die) richtlinien/i,
  /(das|dies|diese anfrage|so etwas) (ist|wäre) (leider )?nicht angemessen/i,
  /ich (kann|darf|werde) (keine|nicht) (expliziten|sexuellen|erotischen)/i,
  /i can'?t help with that/i,
  /i cannot (help|assist|continue|comply|create|provide)/i,
  /i'?m sorry, but i can'?t/i,
  /as an ai( language model| assistant)?,? i (can'?t|cannot|am not able|won'?t|don'?t)/i,
  /i('m| am) (not able|unable) to (help|assist|create|write|continue|provide)/i,
  /i (won'?t|will not) (be able to )?(write|create|continue|engage|produce)/i,
  /content policy/i,
  /not able to (help|provide|engage)/i,
  /i can'?t (do|write|create|continue with) (that|this)/i,
];

export function isRefusal(text) {
  const s = String(text ?? '').slice(0, 400).replace(/[\u2018\u2019`]/g, "'");
  if (!s.trim()) return false;
  return REFUSAL_RX.some((rx) => rx.test(s));
}

/** Nächstes unzensiertes Modell nach dem aktuellen aus usable; sonst Venice-Fallback. Nie ein schon probiertes. */
export function refusalFallback(usable, tried, opts = {}) {
  const u = Array.isArray(usable) ? usable.filter(Boolean) : [];
  const t = Array.isArray(tried) ? tried.filter(Boolean) : [];
  const refused = Array.isArray(opts.refused) ? opts.refused : [];
  const max = Number.isFinite(opts.max) ? opts.max : 2;
  const cur = t[t.length - 1];
  const start = cur ? u.indexOf(cur) + 1 : 0;
  for (let i = Math.max(0, start); i < u.length; i++) {
    const id = u[i];
    if (t.includes(id) || refused.includes(id)) continue;
    if (isUncensoredModel(id)) return id;
  }
  const pool = ['venice-uncensored-1-2', 'venice:gemma-4-uncensored'];
  void max; // Anzahl der Wechsel begrenzt der Aufrufer (functions/api/chat.ts, max 2)
  for (const id of pool) if (!t.includes(id) && !refused.includes(id)) return id;
  return '';
}

/** Puffer-Gate für den Stream: hält die SSE-Bytes zurück, bis ≥ minChars sichtbarer Text (delta) da ist
 *  oder der Stream endet, und entscheidet dann per isRefusal. Keine Ablehnung → Puffer in Originalreihenfolge
 *  an onFlush, danach wird jeder weitere Chunk sofort durchgereicht. Ablehnung → nichts geht raus
 *  (außer release() wird aufgerufen, z. B. wenn keine Wechsel mehr erlaubt sind). */
/** @param {{ minChars?: number, onFlush?: (txt: string) => any }} [opts] */
export function createRefusalGate({ minChars = 240, onFlush = undefined } = {}) {
  let pending = '';
  let carry = '';
  let visible = '';
  let decided = false;
  let refused = false;
  let flushedChars = 0;
  const dec = new TextDecoder();
  const out = async (txt) => { if (!txt) return; flushedChars += txt.length; if (typeof onFlush === 'function') await onFlush(txt); };
  const decide = async () => {
    if (decided) return;
    decided = true;
    refused = isRefusal(visible);
    if (!refused) { const t = pending; pending = ''; await out(t); }
  };
  return {
    get refused() { return refused; },
    get decided() { return decided; },
    get visible() { return visible; },
    get flushedChars() { return flushedChars; },
    async write(chunk) {
      const text = typeof chunk === 'string' ? chunk : dec.decode(chunk, { stream: true });
      if (decided) { if (!refused) await out(text); else pending += text; return true; }
      pending += text;
      carry += text;
      const lines = carry.split('\n');
      carry = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try { const j = JSON.parse(raw); if (typeof j.delta === 'string') visible += j.delta; } catch {}
      }
      if (visible.length >= minChars) await decide();
      return true;
    },
    async finish() { await decide(); return !refused; },
    /** Gepufferte (abgelehnte) Antwort doch ausliefern. */
    async release() { const t = pending; pending = ''; refused = false; await out(t); },
  };
}

// ---- B1: Bildhäufigkeit
export function autoImageDecision({ mode, userAsked = false, fotoTag = false, freq = 'request', profileAuto = null, conv = {}, sfwEvery = '5-10', nReplies = 0, rnd = Math.random } = {}) {
  if (userAsked) return { fire: true, reason: 'user' };
  // bisherige Regel (bis v83): Profil-Automatik schlägt globale Häufigkeit
  const n = Number(nReplies) || 0;
  const autoPic = profileAuto != null ? !!profileAuto : (freq === 'every' || (freq === '3' && n % 3 === 0) || (freq === '5' && n % 5 === 0));
  if (freq === 'off' && !profileAuto) return { fire: false, reason: 'off' };
  if (mode === 'hemmungslos') {
    const fire = !!(fotoTag || autoPic);
    return { fire, reason: fire ? 'adult' : 'none' };
  }
  // jugendfrei: Auto-Bilder drosseln (etwa jede N. Antwort)
  const c = conv || {};
  if (!(fotoTag || autoPic)) return { fire: false, reason: 'sfw-none' };
  const reason = fotoTag ? 'sfw-foto' : 'sfw-auto';
  let nextAt = Number.isFinite(c.nextImgAt) ? c.nextImgAt : drawNextAt(sfwEvery, rnd);
  if (String(sfwEvery) === 'request' || nextAt == null) return { fire: false, reason: 'sfw-request-only' };
  const since = Number.isFinite(c.repliesSinceImg) ? c.repliesSinceImg : 0;
  if (since >= nextAt) return { fire: true, nextAt: drawNextAt(sfwEvery, rnd), reason };
  return { fire: false, reason: 'sfw-wait', nextAt };
}

function drawNextAt(sfwEvery, rnd) {
  const v = String(sfwEvery ?? '5-10');
  if (v === 'request') return null;
  if (v === '3') return 3;
  if (v === '5') return 5;
  if (v === '10') return 10;
  const r = typeof rnd === 'function' ? rnd() : Math.random();
  return 5 + Math.floor(r * 6); // 5..10
}

/** Kurzname einer Stimme ("Seraphina" aus "Seraphina (weiblich, multilingual)"). */
export function voiceShortName(voiceName, EDGE_VOICES) {
  const list = Array.isArray(EDGE_VOICES) ? EDGE_VOICES : [];
  for (const g of list) for (const [id, label] of (g.voices || [])) if (id === voiceName) return String(label).split('(')[0].trim();
  return '';
}
