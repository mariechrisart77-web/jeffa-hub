// v71: automatischer Bildcheck nach der Venice-Generierung.
// Schickt das fertige Bild + eine kompakte Erwartungsliste an ein Vision-Modell (LumiaRouter, OpenAI-kompatibel).
// Fehler dürfen den Bildpfad NIE brechen: jeder Fehler = "pass" mit check.error.
import { Env } from "./env";
import { trackUsage } from "./usage";
import { parseCheckJson as _p, applyFixes as _a, parseFocusJson, parseSpecVision } from "./imgsvc-checkparse.js";
export const parseCheckJson = _p as (text: string) => CheckVerdict | null;
export const applyFixes = _a as (prompt: string, negative: string, v: CheckVerdict) => { prompt: string; negative: string };
export const parseSpec = parseSpecVision as (text: string, spec: any, opts?: any) => any;

const LUMI_URL = "https://lumiarouter.com/v1/chat/completions";
const DEFAULT_MODEL = "gemma-4-uncensored";
const IN_USD_PER_M = 1;
const OUT_USD_PER_M = 5;

export interface CheckExpectation { bikini?: boolean; framing?: string; outfit?: string; pose?: string; scene?: string; intensity?: string }
export interface CheckVerdict {
  pass: boolean; face_in_frame?: boolean; micro_bikini?: boolean; tint_ok?: boolean; pose_ok?: boolean; scene_ok?: boolean;
  anatomy_ok?: boolean; fix_hints?: string; fix_negative?: string; error?: string;
}
export interface CheckResult {
  enabled: boolean; model: string; first?: CheckVerdict; retried: boolean; second?: CheckVerdict; costUsd: number; skipped?: string;
}

const SYSTEM = `You audit ONE generated image against a short expectation list. You have no tools. Do not narrate. Start your reply directly with { and answer with STRICT JSON only:
{"pass":true,"face_in_frame":true,"micro_bikini":true,"tint_ok":true,"pose_ok":true,"scene_ok":true,"anatomy_ok":true,"fix_hints":"","fix_negative":""}
Rules:
- pass = true only when framing, outfit, pose and scene are met and the anatomy is plausible.
- face_in_frame = the whole head/face is inside the image.
- micro_bikini = the outfit reads as a very small bikini (tiny triangles, string straps).
- tint_ok = if the expectation mentions tinted/smoke-grey latex, the fabric is tinted, not clear.
- pose_ok = the body position and level of boldness match the pose expectation.
- scene_ok = place/lighting match the scene expectation.
- anatomy_ok = no extra/missing limbs, no melted hands, no distorted body.
- fix_hints = max 20 words of English prompt hints that would fix the biggest miss (empty if pass).
- fix_negative = max 10 words English negative hints (empty if pass).
No prose, no markdown fences.`;

export function checkEnabled(body: any, env: Env): boolean {
  if (body && typeof body.autoCheck === "boolean") return body.autoCheck;
  return env.IMG_AUTOCHECK === "1";
}
export function checkModel(env: Env): string { return String(env.IMG_CHECK_MODEL || DEFAULT_MODEL); }

function expectationText(e: CheckExpectation): string {
  return [
    "EXPECTATIONS (one line each):",
    "framing: " + String(e.framing || "full body, whole head and face visible, looking at camera"),
    e.outfit && "outfit: " + e.outfit,
    e.pose && "pose: " + e.pose,
    e.scene && "scene: " + e.scene,
    e.intensity && "intensity (boldness): " + e.intensity,
    "The subject is an adult woman 18+. Judge only visual match, do not add new content.",
  ].filter(Boolean).join("\n").slice(0, 1200);
}

function costOf(usage: any): number {
  if (!usage || typeof usage !== "object") return 0;
  if (Number(usage.lumia_cost_usd) > 0) return Number(usage.lumia_cost_usd);
  const inTok = Number(usage.prompt_tokens || usage.input_tokens || 0) || 0;
  const outTok = Number(usage.completion_tokens || usage.output_tokens || 0) || 0;
  return (inTok / 1e6) * IN_USD_PER_M + (outTok / 1e6) * OUT_USD_PER_M;
}

/** Vision-Check; liefert immer ein Objekt (Fehler → pass:true + error) */
const VENICE_URL = "https://api.venice.ai/api/v1/chat/completions";
const FOCUS_SYSTEM = 'You audit ONE AI-generated image of an adult fictional character (18+) for a prompt-QA tool. Reply with STRICT JSON only, start with {: {"eyes_visible":bool,"top_of_head_visible":bool,"garment":"nude|bikini|micro_bikini|swimsuit|lingerie|dress|latex|other","top_worn":bool (true ONLY if a top covers BOTH nipples with fabric),"bottom_worn":bool,"nipples_covered":bool (answer explicitly: are BOTH nipples covered by fabric? if either nipple or areola is exposed by a slipped triangle, pulled-aside fabric or a see-through gap, false),"triangles":"tiny|small|medium|large|none","scene_ok":bool,"extra_people":bool}. If a top is expected, look at BOTH breasts and state explicitly whether each nipple is covered by fabric.';
const PRICES: Record<string, [number, number]> = { "gemma-4-uncensored": [0.1625, 0.5], "qwen3-vl-235b-a22b": [0.21, 1.9] };
export function checkModels(env: Env): string[] {
  return [String(env.IMG_CHECK_MODEL || "gemma-4-uncensored"), String((env as any).IMG_CHECK_FALLBACK || "qwen3-vl-235b-a22b")];
}
/** v72: Venice-Vision (antwortet auch bei expliziten Bildern). Leere/unlesbare Antwort → 2. Modell; erst dann fail-open. */
export async function runCheck(env: Env, dataUrl: string, exp: CheckExpectation): Promise<{ verdict: CheckVerdict; costUsd: number }> {
  const key = (env as any).VENICE_API_KEY;
  if (!key) return { verdict: { pass: true, error: "no_key" }, costUsd: 0 };
  let cost = 0; const tried: string[] = [];
  for (const model of checkModels(env)) {
    tried.push(model);
    try {
      const res = await fetch(VENICE_URL, {
        method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 200, temperature: 0, venice_parameters: { include_venice_system_prompt: false },
          messages: [{ role: "system", content: FOCUS_SYSTEM }, { role: "user", content: [
            { type: "text", text: `Expected scene: ${String(exp.scene || "any").slice(0, 200)}. Expected: whole face and head in frame${exp.bikini !== false ? ", micro bikini with tiny triangles, top worn" : ""}.` },
            { type: "image_url", image_url: { url: dataUrl } }] }] }),
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const u = data?.usage || {}; const pr = PRICES[model] || [0.5, 2];
      cost += ((u.prompt_tokens || 0) * pr[0] + (u.completion_tokens || 0) * pr[1]) / 1e6;
      const v: any = parseFocusJson(String(data?.choices?.[0]?.message?.content || ""), exp.bikini !== false);
      if (v) { v.model = model; return { verdict: v, costUsd: cost }; }
    } catch { /* nächstes Modell */ }
  }
  return { verdict: { pass: true, error: "no_answer:" + tried.join("+") } as any, costUsd: cost };
}

/** Cost-Log: trackUsage, wenn die Signatur passt, sonst console.log – Schlüssel werden nie geloggt. */
export async function logCheckUsage(env: Env, model: string, costUsd: number, inTok = 0, outTok = 0): Promise<void> {
  if (!(costUsd > 0)) return;
  try {
    if (typeof trackUsage === "function") {
      const r: any = trackUsage(env, "venice-vision", model, inTok, outTok, costUsd);
      if (r && typeof r.then === "function") await r;
      return;
    }
  } catch { /* fallthrough */ }
  console.log("imgcheck cost", model, costUsd.toFixed(6));
}

/** komplette Check-Stufe (erster Lauf). Gibt null zurück, wenn AutoCheck aus ist. */
export async function firstCheck(env: Env, body: any, dataUrl: string, exp: CheckExpectation): Promise<CheckResult | null> {
  if (!checkEnabled(body, env)) return null;
  const { verdict, costUsd } = await runCheck(env, dataUrl, exp);
  return { enabled: true, model: checkModel(env), first: verdict, retried: false, costUsd };
}

/** v74: Check mit einer checkSpec (garment/nude/scene/extra_people) und den nipples_covered-Regeln. */
export async function runCheckSpec(env: Env, dataUrl: string, spec: any): Promise<{ verdict: any; costUsd: number; model: string }> {
  const key = (env as any).VENICE_API_KEY;
  if (!key) return { verdict: { pass: true, error: "no_key" }, costUsd: 0, model: checkModel(env) };
  let cost = 0; const tried: string[] = [];
  const userText = `Expected garment: ${spec?.garment?.kind || "any"}${spec?.nudeExpected ? " (nude)" : ""}. ${spec?.garment?.topRequired ? "A top MUST cover both nipples." : ""} Expected scene: ${String(spec?.scene || "any").slice(0, 200)}.`;
  for (const model of checkModels(env)) {
    tried.push(model);
    try {
      const res = await fetch(VENICE_URL, {
        method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 200, temperature: 0, venice_parameters: { include_venice_system_prompt: false },
          messages: [{ role: "system", content: FOCUS_SYSTEM }, { role: "user", content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: dataUrl } }] }] }),
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const u = data?.usage || {}; const pr = PRICES[model] || [0.5, 2];
      cost += ((u.prompt_tokens || 0) * pr[0] + (u.completion_tokens || 0) * pr[1]) / 1e6;
      const v: any = parseSpecVision(String(data?.choices?.[0]?.message?.content || ""), spec, { sheerOk: (env as any).CHECK_SHEER_OK === "1" });
      if (v) { v.model = model; return { verdict: v, costUsd: cost, model }; }
    } catch { /* nächstes Modell */ }
  }
  return { verdict: { pass: true, error: "no_answer:" + tried.join("+") }, costUsd: cost, model: checkModel(env) };
}

