import { Env } from "../../../src/env";
import { requireRole, AuthError } from "../../../src/auth";
import { loadSyncedProfile } from "../../../src/imgsvc-db";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function validateId(id: string): boolean {
  return ID_PATTERN.test(id);
}

function errorResponse(code: string, status: number = 400): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    await requireRole(context, "read");
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.code, e.status);
    throw e;
  }

  const { path } = context.params;
  const pathStr = Array.isArray(path) ? path.join("/") : path;

  if (!pathStr || pathStr === "") {
    // GET /api/profiles → {items:[{id,updated}]}
    try {
      const { results } = await context.env.DB!.prepare(
        "SELECT id, updated FROM profiles_sync ORDER BY updated DESC"
      ).all<{ id: string; updated: number }>();
      return new Response(JSON.stringify({ items: results }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    } catch (err) {
      return errorResponse("database_error", 500);
    }
  }

  // GET /api/profiles/:id
  if (!validateId(pathStr)) {
    return errorResponse("bad_input", 400);
  }

  try {
    const row = await loadSyncedProfile(context.env, pathStr);
    if (!row) {
      return errorResponse("profile_not_found", 404);
    }
    return new Response(JSON.stringify(row), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err) {
    return errorResponse("database_error", 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    await requireRole(context, "read");
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.code, e.status);
    throw e;
  }

  const { path } = context.params;
  const pathStr = Array.isArray(path) ? path.join("/") : path;

  if (!pathStr || !validateId(pathStr)) {
    return errorResponse("bad_input", 400);
  }

  let body: { profile?: any; resolved?: any };
  try {
    body = await context.request.json();
  } catch {
    return errorResponse("bad_input", 400);
  }

  const { profile, resolved } = body;
  if (!profile || typeof profile !== "object" || !resolved || typeof resolved !== "object") {
    return errorResponse("bad_input", 400);
  }

  const data = JSON.stringify({ profile, resolved });
  if (new TextEncoder().encode(data).length > 200 * 1024) {
    return errorResponse("too_large", 413);
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    await context.env.DB!.prepare(
      "INSERT INTO profiles_sync (id, data, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated=excluded.updated"
    ).bind(pathStr, data, now).run();

    return new Response(JSON.stringify({ id: pathStr, updated: now }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err) {
    return errorResponse("database_error", 500);
  }
};
