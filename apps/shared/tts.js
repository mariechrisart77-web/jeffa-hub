let currentUtterance = null;

export function listBrowserVoices() {
  return speechSynthesis.getVoices();
}

export function pickNaturalVoice(lang) {
  const voices = listBrowserVoices();
  const filtered = voices.filter(v => v.lang.startsWith(lang));
  
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

export async function speak(text, voiceCfg, lang) {
  stopSpeaking();
  
  if (!text || !text.trim()) return;

  const provider = voiceCfg?.provider || 'browser';
  
  if (provider === 'browser') {
    return speakBrowser(text, voiceCfg, lang);
  } else if (provider === 'edge') {
    return speakEdge(text, voiceCfg, lang);
  } else if (provider === 'hf') {
    return speakHF(text, voiceCfg);
  } else {
    throw new Error('Unbekannter TTS-Provider: ' + provider);
  }
}

function speakBrowser(text, voiceCfg, lang) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
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
      currentUtterance = null;
      resolve();
    };

    utterance.onerror = (e) => {
      currentUtterance = null;
      reject(new Error('Sprachausgabe-Fehler: ' + e.error));
    };

    speechSynthesis.speak(utterance);
  });
}

async function speakEdge(text, voiceCfg, lang) {
  try {
    const voiceName = voiceCfg?.voiceName || (lang === 'de' ? 'de-DE-SeraphinaMultilingualNeural' : 'en-US-AriaNeural');
    const rate = (voiceCfg?.rate || 1.0) * 100;
    const pitch = ((voiceCfg?.pitch || 1.0) - 1) * 50;

    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        provider: 'edge',
        voiceName,
        rate,
        pitch
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Edge TTS Fehler');
    }

    const result = await response.json().catch(() => ({}));
    if (!result.dataUrl) throw new Error(result.error?.message || 'Edge TTS Fehler');
    const blob = await fetch(result.dataUrl).then((r) => r.blob());
    const audio = new Audio(URL.createObjectURL(blob));
    
    return new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(audio.src);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        reject(new Error('Audio-Wiedergabe fehlgeschlagen'));
      };
      audio.play();
    });
  } catch (e) {
    return speakBrowser(text, voiceCfg, lang);
  }
}

async function speakHF(text, voiceCfg) {
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        provider: 'hf',
        rate: voiceCfg?.rate || 1.0
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || 'HF TTS Fehler');
    }

    const result = await response.json().catch(() => ({}));
    if (!result.dataUrl) throw new Error(result.error?.message || 'HF TTS Fehler');
    const blob = await fetch(result.dataUrl).then((r) => r.blob());
    const audio = new Audio(URL.createObjectURL(blob));
    
    return new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(audio.src);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        reject(new Error('Audio-Wiedergabe fehlgeschlagen'));
      };
      audio.play();
    });
  } catch (e) {
    throw new Error('HF TTS nicht verfügbar: ' + e.message);
  }
}

export function stopSpeaking() {
  if (window.speechSynthesis) {
    speechSynthesis.cancel();
  }
  currentUtterance = null;
}
export const stop = () => stopSpeaking();
