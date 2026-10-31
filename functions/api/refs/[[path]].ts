// Per-profile reference images (admin only). Categories: gesicht, koerper, details, kleidung, beispiel, generiert.
// NEW: R2 storage via env.IMAGES, thumbs (≤40KB base64 JPEG), star, settings (off|face|full), migrate.
import { Env } from "../../../src/env";
import { requireRole, AuthError } from "../../../src/auth";

const CATS = ["gesicht", "koerper", "details", "kleidung", "beispiel", "generiert"];
const PID = /^[A-Za-z0-9_-]{1,64}$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MODES = ["off", "face", "figur"];

const j = (s: number, o: unknown) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const rid = () => Date.now().toString(36) + "-" + crypto.randomUUID().slice(0, 8);

const okImg = (b: any) => typeof b?.data === "string" && b.data.length < 950_000 && B64.test(b.data) && ["image/jpeg", "image/webp", "image/png"].includes(b.mime || "image/jpeg");
const okThumb = (t: string) => t.length < 60_000 && B64.test(t);

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const db = env.DB;
  if (!db) return j(500, { error: "not_configured" });

  const url = new URL(request.url);
  const M = request.method;
  const path = url.pathname.replace(/^\/api\/refs\/?/, "").split("/").filter(Boolean);

  try {
    await requireRole(ctx, "admin");

    // GET /api/refs/settings?profile=X
    if (path[0] === "settings" && M === "GET") {
      const p = url.searchParams.get("profile") || "";
      if (!PID.test(p)) return j(400, { error: "bad_profile" });
      const row = await db.prepare("SELECT mode FROM ref_settings WHERE profile=?").bind(p).first<{ mode: string }>();
      return j(200, { mode: row?.mode === "full" ? "figur" : row?.mode ?? null }); // v35: legacy full -> figur (read-map only)
    }

    // PUT /api/refs/settings?profile=X body {mode}
    if (path[0] === "settings" && M === "PUT") {
      const p = url.searchParams.get("profile") || "";
      if (!PID.test(p)) return j(400, { error: "bad_profile" });
      const b: any = await request.json().catch(() => null);
      if (!b || !MODES.includes(b.mode)) return j(400, { error: "bad_input" });
      await db.prepare("INSERT INTO ref_settings (profile, mode) VALUES (?, ?) ON CONFLICT(profile) DO UPDATE SET mode=excluded.mode").bind(p, b.mode).run();
      return j(200, { ok: true });
    }

    // POST /api/refs/migrate
    if (path[0] === "migrate" && M === "POST") {
      if (!env.IMAGES) return j(400, { error: "r2_not_bound" });
      const rows = await db.prepare("SELECT id, profile, data FROM profile_refs WHERE r2_key IS NULL AND data != ''").all();
      let moved = 0;
      for (const row of rows.results as any[]) {
        const r2Key = `refs/${row.profile}/${row.id}.jpg`;
        const buf = Uint8Array.from(atob(row.data), c => c.charCodeAt(0));
        await env.IMAGES.put(r2Key, buf, { httpMetadata: { contentType: "image/jpeg" } });
        await db.prepare("UPDATE profile_refs SET r2_key=?, data='' WHERE id=?").bind(r2Key, row.id).run();
        moved++;
      }
      await db.prepare("UPDATE profile_refs SET star=1 WHERE active=1 AND cat='gesicht' AND star=0").run();
      const starred = await db.prepare("SELECT changes() as c").first<number>("c") || 0;
      return j(200, { moved, starred });
    }

    // GET /api/refs?profile=X
    if (!path[0] && M === "GET") {
      const p = url.searchParams.get("profile") || "";
      if (!PID.test(p)) return j(400, { error: "bad_profile" });
      const r = await db.prepare("SELECT id, cat, mime, thumb, CASE WHEN thumb IS NULL AND r2_key IS NULL THEN data END AS data, active, star, fav, created, r2_key FROM profile_refs WHERE profile=? ORDER BY created").bind(p).all();
      return j(200, { items: r.results || [] });
    }

    // POST /api/refs (create)
    if (!path[0] && M === "POST") {
      const b: any = await request.json().catch(() => null);
      if (!b || !PID.test(b.profile || "") || !CATS.includes(b.cat) || !okImg(b)) return j(400, { error: "bad_input" });
      if (b.thumb && !okThumb(b.thumb)) return j(400, { error: "bad_thumb" });

      const limit = await db.prepare("SELECT COUNT(*) n FROM profile_refs WHERE profile=? AND cat IN ('gesicht','koerper')").bind(b.profile).first<number>("n");
      if ((limit || 0) >= 3) return j(400, { error: "too_many_refs" });

      const hasActive = b.cat === "gesicht" && !(await db.prepare("SELECT 1 FROM profile_refs WHERE profile=? AND cat='gesicht' AND active=1").bind(b.profile).first());
      const id = rid();

      let r2Key = null;
      let dataVal = b.data;
      if (env.IMAGES) {
        r2Key = `refs/${b.profile}/${id}.jpg`;
        const buf = Uint8Array.from(atob(b.data), c => c.charCodeAt(0));
        await env.IMAGES.put(r2Key, buf, { httpMetadata: { contentType: b.mime || "image/jpeg" } });
        dataVal = '';
      }

      await db.prepare("INSERT INTO profile_refs (id, profile, cat, mime, data, thumb, active, star, r2_key, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, b.profile, b.cat, b.mime || "image/jpeg", dataVal, b.thumb || null, hasActive ? 1 : 0, 0, r2Key, Date.now()).run();
      return j(200, { id });
    }

    // /:id/full GET (retrieve full image)
    if (path.length === 2 && path[1] === "full" && M === "GET") {
      const id = path[0];
      const row = await db.prepare("SELECT r2_key, data, mime FROM profile_refs WHERE id=?").bind(id).first<{ r2_key: string | null; data: string; mime: string }>();
      if (!row) return j(404, { error: "not_found" });
      
      let dataUrl: string;
      if (row.r2_key && env.IMAGES) {
        const obj = await env.IMAGES.get(row.r2_key);
        if (!obj) return j(404, { error: "r2_not_found" });
        const buf = await obj.arrayBuffer();
        const u = new Uint8Array(buf); let bin = ""; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000)); const b64 = btoa(bin);
        dataUrl = `data:${row.mime};base64,${b64}`;
      } else {
        dataUrl = `data:${row.mime};base64,${row.data}`;
      }
      return j(200, { dataUrl });
    }

    // /:id/star POST (set star)
    if (path.length === 2 && path[1] === "star" && M === "POST") {
      const id = path[0];
      const row = await db.prepare("SELECT profile FROM profile_refs WHERE id=?").bind(id).first<{ profile: string }>();
      if (!row) return j(404, { error: "not_found" });
      await db.batch([
        db.prepare("UPDATE profile_refs SET star=0 WHERE profile=?").bind(row.profile),
        db.prepare("UPDATE profile_refs SET star=1 WHERE id=?").bind(id)
      ]);
      return j(200, { ok: true });
    }

    // /:id operations
    const id = path[0];
    const row: any = await db.prepare("SELECT id, profile, cat FROM profile_refs WHERE id=?").bind(id).first();
    if (!row) return j(404, { error: "not_found" });

    if (M === "DELETE") {
      const r2Row = await db.prepare("SELECT r2_key FROM profile_refs WHERE id=?").bind(id).first<{ r2_key: string | null }>();
      if (r2Row?.r2_key && env.IMAGES) {
        await env.IMAGES.delete(r2Row.r2_key);
      }
      await db.prepare("DELETE FROM profile_refs WHERE id=?").bind(id).run();
      return j(200, { ok: true });
    }

    if (M === "PUT") {
      const b: any = await request.json().catch(() => null);
      if (!okImg(b)) return j(400, { error: "bad_input" });
      if (b.thumb && !okThumb(b.thumb)) return j(400, { error: "bad_thumb" });

      const r2Row = await db.prepare("SELECT r2_key FROM profile_refs WHERE id=?").bind(id).first<{ r2_key: string | null }>();
      if (r2Row?.r2_key && env.IMAGES) {
        const buf = Uint8Array.from(atob(b.data), c => c.charCodeAt(0));
        await env.IMAGES.put(r2Row.r2_key, buf, { httpMetadata: { contentType: b.mime || "image/jpeg" } });
        await db.prepare("UPDATE profile_refs SET mime=?, thumb=? WHERE id=?").bind(b.mime || "image/jpeg", b.thumb || null, id).run();
      } else {
        await db.prepare("UPDATE profile_refs SET data=?, mime=?, thumb=? WHERE id=?").bind(b.data, b.mime || "image/jpeg", b.thumb || null, id).run();
      }
      return j(200, { ok: true });
    }

    if (M === "PATCH") {
      const b: any = await request.json().catch(() => null);
      if (!b) return j(400, { error: "bad_input" });
      if (b.cat !== undefined) {
        if (!CATS.includes(b.cat)) return j(400, { error: "bad_cat" });
        await db.prepare("UPDATE profile_refs SET cat=?, active=CASE WHEN ?='gesicht' THEN active ELSE 0 END WHERE id=?").bind(b.cat, b.cat, id).run();
      }
      if (b.fav !== undefined) {
        await db.prepare("UPDATE profile_refs SET fav=? WHERE id=?").bind(b.fav ? 1 : 0, id).run();
      }
      return j(200, { ok: true });
    }

    if (M === "POST" && path[1] === "active") {
      if (row.cat !== "gesicht") return j(400, { error: "only_face" });
      await db.batch([
        db.prepare("UPDATE profile_refs SET active=0 WHERE profile=? AND cat='gesicht'").bind(row.profile),
        db.prepare("UPDATE profile_refs SET active=1 WHERE id=?").bind(id)
      ]);
      return j(200, { ok: true });
    }

    return j(405, { error: "method" });
  } catch (e) {
    if (e instanceof AuthError) return j(e.status, { error: e.code });
    return j(500, { error: "server_error" });
  }
};
