// v78: Tageszeit + Pose-Details aus deutschem Story-Text erkennen.
// Reine JS-Logik, keine Browser-APIs.

const TIME_MAP = [
  [/\b(abends?|am abend|abendessen|abendstimmung)\b/i, 'evening'],
  [/\b(nachts?|in der nacht|mitternacht|nacht\b|nächtlich\w*)\b/i, 'night'],
  [/\b(morgens?|am morgen|früh am morgen|sonnenaufgang)\b/i, 'morning'],
  [/\b(mittags?|am mittag|tagsüber|nachmittags?)\b/i, 'day'],
];

/** Tageszeit aus Text; letzter Treffer im Text gewinnt (spezifischster Zeitmarker). Liefert 'evening'|'night'|'morning'|'day'|'' */
export function detectTimeOfDay(text) {
  const t = String(text || '');
  if (!t) return '';
  let best = { at: -1, val: '' };
  for (const [rx, val] of TIME_MAP) {
    const g = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
    for (const m of t.matchAll(g)) {
      if (m.index > best.at) best = { at: m.index, val };
    }
  }
  return best.val;
}

const POSE_DETAIL_MAP = [
  [/\b(tür offen|tür auf|tür steht offen|door (is )?open|door wide open)\b/i, 'car door wide open'],
  [/\b(bein draußen|bein raus|beine draußen|one leg outside|leg outside)\b/i, 'one leg outside on the ground'],
];

/** Pose-Details aus Text extrahieren (dedupe, Reihenfolge stabil). Liefert String[] */
export function detectPoseDetails(text) {
  const t = String(text || '');
  if (!t) return [];
  const out = [];
  for (const [rx, val] of POSE_DETAIL_MAP) {
    if (rx.test(t) && !out.includes(val)) out.push(val);
  }
  return out;
}
