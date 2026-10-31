import { Env } from "../../../src/env";
import { requireRole } from "../../../src/auth";
import { listMemories, extractMemories } from "../../../src/memory";
import { checkRateLimit } from "../../../src/ratelimit";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export const onRequest: PagesFunction<Env> = async (ctx) => {
  try { return await handle(ctx); } catch (e: any) {
    if (e && (typeof e.status === "number" || /RateLimit|Budget/.test(e.name || ""))) throw e;
    if (e instanceof SyntaxError) return json({ error: { code: "invalid_input", message: "Gedächtnis: Anfrage unlesbar (kein gültiges JSON)" } }, 400);
    console.error("memory error", e);
    return json({ error: { code: "d1_error", message: "Gedächtnis-Datenbank: " + String(e?.message || e).slice(0, 160) } }, 500);
  }
};

const handle = async (ctx: EventContext<Env, any, any>): Promise<Response> => {
  if (!ctx.env.DB) return json({ error: { code: "d1_missing", message: "D1 fehlt" } }, 503);
  const url = new URL(ctx.request.url);
  const parts = ((ctx.params.route as string[]) || []);
  const m = ctx.request.method;
  if (m === "POST" && parts[0] === "extract") {
    const ip = ctx.request.headers.get("cf-connecting-ip") || "unknown";
    await checkRateLimit(ctx.env, ip);
    const b: any = await ctx.request.json();
    if (!Array.isArray(b.messages)) return json({ error: { code: "invalid_input", message: "messages fehlt" } }, 400);
    const profileName = typeof b.profileName === "string" ? b.profileName.slice(0, 40) : undefined;
    const otherNames = Array.isArray(b.otherNames) ? b.otherNames.filter((n: unknown) => typeof n === "string").slice(0, 20).map((n: string) => n.slice(0, 40)) : undefined;
    const saved = await extractMemories(ctx.env, b.profileId ? String(b.profileId).slice(0, 80) : undefined, b.messages.slice(-6), { profileName, otherNames });
    return json({ saved });
  }
  await requireRole(ctx, "read");
  if (m === "GET") {
    const pid = url.searchParams.get("profileId");
    const scopes = url.searchParams.get("all") ? null : ["user", ...(pid ? [`p:${pid}`] : [])];
    const rows = scopes ? await listMemories(ctx.env, scopes)
      : ((await ctx.env.DB.prepare("SELECT id, scope, fact, created_at FROM memories ORDER BY id DESC LIMIT 500").all()).results || []);
    return json({ memories: rows });
  }
  if (m === "POST") {
    const b: any = await ctx.request.json();
    const fact = String(b.fact || "").trim().slice(0, 300); if (!fact) return json({ error: { code: "invalid_input", message: "fact fehlt" } }, 400);
    const scope = b.profileId ? `p:${String(b.profileId).slice(0, 80)}` : "user";
    const row = await ctx.env.DB.prepare("INSERT INTO memories (scope, fact) VALUES (?, ?) RETURNING id, scope, fact, created_at").bind(scope, fact).first();
    return json({ memory: row });
  }
  const id = parseInt(parts[0] || "", 10);
  if (!id) return json({ error: { code: "invalid_input", message: "id fehlt" } }, 400);
  if (m === "PUT") {
    const b: any = await ctx.request.json();
    await ctx.env.DB.prepare("UPDATE memories SET fact = ? WHERE id = ?").bind(String(b.fact || "").trim().slice(0, 300), id).run();
    return json({ ok: true });
  }
  if (m === "DELETE") { await ctx.env.DB.prepare("DELETE FROM memories WHERE id = ?").bind(id).run(); return json({ ok: true }); }
  return json({ error: { code: "method_not_allowed", message: "Methode nicht erlaubt" } }, 405);
};
