import { Env } from "../../../../src/env";
import { checkRateLimit } from "../../../../src/ratelimit";

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

  const result = await context.env.DB.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all<Task>();
  return new Response(JSON.stringify({ tasks: result.results || [] }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  if (!context.env.DB) {
    return new Response(JSON.stringify({ error: { code: "d1_missing", message: "D1-Datenbank nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const body: Partial<Task> = await context.request.json();
  const { title, body: taskBody, assignee } = body;

  if (!title || typeof title !== "string" || title.length > 200) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "title erforderlich, max 200 Zeichen" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const result = await context.env.DB.prepare("INSERT INTO tasks (title, body, assignee) VALUES (?, ?, ?) RETURNING *")
    .bind(title, taskBody || null, assignee || null)
    .first<Task>();

  return new Response(JSON.stringify({ task: result }), {
    status: 201,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
