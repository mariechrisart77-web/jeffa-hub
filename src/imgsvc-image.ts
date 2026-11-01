// Server-side prompt from the synced profile (spec r5) – single path for chat, Bild-App and 'jeffa:image'.
import { storeGenerated } from "./r2img.js";
import { sizeParamsFor } from "./venice-size.js";
import { trackUsage } from "./usage";
import { Env } from "./env";
import { requireRole, AuthError } from "./auth";
import { complete } from "./providers";
import {
  buildImagePlan, buildEditPrompt, shortModel, COMPOSER_JSON_SYSTEM, modelLabel, scrubYouth, normRefMode,
} from "./imgsvc";
import { refLook } from "./reflook";
import { classifyVerdict } from "./imgsvc-checkparse.js";
import { checkEnabled, checkModel, runCheck, runCheckSpec, applyFixes, logCheckUsage } from "./imgsvc-check";
import { loadSyncedProfile, loadCard, getCorrections, loadRefMode, loadStarRef } from "./imgsvc-db";
import { enforceImageMode } from "./mode-server.js";
import { validComposerModel } from "./model-allow.js";
import { normalizeMix, mixBackgroundPrompt, mixBackgroundNegative, mixPersonPrompt } from "./imgsvc-mix.js";
import { runwareTask, parseRunwareImage, RUNWARE_MODEL } from "./runware.js";

const PID = /^[A-Za-z0-9_-]{1,64}$/;
const j = (s: number, o: unknown) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const b64 = (buf: Uint8Array) => { let s = ""; for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000)); return btoa(s); };

interface NewBody {
  profile: string; conversationId?: string; profileData?: { profile?: any; resolved?: any };
  context?: { scene?: string; summary?: string; messages?: { role: string; content: string; generated?: boolean }[]; story?: any; camera?: string };
  style?: string; adult?: boolean; quality?: string; seed?: number; seedMode?: string;
  photoOverride?: Record<string, string>; camera?: string; dryRun?: boolean; saveStory?: boolean;
  preview?: boolean;
  mode?: string;
  composerModel?: string;
  mix?: { bg?: string; fg?: string };
}

const STORY_TTL = 30 * 24 * 3600;
function storyKvKey(pid: string, cid: string) { return `story:${pid}:${cid || 'default'}`; }

export async function imageNewMode(ctx: EventContext<Env, any, any>, env: Env, body: NewBody): Promise<Response> {
  if (body?.dryRun !== true && typeof body?.profile !== "string") return j(400, { error: "bad_input" });

  const noAuth = env.IMG_DRYRUN_NOAUTH === "1" && body?.dryRun === true && body?.profileData && typeof body.profileData === "object";
  let isAdmin = false, canRead = false;
  if (!noAuth) {
    try {
      await requireRole(ctx as any, "read"); canRead = true;
      try { await requireRole(ctx as any, "admin"); isAdmin = true; } catch {}
    } catch (e) { if (e instanceof AuthError) return j(e.status, { error: e.code }); throw e; }
  } else { isAdmin = true; canRead = true; }

  body = enforceImageMode(body);
  if (body.profile && !PID.test(String(body.profile))) return j(400, { error: "bad_input" });
  const pid = String(body.profile || (noAuth ? String(body.profileData?.profile?.id || "local") : ""));

  let profile: any, resolved: any, card: any = null, corrections: any = {};
  if (noAuth) {
    profile = body.profileData!.profile || {};
    resolved = { ...(body.profileData!.resolved || {}), photo: { ...((body.profileData!.resolved || {}).photo || {}), ...(profile.photo || {}) } };
  } else {
    const sp = await loadSyncedProfile(env, pid);
    if (!sp) return j(404, { error: "profile_not_synced" });
    profile = sp.profile || {}; resolved = sp.resolved || {};
    [card, corrections] = await Promise.all([loadCard(env, pid), getCorrections(env, pid)]);
  }

  const key = env.VENICE_API_KEY;
  const preview = body.preview === true;
  const dryRun = preview || body.dryRun === true;
  const wantImage = !dryRun;
  const rwKey = env.RUNWARE_API_KEY;
  if (wantImage && !key && !rwKey) return j(503, { error: "not_configured" });

  // story state from KV (unless dryRun without saveStory)
  const cid = String(body.conversationId || "default");
  let prevStory: any = null;
  const mayUseKv = !!env.KV && (body.dryRun !== true || body.saveStory === true);
  if (mayUseKv) { try { const s = await env.KV!.get(storyKvKey(pid, cid)); if (s) prevStory = JSON.parse(s); } catch {} }
  if (!prevStory && body.context?.story && typeof body.context.story === "object") prevStory = body.context.story;

  // Composer-LLM (striktes JSON); bei Fehler/Verweigerung → Regel-Composer im Plan
  const hasLLM = !(noAuth && env.IMG_DRYRUN_LLM !== "1");
  const composeLLM = hasLLM ? async (system: string, input: string) => {
    const def = body.adult === true ? "venice-uncensored-1-2" : (env.DEFAULT_MODEL || "gemini-3.5-flash-lite");
    const want = validComposerModel(body.composerModel);
    const models = want ? [want, def] : [def];
    let lastErr: any = null;
    for (const m of models) {
      try {
        const r: any = await complete(env, { model: m, maxTokens: 500, private: true, system, messages: [{ role: "user", content: input }] } as any);
        const reply = String(r?.reply || "");
        if (reply.trim()) return reply;
      } catch (e) { lastErr = e; console.error("composer llm failed", m); }
    }
    if (lastErr) throw lastErr;
    return "";
  } : null;
  void COMPOSER_JSON_SYSTEM;

  const plan = await buildImagePlan({ profile, resolved, card, corrections, body: { ...body, profile: pid }, prevStory, composeLLM });
  // v68: kein Prompt-Cache mehr – jede Szene wird neu geplant

  if ("error" in plan) {
    const e = (plan as any).error;
    const msg = e.message || (e.code === "not_adult" ? "Profil muss eindeutig erwachsen sein (18+)" : undefined);
    return j(e.status || 400, e.code === "not_adult" ? { error: "not_adult", message: msg } : { error: e.code || "bad_request" });
  }

  const P: any = plan;
  const saveStory = !dryRun || body.saveStory === true;
  if (env.KV && saveStory && P.story) { try { await env.KV.put(storyKvKey(pid, cid), JSON.stringify({ ...P.story, updatedAt: Date.now() }), { expirationTtl: STORY_TTL }); } catch {} }

  const route: any = P.route;
  const prompt = scrubYouth(P.prompt), negative = scrubYouth(P.negative);
  // v85a: Bild-Mix (Hintergrund + Person getrennt) – nur wenn gewählt, kein Nachschliff, keine Comic-Seite
  const mix = body.style !== 'comicpage' ? normalizeMix(body.mix, body.adult === true) : null;
  const male = /^\s*adult man\b/i.test(String((P as any).identity || ''));
  const identity = String((P as any).identity || '');
  const sceneTxt = String((P as any).parts?.scene || (P as any).parts?.background || "");
  const mixBgPrompt = mix ? scrubYouth(mixBackgroundPrompt({ background: (P as any).parts?.background, scene: (P as any).parts?.scene, lighting: (P as any).parts?.lighting, camera: (P as any).parts?.camera }, P.style)) : "";
  const mixFgPrompt = mix ? scrubYouth(mixPersonPrompt({ parts: (P as any).parts || {}, identity, male })) : "";

  if (dryRun) {
    const common: any = {
      dryRun: true, preview, prompt, negative, parts: P.parts, story: P.story, seed: P.seed,
      model: route.model, label: modelLabel(P.quality, body.adult === true), route: route.model, q: route.q,
      composer: P.composer, adult: body.adult === true, style: P.style, quality: P.quality,
      abgleich: P.abgleich || [], image: null, refMode: "off",
    };
    if (mix) common.mix = { bg: mix.bg, fg: mix.fg, cost: mix.cost, bgPrompt: mixBgPrompt, fgPrompt: mixFgPrompt };
    if (preview) {
      common.checkSpec = (P as any).checkSpec || null;
      common.notes = (P as any).abgleich || [];
      common.identity = (P as any).identity || "";
      common.garment = (P as any).garment || null;
      common.preview = true;
    }
    return j(200, common);
  }

  let finalPrompt = prompt, lookUsed = "";
  try {
    const sm = isAdmin ? await loadRefMode(env, pid, null) : null;
    const refMode = normRefMode(sm || (profile.refFace ? (profile.refMode === "full" || profile.refMode === "figur" ? "figur" : "face") : "off"));
    if (isAdmin && (refMode === "face" || refMode === "figur")) {
      const ref = await loadStarRef(env, pid);
      if (ref) { const lk = await refLook(env, ref, refMode === "figur"); if (lk) { lookUsed = lk; finalPrompt = `${finalPrompt}. Same woman every time, her appearance: ${lk}`; } }
    }
  } catch (e) { console.error("ref look failed", e); }

  // guard: reference look must not add weight syntax or extra people
  finalPrompt = finalPrompt.replace(/\(([^()]*?)\s*:\s*\d+(?:\.\d+)?\s*\)/g, "$1");

  const genRunware = async (p: string, seed: number = P.seed, neg: string = negative) => {
    if (!rwKey) throw new Error("runware no key");
    let task: any[];
    try {
      task = runwareTask({ prompt: p, negative: neg, width: 1024, height: 1024, seed, adult: body.adult === true, uuid: crypto.randomUUID() });
    } catch (e: any) { throw new Error("runware task: " + String(e?.message || e).slice(0, 120)); }
    const res = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: { authorization: `Bearer ${rwKey}`, "content-type": "application/json" },
      body: JSON.stringify(task),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { const t = (await res.text()).slice(0, 120); console.error("runware", res.status); throw new Error(`runware ${res.status}: ${t}`); }
    const json: any = await res.json();
    const r = parseRunwareImage(json);
    if (r.nsfw && body.adult !== true) throw new Error("runware nsfw");
    return r.b64;
  };
  const genAny = async (model: string, p: string, steps?: number, seed: number = P.seed, neg: string = negative) => {
    // v85: Runware-Modell gewählt ODER kein Venice-Key (aber Runware-Key) → Runware
    return model.startsWith("runware:") || (!key && rwKey) ? genRunware(p, seed, neg) : genOne(model, p, steps, seed, neg);
  };
  const genOne = async (model: string, p: string, steps?: number, seed: number = P.seed, neg: string = negative) => {
    const chroma = model === "chroma";
    const res = await fetch("https://api.venice.ai/api/v1/image/generate", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: p.slice(0, chroma ? 3000 : 1500), negative_prompt: neg.slice(0, 800), seed, hide_watermark: true, ...sizeParamsFor(model, chroma ? 768 : 1024, 1024), format: "webp", safe_mode: !body.adult, ...(model.startsWith("lustify") ? { steps: steps || 30, cfg_scale: 5 } : {}) }),
    });
    if (!res.ok) { const t = (await res.text()).slice(0, 200); console.error("venice gen", res.status, t); throw new Error(`gen ${res.status}: ${t}`); }
    const d: any = await res.json(); const im = d.images?.[0];
    if (!im) throw new Error("no image");
    return typeof im === "string" && im.startsWith("data:") ? im.split(",")[1] : String(im);
  };
  const editOne = async (img: string, model: string, promptText?: string) => {
    const res = await fetch("https://api.venice.ai/api/v1/image/edit", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, image: img, prompt: String(promptText != null ? promptText : buildEditPrompt(prompt, false)).slice(0, 1400), output_format: "webp", safe_mode: !body.adult }),
    });
    if (!res.ok) throw new Error(`edit ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return b64(new Uint8Array(await res.arrayBuffer()));
  };
  const out = async (dataB64: string, model: string, cost: number, extra: Record<string, unknown> = {}) => {
    await trackUsage(env, model.startsWith("runware") ? "runware" : "venice-image", model, 0, 0, cost);
    const r2 = await storeGenerated(env, dataB64, { profile: pid, model });
    return j(200, {
      dataUrl: `data:image/webp;base64,${dataB64}`, url: r2?.url, model, cost, seed: P.seed,
      prompt, negative, composer: P.composer, story: P.story, parts: P.parts,
      refMode: lookUsed ? "face" : "off", conflicts: P.conflicts, abgleich: P.abgleich || [], ...extra,
    });
  };

  try {
    if (mix && !route.edit) {
      try {
        const bgImg = await genAny(mix.bg, mixBgPrompt, undefined, P.seed, mixBackgroundNegative());
        const fgText = mixFgPrompt + (lookUsed ? " Appearance: " + lookUsed : "");
        const img = await editOne(bgImg, mix.fg, scrubYouth(fgText));
        return await out(img, `mix ${mix.bg} + ${mix.fg}`, mix.cost, { mix: { bg: mix.bg, fg: mix.fg } });
      } catch (e: any) { console.error("mix failed", String(e?.message || e).slice(0, 160)); }
    }
    if (route.edit) {
      const base = await genAny(route.edit.base, finalPrompt);
      try { return await out(await editOne(base, route.edit.model), `${route.edit.base} + ${route.edit.model}`, route.cost); }
      catch (e) { console.error("refine failed", e); return await out(base, route.edit.base, 0.01); }
    }
    if (route.mix) {
      const base = await genAny(route.model, finalPrompt);
      try { return await out(await editOne(base, "qwen-image-2-1-turbo-edit"), "mix", route.cost); }
      catch { return await out(base, route.model, 0.01); }
    }
    const data = await genAny(route.model, finalPrompt, route.steps);
    // v71: automatischer Bildcheck (Claude-Vision via LumiaRouter), bei Fehlschlag 1× neu mit neuem Seed + Korrektur-Hinweisen
    if (checkEnabled(body, env)) {
      const pp: any = P.parts || {};
      const spec = (P as any).checkSpec || null;
      // v74: zwei Wege – mit checkSpec (Garment-aware) oder Fallback-Erwartung
      const runOnce = spec
        ? (d: string) => runCheckSpec(env, d, spec)
        : (d: string) => runCheck(env, d, { framing: "full body, entire face and head in frame", outfit: String(pp.outfit || "").slice(0, 500), pose: String(pp.pose || "").slice(0, 300), scene: [pp.scene, pp.background].filter(Boolean).join(", ").slice(0, 300), intensity: String(P.intensity || ""), bikini: !!(P as any).bikiniActive });
      const c1: any = await runOnce(`data:image/webp;base64,${data}`);
      const check: any = { enabled: true, model: (c1.verdict as any).model || checkModel(env), first: c1.verdict, retried: false, costUsd: c1.costUsd, chosen: 'first' };
      // v78: Retry nur bei harten Fehlern; Gründe kategorisiert und geloggt
      const cls = classifyVerdict(c1.verdict); check.reasons = cls.reasons; check.hard = cls.hard;
      if (cls.reasons.length) console.log("imgcheck reasons", cls.hard ? "retry" : "no-retry", cls.reasons.join(","));
      if (!c1.verdict.pass && !c1.verdict.error && cls.hard) {
        const fx = applyFixes(finalPrompt, negative, c1.verdict);
        const seed2 = 1 + Math.floor(Math.random() * 999999998);
        try {
          const data2 = await genAny(route.model, fx.prompt, route.steps, seed2, fx.negative);
          const c2: any = await runOnce(`data:image/webp;base64,${data2}`);
          check.retried = true; check.second = c2.verdict; check.costUsd += c2.costUsd; check.firstSeed = P.seed;
          await logCheckUsage(env, check.model, check.costUsd);
          // v75 (d.2): zweiter Check wieder fehlgeschlagen UND erster hatte Gesicht im Bild, zweiter nicht → der ERSTE ist besser
          const firstFace = c1.verdict && c1.verdict.face_in_frame === true;
          const secondFace = c2.verdict && c2.verdict.face_in_frame === true;
          const secondPass = c2.verdict && c2.verdict.pass === true;
          if (!secondPass && firstFace && secondFace === false) {
            check.chosen = 'first';
            return await out(data, shortModel(route.model, route.label), route.cost, { check });
          }
          check.chosen = 'second';
          return await out(data2, shortModel(route.model, route.label), route.cost * 2, { check, seed: seed2, prompt: fx.prompt, negative: fx.negative });
        } catch (e: any) { console.error("check retry failed", e); check.retryError = String(e?.message || e).slice(0, 160); }
      }
      await logCheckUsage(env, check.model, check.costUsd);
      return await out(data, shortModel(route.model, route.label), route.cost, { check });
    }
    return await out(data, shortModel(route.model, route.label), route.cost);
  } catch (e: any) {
    const t = String(e?.message || "");
    if (rwKey && /402|insufficient|balance/i.test(t)) {
      // v85a: Venice leer → EIN Ersatzversuch über Runware (nur wenn Key im Tresor/Env)
      try {
        const img = await genRunware(finalPrompt, P.seed, negative);
        return await out(img, `${RUNWARE_MODEL} (Ersatz – Venice leer)`, 0.002, { fallback: "runware", warning: `Venice fehlgeschlagen: kein Guthaben (${t.slice(0, 80)}) – Ersatz Runware benutzt` });
      } catch (e2: any) {
        const t2 = String(e2?.message || e2).slice(0, 160); console.error("runware fallback failed", t2);
        return j(502, { error: { code: "all_providers_failed", message: `Alle Anbieter fehlgeschlagen – Venice: kein Guthaben (${t.slice(0, 80)}); Ersatz Runware: ${t2}` } });
      }
    }
    if (/runware no key/.test(t)) return j(503, { error: { code: "runware_no_key", message: "Runware-Key fehlt – bitte im Tresor hinterlegen oder andere Qualität wählen" } });
    if (/402|insufficient|balance/i.test(t)) return j(402, { error: { code: "venice_no_credit", message: "Venice-Guthaben leer – bitte auf venice.ai aufladen" } });
    console.error("new-mode image failed", e);
    return j(502, { error: { code: "generation_failed", message: `Bild fehlgeschlagen (Venice): ${t.slice(0, 160) || "unbekannter Fehler"}` } });
  }
}
