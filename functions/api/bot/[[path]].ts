// Encrypted channels App <-> Grok Bots (multi-bot). Server only stores ciphertext envelopes
// {v:1, dir:"task"|"reply", kdf, alg:"A256GCM", salt, iv, ct}; keys come from per-bot passphrases known only to
// the app (in memory after unlock) and the bot's box. Webhook payload = {job_ref, bot} only. Nothing is logged.
// Storage: D1 (bot_bots, bot_msgs) – strongly consistent, so replies are visible immediately (KV list lagged ~60 s).
// Bot "grok" = built-in (env BOT_WEBHOOK_URL / BOT_WEBHOOK_KEY / BOT_TOKEN_HASH). Further bots live in D1 bot_bots;
// their webhook URL+key are AES-GCM encrypted with a key derived from VAULT_SECRET, tokens stored only as SHA-256.
import { Env } from "../../../src/env";
import { requireRole, AuthError } from "../../../src/auth";
import { pushAll } from "../../../src/push";
import { sha256hex, constantTimeCompare, hkdfDeriveKey, encryptJSON, decryptJSON } from "../../../src/crypto";

const TTL_MS = 30 * 24 * 3600 * 1000, B64 = /^[A-Za-z0-9+/]+={0,2}$/, REF = /^[A-Za-z0-9_-]{16,64}$/, BID = /^[a-z0-9_-]{2,32}$/;
const j = (s: number, o: unknown) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
const rid = (n = 18) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
interface Bot { id: string; name: string; hook?: string; token_hash?: string; created: number; builtin?: boolean }
function envOk(e: any, dir: string) {
  if (!e || typeof e !== "object" || e.v !== 1 || e.dir !== dir || e.alg !== "A256GCM" || typeof e.kdf !== "string" || e.kdf.length > 64) return false;
  for (const k of ["salt", "iv", "ct"]) if (typeof e[k] !== "string" || !B64.test(e[k])) return false;
  if (e.ct.length > (dir === "att" ? 1_850_000 : 4_000_000)) return false;
  return Object.keys(e).every(k => ["v", "dir", "kdf", "alg", "salt", "iv", "ct"].includes(k));
}
async function bots(env: Env): Promise<Bot[]> {
  const extra = (await env.DB!.prepare("SELECT id,name,hook,token_hash,created FROM bot_bots ORDER BY created").all<Bot>()).results || [];
  return [{ id: "grok", name: "Grok Bot", builtin: true, created: 0 }, ...extra];
}
const saveBot = (env: Env, b: Bot) => env.DB!.prepare("INSERT INTO bot_bots (id,name,hook,token_hash,created) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, hook=excluded.hook, token_hash=excluded.token_hash").bind(b.id, b.name, b.hook ?? null, b.token_hash ?? null, b.created).run();
const vkey = (env: Env) => { if (!env.VAULT_SECRET) throw new Error("no vault"); return hkdfDeriveKey(env.VAULT_SECRET, "bot-salt", "bot-webhook-key"); };
async function hookOf(env: Env, b: Bot): Promise<{ url: string; key: string }> {
  if (b.builtin) return { url: (env.BOT_WEBHOOK_URL || "").trim(), key: (env.BOT_WEBHOOK_KEY || "").trim() };
  if (!b.hook) return { url: "", key: "" };
  return decryptJSON(await vkey(env), b.hook);
}
async function botFromToken(req: Request, env: Env): Promise<Bot | null> {
  const m = /^Bearer\s+(\S{24,256})$/.exec(req.headers.get("authorization") || "");
  if (!m) return null;
  const h = await sha256hex(m[1]);
  for (const b of await bots(env)) {
    const th = (b.builtin ? env.BOT_TOKEN_HASH || "" : b.token_hash || "").trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(th) && constantTimeCompare(h, th)) return b;
  }
  return null;
}
const MAXATT = 5;
const attsOk = (a: any) => a === undefined || (Array.isArray(a) && a.length <= MAXATT && a.every(x => envOk(x, "att")));
async function putAtts(env: Env, ref: string, bot: string, dir: string, atts: any[] | undefined) {
  if (!atts?.length) return;
  await env.DB!.batch(atts.map((e, i) => env.DB!.prepare("INSERT INTO bot_atts (id,ref,bot,dir,env,size,ts) VALUES (?,?,?,?,?,?,?)").bind(ref + "." + dir[0] + i + "." + rid(4), ref, bot, dir, JSON.stringify(e), e.ct.length, Date.now())));
}
const attList = async (env: Env, ref: string, dir: string) => ((await env.DB!.prepare("SELECT id,size FROM bot_atts WHERE ref=? AND dir=? ORDER BY id").bind(ref, dir).all()).results || []);
const row = (r: any) => r && ({ ...r, conv: r.conv ?? undefined, env: JSON.parse(r.env) });
const getBy = async (env: Env, ref: string, dir: string) => row(await env.DB!.prepare("SELECT * FROM bot_msgs WHERE ref=? AND dir=?").bind(ref, dir).first());
const putMsg = (env: Env, m: any) => env.DB!.prepare("INSERT INTO bot_msgs (id,bot,dir,ref,ts,conv,env) VALUES (?,?,?,?,?,?,?)").bind(m.id, m.bot, m.dir, m.ref, m.ts, m.conv ?? null, JSON.stringify(m.env)).run();

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (!env.DB) return j(500, { error: "not_configured" });
  const url = new URL(request.url), M = request.method;
  const path = url.pathname.replace(/^\/api\/bot\/?/, "").split("/");
  try {
    // ================= App side (unlocked admin session) =================
    if (path[0] === "bots") {
      await requireRole(ctx, "admin");
      const list = await bots(env);
      if (M === "GET" && !path[1]) return j(200, { bots: await Promise.all(list.map(async b => ({ id: b.id, name: b.name, builtin: !!b.builtin, hasHook: !!(await hookOf(env, b).catch(() => ({ url: "" }))).url, hasToken: b.builtin ? !!env.BOT_TOKEN_HASH : !!b.token_hash }))) });
      const body: any = M === "GET" || M === "DELETE" ? {} : await request.json().catch(() => ({}));
      const enc = async (u: string, k: string) => encryptJSON(await vkey(env), { url: u, key: k });
      const okUrl = (u: any) => typeof u === "string" && (u === "" || /^https:\/\/\S{4,500}$/.test(u));
      if (M === "POST" && !path[1]) {
        const name = String(body.name || "").trim().slice(0, 40); if (!name) return j(400, { error: "name_required" });
        if (!okUrl(body.webhook_url || "")) return j(400, { error: "bad_url" });
        if (list.length >= 12) return j(400, { error: "too_many" });
        let id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "bot";
        while (list.some(b => b.id === id)) id = id.slice(0, 20) + "-" + rid(2).toLowerCase().replace(/[^a-z0-9]/g, "x");
        const token = "jbt_" + rid(32);
        const b: Bot = { id, name, created: Date.now(), token_hash: await sha256hex(token), hook: (body.webhook_url ? await enc(body.webhook_url, String(body.webhook_key || "")) : undefined) };
        await saveBot(env, b);
        return j(200, { id, token });           // token shown once
      }
      const b = list.find(x => x.id === path[1]); if (!b) return j(404, { error: "unknown_bot" });
      if (M === "PUT") {
        if (b.builtin) return j(400, { error: "builtin_bot_uses_env" });
        if (body.name) b.name = String(body.name).trim().slice(0, 40);
        if (body.webhook_url !== undefined) {
          if (!okUrl(body.webhook_url)) return j(400, { error: "bad_url" });
          const old = await hookOf(env, b).catch(() => ({ url: "", key: "" }));
          b.hook = body.webhook_url ? await enc(body.webhook_url, body.webhook_key !== undefined ? String(body.webhook_key) : old.key) : undefined;
        }
        await saveBot(env, b); return j(200, { ok: true });
      }
      if (M === "POST" && path[2] === "token") {
        if (b.builtin) return j(400, { error: "builtin_bot_uses_env" });
        const token = "jbt_" + rid(32); b.token_hash = await sha256hex(token); await saveBot(env, b);
        return j(200, { token });
      }
      if (M === "DELETE") { if (b.builtin) return j(400, { error: "builtin" }); await env.DB!.prepare("DELETE FROM bot_bots WHERE id=?").bind(b.id).run(); return j(200, { ok: true }); }
      return j(405, { error: "method" });
    }
    if (path[0] === "send" && M === "POST") {
      await requireRole(ctx, "admin");
      const body: any = await request.json().catch(() => null);
      if (!envOk(body?.envelope, "task") || !attsOk(body.atts)) return j(400, { error: "bad_envelope" });
      const bot = (await bots(env)).find(b => b.id === (body.bot || "grok")); if (!bot) return j(404, { error: "unknown_bot" });
      const conv = typeof body.conv === "string" && /^[A-Za-z0-9_-]{4,40}$/.test(body.conv) ? body.conv : undefined;
      const ts = Date.now(), ref = rid(), id = String(ts).padStart(13, "0") + "-" + rid(6);
      await putMsg(env, { id, bot: bot.id, dir: "task", ref, ts, conv, env: body.envelope });
      await putAtts(env, ref, bot.id, "task", body.atts);
      ctx.waitUntil(env.DB!.batch([env.DB!.prepare("DELETE FROM bot_msgs WHERE ts < ?").bind(ts - TTL_MS), env.DB!.prepare("DELETE FROM bot_atts WHERE ts < ?").bind(ts - TTL_MS)]).catch(() => {}));
      let webhook = "not_configured";
      const h = await hookOf(env, bot).catch(() => ({ url: "", key: "" }));
      if (/^https:\/\//.test(h.url)) {
        try {
          const key = h.key.replace(/^bearer\s+/i, "");
          const r = await fetch(h.url, { method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ job_ref: ref, bot: bot.id }), signal: AbortSignal.timeout(15000) });
          webhook = r.ok ? "sent" : "error_" + r.status;
        } catch { webhook = "unreachable"; }
      }
      return j(200, { ok: true, id, ref, webhook });
    }
    if (path[0] === "inbox" && M === "GET") {
      await requireRole(ctx, "admin");
      const want = url.searchParams.get("bot") || "grok";
      const r = await env.DB!.prepare("SELECT * FROM (SELECT * FROM bot_msgs WHERE bot=? ORDER BY ts DESC LIMIT 200) ORDER BY ts").bind(want).all();
      const items = (r.results || []).map(row);
      if (items.length) {
        const a = await env.DB!.prepare("SELECT id,ref,dir,size FROM bot_atts WHERE bot=? AND ts >= ?").bind(want, Math.min(...items.map((i: any) => i.ts)) - 60000).all<any>();
        for (const x of a.results || []) { const m = items.find((i: any) => i.ref === x.ref && i.dir === x.dir); if (m) (m.atts ||= []).push({ id: x.id, size: x.size }); }
      }
      return j(200, { items });
    }
    if (path[0] === "answer" && REF.test(path[1] || "") && M === "GET") {   // fast poll for one job's reply (no list delay)
      await requireRole(ctx, "admin");
      const it = await getBy(env, path[1], "reply"); if (!it) return j(200, { pending: true });
      it.atts = await attList(env, path[1], "reply");
      return j(200, { item: it });
    }
    if (path[0] === "msg" && path[1] && M === "DELETE") {
      await requireRole(ctx, "admin");
      await env.DB!.prepare("DELETE FROM bot_msgs WHERE id=?").bind(path[1].replace(/[^0-9A-Za-z_-]/g, "")).run();
      return j(200, { ok: true });
    }
    // attachment download: app (admin) or the owning bot
    if (path[0] === "att" && /^[A-Za-z0-9_.-]{20,100}$/.test(path[1] || "") && M === "GET") {
      const a: any = await env.DB!.prepare("SELECT bot,env FROM bot_atts WHERE id=?").bind(path[1]).first();
      const tb = await botFromToken(request, env);
      if (!tb) await requireRole(ctx, "admin"); else if (!a || a.bot !== tb.id) return j(404, { error: "not_found" });
      if (!a) return j(404, { error: "not_found" });
      return j(200, { envelope: JSON.parse(a.env) });
    }
    // ================= Bot side (Bearer bot token; each bot sees only its own jobs) =================
    const bot = await botFromToken(request, env);
    if (!bot) return j(401, { error: "unauthorized" });
    if (path[0] === "job" && REF.test(path[1] || "") && M === "GET") {
      const o = await getBy(env, path[1], "task");
      if (!o || o.bot !== bot.id) return j(404, { error: "not_found" });
      return j(200, { ref: o.ref, ts: o.ts, bot: bot.id, envelope: o.env, atts: await attList(env, o.ref, "task") });
    }
    if (path[0] === "pending" && M === "GET") {
      const r = await env.DB!.prepare("SELECT t.ref, t.ts FROM bot_msgs t WHERE t.bot=? AND t.dir='task' AND NOT EXISTS (SELECT 1 FROM bot_msgs r WHERE r.ref=t.ref AND r.dir='reply') ORDER BY t.ts").bind(bot.id).all();
      return j(200, { bot: bot.id, pending: r.results || [] });
    }
    if (path[0] === "reply" && M === "POST") {
      const ref = url.searchParams.get("job") || "";
      const t = REF.test(ref) ? await getBy(env, ref, "task") : null;
      if (!t || t.bot !== bot.id) return j(404, { error: "unknown_job" });
      const body: any = await request.json().catch(() => null);
      if (!envOk(body?.envelope, "reply") || !attsOk(body.atts)) return j(400, { error: "bad_envelope" });
      const ts = Date.now(), id = String(ts).padStart(13, "0") + "-" + rid(6);
      if (await getBy(env, ref, "reply")) return j(409, { error: "already_answered" });
      await putMsg(env, { id, bot: bot.id, dir: "reply", ref, ts, conv: t.conv, env: body.envelope });
      await putAtts(env, ref, bot.id, "reply", body.atts);
      ctx.waitUntil(pushAll(env, { title: "Jeffa", body: "Neue Antwort von " + bot.name, tag: "bot-" + bot.id, url: "/#bot" }).catch(() => 0));
      return j(200, { ok: true, id });
    }
    return j(404, { error: "not_found" });
  } catch (e) {
    if (e instanceof AuthError) return j(e.status, { error: e.code });
    return j(500, { error: "server_error" });
  }
};
