import { withKeys } from "../keys";
import { Env } from "../env";
import { checkRateLimit } from "../ratelimit";
import { requireRole } from "../auth";
import { imageNewMode } from "../imgsvc-image";
import { refLook } from "../reflook";
import { loadStarRef } from "../imgsvc-db";
import { trackUsage } from "../usage";
// @ts-ignore plain JS helper
import { storeGenerated } from "../r2img.js";

interface ImageBody {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  safe_mode?: boolean;
  adult?: boolean;
  style?: string;
  quality?: string;
  scene?: string;
  person?: string;
  ref_profile?: string;
  negative?: string;
  seed?: number;
  ref_mode?: string;
}

export async function handleImage(ctx: EventContext<Env, any, any>): Promise<Response> {
  const context = { ...ctx, env: await withKeys(ctx.env) };
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  const body: ImageBody = await context.request.json();
  // Prompt- & Bild-Dienst (spec r5): {profile, context} -> server builds the prompt (single path for chat + Bild-App).
  if ((body as any).profile) return imageNewMode(ctx, context.env, body as any);
  const { prompt } = body;
  // v68: freier Prompt für alle erlaubt (Christian), 21+-Schutz bleibt auf diesem Weg aktiv
  if (prompt) {
    const { minorRisk, youthRisk } = await import("../imgsvc");
    let minor = youthRisk(String(prompt));
    const pid = String((body as any).ref_profile || "");
    if (!minor && pid && body.adult === true) { try { const { loadSyncedProfile } = await import("../imgsvc-db"); const sp = await loadSyncedProfile(context.env, pid); if (sp) minor = minorRisk(sp.profile || {}, sp.resolved || {}); } catch (e) { console.error("profile load failed", e); } }
    if (minor) return new Response(JSON.stringify({ error: "not_adult", message: "Profil muss eindeutig erwachsen sein (21+)" }), { status: 403, headers: { "content-type": "application/json" } });
  }
  const safeMode = body.adult === true ? false : body.safe_mode !== false;
  const comicStyle = ["comic", "comicpage", "manhwa"].includes(String(body.style));
  // FSK18 photo mode, ported from Nachtfalter: Venice chroma (uncensored, $0.01, default steps) at 768x1024 (Nachtfalter "mittel"; Venice max 1280).
  const lustify = !safeMode && !comicStyle && !body.model;
  const full = body.ref_mode === "full" || body.ref_mode === "figur"; // v35: figur = face + hair + body type
  const editRef = body.ref_mode === "edit"; // v36: only an explicit edit mode uses /image/edit
  const width = body.width && body.width >= 256 && body.width <= 2048 ? body.width : lustify ? 768 : 1024;
  const height = body.height && body.height >= 256 && body.height <= 2048 ? body.height : lustify ? 1024 : 1024;

  if (!prompt || typeof prompt !== "string" || prompt.length > 2000) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "prompt erforderlich, max 2000 Zeichen" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (context.env.VENICE_API_KEY) {
    const key = context.env.VENICE_API_KEY;
    const comic = ["comic", "comicpage", "manhwa"].includes(String(body.style));
    const gen = async (model: string, p: string, neg: string, steps?: number) => {
      const res = await fetch("https://api.venice.ai/api/v1/image/generate", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, prompt: p.slice(0, model === "chroma" ? 3000 : 1500), negative_prompt: neg, ...(seed != null ? { seed } : {}), hide_watermark: true, width, height, format: "webp", ...(model.startsWith("lustify") ? { steps: steps || 30, cfg_scale: 5 } : {}), ...(safeMode ? { safe_mode: true } : { safe_mode: false }) }),
      });
      if (!res.ok) throw new Error(`Venice API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data: any = await res.json();
      const image = data.images?.[0];
      if (!image) throw new Error("Kein Bild in Antwort");
      return typeof image === "string" && image.startsWith("data:") ? image.split(",")[1] : String(image);
    };
    const seed = Number.isInteger(body.seed) && body.seed! >= 0 && body.seed! < 2147483647 ? body.seed! % 999999999 : undefined;
    const NEG0 = "text, letters, words, speech bubbles, captions, watermark, logo, signature, deformed hands";
    const NEG = typeof body.negative === "string" && body.negative.trim() ? body.negative.slice(0, 800) : NEG0;
    const ok = async (b64: string, model: string, cost: number) => { 
      await trackUsage(context.env, "venice-image", model, 0, 0, cost);
      const r2 = await storeGenerated(context.env, b64, { profile: typeof (body as any).profileId === "string" ? (body as any).profileId : "", model }); 
      return new Response(JSON.stringify({ dataUrl: `data:image/webp;base64,${b64}`, url: r2?.url, model, cost, seed }), { headers: { "content-type": "application/json; charset=utf-8" } }); 
    };
    try {
      // v54 Bildqualität variants (prices verified via Venice /models, 30.10.2026)
      const q = String(body.quality || "single");
      const editPass = async (img: string, editModel: string, p: string) => {
        const res = await fetch("https://api.venice.ai/api/v1/image/edit", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({ model: editModel, image: img, prompt: p.slice(0, 1400), output_format: "webp", safe_mode: safeMode }) });
        if (!res.ok) throw new Error(`edit ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const buf = new Uint8Array(await res.arrayBuffer()); let bin = ""; for (let k = 0; k < buf.length; k += 0x8000) bin += String.fromCharCode(...buf.subarray(k, k + 0x8000)); return btoa(bin);
      };
      if (body.style !== "comicpage" && !body.ref_profile && ["lustify", "hq", "krea", "refine", "refine-firered"].includes(q)) {
        if (q === "lustify" && !safeMode) return ok(await gen("lustify-v8", prompt, NEG), "lustify-v8", 0.01);
        if (q === "hq") return safeMode ? ok(await gen("qwen-image-3", prompt, NEG), "qwen-image-3 (HQ)", 0.04) : ok(await gen("lustify-v8", prompt, NEG, 50), "lustify-v8 (HQ, 50 Schritte)", 0.01);
        if (q === "krea" && safeMode) return ok(await gen("krea-v2-large", prompt, NEG), "krea-v2-large (Premium)", 0.07);
        if (q === "refine" || q === "refine-firered") {
          const base = !safeMode ? "chroma" : "z-image-turbo";
          const img = await gen(base, prompt, NEG);
          const em = q === "refine-firered" ? "firered-image-edit" : safeMode ? "qwen-image-2-1-pro-edit" : "qwen-edit-uncensored";
          const ec = q === "refine-firered" || !safeMode ? 0.04 : 0.05;
          try { return ok(await editPass(img, em, "Refine this photo: more realistic natural skin texture, better lighting and detail. Keep composition, the person, pose, clothing and background exactly the same. No text."), `${base} + ${em} (Nachschliff)`, 0.01 + ec); }
          catch (e) { console.error("refine failed", e); return ok(img, `${base} (Nachschliff fehlgeschlagen)`, 0.01); }
        }
      }
      const model = !safeMode ? "chroma" /* v46 AP5: FSK18 always chroma */ : (body.model && ["qwen-image-2-1-turbo", "qwen-image-3", "chroma", "z-image-turbo"].includes(body.model) ? body.model : "") || (lustify ? "chroma" : comic && !safeMode ? "qwen-image-2-1-turbo" : "z-image-turbo");
      const cost = model === "qwen-image-3" ? 0.04 : model === "qwen-image-2-1-turbo" ? 0.02 : 0.01;
      let refAppend = "";
      // Face reference (admin/unlocked only): the active "Gesicht" image of the profile is used as identity source.
      if (body.ref_profile && /^[A-Za-z0-9_-]{1,64}$/.test(body.ref_profile) && context.env.DB && body.style !== "comicpage") {
        let ref: any = null;
        try { await requireRole(ctx as any, "admin"); const d = await loadStarRef(context.env, body.ref_profile); ref = d ? { data: d } : null; } catch { ref = null; }
        if (ref?.data && !editRef) {
          // v36: no edit route – reference only gives face/hair/body as text; scene prompt leads, normal text model renders
          const look = await refLook(context.env, ref.data, full);
          if (look) refAppend = `. Same woman every time, her appearance: ${look}`;
        } else if (ref?.data) {
          try {
            const res = await fetch("https://api.venice.ai/api/v1/image/edit", {
              method: "POST",
              headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
              body: JSON.stringify({ model: "qwen-image-2-1-turbo-edit", image: ref.data, prompt: `IMPORTANT: this is the same person as in the reference image. Strictly preserve her exact face, facial features, hairline, hair colour, skin tone, eye colour${full ? ", hairstyle, hair length and body type / figure" : ""}; do not change her identity. Outfit, pose, place and camera come ONLY from this description, never from the reference image. New image of her: ${prompt}`.slice(0, 1400), output_format: "webp", safe_mode: safeMode }),
            });
            if (!res.ok) throw new Error(`edit ${res.status}`);
            const buf = new Uint8Array(await res.arrayBuffer());
            let bin = ""; for (let k = 0; k < buf.length; k += 0x8000) bin += String.fromCharCode(...buf.subarray(k, k + 0x8000));
            return ok(btoa(bin), full ? "Venice · qwen-edit (Gesicht + Figur)" : "Venice · qwen-edit (Referenzbild Gesicht)", 0.02);
          } catch (e) { console.error("ref edit failed", e); }
        }
      }
      if (body.quality === "mix" && safeMode && body.scene && body.person) { // v54: never Mix in FSK18 (always chroma)
        // Spar-Mix: model A renders the scene/background, model B places the person (look) into it.
        const bg = await gen("z-image-turbo", `${body.scene}, empty scene, no people, ${comic ? "comic illustration" : "photorealistic"}`, NEG0 + ", people, person");
        try {
          const res = await fetch("https://api.venice.ai/api/v1/image/edit", {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({ model: "qwen-image-2-1-turbo-edit", image: bg, prompt: `Add this person naturally into the scene, matching light and perspective: ${body.person}. No text.`.slice(0, 1400), output_format: "webp", safe_mode: safeMode }),
          });
          if (!res.ok) throw new Error(`edit ${res.status}: ${(await res.text()).slice(0, 200)}`);
          const buf = new Uint8Array(await res.arrayBuffer());
          let bin = ""; for (let k = 0; k < buf.length; k += 0x8000) bin += String.fromCharCode(...buf.subarray(k, k + 0x8000));
          return ok(btoa(bin), "z-image-turbo + qwen-edit (Mix)", 0.03);
        } catch (e) {
          console.error("Spar-Mix edit failed:", e);
          return ok(await gen(model, prompt + refAppend, NEG), `${model} (Mix-Fallback)`, cost);
        }
      }
      // comic pages are rendered WITHOUT text; the app overlays Spanish speech bubbles itself
      return ok(await gen(model, prompt + refAppend, NEG), q === "mix" && !safeMode ? "chroma (Spar-Mix → FSK18 Einzelbild)" : model, cost);
    } catch (e) {
      console.error("Venice-Fehler:", e);
      // v36: surface the real Venice error instead of the misleading "nicht konfiguriert"
      return new Response(JSON.stringify({ error: { code: "generation_failed", message: "Bild fehlgeschlagen: " + String((e as any)?.message || e).replace(/Bearer\s+\S+/g, "").slice(0, 160) } }), { status: 502, headers: { "content-type": "application/json" } });
    }
  }

  if (context.env.HF_TOKEN) {
    try {
      const res = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0", {
        method: "POST",
        headers: {
          authorization: `Bearer ${context.env.HF_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
      });
      if (!res.ok) throw new Error(`HF API ${res.status}`);
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      return new Response(JSON.stringify({ dataUrl: `data:image/png;base64,${b64}` }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch (e) {
      console.error("HF-Fehler:", e);
    }
  }

  return new Response(JSON.stringify({ error: { code: "not_configured", message: "Bildgenerierung nicht konfiguriert (VENICE_API_KEY oder HF_TOKEN fehlt)" } }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}
