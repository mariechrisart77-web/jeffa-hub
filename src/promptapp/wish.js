// v87b: Marie-Entscheidung zur v73-Regel – ein im Bild-Wunsch ausdrücklich genanntes Outfit / eine genannte Haltung
// ERSETZT die gespeicherte Dropdown-Kleidung / -Pose (alle Modi; Jugendschutz-Filter laufen danach wie bisher).
// Außerdem: lange Outfit-Texte kürzen (ganze Segmente, Kleidungsstücke zuerst).
import { splitSegs, low, tidy } from './util.js';
import { detectStoryPose } from './scene-map.js';

const COLORS = { rot: 'red', blau: 'blue', schwarz: 'black', weiß: 'white', weiss: 'white', grün: 'green', gruen: 'green', rosa: 'pink', pink: 'pink', gelb: 'yellow', braun: 'brown', beige: 'beige', silber: 'silver', gold: 'gold', lila: 'purple', türkis: 'turquoise', red: 'red', blue: 'blue', black: 'black', white: 'white', green: 'green', yellow: 'yellow', brown: 'brown', silver: 'silver', purple: 'purple' };
const COLOR_RX = '(rot|blau|schwarz|wei(?:ß|ss)|gr(?:ü|ue)n|rosa|pink|gelb|braun|beige|silber|gold|lila|türkis|red|blue|black|white|green|yellow|brown|silver|purple)(?:e|en|er|es|em)?';
// Reihenfolge = Priorität (spezifisch vor allgemein). [Regex, englische Bezeichnung]
const WISH_GARMENTS = [
  [/\b(?:micro|mikro)[\s-]*bikini\b/i, 'micro bikini'],
  [/\bstring[\s-]*bikini\b/i, 'string bikini'],
  [/\bbikini\b/i, 'bikini'],
  [/\bbadeanzug\b|\bswimsuit\b/i, 'one-piece swimsuit'],
  [/\b(?:spitzen[\s-]*)?(?:lingerie|dessous|reizwäsche|unterwäsche)\b|\blace lingerie\b/i, (t) => (/spitze|lace/i.test(t) ? 'lace lingerie' : 'lingerie') + (/strapse|garter/i.test(t) ? ' with garter belt and stockings' : '')],
  [/\b(?:latex|pvc|lack)\w*/i, 'latex outfit'],
  [/\bbodysuit|body\b(?=\s|$)/i, 'bodysuit'],
  [/\bbademantel|bathrobe\b/i, 'bathrobe'],
  [/\bhandtuch|towel\b/i, 'white towel'],
  [/\bschlafanzug|pyjama|pajama/i, 'pyjamas'],
  [/\babendkleid|evening dress|evening gown/i, 'evening dress'],
  [/\bsommerkleid|summer dress/i, 'summer dress'],
  [/\bdirndl\b/i, 'dirndl'],
  [/\bhosenanzug\b|\bpant ?suit\b/i, 'trouser suit'],
  [/\bjumpsuit\b/i, 'jumpsuit'],
  [/\b(?:mini)?kleid\b|\bdress\b/i, (t) => (/minikleid/i.test(t) ? 'mini dress' : 'dress')],
  [/\b(?:mini)?rock\b|\bskirt\b/i, (t) => (/minirock/i.test(t) ? 'mini skirt' : 'skirt')],
  [/\bbluse\b|\bblouse\b/i, 'blouse'],
  [/\bt-?shirt\b/i, 't-shirt'],
  [/\bhemd\b|\bshirt\b/i, 'shirt'],
  [/\btank ?top\b/i, 'tank top'],
  [/\bpullover\b|\bsweater\b|\bhoodie\b/i, 'sweater'],
  [/\bjeans\b/i, 'jeans'],
  [/\bshorts\b|\bhotpants\b/i, 'shorts'],
  [/\bmantel\b|\bcoat\b/i, 'coat'],
  [/\bjacke\b|\bjacket\b/i, 'jacket'],
  [/\buniform\b/i, 'uniform'],
];
const NUDE_WISH_RX = /\b(nackt|splitternackt|unbekleidet|ohne kleidung|nude|naked|fully nude)\b/i;
const TOPLESS_WISH_RX = /\b(oben ohne|topless)\b/i;
const NEG_CTX_RX = /\b(ohne|kein|keine|keinen|nicht|without|no)\s+$/i;

function colorBefore(t, idx) {
  const m = t.slice(Math.max(0, idx - 30), idx).match(new RegExp(COLOR_RX + '[\\s-]*(?:\\w+[\\s-]+)?$', 'i'));
  if (!m) return '';
  const k = low(m[1]).replace('ss', 'ß');
  return COLORS[k] || COLORS[low(m[1])] || '';
}

/** Outfit, das der Nutzer im Bild-Wunsch ausdrücklich nennt (englisch), sonst ''. Kleidung von Partnern („Marc im Anzug“) wird nicht erkannt. */
export function wishOutfitText(wish = '') {
  const t = String(wish || '');
  if (!t.trim()) return '';
  const found = [];
  for (const [rx, name] of WISH_GARMENTS) {
    const m = t.match(rx);
    if (!m) continue;
    if (NEG_CTX_RX.test(t.slice(Math.max(0, m.index - 12), m.index))) continue; // „ohne Bikini“
    let label = typeof name === 'function' ? name(t) : name;
    if (found.some((f) => f.includes(label) || label.includes(f.replace(/^\w+ /, '')))) continue;
    const col = colorBefore(t, m.index);
    if (col && !Object.values(COLORS).some((c) => label.startsWith(c + ' '))) label = col + ' ' + label;
    found.push(label);
    if (found.length >= 3) break;
  }
  if (TOPLESS_WISH_RX.test(t) && !NUDE_WISH_RX.test(t)) {
    return found.length ? ['topless', ...found.filter((f) => !/bikini$|top|blouse|shirt|sweater/.test(f)).map((f) => f.replace(/bikini$/, 'bikini bottom'))].join(', ') : 'topless';
  }
  if (NUDE_WISH_RX.test(t)) {
    const m = t.match(NUDE_WISH_RX);
    if (/ohne kleidung/i.test(m[0]) || !NEG_CTX_RX.test(t.slice(Math.max(0, m.index - 12), m.index))) {
      return found.some((f) => /towel|bathrobe/.test(f)) ? 'nude, ' + found.filter((f) => /towel|bathrobe/.test(f)).join(', ') : 'nude';
    }
  }
  return found.join(', ');
}

// Allgemeine Haltungen (wenn die ortsgebundene Pose-Erkennung nichts findet)
const WISH_POSES = [
  [/\b(kniet|knie|kniend|kneeling|kneels|on her knees)\b/i, 'kneeling'],
  [/\b(liegt|liege|liegend)\b.*\b(bauch)\b|\blying on her (stomach|belly)\b/i, 'lying on her stomach'],
  [/\b(liegt|liege|liegend)\b.*\b(rücken)\b|\blying on her back\b/i, 'lying on her back'],
  [/\b(liegt|liege|liegend|lying|lies)\b/i, 'lying down'],
  [/\b(hockt|hocke|squatting|squats)\b/i, 'squatting'],
  [/\b(sitzt|sitze|sitzend|sitting|sits)\b.*\b(schreibtisch|desk)\b/i, (t) => (/\b(auf dem schreibtisch|on the desk)\b/i.test(t) ? 'sitting on the edge of the desk' : 'sitting at the desk')],
  [/\b(sitzt|sitze|sitzend|sitting|sits)\b/i, 'sitting'],
  [/\b(lehnt|lehne|leaning|leans)\b/i, 'leaning'],
  [/\b(tanzt|tanze|dancing|dances)\b/i, 'dancing'],
  [/\b(läuft|geht|spaziert|walking|walks)\b/i, 'walking'],
  [/\b(steht|stehe|stehend|standing|stands)\b/i, (t) => (/\bknietief|knee-?deep\b/i.test(t) ? 'standing knee-deep in the water' : 'standing')],
];
/** Haltung aus dem Bild-Wunsch: ortsgebundene Pose (scene-map) zuerst, sonst allgemeine Haltung. */
export function wishPoseText(wish = '') {
  const t = String(wish || '');
  if (!t.trim()) return '';
  const p = detectStoryPose(t);
  if (p) return p;
  for (const [rx, name] of WISH_POSES) {
    const m = t.match(rx);
    if (m) return typeof name === 'function' ? name(t) : name;
  }
  return '';
}

// ---------- Outfit kürzen ----------
const GARMENT_SEG_RX = /\b(bikini|top|bottom|thong|string|dress|kleid|skirt|lingerie|bra|panties|stockings|garter|corset|bodysuit|catsuit|latex|swimsuit|shirt|blouse|jeans|shorts|pants|trousers|jacket|coat|robe|towel|pyjamas|uniform|suit|heels|boots|nude|naked|topless|no clothes|apron|sweater)\b/i;
const PIERCING_RX = /\bpiercing/i;
const LOWER_BODY_RX = /\b(pubic|labia|cameltoe|crotch|thong|bottom|string bottom|panties|hips?|legs?|thighs?|stockings|garter|heels|boots|shoes|feet|waistline|navel)\b/i;
/**
 * Kürzt einen Outfit-Text auf max Zeichen: nur ganze Segmente; Kleidungsstücke vor Piercings vor Beschreibungen;
 * Ausgabe in Original-Reihenfolge. Porträt: Unterkörper-Segmente fallen weg.
 */
export function condenseOutfit(text, { max = 250, portrait = false } = {}) {
  const seen = new Set();
  let segs = splitSegs(text).filter((s) => { const k = low(s); if (seen.has(k)) return false; seen.add(k); return true; });
  const removed = [];
  if (portrait) {
    const keep = segs.filter((s) => !LOWER_BODY_RX.test(s) || /\b(top|bra|dress|shirt|blouse)\b/i.test(s) && !/\b(bottom|thong|pubic|labia|cameltoe)\b/i.test(s));
    if (keep.length) { removed.push(...segs.filter((s) => !keep.includes(s))); segs = keep; }
  }
  const joined = segs.join(', ');
  if (joined.length <= max) return { text: joined, removed, cut: removed.length > 0 };
  const DESC_RX = /^(visible|clearly|a lot of|plus|with|separate|crisp|glossy|minuscule)\b/i;
  const score = (s) => (PIERCING_RX.test(s) ? 2 : DESC_RX.test(s) ? 1 : GARMENT_SEG_RX.test(s) ? 3 : 1);
  // lange Einzelsegmente auf den Kern kürzen („…, clearly visible as …“ fällt weg)
  const core = (s) => { const c = tidy(s.replace(/^plus\s+/i, '')); return c.length > 90 ? tidy(c.split(/\s+(?:clearly|visible|which|that)\b/i)[0]) : c; };
  const items = segs.map((s, i) => ({ s: core(s), i, sc: score(s) }));
  const order = [...items].sort((a, b) => b.sc - a.sc || a.i - b.i);
  const picked = new Set();
  let len = 0;
  for (const it of order) {
    const add = it.s.length + (picked.size ? 2 : 0);
    if (len + add > max) continue;
    picked.add(it.i); len += add;
  }
  const out = items.filter((it) => picked.has(it.i)).map((it) => it.s);
  for (const it of items) if (!picked.has(it.i)) removed.push(segs[it.i]);
  return { text: out.join(', '), removed, cut: true };
}
