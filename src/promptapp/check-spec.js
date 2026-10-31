// v74 Check-Spec: aus dem Plan eine kompakte Erwartung ableiten und aus dem Vision-JSON bewerten.
// Deckt bikini/lingerie/dress/nude/swimsuit/other ab. `topRequired` und `nudeExpected` steuern Fehler.
import { FRAMING } from './format.js';

/** Goal-Objekt → checkSpec */
export function makeCheckSpec({ framing = FRAMING, garment, sceneText }) {
  const spec = garment || null;
  return {
    framing: /\bclose-up\b/i.test(String(framing || '')) ? 'close_up' : 'face_in_frame',
    garment: spec ? { kind: spec.kind || 'other', label: spec.label || spec.kind || 'outfit', topRequired: !!spec.topRequired } : null,
    nudeExpected: !!spec?.nudeExpected,
    scene: String(sceneText || '').slice(0, 260),
  };
}

/** Vision-System-Prompt für Venice gemma-4-uncensored */
export const CHECK_SYSTEM = `You audit ONE AI-generated image of a fictional adult character (21+) for a prompt-QA tool. Strict JSON only:
{"eyes_visible":bool,"top_of_head_visible":bool,"garment":"nude|bikini|micro_bikini|swimsuit|lingerie|dress|latex|other","top_worn":bool,"bottom_worn":bool,"nipples_covered":bool,"scene_ok":bool,"extra_people":bool}
Rules:
- eyes_visible + top_of_head_visible = BOTH eyes and the top of the head are inside the frame.
- garment = the visual outfit type you actually see.
- top_worn = true ONLY if a top garment covers BOTH nipples with fabric. If one or both nipples are visible, top_worn = false.
- nipples_covered = answer explicitly whether BOTH nipples are covered by fabric. Look closely at both breasts: if either nipple or areola is exposed (slipped triangle, pulled-aside fabric, see-through gap), nipples_covered = false.
- bottom_worn = true if a bottom garment covers the pubic area.
- scene_ok = the background matches the expected scene.
- extra_people = true if another human body/person is visible besides the single subject.
No prose, no fences.`;

/** robustes JSON aus einer Vision-Antwort */
export function parseVisionJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let o;
  try { o = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const allowed = new Set(['nude', 'bikini', 'micro_bikini', 'swimsuit', 'lingerie', 'dress', 'latex', 'other']);
  const g = String(o.garment || 'other').toLowerCase();
  return {
    eyes_visible: o.eyes_visible === true,
    top_of_head_visible: o.top_of_head_visible === true,
    garment: allowed.has(g) ? g : 'other',
    top_worn: o.top_worn === true,
    bottom_worn: o.bottom_worn === true,
    nipples_covered: o.nipples_covered === true,
    scene_ok: o.scene_ok !== false,
    extra_people: o.extra_people === true,
  };
}

/** Spec + Vision-Ergebnis → Prüf-Verdikt (pass/fail + Korrekturhinweise) */
export function verdictForVision(spec, vision) {
  const hints = [], negatives = [];
  let pass = true;
  if (spec.framing === 'face_in_frame') {
    const faceOk = vision.eyes_visible && vision.top_of_head_visible;
    if (!faceOk) { pass = false; hints.push('full body shot, entire face and head in frame'); negatives.push('cropped head, cut off face, out of frame'); }
  }
  const g = spec.garment;
  if (g && g.kind && g.kind !== 'other') {
    if (spec.nudeExpected && vision.garment !== 'nude') { pass = false; hints.push('nude, no clothes'); negatives.push('clothes, dressed'); }
    if (!spec.nudeExpected && vision.garment === 'nude') { pass = false; hints.push(`wearing the ${g.label}`); negatives.push('nude, topless'); }
    if (g.topRequired && vision.top_worn !== true) {
      pass = false; hints.push('top worn, both triangles on'); negatives.push('topless, bare breasts, nude');
    }
    if (g.topRequired && vision.top_worn === true && vision.nipples_covered === false) {
      // Top verrutscht → gleicher Fix wie fehlendes Top
      pass = false; hints.push('top worn, both triangles on, both nipples covered'); negatives.push('exposed nipple, slipped top');
    }
    if (g.kind === 'dress' && (vision.garment === 'bikini' || vision.garment === 'micro_bikini')) {
      pass = false; hints.push('dress, fabric covering torso'); negatives.push('bikini');
    }
  }
  if (spec.scene && vision.scene_ok === false) { pass = false; hints.push('in the described scene, matching background'); negatives.push('wrong background'); }
  if (vision.extra_people) { pass = false; hints.push('only one woman, no other people'); negatives.push('extra people, second person, man, crowd'); }
  return {
    pass,
    fix_hints: hints.join(', ').slice(0, 200),
    fix_negative: negatives.join(', ').slice(0, 120),
    vision,
  };
}
