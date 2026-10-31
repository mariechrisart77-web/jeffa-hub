// Image feedback loop + prompt composer.
// POST /api/imagefb            {profile,imageId,rating:1|-1,comment,prompt,seed}  -> store rating (D1)
// GET  /api/imagefb?profile=X  -> {positive,negative,goodSeed}: LLM-condensed from last 10 ratings, cached per profile,
//                                 regenerated only when the feedback count changed. Fails gracefully (empty).
// POST /api/imagefb/autofill   {section:'stil'|'outfit',adult,profile:{...}} -> {fields}: v61 '✨ Automatisch ausfüllen' (only on button press)
// POST /api/imagefb/compose    {settings,context,corrections} -> {prompt}: assembles the user's own settings into one prompt.
import { Env } from "../env";
import { withKeys } from "../keys";
import { complete } from "../providers";
import { requireRole, AuthError } from "../auth";
// @ts-ignore plain JS helper
import { minorRisk, scrubYouth } from "../imgsvc-core.js";
const PID = /^[A-Za-z0-9_-]{1,64}$/;
const j = (s: number, o: unknown) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const SCENE = "You write a vivid scene description for an AI image generator, ported from Nachtfalter. Describe the CURRENT moment of the role-play chat (latest messages) as one photo. Call the main character only \"the woman\". Do NOT describe her face, hair, age, ethnicity or body shape (added separately). Describe only: setting (exact place, vehicles with make/colour), pose, action, visible piercings/tattoos/jewellery, other people (each by gender and look as described; the chat partner only if physically present in this moment), clothing, lighting, mood, and a camera angle. Stay faithful to the chat: do not invent, add or tone down anything. All persons are adults (18+). No dialogue, no feelings, no story summary; concrete visual nouns. Always write in English, even when the chat is German. Keep size words exactly (tiny, micro, minimal, see-through). English prose, max 110 words. Output only the description.";
const EMPTY = { positive: "", negative: "", goodSeed: null as number | null };
const COMPOSER = "Du bist ein Prompt-Designer für einen Bildgenerator. Du erhältst die Einstellungen einer Figur (Aussehen, Stil-Preset, Pose, Qualität), den aktuellen Chat-Kontext und Feedback-Korrekturen. Setze daraus EINEN zusammenhängenden englischen Bild-Prompt aus kurzen Stichworten zusammen, der zur aktuellen Szene im Chat passt. Regeln: Verwende nur Inhalte aus den Einstellungen und dem Kontext, erfinde keine neuen Details hinzu. Identität (Gesicht, Haare, Figur) unverändert übernehmen. Alle Personen sind Erwachsene (18+). Feedback-Korrekturen berücksichtigen. Keine Schrift im Bild. Reihenfolge: Szene/Handlung, Kamera, Licht, Outfit, Identität, Stil, Qualität. Maximal 120 Wörter. Antworte NUR mit dem Prompt.";

// v61: autofill writer – same cheap text models as the scene writer; characters always clearly adult (21+)
const AF_BASE = "You help fill in a character sheet for a role-play chat + AI image app. Use ONLY the given character data (name, description, look, personality, chosen image style, reference-photo description); do not invent a different identity. The character is a clearly adult woman aged 21 or older: describe her as an adult woman, never use youthful or childlike words (no teen, girl, young-looking, schoolgirl, petite-child, kid, minor, jugendlich, kindlich, Mädchen) and never state an age under 21. Answer ONLY with compact JSON, no markdown.";
export const AF_SYSTEM: Record<string, string> = {
  stil: AF_BASE + ' Return {"beispielPersona":"German, 4-6 short sentences: example personality description in the style the user likes – tone, way of speaking, temperament, quirks","beispielBildprompt":"English, comma-separated image prompt keywords (max 60 words): framing, light, setting mood, outfit style, rendering style matching the chosen image style; refer to her as \'adult woman\'"}.',
  outfit: AF_BASE + ' Return {"outfitKeyword":"one short German keyword for her signature outfit, max 2 words, lowercase","outfitText":"English, comma-separated (max 45 words): her signature everyday outfit with colours, materials and accessories, fitting her look and style","outfitNeg":"English, comma-separated (max 15 words): clothing items or looks to avoid for consistency"}.',
};
const AF_KEYS: Record<string, [string, number][]> = { stil: [["beispielPersona", 4000], ["beispielBildprompt", 2000]], outfit: [["outfitKeyword", 40], ["outfitText", 600], ["outfitNeg", 300]] };
export function autofillInput(p: any): string {
  const s = (v: unknown, n: number) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v)).slice(0, n);
  const per = p?.persona || {};
  return JSON.stringify({ name: s(p?.name, 60), description: s(p?.description, 1200), look: s(per.look, 900), figure: s(per.figur, 300), personality: s([per.base, per.temperament, per.subtraits].filter(Boolean), 600), traits: s(p?.traits, 400), imageStyle: s(p?.photo?.style || p?.imgStyle || "real", 60), photoSettings: s(p?.photo, 400), referencePhoto: s(p?.looks?.refLook, 600), currentOutfit: s(p?.outfitText, 300) });
}
export function parseAutofill(section: string, reply: string): Record<string, string> | null {
  const m = String(reply || "").match(/\{[\s\S]*\}/); if (!m) return null;
  let o: any; try { o = JSON.parse(m[0]); } catch { return null; }
  const out: Record<string, string> = {};
  for (const [k, n] of AF_KEYS[section] || []) { const v = scrubYouth(String(o?.[k] ?? "").replace(/\s+\n/g, "\n").trim()).slice(0, n); if (v) out[k] = v; }
  return Object.keys(out).length ? out : null;
}

export async function handleImageFb(ctx: EventContext<Env, any, any>): Promise<Response> {
  const env = await withKeys(ctx.env); const db = env.DB;
  const { request } = ctx; const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/imagefb\/?/, "");
  try {
    await requireRole(ctx, "read");
    const model = env.DEFAULT_MODEL || "gemini-3.5-flash-lite";
    if (path === "scene" && request.method === "POST") {
      const b: any = await request.json().catch(() => null);
      if (!b) return j(400, { error: "bad_input" });
      const user = `Main character: ${String(b.character || "").slice(0, 80)}\n\nChat (latest last):\n${String(b.context || "").slice(-3000)}`;
      const models = b.adult === true ? ["venice-uncensored-1-2"] : [model]; // v38: no Gemini for FSK18
      for (const m of models) {
        try {
          const res = await complete(env, { model: m, maxTokens: 220, private: true, system: SCENE, messages: [{ role: "user", content: user }] });
          const scene = String(res.reply || "").replace(/```\w*|```/g, "").replace(/\s+/g, " ").trim().slice(0, 900);
          if (scene && !/^(i can'?t|i cannot|sorry|ich kann)/i.test(scene)) return j(200, { scene, model: m });
        } catch (e) { console.error("scene failed", m, e); }
      }
      return j(200, { scene: "" });
    }
    if (path === "autofill" && request.method === "POST") {
      const b: any = await request.json().catch(() => null);
      const section = String(b?.section || "");
      if (!b || !AF_SYSTEM[section] || typeof b.profile !== "object" || !b.profile) return j(400, { error: "bad_input" });
      if (minorRisk(b.profile, {})) return j(403, { error: "not_adult", message: "Profil muss eindeutig erwachsen sein (21+)" });
      const models = b.adult === true ? ["venice-uncensored-1-2"] : [model]; // like the scene writer: FSK18 never via Gemini
      for (const m of models) {
        try {
          const res = await complete(env, { model: m, maxTokens: 500, private: true, system: AF_SYSTEM[section], messages: [{ role: "user", content: autofillInput(b.profile) }] });
          const fields = parseAutofill(section, res.reply);
          if (fields) return j(200, { fields, model: m });
        } catch (e) { console.error("autofill failed", m, e); }
      }
      return j(200, { fields: null, error: "failed" });
    }
    if (path === "compose" && request.method === "POST") {
      const b: any = await request.json().catch(() => null);
      if (!b) return j(400, { error: "bad_input" });
      const user = JSON.stringify({ settings: b.settings || {}, context: String(b.context || "").slice(0, 1500), corrections: b.corrections || {} }).slice(0, 5000);
      try {
        const res = await complete(env, { model: b.adult === true ? "venice-uncensored-1-2" : model, maxTokens: 300, private: true, system: COMPOSER, messages: [{ role: "user", content: user }] });
        const prompt = String(res.reply || "").replace(/```\w*|```/g, "").trim().slice(0, 1400);
        return j(200, { prompt });
      } catch (e) { console.error("compose failed", e); return j(200, { prompt: "" }); }
    }
    if (!db) return j(200, EMPTY);
    if (request.method === "POST") {
      const b: any = await request.json().catch(() => null);
      if (!b || !PID.test(b.profile || "") || ![1, -1].includes(b.rating)) return j(400, { error: "bad_input" });
      const id = String(b.imageId || "").slice(0, 64) || crypto.randomUUID();
      await db.prepare("INSERT OR REPLACE INTO image_feedback (id,profile,image_id,rating,comment,prompt,seed,created) VALUES (?,?,?,?,?,?,?,?)")
        .bind(`${b.profile}:${id}`, b.profile, id, b.rating, String(b.comment || "").slice(0, 600), String(b.prompt || "").slice(0, 1500), Number.isInteger(b.seed) ? b.seed : null, Date.now()).run();
      return j(200, { ok: true });
    }
    const p = url.searchParams.get("profile") || ""; if (!PID.test(p)) return j(400, { error: "bad_profile" });
    const cnt = (await db.prepare("SELECT COUNT(*) n FROM image_feedback WHERE profile=?").bind(p).first<number>("n")) || 0;
    if (!cnt) return j(200, EMPTY);
    const c: any = await db.prepare("SELECT * FROM image_feedback_corr WHERE profile=?").bind(p).first();
    if (c && c.fb_count === cnt) return j(200, { positive: c.positive || "", negative: c.negative || "", goodSeed: c.good_seed ?? null });
    const rows: any[] = (await db.prepare("SELECT rating,comment,prompt,seed FROM image_feedback WHERE profile=? ORDER BY created DESC LIMIT 10").bind(p).all()).results || [];
    const goodSeed = rows.find((r) => r.rating > 0 && r.seed != null)?.seed ?? null;
    let positive = "", negative = "";
    try {
      const list = rows.map((r) => `${r.rating > 0 ? "GUT" : "SCHLECHT"} ${r.comment ? "Kommentar: " + r.comment : "(kein Kommentar)"} | Prompt: ${String(r.prompt || "").slice(0, 300)}`).join("\n");
      const res = await complete(env, {
        model, maxTokens: 250, private: true,
        system: 'Du wertest Nutzer-Feedback zu generierten Bildern einer Figur aus. Leite kurze, konkrete Korrekturen für den nächsten Bild-Prompt ab: was beibehalten/betont werden soll (aus GUT und Wünschen in Kommentaren) und was vermieden werden soll (aus SCHLECHT-Kommentaren). Antworte NUR mit JSON: {"positive":"englische Stichworte, kommagetrennt, max 25 Wörter","negative":"englische Stichworte, kommagetrennt, max 20 Wörter"}. Neuere Einträge stehen oben und wiegen mehr.',
        messages: [{ role: "user", content: list }],
      });
      const m = String(res.reply || "").match(/\{[\s\S]*\}/);
      if (m) { const o = JSON.parse(m[0]); positive = String(o.positive || "").slice(0, 300); negative = String(o.negative || "").slice(0, 300); }
    } catch (e) { console.error("imagefb condense failed", e); if (c) return j(200, { positive: c.positive || "", negative: c.negative || "", goodSeed }); }
    await db.prepare("INSERT OR REPLACE INTO image_feedback_corr (profile,positive,negative,good_seed,fb_count,updated) VALUES (?,?,?,?,?,?)").bind(p, positive, negative, goodSeed, cnt, Date.now()).run();
    return j(200, { positive, negative, goodSeed });
  } catch (e) {
    if (e instanceof AuthError) return j(e.status, { error: "auth" });
    console.error(e); return j(200, EMPTY);
  }
}
