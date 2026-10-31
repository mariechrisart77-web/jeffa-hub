// Character cards (chara_card_v2 + extensions.jeffa). Never writes the profile itself.
// POST /api/card/generate {profile:id} -> {card, summary} (stored)   GET /api/card?profile=id   POST /api/card/parse {text} -> {card}
import { Env } from "../../../src/env";
import { requireRole, AuthError } from "../../../src/auth";
import { withKeys } from "../../../src/keys";
import { complete } from "../../../src/providers";
import { loadSyncedProfile } from "../../../src/imgsvc-db";

const PID = /^[A-Za-z0-9_-]{1,64}$/;
const j = (s: number, o: unknown) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const SHAPE = '{"spec":"chara_card_v2","data":{"name":"","description":"","personality":"","scenario":"","first_mes":"","tags":[],"extensions":{"jeffa":{"look":{"hair":"","eyes":"","skin":"","age":25,"typ":"","style":"","details":""},"figur":{"groesse":"","statur":"","kurven":5,"oberweite":4},"traits":[],"outfit":"","place":"","expression":""}}}}';
const SYS_GEN = "Du erstellst aus einem Figuren-Profil eine Charakter-Karte. Antworte NUR mit JSON exakt in dieser Form: " + SHAPE + " Übernimm Aussehen und Figur wörtlich aus dem Profil, erfinde keine Identitätsdetails. kurven 1-10, oberweite 1-7 (Körbchen 1=A 2=B 3=C 4=D 5=DD/E 6=F 7=G). Die Figur ist erwachsen (18+). Keine expliziten Inhalte. Deutsch, description höchstens 600 Zeichen.";
const SYS_PARSE = "Wandle den folgenden Charakter-Text in eine Charakter-Karte um. Antworte NUR mit JSON exakt in dieser Form: " + SHAPE + " Leere Felder bleiben leer. Erfinde nichts. Die Figur ist erwachsen (18+). Keine expliziten Inhalte.";

function extractJson(t: string): any {
  const s = String(t || "").replace(/```\w*|```/g, ""); const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}
export function normalizeCard(o: any): any {
  if (!o || typeof o !== "object") return null;
  const d = o.spec === "chara_card_v2" || o.data ? o.data : o;
  if (!d || typeof d !== "object" || (!d.name && !d.description && !d.extensions)) return null;
  const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  return { spec: "chara_card_v2", data: { name: s(d.name, 120), description: s(d.description, 4000), personality: s(d.personality, 2000), scenario: s(d.scenario, 2000), first_mes: s(d.first_mes, 4000), tags: Array.isArray(d.tags) ? d.tags.slice(0, 30).map((x: unknown) => s(x, 40)) : [], extensions: d.extensions && typeof d.extensions === "object" ? d.extensions : {} } };
}
async function llmCard(env: Env, system: string, user: string, adult: boolean): Promise<any> {
  const base = env.DEFAULT_MODEL || "gemini-3.5-flash-lite";
  for (const m of adult ? ["venice-uncensored-1-2", base] : [base]) {
    try {
      const r = await complete(env, { model: m, maxTokens: 1500, private: true, system, messages: [{ role: "user", content: user }] });
      const c = normalizeCard(extractJson(r.reply));
      if (c) return c;
    } catch (e) { console.error("card llm failed", m, e); }
  }
  return null;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const env = await withKeys(ctx.env); const db = env.DB;
  if (!db) return j(500, { error: "not_configured" });
  const url = new URL(ctx.request.url), path = url.pathname.replace(/^\/api\/card\/?/, ""), M = ctx.request.method;
  try {
    await requireRole(ctx, "read");
    if (!path && M === "GET") {
      const p = url.searchParams.get("profile") || "";
      if (!PID.test(p)) return j(400, { error: "bad_input" });
      const r: any = await db.prepare("SELECT card, summary, updated FROM character_cards WHERE profile=?").bind(p).first();
      return r ? j(200, { card: JSON.parse(r.card), summary: r.summary, updated: r.updated }) : j(404, { error: "not_found" });
    }
    if (M !== "POST") return j(405, { error: "method" });
    const raw = await ctx.request.text();
    if (raw.length > 70_000) return j(413, { error: "too_large" });
    let b: any; try { b = JSON.parse(raw); } catch { return j(400, { error: "bad_input" }); }
    if (path === "generate") {
      const id = typeof b?.profile === "string" ? b.profile : b?.profile?.id;
      if (!PID.test(id || "")) return j(400, { error: "bad_input" });
      const sp = await loadSyncedProfile(env, id);
      if (!sp) return j(404, { error: "profile_not_synced" });
      const p = sp.profile || {};
      const input = JSON.stringify({ name: p.name, persona: p.persona, aussehen_prompt: String(sp.resolved?.look || "").slice(0, 1200), outfit: sp.resolved?.outfitText || "" }).slice(0, 12000);
      const card = await llmCard(env, SYS_GEN, input, b.adult === true);
      if (!card) return j(502, { error: "generate_failed" });
      if (!card.data.name) card.data.name = String(p.name || "");
      const summary = String(card.data.description || card.data.personality || "").slice(0, 600);
      await db.prepare("INSERT INTO character_cards (profile, card, summary, updated) VALUES (?,?,?,?) ON CONFLICT(profile) DO UPDATE SET card=excluded.card, summary=excluded.summary, updated=excluded.updated").bind(id, JSON.stringify(card), summary, Date.now()).run();
      return j(200, { card, summary });
    }
    if (path === "parse") {
      const text = String(b?.text || "");
      if (!text.trim()) return j(400, { error: "bad_input" });
      if (text.length > 60_000) return j(413, { error: "too_large" });
      const direct = normalizeCard(extractJson(text));
      if (direct && /^\s*\{/.test(text)) return j(200, { card: direct });
      const card = await llmCard(env, SYS_PARSE, text.slice(0, 20000), b.adult === true);
      return card ? j(200, { card }) : j(502, { error: "parse_failed" });
    }
    return j(404, { error: "not_found" });
  } catch (e) {
    if (e instanceof AuthError) return j(e.status, { error: e.code });
    console.error(e); return j(500, { error: "server_error" });
  }
};
