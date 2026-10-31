// v85a: Bild-Mix (Hintergrund + Person getrennt) – rein, ohne fetch/env, von Server UND Client importierbar.
// Neue Prompts nennen die Person ausdrücklich erwachsen; zusätzliches scrubYouth läuft auf dem Server.

export const MIX_BG = { 'z-image-turbo': 0.01, 'qwen-image-2-1-turbo': 0.02, 'chroma': 0.01, 'runware:100@1': 0.002 };
export const MIX_FG_SAFE = { 'qwen-image-2-1-turbo-edit': 0.02, 'qwen-image-2-1-pro-edit': 0.05, 'firered-image-edit': 0.03 };
export const MIX_FG_ADULT = { 'qwen-edit-uncensored': 0.04, 'firered-image-edit': 0.03 };
export const MIX_DEFAULT = { bg: 'z-image-turbo', fg: 'qwen-image-2-1-turbo-edit', fgAdult: 'qwen-edit-uncensored' };

const round3 = (n) => Math.round(n * 1000) / 1000;

export function mixCost(bg, fg) {
  const b = MIX_BG[bg] != null ? MIX_BG[bg] : MIX_BG[MIX_DEFAULT.bg];
  const f = MIX_FG_SAFE[fg] != null ? MIX_FG_SAFE[fg] : (MIX_FG_ADULT[fg] != null ? MIX_FG_ADULT[fg] : 0);
  return round3(b + f);
}

/** Allowlist-Prüfung; unbekannte Werte → Default. null, wenn kein Objekt übergeben wird. */
export function normalizeMix(mix, adult = false) {
  if (!mix || typeof mix !== 'object' || Array.isArray(mix)) return null;
  const bg = typeof mix.bg === 'string' && MIX_BG[mix.bg] != null ? mix.bg : MIX_DEFAULT.bg;
  const fgTable = adult ? MIX_FG_ADULT : MIX_FG_SAFE;
  const fgDef = adult ? MIX_DEFAULT.fgAdult : MIX_DEFAULT.fg;
  const fg = typeof mix.fg === 'string' && fgTable[mix.fg] != null ? mix.fg : fgDef;
  const cost = round3((MIX_BG[bg] || 0) + (fgTable[fg] || 0));
  return { bg, fg, cost };
}

const PEOPLE_RX = /\b(?:(?:the|a|an)\s+)?(woman|man|girl|boy|person|people|she|her|he|his|lady|guy)\b/gi; // v85: Artikel mit entfernen
const stripPeople = (s) => String(s || '').replace(PEOPLE_RX, '').replace(/\s{2,}/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '');

/** Hintergrund-Prompt ohne Personen; Stil comic/manhwa → Illustration statt Foto. */
export function mixBackgroundPrompt(parts, style) {
  const p = parts && typeof parts === 'object' ? parts : {};
  const base = [stripPeople(p.background), stripPeople(p.scene)].filter(Boolean).join(', ');
  const light = String(p.lighting || '').trim();
  const pictorial = (style === 'comic' || style === 'manhwa') ? `${style} illustration` : 'photorealistic photo';
  const out = [base, light, 'empty scene, no people, nobody', pictorial, 'wide shot', 'high detail'].filter(Boolean).join(', ');
  return out.slice(0, 900);
}

export function mixBackgroundNegative() {
  return 'people, person, woman, man, crowd, figure, body, face, text, watermark';
}

/** Personen-Prompt für den Edit-Schritt; nennt die Person ausdrücklich erwachsen. */
export function mixPersonPrompt({ parts, identity, male } = {}) {
  const p = parts && typeof parts === 'object' ? parts : {};
  const who = male ? 'adult man' : 'adult woman';
  const outfit = [String(p.outfit || '').trim(), String(p.outfit_state || '').trim()].filter(Boolean).join(', ');
  const segs = [];
  segs.push(`Add exactly ONE ${who} into this photo, placed naturally in the scene: ${String(identity || '').trim()}.`);
  if (outfit) segs.push(`Outfit: ${outfit}.`);
  if (String(p.pose || '').trim()) segs.push(`Pose: ${String(p.pose).trim()}.`);
  if (String(p.camera || '').trim()) segs.push(`Camera: ${String(p.camera).trim()}.`);
  if (String(p.expression || '').trim()) segs.push(`Expression: ${String(p.expression).trim()}.`);
  segs.push('Keep the background, perspective and lighting unchanged, realistic scale and shadows, full figure with the entire face and head in frame, photorealistic.');
  return segs.join(' ').slice(0, 1400);
}
