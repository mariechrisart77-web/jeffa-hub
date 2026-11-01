// v74 Modell-bewusster Prompt-Bau. v87b-Reihenfolge: Framing → Stil → Personen → Identität → Szene → Outfit → Pose → Action → Licht → Mood → Quality.
// Truncation schneidet nur ganze Segmente: Quality → Licht/Mood → Action → Pose → Outfit/Szene; Framing/Stil/Personen/Identität geschützt.
import { dedupeText, dropNegativeConflicts, tidy } from './util.js';
import { subjectOf } from './identity.js';

export const FRAMING = 'full body shot, entire face and head in frame, looking at camera';

/** Modell-Profil-Tabelle (nur was der Formatter braucht) */
export const FORMAT = {
  'lustify-v8': { style: 'tags', maxPrompt: 1500, maxNegative: 800, keepBefore: 75 },
  chroma: { style: 'prose', maxPrompt: 3000, maxNegative: 800 },
  'qwen-image-3': { style: 'prose', maxPrompt: 1500, maxNegative: 800 },
  'qwen-image-2-1-turbo': { style: 'prose', maxPrompt: 1500, maxNegative: 800 },
  'z-image-turbo': { style: 'prose', maxPrompt: 1500, maxNegative: 800 },
  'flux-2-pro': { style: 'prose', maxPrompt: 1500, maxNegative: 800 },
  default: { style: 'prose', maxPrompt: 1500, maxNegative: 800 },
};
export function formatOf(model) { return FORMAT[String(model || '').toLowerCase()] || FORMAT.default; }

/** Anzeige-Label einer Section (nur im Prose-Stil genutzt) */
/** v87: Stil-Texte (aus imgsvc-core dupliziert, um den Zirkelimport zu vermeiden) */
export const STYLE_TEXT = {
  real: 'photorealistic, natural light, sharp focus',
  comic: 'western comic book art style, bold ink outlines, flat vibrant colors',
  manhwa: 'Korean manhwa webtoon style, clean digital line art, soft cel shading, vibrant colors',
  story: 'photorealistic photo, cinematic',
};
const SECTION_LABEL = {
  framing: 'Framing',
  people: 'People',
  style: 'Style',
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
  const { framing, identity, outfitText, garmentTags, pose, action, scene, light, mood, quality, styleText, people } = parts || {};
  const outfitParts = [...listOf(outfitText), ...listOf(garmentTags)];
  // v87b: Kritisches zuerst (Ausschnitt, Stil, Personenzahl, Identität/Alter/Körper, Szene), Outfit danach.
  const rows = [
    { key: 'framing', text: listOf(framing).join(', '), prio: 1 },
    { key: 'style', text: listOf(styleText).join(', '), prio: 1 },
    { key: 'people', text: listOf(people).join(', '), prio: 1 },
    { key: 'identity', text: listOf(identity).join(', '), prio: 1 },
    { key: 'scene', text: listOf(scene).join(', '), prio: 2 },
    { key: 'outfit', text: outfitParts.join(', '), prio: 2 },
    { key: 'pose', text: listOf(pose).join(', '), prio: 3 },
    { key: 'action', text: listOf(action).join(', '), prio: 4 },
    { key: 'light', text: listOf(light).join(', '), prio: 5 },
    { key: 'mood', text: listOf(mood).join(', '), prio: 5 },
    { key: 'quality', text: listOf(quality).join(', '), prio: 6 },
  ];
  return rows.map((s) => ({ ...s, text: tidy(s.text) })).filter((s) => s.text);
}

/**
 * v87b Truncation: nur GANZE Komma-Segmente fallen weg (nie ein halbes Wort/Fragment), von der niedrigsten Priorität her
 * und innerhalb einer Section von hinten. Leere Sections fallen ganz weg. `overhead` = Zeichen für Labels/Trenner je Section.
 * Liefert [{key,text}] (Labels bleiben korrekt zugeordnet).
 */
export function truncateSectionsKeyed(sections, max, overhead = 2) {
  const list = (Array.isArray(sections) ? sections : buildSections(sections)).map((s) => ({ ...s, segs: String(s.text).split(/\s*,\s*/).filter(Boolean) }));
  const lenOf = (s) => s.segs.join(', ').length + (s.segs.length ? (typeof overhead === 'function' ? overhead(s.key) : overhead) : 0);
  const total = () => list.reduce((n, s) => n + lenOf(s), 0);
  const prios = [...new Set(list.map((s) => s.prio))].sort((a, b) => b - a);
  for (const p of prios) {
    // innerhalb einer Priorität immer zuerst am längsten Abschnitt kürzen (ein Riesen-Absatz verdrängt nicht das Outfit)
    for (;;) {
      if (total() <= max) break;
      const cand = list.filter((x) => x.prio === p && x.segs.length > (p <= 1 ? 1 : 0)).sort((a, b) => lenOf(b) - lenOf(a))[0];
      if (!cand) break;
      cand.segs.pop();
    }
    if (total() <= max) break;
  }
  return list.filter((s) => s.segs.length).map((s) => ({ key: s.key, text: tidy(s.segs.join(', ')) }));
}

/** alte API (Strings) – für Tests/Kompatibilität */
export function truncateSections(sections, max) { return truncateSectionsKeyed(sections, max).map((s) => s.text); }

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
  const identityLabel = opts.profile ? subjectOf(opts.profile).label : SECTION_LABEL.identity;
  const labelLen = (key) => (fm.style === 'tags' ? 2 : String(key === 'identity' ? identityLabel : (SECTION_LABEL[key] || '')).length + 4);
  const cut = truncateSectionsKeyed(sections, fm.maxPrompt - 1, labelLen);
  const text = fm.style === 'tags' ? renderTags(cut.map((c) => c.text)) : renderProse(cut.map((c) => c.text), cut.map((c) => c.key), { identityLabel });
  // v87: Negatives, die den positiven Stil negieren, entfernen (Comic-Stil darf nicht „cartoon“ negieren)
  let negAll = dedupeText(listOf(opts.negative).join(', '));
  if (parts && parts.styleText) negAll = dropNegativeConflicts(negAll, String(parts.styleText));
  const negative = negAll.slice(0, opts.maxNegative || fm.maxNegative);
  return {
    prompt: text.length <= fm.maxPrompt ? text : text.slice(0, fm.maxPrompt).replace(/,[^,]*$/, '') + '.',
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
