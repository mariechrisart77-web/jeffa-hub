// v82 C1: Vorlesen mit Start/Stopp. Zustaende: idle | loading | playing.
import { cleanForTTS } from './tts-clean.js';

let currentUtterance = null;
let currentAudio = null;
let currentUrl = null;
let currentFetch = null;
let generation = 0;
let currentId = null;
let speaking = false;
let pendingResolve = null;
const listeners = new Set();

function emit() {
  const state = { speaking, id: currentId };
  for (const cb of [...listeners]) { try { cb(state); } catch {} }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    try { window.dispatchEvent(new CustomEvent('jeffa:tts', { detail: state })); } catch {}
  }
}

function setState(on, id) {
  speaking = !!on;
  currentId = on ? (id || null) : null;
  emit();
}

function releaseAudio() {
  if (currentAudio) {
    try { currentAudio.onended = null; currentAudio.onerror = null; currentAudio.pause(); } catch {}
    try { currentAudio.src = ''; } catch {}
    currentAudio = null;
  }
  if (currentUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try { URL.revokeObjectURL(currentUrl); } catch {}
  }
  currentUrl = null;
}

function resolvePending() {
  const r = pendingResolve;
  pendingResolve = null;
  if (r) { try { r(); } catch {} }
}

export function listBrowserVoices() {
  if (typeof speechSynthesis === 'undefined' || !speechSynthesis) return [];
  return speechSynthesis.getVoices() || [];
}

export function pickNaturalVoice(lang) {
  const voices = listBrowserVoices();
  const filtered = voices.filter(v => v.lang.startsWith(lang || 'de'));

  const preferredNames = [
    'Seraphina', 'Katja', 'Aria', 'Natural', 'Neural', 'Online',
    'Premium', 'Enhanced', 'Samantha', 'Daniel', 'Fiona'
  ];

  for (const name of preferredNames) {
    const match = filtered.find(v => v.name.includes(name));
    if (match) return match;
  }

  const neural = filtered.find(v => v.name.toLowerCase().includes('neural'));
  if (neural) return neural;

  const online = filtered.find(v => v.localService === false);
  if (online) return online;

  return filtered[0] || voices[0];
}

export function isSpeaking() { return speaking; }
export function speakingId() { return speaking ? currentId : null; }
export function onTtsChange(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export async function speak(text, voiceCfg, lang, opts = {}) {
  stopSpeaking();

  const cleaned = cleanForTTS(text);
  if (!cleaned) return;

  const myGen = ++generation;
  const id = opts && opts.id != null ? String(opts.id) : null;
  setState(true, id);

  const provider = voiceCfg?.provider || 'browser';
  try {
    if (provider === 'browser') {
      return await speakBrowser(cleaned, voiceCfg, lang, myGen, id);
    } else if (provider === 'edge') {
      return await speakEdge(cleaned, voiceCfg, lang, myGen, id);
    } else if (provider === 'hf') {
      return await speakHF(cleaned, voiceCfg, myGen, id);
    } else {
      throw new Error('Unbekannter TTS-Provider: ' + provider);
    }
  } catch (e) {
    if (myGen === generation) setState(false, null);
    throw e;
  }
}

function speakBrowser(text, voiceCfg, lang, myGen, id) {
  return new Promise((resolve, reject) => {
    if (typeof speechSynthesis === 'undefined' || !speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      reject(new Error('Browser unterstützt keine Sprachausgabe'));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    currentUtterance = utterance;

    if (voiceCfg?.voiceName) {
      const voice = listBrowserVoices().find(v => v.name === voiceCfg.voiceName);
      if (voice) utterance.voice = voice;
    } else {
      const voice = pickNaturalVoice(lang || 'de');
      if (voice) utterance.voice = voice;
    }

    utterance.lang = lang || 'de-DE';
    utterance.rate = voiceCfg?.rate || 1.0;
    utterance.pitch = voiceCfg?.pitch || 1.0;

    utterance.onend = () => {
      if (currentUtterance === utterance) currentUtterance = null;
      if (myGen === generation) setState(false, null);
      resolve();
    };

    utterance.onerror = (e) => {
      if (currentUtterance === utterance) currentUtterance = null;
      if (myGen === generation) setState(false, null);
      reject(new Error('Sprachausgabe-Fehler: ' + (e && e.error)));
    };

    try { speechSynthesis.speak(utterance); } catch (e) { reject(e); }
  });
}

async function fetchTts(body, myGen) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  currentFetch = ctrl;
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctrl ? ctrl.signal : undefined,
  });
  if (myGen !== generation) throw new Error('aborted');
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err && err.error && err.error.message) || 'TTS Fehler');
  }
  const result = await response.json().catch(() => ({}));
  if (!result.dataUrl) throw new Error((result && result.error && result.error.message) || 'TTS Fehler');
  return result.dataUrl;
}

async function playBlob(dataUrl, myGen, id) {
  if (myGen !== generation) throw new Error('aborted');
  const blob = await fetch(dataUrl).then((r) => r.blob());
  if (myGen !== generation) throw new Error('aborted');
  const url = URL.createObjectURL(blob);
  currentUrl = url;
  const audio = new Audio(url);
  currentAudio = audio;
  await new Promise((resolve, reject) => {
    pendingResolve = resolve;
    audio.onended = () => {
      if (currentAudio === audio) { releaseAudio(); }
      if (myGen === generation) setState(false, null);
      resolvePending();
    };
    audio.onerror = () => {
      if (currentAudio === audio) { releaseAudio(); }
      if (myGen === generation) setState(false, null);
      resolvePending();
      reject(new Error('Audio-Wiedergabe fehlgeschlagen'));
    };
    const blocked = () => { // v82: z. B. iOS-Autoplay-Sperre – nicht ewig „spricht“ anzeigen
      if (currentAudio === audio) { releaseAudio(); }
      if (myGen === generation) setState(false, null);
      resolvePending();
      reject(new Error('Audio-Wiedergabe blockiert'));
    };
    try {
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(blocked);
    } catch { blocked(); }
  });
}

async function speakEdge(text, voiceCfg, lang, myGen, id) {
  let dataUrl;
  try {
    const voiceName = voiceCfg?.voiceName || (lang === 'de' ? 'de-DE-SeraphinaMultilingualNeural' : 'en-US-AriaNeural');
    const rate = (voiceCfg?.rate || 1.0) * 100;
    const pitch = ((voiceCfg?.pitch || 1.0) - 1) * 50;
    dataUrl = await fetchTts({ text, provider: 'edge', voiceName, rate, pitch }, myGen);
    currentFetch = null;
  } catch (e) {
    currentFetch = null;
    if (myGen !== generation) return; // nach Stopp nichts mehr starten
    try { return await speakBrowser(text, voiceCfg, lang, myGen, id); } catch { return; }
  }
  if (myGen !== generation) return;
  try { await playBlob(dataUrl, myGen, id); } catch (e) { if (myGen === generation) throw e; }
}

async function speakHF(text, voiceCfg, myGen, id) {
  let dataUrl;
  try {
    dataUrl = await fetchTts({ text, provider: 'hf', rate: voiceCfg?.rate || 1.0 }, myGen);
    currentFetch = null;
  } catch (e) {
    currentFetch = null;
    throw new Error('HF TTS nicht verfügbar: ' + (e && e.message));
  }
  if (myGen !== generation) return;
  await playBlob(dataUrl, myGen, id);
}

export function stopSpeaking() {
  generation++;
  if (typeof speechSynthesis !== 'undefined' && speechSynthesis) {
    try { speechSynthesis.cancel(); } catch {}
  }
  currentUtterance = null;
  if (currentFetch) { try { currentFetch.abort(); } catch {} currentFetch = null; }
  releaseAudio();
  resolvePending();
  if (speaking) setState(false, null);
  else { currentId = null; emit(); }
}
export const stop = () => stopSpeaking();
