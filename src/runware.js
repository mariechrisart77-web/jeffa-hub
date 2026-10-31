// v85a: Runware (FLUX.1 schnell) – reine Task-/Antwort-Bauer, Node-testbar, keine Netzaufrufe, keine Schlüssel.
export const RUNWARE_MODEL = 'runware:100@1';

const clamp64 = (v, def = 1024) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const r = Math.round(n / 64) * 64;
  return Math.min(2048, Math.max(256, r));
};

export function runwareTask({ prompt, negative, width, height, seed, model = RUNWARE_MODEL, adult = false, uuid }) {
  const pos = String(prompt || '').slice(0, 2900);
  if (pos.length < 2) throw new Error('runware prompt too short');
  const task = {
    taskType: 'imageInference',
    taskUUID: uuid,
    model,
    positivePrompt: pos,
    width: clamp64(width, 1024),
    height: clamp64(height, 1024),
    numberResults: 1,
    outputType: 'base64Data',
    outputFormat: 'WEBP',
    includeCost: true,
    checkNSFW: !adult,
  };
  const neg = String(negative || '').trim();
  if (neg) task.negativePrompt = neg.slice(0, 1500);
  const s = Number(seed);
  if (Number.isInteger(s) && s > 0) task.seed = s;
  return [task];
}

export function parseRunwareImage(json) {
  const first = Array.isArray(json?.data) ? json.data[0] : null;
  const err = Array.isArray(json?.errors) ? json.errors[0] : null;
  if (err) {
    const code = err.code || err.code === 0 ? String(err.code) : '';
    const msg = String(err.message || '').slice(0, 120);
    throw new Error('runware ' + code + ': ' + msg);
  }
  if (!first) throw new Error('runware no image');
  let b64 = '';
  if (typeof first.imageBase64Data === 'string' && first.imageBase64Data) b64 = first.imageBase64Data;
  else if (typeof first.imageDataURI === 'string' && first.imageDataURI) {
    const i = first.imageDataURI.indexOf(',');
    b64 = i >= 0 ? first.imageDataURI.slice(i + 1) : first.imageDataURI;
  }
  if (!b64) throw new Error('runware no image');
  const cost = typeof first.cost === 'number' && Number.isFinite(first.cost) ? first.cost : undefined;
  const seed = Number.isInteger(first.seed) ? first.seed : undefined;
  const nsfw = first.NSFWContent === true || first.nsfw === true || first.NSFW === true;
  return { b64, cost, seed, nsfw };
}
