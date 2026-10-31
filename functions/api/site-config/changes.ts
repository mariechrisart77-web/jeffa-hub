// GET /api/site-config/changes — Änderungsverlauf.
import type { Env } from "../../../src/env";
import { requireRole } from "../../../src/auth";
import { listChanges } from "../../../src/site-config-store";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  await requireRole(context, "read");
  const changes = await listChanges(context.env, 50);
  return Response.json({ changes }, { headers: { "cache-control": "no-store" } });
};
