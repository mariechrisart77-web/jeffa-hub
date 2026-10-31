// GET öffentlich / POST admin — Seiten-Anpassungen.
import type { Env } from "../../../src/env";
import { requireRole } from "../../../src/auth";
import { loadConfig, setConfig, configVersion } from "../../../src/site-config-store";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const config = await loadConfig(context.env);
  const version = await configVersion(context.env);
  return Response.json({ config, version }, { headers: { "cache-control": "no-store" } });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  await requireRole(context, "admin");
  const body: any = await context.request.json().catch(() => ({}));
  try {
    const r = await setConfig(context.env, "admin", Array.isArray(body.changes) ? body.changes : []);
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: { code: "config_error", message: (e as Error).message } }, { status: 400 });
  }
};
