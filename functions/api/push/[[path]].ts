// GET /api/push/key (public VAPID key) · POST subscribe|unsubscribe|test (admin)
import { Env } from "../../../src/env";
import { requireRole, AuthError } from "../../../src/auth";
import { checkSubscription, addSub, removeSub, pushAll, vapidPublic } from "../../../src/push";
const j = (s: number, o: unknown) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx; const p = new URL(request.url).pathname.replace(/^\/api\/push\/?/, "");
  try {
    if (p === "key" && request.method === "GET") { const k = await vapidPublic(env); return k ? j(200, { key: k }) : j(500, { error: "push_not_configured" }); }
    if (request.method !== "POST") return j(405, { error: "method" });
    await requireRole(ctx, "admin");
    if (!env.DB) return j(500, { error: "not_configured" });
    const b: any = await request.json().catch(() => ({}));
    if (p === "subscribe") { const s = checkSubscription(b.subscription); if (!s) return j(400, { error: "bad_subscription" }); await addSub(env, s); return j(200, { ok: true }); }
    if (p === "unsubscribe") { if (typeof b.endpoint === "string") await removeSub(env, b.endpoint); return j(200, { ok: true }); }
    if (p === "test") {
      if (env.KV) { if (await env.KV.get("push:test")) return j(429, { error: "rate_limited" }); await env.KV.put("push:test", "1", { expirationTtl: 60 }); }
      return j(200, { ok: true, sent: await pushAll(env, { title: "Jeffa", body: "Test-Mitteilung ✅", tag: "test" }) });
    }
    return j(404, { error: "not_found" });
  } catch (e) {
    if (e instanceof AuthError) return j(e.status, { error: e.code });
    return j(500, { error: "server_error" });
  }
};
