// GET /api/img/gen/... – serves generated images from R2. Access: valid signature (issued only to the logged-in owner) or a Bearer session.
import { Env } from "../../../src/env";
import { getSession } from "../../../src/auth";
// @ts-ignore plain JS helper
import { KEY_RE, verifySig } from "../../../src/r2img.js";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { path } = context.params;
  const key = Array.isArray(path) ? path.join("/") : String(path || "");
  if (!KEY_RE.test(key)) return new Response("bad key", { status: 400 });
  const u = new URL(context.request.url);
  const ok = (await verifySig(context.env.VAULT_SECRET, key, u.searchParams.get("exp"), u.searchParams.get("sig"))) || !!(await getSession(context));
  if (!ok) return new Response("unauthorized", { status: 401 });
  if (!context.env.IMAGES) return new Response("r2 not bound", { status: 503 });
  const obj = await context.env.IMAGES.get(key);
  if (!obj) return new Response("not found", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "image/webp", "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
};
