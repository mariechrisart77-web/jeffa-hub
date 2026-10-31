// POST /api/site-config/undo — letzte Änderung eines Schlüssels zurücknehmen.
import type { Env } from "../../../src/env";
import { requireRole } from "../../../src/auth";
import { undoChange } from "../../../src/site-config-store";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  await requireRole(context, "admin");
  const body: any = await context.request.json().catch(() => ({}));
  try {
    const r = await undoChange(context.env, "admin", Number(body.id));
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: { code: "undo_error", message: (e as Error).message } }, { status: 400 });
  }
};
