// v74 Bekleidung: Outfit-Presets als generische Garment-Specs. Kein Charakter-Bezug.
// activeTags/activeNegatives gelten NUR, wenn das Outfit aktiv ist.
import { low, tidy } from './util.js';

/** Bekannte Garment-Arten mit ihren aktiven Tags/Negatives */
const GARMENT_SPECS = {
  nude: {
    kind: 'nude', label: 'Ohne Kleidung', parts: ['full'],
    activeTags: ['nude, no clothes'],
    activeNegatives: [], // nude: KEINE Kleidungs-Negatives, die gegen "nackt" ankämpfen
    checkLabel: 'nude', topRequired: false, nudeExpected: true,
  },
  bikini: {
    kind: 'bikini', label: 'Bikini', parts: ['top', 'bottom'],
    activeTags: ['bikini top worn, both triangles on', 'tie-side string bottom'],
    activeNegatives: ['topless', 'bare breasts', 'nude'],
    checkLabel: 'bikini', topRequired: true, nudeExpected: false,
  },
  micro_bikini: {
    kind: 'micro_bikini', label: 'Mikrobikini', parts: ['top', 'bottom'],
    activeTags: ['bikini top worn, both triangles on', 'sideboob', 'underboob', 'thong string bottom'],
    activeNegatives: ['topless', 'bare breasts', 'nude', 'large bikini', 'wide triangles', 'full coverage'],
    checkLabel: 'micro_bikini', topRequired: true, nudeExpected: false,
  },
  swimsuit: {
    kind: 'swimsuit', label: 'Badeanzug', parts: ['full'],
    activeTags: ['one-piece swimsuit fitted to the body'],
    activeNegatives: ['bikini', 'two-piece', 'nude', 'topless'],
    checkLabel: 'swimsuit', topRequired: true, nudeExpected: false,
  },
  lingerie: {
    kind: 'lingerie', label: 'Dessous', parts: ['top', 'bottom'],
    activeTags: ['lingerie worn'],
    activeNegatives: ['nude', 'bikini', 'swimsuit'],
    checkLabel: 'lingerie', topRequired: true, nudeExpected: false,
  },
  latex: {
    kind: 'latex', label: 'Latex', parts: ['full'],
    activeTags: ['glossy latex sheen, crisp fabric detail'],
    activeNegatives: ['metallic', 'silver', 'chrome', 'mirror finish', 'foil', 'opaque', 'stiff fabric', 'loose fabric', 'padded cups'],
    checkLabel: 'latex', topRequired: false, nudeExpected: false,
  },
  dress: {
    kind: 'dress', label: 'Kleid', parts: ['full'],
    activeTags: ['fabric covering the torso and thighs'],
    // dress: KEIN "topless" – das würde gegen ein Kleid kämpfen und ist kein Gegenstand des Kleids
    activeNegatives: ['bikini', 'micro bikini'],
    checkLabel: 'dress', topRequired: false, nudeExpected: false,
  },
  casual: {
    kind: 'casual', label: 'Alltagskleidung', parts: ['full'],
    activeTags: [], activeNegatives: ['nude', 'bikini'],
    checkLabel: 'other', topRequired: false, nudeExpected: false,
  },
};

/** Heuristik: aus einem Outfit-Text den Garment `kind` erraten. */
const KIND_RX = [
  [/\b(nude|naked|nackt|topless|oben ohne|ohne kleidung|no clothes)\b/i, 'nude'],
  [/\bmicro\s*-?\s*bikini|string\s*bikini|tiny\s*bikini|wicked[- ]?weasel|micro_?bikini/i, 'micro_bikini'],
  [/\bbikini\b/i, 'bikini'],
  [/\b(swimsuit|badeanzug|one-?piece)\b/i, 'swimsuit'],
  [/\b(lingerie|dessous|bodysuit|negligee|garter|fishnet|lace)\b/i, 'lingerie'],
  [/\b(latex|leather|leder|harness|catsuit)\b/i, 'latex'],
  [/\b(dress|kleid|abendkleid|sommerkleid|satin|silk dress|robe)\b/i, 'dress'],
  [/\b(shirt|t-?shirt|jeans|pants|hoodie|sweater|pullover|jacket|coat|towel|handtuch|shorts|leggings|top)\b/i, 'casual'],
];

const OTHER = { kind: 'other', label: 'Outfit', parts: [], activeTags: [], activeNegatives: [], checkLabel: 'other', topRequired: false, nudeExpected: false };

const NUDE_ONLY_RX = /\b(nude|naked|nackt|topless|oben ohne|ohne kleidung|no clothes)\b/i;
const GARMENT_RX = /\b(bikini|dress|kleid|shirt|bluse|blouse|skirt|rock|jeans|hose|pants|trousers|short|hoodie|sweater|pullover|jacket|coat|mantel|suit|anzug|uniform|jumpsuit|pyjama|bathrobe|bademantel|swimsuit|badeanzug|one-piece)\b/i;

/** v83: Nackt-Segmente alleinstehend entfernen, wenn ein echtes Kleidungsstück vorhanden ist. */
export function reconcileOutfitNudity(text) {
  const segs = String(text || '').split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return { text: '', removed: [] };
  const hasGarment = segs.some((s) => GARMENT_RX.test(s) && !NUDE_ONLY_RX.test(s.replace(GARMENT_RX, '')));
  if (!hasGarment) return { text: segs.join(', '), removed: [] };
  const kept = [], removed = [];
  for (const s of segs) {
    if (NUDE_ONLY_RX.test(s) && !GARMENT_RX.test(s)) removed.push(s);
    else kept.push(s);
  }
  return { text: kept.join(', '), removed };
}

export function classifyOutfit(text) {
  const raw = String(text || '');
  if (!raw.trim()) return { ...OTHER };
  // v83: nude+bikini-Widerspruch → Kleidungsstück gewinnt (kein 'nude'-Kind)
  const rec = reconcileOutfitNudity(raw);
  const t = rec.text || raw;
  for (const [rx, kind] of KIND_RX) {
    if (kind === 'nude' && rec.removed.length) continue;
    if (rx.test(t)) return { ...GARMENT_SPECS[kind], kind };
  }
  return { ...OTHER };
}

/** Garment-Spec aus Preset-Objekt (aus photoopts) oder Freitext bauen */
export function specFor(outfitText, presetId = '') {
  if (!outfitText && !presetId) return null;
  if (presetId && GARMENT_SPECS[presetId]) return { ...GARMENT_SPECS[presetId] };
  return classifyOutfit(outfitText);
}

/** v83: Garment-Tags, die schon (sinngleich) im Outfit stehen, NICHT doppelt anhängen. */
export function dedupeGarmentTags(tags = [], outfit = '') {
  const o = low(outfit);
  return tags.filter((t) => {
    const parts = String(t).split(/,\s*/).map((x) => low(x).replace(/[^a-z0-9 ]+/g, ' ').trim()).filter(Boolean);
    return !parts.every((p) => p && o.includes(p));
  });
}

/** Tags+Negatives nur wenn aktiv (das ist der Kern der v74-Regel) */
export function activeGarmentBits(spec) {
  if (!spec) return { tags: [], negatives: [], checkSpec: null };
  const tags = Array.isArray(spec.activeTags) ? spec.activeTags.slice() : [];
  const negatives = Array.isArray(spec.activeNegatives) ? spec.activeNegatives.slice() : [];
  const checkSpec = {
    garment: { kind: spec.kind || 'other', label: spec.label || spec.kind || 'outfit', topRequired: !!spec.topRequired },
    nudeExpected: !!spec.nudeExpected,
  };
  return { tags, negatives, checkSpec };
}

/**
 * Outfit-Phrase inkl. Zustand. `visibly soaking wet white t-shirt clinging to her skin` etc.
 * Nackt-Zustand ersetzt das Outfit komplett.
 */
export function renderOutfitPhrase(outfit, state) {
  const o = tidy(String(outfit || ''));
  const s = low(state);
  if (/^(nude|naked)$/.test(s) || (!o && /^(nude|naked)$/.test(s))) return 'nude, no clothes';
  if (!o) return '';
  if (/wet|nass|soak|damp/.test(s)) return `visibly soaking wet ${o} clinging to her skin, dark damp patches on the fabric, water droplets on her skin and hair`;
  if (/torn|zerriss/.test(s)) return `visibly torn ${o} with ripped fabric`;
  if (/dirty|schmutz/.test(s)) return `visibly dirty ${o} with stains`;
  return o;
}

export { GARMENT_SPECS, OTHER as GARMENT_OTHER };
