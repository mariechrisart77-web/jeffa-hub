import { Env } from "../../../../src/env";
import { requireRole, AuthError } from "../../../../src/auth";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    await requireRole(ctx, "read");
    const db = ctx.env.DB;
    if (!db) {
      return new Response(JSON.stringify([]), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    const rows: any[] = (await db.prepare("SELECT id, data FROM profiles_sync ORDER BY id").all()).results || [];
    const profiles = rows.map((r) => {
      let name = r.id;
      try {
        const data = JSON.parse(r.data || "{}");
        const nm = data?.profile?.name || data?.name; if (nm) name = String(nm).slice(0, 60);
      } catch {}
      return { id: r.id, name };
    });
    return new Response(JSON.stringify(profiles), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: "auth" }), {
        status: e.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    console.error(e);
    return new Response(JSON.stringify([]), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
};
