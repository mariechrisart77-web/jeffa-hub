import { Env } from "../../../../src/env";
import { checkRateLimit } from "../../../../src/ratelimit";
import { requireRole } from "../../../../src/auth";

interface Task {
  id: number;
  title: string;
  body: string | null;
  assignee: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!context.env.DB) {
    return new Response(JSON.stringify({ error: { code: "d1_missing", message: "D1-Datenbank nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const id = context.params.id as string;
  const task = await context.env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Task>();

  if (!task) {
    return new Response(JSON.stringify({ error: { code: "not_found", message: "Aufgabe nicht gefunden" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ task }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  await requireRole(context, "admin");
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  if (!context.env.DB) {
    return new Response(JSON.stringify({ error: { code: "d1_missing", message: "D1-Datenbank nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const id = context.params.id as string;
  const body: Partial<Task> = await context.request.json();
  const { title, body: taskBody, assignee, status } = body;

  const updates: string[] = [];
  const values: any[] = [];

  if (title !== undefined) {
    if (typeof title !== "string" || title.length > 200) {
      return new Response(JSON.stringify({ error: { code: "invalid_input", message: "title max 200 Zeichen" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    updates.push("title = ?");
    values.push(title);
  }
  if (taskBody !== undefined) {
    updates.push("body = ?");
    values.push(taskBody || null);
  }
  if (assignee !== undefined) {
    updates.push("assignee = ?");
    values.push(assignee || null);
  }
  if (status !== undefined) {
    if (!["offen", "in_arbeit", "erledigt"].includes(status)) {
      return new Response(JSON.stringify({ error: { code: "invalid_input", message: "status muss offen/in_arbeit/erledigt sein" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    updates.push("status = ?");
    values.push(status);
  }

  if (updates.length === 0) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "Keine Änderungen" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  const result = await context.env.DB.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ? RETURNING *`).bind(...values).first<Task>();

  if (!result) {
    return new Response(JSON.stringify({ error: { code: "not_found", message: "Aufgabe nicht gefunden" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ task: result }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  await requireRole(context, "admin");
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  if (!context.env.DB) {
    return new Response(JSON.stringify({ error: { code: "d1_missing", message: "D1-Datenbank nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const id = context.params.id as string;
  const result = await context.env.DB.prepare("DELETE FROM tasks WHERE id = ? RETURNING id").bind(id).first<{ id: number }>();

  if (!result) {
    return new Response(JSON.stringify({ error: { code: "not_found", message: "Aufgabe nicht gefunden" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(null, { status: 204 });
};
