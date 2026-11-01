// v87: Größen-Parameter je Venice-Modell (pure, node-testbar).
// qwen-image-Familie lehnt width/height mit HTTP 400 ab → aspect_ratio + resolution:'1K'.
// flux-2-pro ist ein Aspect-Ratio-Modell (nur aspect_ratio). chroma/z-image-turbo/lustify: width/height.
const QWEN_ASPECT = ['1:1', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9'];
const FLUX_ASPECT = ['1:1', '3:2', '16:9', '21:9', '9:16', '2:3', '3:4', '4:5'];

function nearest(value, list) {
  let best = list[0], bestErr = Infinity;
  for (const a of list) {
    const err = Math.abs(a - value);
    if (err < bestErr) { bestErr = err; best = a; }
  }
  return best;
}

export function aspectFromSize(width, height, allowed) {
  const w = Number(width) > 0 ? Number(width) : 1;
  const h = Number(height) > 0 ? Number(height) : 1;
  const value = w / h;
  const parsed = allowed.map((a) => { const [x, y] = a.split(':').map(Number); return { a, r: x / y }; });
  let best = parsed[0], bestErr = Infinity;
  for (const p of parsed) { const err = Math.abs(p.r - value); if (err < bestErr) { bestErr = err; best = p; } }
  return best.a;
}

/** Liefert die Venice-Generierungsparameter für Modell + gewünschte Größe. */
export function sizeParamsFor(model, width, height) {
  const m = String(model || '').toLowerCase();
  if (m.startsWith('qwen-image')) return { aspect_ratio: aspectFromSize(width, height, QWEN_ASPECT), resolution: '1K' };
  if (m === 'flux-2-pro') return { aspect_ratio: aspectFromSize(width, height, FLUX_ASPECT) };
  return { width: Number(width) || 1024, height: Number(height) || 1024 };
}

export { QWEN_ASPECT, FLUX_ASPECT };
