// v74 Modell-bewusster Prompt-Bau. Reihenfolge (immer): Framing → Identität → Outfit → Pose → Action → Szene → Licht → Mood → Quality.
// Framing + Identität + Outfit werden NIE gekürzt. Truncation schneidet Quality → Background → Mood zuerst.
import { dedupeText, tidy } from './util.js';
import { subjectOf } from './identity.js';

export const FRAMING = 'full body shot, entire face and head in frame, looking at camera';

/** Modell-Profil-Tabelle (nur was der Formatter braucht) */
export const FORMAT = {
  'lustify-v8': { style: 'tags', maxPrompt: 1500, maxNegative: 800, keepBefore: 75 },
  chroma: { style: 'prose', maxPrompt: 3000, maxNegative: 800 },
  'qwen-image-3': { style: 'prose', maxPrompt: 1500, maxNegative: 800 },
  'qwen-image-2-1-turbo': { style: 'prose', maxPrompt: 1500, maxNegative: 800 },
  'z-image-turbo': { style: 'prose', maxPrompt: 1500, maxNegative: 800 },
  default: { style: 'prose', maxPrompt: 1500, maxNegative: 800 },
};
export function formatOf(model) { return FORMAT[String(model || '').toLowerCase()] || FORMAT.default; }

/** Anzeige-Label einer Section (nur im Prose-Stil genutzt) */
const SECTION_LABEL = {
  framing: 'Framing',
  identity: 'The woman', // v78: wird von formatPrompt per subjectOf überschrieben, wenn male
  outfit: 'Outfit',
  pose: 'Camera and pose',
  action: 'Action',
  scene: 'Scene',
  light: 'Lighting',
  mood: 'Mood',
  quality: 'Quality',
};

/** Wandelt beliebige Eingabe (String | String[] | undefined) in ein sauberes Array */
function listOf(v) {
  if (Array.isArray(v)) return v.map((x) => tidy(String(x == null ? '' : x))).filter(Boolean);
  const t = tidy(String(v == null ? '' : v));
  return t ? [t] : [];
}

/** Sections in der festen Reihenfolge; `prio` wird für die Truncation genutzt (1 = geschützt). */
export function buildSections(parts = {}) {
  const { framing, identity, outfitText, garmentTags, pose, action, scene, light, mood, quality } = parts || {};
  const outfitParts = [...listOf(outfitText), ...listOf(garmentTags)];
  const rows = [
    { key: 'framing', text: listOf(framing).join(', '), prio: 1 },
    { key: 'identity', text: listOf(identity).join(', '), prio: 1 },
    { key: 'outfit', text: outfitParts.join(', '), prio: 1 },
    { key: 'pose', text: listOf(pose).join(', '), prio: 2 },
    { key: 'action', text: listOf(action).join(', '), prio: 3 },
    { key: 'scene', text: listOf(scene).join(', '), prio: 4 },
    { key: 'light', text: listOf(light).join(', '), prio: 4 },
    { key: 'mood', text: listOf(mood).join(', '), prio: 5 },
    { key: 'quality', text: listOf(quality).join(', '), prio: 6 },
  ];
  return rows.map((s) => ({ ...s, text: tidy(s.text) })).filter((s) => s.text);
}

/** Truncation: Framing/Identität/Outfit bleiben vollständig; Quality→Background→Mood fallen zuerst. */
export function truncateSections(sections, max) {
  const list = Array.isArray(sections) ? sections : buildSections(sections);
  const totalOf = (arr) => arr.reduce((n, s) => n + s.text.length + 2, 0);
  if (totalOf(list) <= max) return list.map((s) => s.text);
  const out = list.map((s) => ({ ...s }));
  const order = [...out].sort((a, b) => b.prio - a.prio); // 6 → 2
  for (const drop of order) {
    let total = totalOf(out);
    if (total <= max) break;
    if (drop.prio <= 1) continue; // geschützt
    const idx = out.findIndex((s) => s.key === drop.key);
    if (idx < 0) continue;
    const before = out[idx].text.length;
    const take = Math.max(0, before - (total - max) - 4);
    let next = take > 0 ? out[idx].text.slice(0, take).replace(/[,\s]+\S*$/, '') : '';
    if (next && !/[,.]$/.test(next)) next += ','; 
    out[idx].text = tidy(next);
    if (!out[idx].text) out[idx].skip = true;
  }
  return out.filter((s) => !s.skip && s.text).map((s) => s.text);
}

/** Tags-Stil (SDXL/lustify): Komma-getrennt, kurze Phrasen; wichtige Teile zuerst. */
export function renderTags(sections) {
  return sections.map((s) => tidy(s)).filter(Boolean).join(', ');
}
/** Prose-Stil (chroma/qwen/flux): "Label: text"-Sätze, mit Punkt getrennt. */
export function renderProse(sections, keys = null, labelOpts = null) {
  const arr = Array.isArray(sections) ? sections : [];
  const labels = Array.isArray(keys) ? keys : null;
  const identityLabel = labelOpts && labelOpts.identityLabel ? labelOpts.identityLabel : SECTION_LABEL.identity;
  const body = arr.map((s, i) => {
    const t = tidy(s);
    if (!t) return '';
    const key = labels ? labels[i] : null;
    const label = key ? (key === 'identity' ? identityLabel : SECTION_LABEL[key]) : null;
    return label ? `${label}: ${t}` : t;
  }).filter(Boolean).join('. ');
  return body ? `${body}.` : '';
}

/** Framing je nach Dropdown (close-up lehnt sich nur bei echtem Close-up) */
export function framingFor(frame) {
  const fr = String(frame || '').trim();
  const closeFrame = /\b(close-up|close up|portrait|nahaufnahme|kopf|head|gesicht)\b/i.test(fr);
  if (closeFrame) return `${fr}, entire head and face in frame, looking at camera`;
  return `${FRAMING}${fr ? ', ' + fr : ''}`;
}

/** komplettes Prompt/Paar aus bereits sortierten Teilen bauen */
export function formatPrompt(model, parts, opts = {}) {
  const fm = formatOf(model);
  const sections = buildSections(parts || {});
  const keys = sections.map((s) => s.key);
  const cut = truncateSections(sections, fm.maxPrompt);
  const identityLabel = opts.profile ? subjectOf(opts.profile).label : SECTION_LABEL.identity;
  const text = fm.style === 'tags' ? renderTags(cut) : renderProse(cut, keys.slice(0, cut.length), { identityLabel });
  const negative = dedupeText(listOf(opts.negative).join(', ')).slice(0, fm.maxNegative);
  return {
    prompt: text.slice(0, fm.maxPrompt),
    negative,
    sections: sections.map((s) => s.key + ':' + s.text.length),
  };
}

/** Prioritäts-Truncation Helfer für Tests (nur String-Inhalt). */
export function fitToBudget(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return s.slice(0, max);
}
