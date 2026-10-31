// v71: reine Helfer für den Bildcheck (node-testbar)
/** striktes JSON aus einer Modellantwort ziehen – dynamisch tolerant (Code-Fences, Prosa drumherum) */
export function parseCheckJson(text) {
  const t = String(text || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  const candidates = [];
  if (a >= 0 && b > a) candidates.push(t.slice(a, b + 1));
  candidates.push(t.trim());
  for (const c of candidates) {
    try {
      const o = JSON.parse(c);
      if (!o || typeof o !== "object" || Array.isArray(o)) continue;
      const v = {
        pass: o.pass === true,
        face_in_frame: o.face_in_frame === true,
        micro_bikini: o.micro_bikini === true,
        tint_ok: o.tint_ok === true,
        pose_ok: o.pose_ok === true,
        scene_ok: o.scene_ok === true,
        anatomy_ok: o.anatomy_ok === true,
        fix_hints: typeof o.fix_hints === "string" ? o.fix_hints.slice(0, 200) : "",
        fix_negative: typeof o.fix_negative === "string" ? o.fix_negative.slice(0, 120) : "",
      };
      if (!("pass" in o)) v.pass = !!(v.face_in_frame && v.micro_bikini && v.tint_ok && v.pose_ok && v.scene_ok && v.anatomy_ok);
      return v;
    } catch { /* nächster Kandidat */ }
  }
  return null;
}

/** v75: fix_hints NACH das Framing-Block einfügen, dedupliziert, nie doppelt gestapelt.
 *  Framing bleibt immer ERSTE Section. Face/Head-Hints schlagen Outfit-Hints (Kopf im Bild).
 *  v75-Fix: der Ergebnis-Prompt beginnt IMMER mit "full body shot, entire face and head in frame"
 *  (auch wenn das Framing im Original fehlt oder verkürzt ist) – genau EIN Mal.
 */
const FRAME_PHRASE = 'full body shot, entire face and head in frame';
export function applyFixes(prompt, negative, v) {
  const p0 = String(prompt || '').trim();
  const hints = String((v && v.fix_hints) || '').split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  const negAdd = String((v && v.fix_negative) || '').trim();
  // 1. Framing-Block erkennen: mit/ohne "Framing:"-Label, oder nur prose die mit "full body shot" beginnt
  let framingBlock = '';
  let rest = p0;
  const tryRx = [
    /^(Framing:\s*[^.]*\.\s*)/i,
    /^((?:full body shot|entire face and head in frame)[^.]*\.\s*)/i,
    /^([^.]*?(?:full body shot|entire face and head in frame)[^.]*\.\s*)/i,
  ];
  for (const rx of tryRx) {
    const m = p0.match(rx);
    if (m) { framingBlock = m[1]; rest = p0.slice(framingBlock.length); break; }
  }
  // 2. Framing normalisieren: "full body shot, entire face and head in frame" steht IMMER vorne
  const framingNorm = `Framing: ${FRAME_PHRASE}, looking at camera. `;
  const hasClose = /close-?up|portrait|nahaufnahme/i.test(framingBlock);
  const finalFraming = hasClose ? framingNorm.replace('looking at camera.', `looking at camera, ${framingBlock.replace(/^Framing:\s*/i, '').replace(/\.\s*$/, '')}.`.replace(', ,', ',')) : framingNorm;
  // 3. Hints deduplizieren und priorisieren: Face/Head → Outfit → andere
  const seen = new Set();
  const promptLow = (framingBlock + rest).toLowerCase();
  const uniq = [];
  for (const h of hints) {
    const k = h.toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    // Face/Head-Phrase ist bereits im Framing → nicht doppelt einfügen
    if (/full body shot|entire face and head in frame/.test(k) && FRAME_PHRASE.includes(h.toLowerCase().slice(0, 25))) {
      // nur dann überspringen, wenn sie bereits im Framing steht
      if (promptLow.includes('full body shot, entire face and head in frame')) continue;
    }
    if (promptLow.includes(k)) continue;
    uniq.push(h);
  }
  const faceHints = uniq.filter((h) => /frame|head|face|crop/i.test(h));
  const outfitHints = uniq.filter((h) => /worn|triangles|nipples|\btop\b|dress|bikini|outfit/i.test(h) && !faceHints.includes(h));
  const otherHints = uniq.filter((h) => !faceHints.includes(h) && !outfitHints.includes(h));
  const ordered = [...faceHints, ...outfitHints, ...otherHints];
  // 4. Zwischen Framing und Rest einfügen (kein Stacking, kein Duplikat)
  const merged = (finalFraming + (ordered.length ? ordered.join(', ') + '. ' : '') + rest).replace(/\.\s*\./g, '.').trim();
  // 5. Garantie: Prompt beginnt mit FRAME_PHRASE (case-sensitiv, kleingeschrieben wie im Original)
  let outPrompt = merged;
  if (!/^(Framing:\s*)?full body shot/i.test(outPrompt)) {
    outPrompt = (FRAME_PHRASE + (outPrompt ? '. ' + outPrompt : '')).slice(0, 2000);
  }
  return {
    prompt: outPrompt.slice(0, 2000),
    negative: [String(negative || ''), negAdd].filter(Boolean).join(', ').slice(0, 1200),
  };
}


// v72: fokussierter Check (nur Bildausschnitt, Kleidungstyp/Dreiecksgröße, Szene) – Hinweise werden lokal abgeleitet.
export function parseFocusJson(text, bikiniActive = true) {
  const t = String(text || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let o; try { o = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  const garment = String(o.garment || "other").toLowerCase();
  const tri = String(o.triangles || "none").toLowerCase();
  const face = o.eyes_visible === true && o.top_of_head_visible === true;
  const topWorn = o.top_worn !== false;
  const nipplesCovered = o.nipples_covered !== false; // v74: displaced top = fail
  const bikini = !bikiniActive || ((garment === "micro_bikini" || garment === "bikini") && (tri === "tiny" || tri === "small") && topWorn && nipplesCovered);
  const scene = o.scene_ok !== false;
  const hints = [], neg = [];
  if (!face) { hints.push("full body shot, entire face and head in frame"); neg.push("cropped head, cut off face, out of frame"); }
  if (!bikini) {
    hints.push(topWorn ? "micro string bikini with minuscule triangles" : "bikini top worn, both triangles on");
    if (!topWorn) neg.push("topless, bare breasts, nude");
    else if (!nipplesCovered) neg.push("exposed nipple, slipped top");
    if (garment === "one_piece" || garment === "bodysuit") neg.push("one-piece, bodysuit, swimsuit, long sleeves");
    else if (garment === "nude") neg.push("nude, topless");
    else neg.push("large bikini, wide triangles, full coverage");
  }
  if (!scene) hints.push("in the described scene");
  return { pass: face && bikini && scene, face_in_frame: face, micro_bikini: bikini, scene_ok: scene, garment, triangles: tri, top_worn: topWorn,
    nipples_covered: nipplesCovered, fix_hints: hints.join(", "), fix_negative: neg.join(", ") };
}

/** v74: aus checkSpec + parseFocusJson-artiger Vision-Antwort ein Verdikt ableiten. */
export function parseSpecVision(text, spec, opts = {}) {
  const t = String(text || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let o; try { o = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  const allowed = new Set(["nude","bikini","micro_bikini","swimsuit","lingerie","dress","latex","other"]);
  const g = String(o.garment || "other").toLowerCase();
  const vision = {
    eyes_visible: o.eyes_visible === true,
    top_of_head_visible: o.top_of_head_visible === true,
    garment: allowed.has(g) ? g : "other",
    top_worn: o.top_worn === true,
    bottom_worn: o.bottom_worn === true,
    nipples_covered: o.nipples_covered !== false,
    scene_ok: o.scene_ok !== false,
    extra_people: o.extra_people === true,
  };
  const hints = [], neg = [];
  let pass = true;
  if (spec?.framing !== "close_up" && !(vision.eyes_visible && vision.top_of_head_visible)) {
    pass = false; hints.push("full body shot, entire face and head in frame"); neg.push("cropped head, cut off face, out of frame");
  }
  const gs = spec?.garment;
  if (gs && gs.kind && gs.kind !== "other") {
    if (spec.nudeExpected && vision.garment !== "nude") { pass = false; hints.push("nude, no clothes"); neg.push("clothes, dressed"); }
    if (!spec.nudeExpected && vision.garment === "nude") { pass = false; hints.push("wearing the " + gs.label); neg.push("nude, topless"); }
    // v78: CHECK_SHEER_OK (Standard aus): transparentes/sheer Top zählt als getragen
    const sheerTop = opts.sheerOk === true && /\b(sheer|see-?through|transparent|mesh|latex)\b/i.test(`${gs.label || ''} ${gs.desc || ''} ${spec?.outfit || ''}`);
    if (gs.topRequired && vision.top_worn !== true && !sheerTop) { pass = false; hints.push("top worn, both triangles on"); neg.push("topless, bare breasts, nude"); }
    if (gs.topRequired && vision.top_worn === true && !vision.nipples_covered) { pass = false; hints.push("top worn properly, both nipples covered"); neg.push("exposed nipple, slipped top"); }
  }
  if (spec?.scene && vision.scene_ok === false) { pass = false; hints.push("in the described scene"); neg.push("wrong background"); }
  if (vision.extra_people) { pass = false; hints.push("only one woman, no other people"); neg.push("extra people, second person, man, crowd"); }
  return { pass, face_in_frame: vision.eyes_visible && vision.top_of_head_visible, micro_bikini: gs?.kind === "micro_bikini" && vision.garment === "micro_bikini" && vision.top_worn,
    garment: vision.garment, top_worn: vision.top_worn, scene_ok: vision.scene_ok, fix_hints: hints.join(", "), fix_negative: neg.join(", "), vision };
}

/** v78: Fehlgründe kategorisieren. hard = Retry lohnt (falsche Person, Minderjährig-Risiko, falsche Szene, Gesicht fehlt). */
export const HARD_REASONS = ['minor', 'person', 'scene', 'framing'];
export function classifyVerdict(v) {
  const reasons = [];
  if (!v || v.error || v.pass === true) return { reasons, hard: false };
  const vi = v.vision || {};
  if (v.minor_risk === true || vi.minor_risk === true) reasons.push('minor');
  if (vi.extra_people === true || v.extra_people === true || v.wrong_person === true) reasons.push('person');
  if (v.scene_ok === false) reasons.push('scene');
  if (v.face_in_frame === false) reasons.push('framing');
  if (v.top_worn === false || vi.nipples_covered === false || (!v.vision && v.micro_bikini === false) || /nude|wearing the|top worn/i.test(String(v.fix_hints || ''))) reasons.push('garment');
  if (v.tint_ok === false) reasons.push('tint');
  if (v.pose_ok === false) reasons.push('pose');
  if (v.anatomy_ok === false) reasons.push('anatomy');
  const uniq = [...new Set(reasons)];
  return { reasons: uniq, hard: uniq.some((r) => HARD_REASONS.includes(r)) };
}
