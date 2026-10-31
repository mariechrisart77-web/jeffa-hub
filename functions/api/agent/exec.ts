// POST /api/agent/exec — apply a user-confirmed write tool (server tools) or audit a client tool.
import type { Env } from "../../../src/env";
import { requireRole } from "../../../src/auth";
import { TOOLS, execServerTool, audit } from "../../../src/tools";
import { checkRateLimit } from "../../../src/ratelimit";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const raw = (await context.request.json()) as { name: string; args: Record<string, unknown>; clientResult?: string; actor?: string };
  const { name, args, clientResult } = raw;
  const actor = raw.actor === "gemini" || raw.actor === "seraphina" ? raw.actor : "admin";
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return Response.json({ error: { code: "unknown_tool", message: "Unbekanntes Werkzeug" } }, { status: 400 });
  await checkRateLimit(context.env, context.request.headers.get("cf-connecting-ip") || "local");
  if (t.write) await requireRole(context, "admin");
  if (t.client) { await audit(context.env, "admin", name, args, true, clientResult || "client"); return Response.json({ ok: true }); }
  try {
    const result = await execServerTool(context.env, t.write ? "admin" : "read", name, args || {}, actor);
    await audit(context.env, "admin", name, args, true, "ok");
    return Response.json({ ok: true, result });
  } catch (e) {
    await audit(context.env, "admin", name, args, false, (e as Error).message);
    return Response.json({ error: { code: "tool_error", message: (e as Error).message } }, { status: 400 });
  }
};
