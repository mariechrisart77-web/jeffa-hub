import { Env } from "../../../src/env";
import { requireRole } from "../../../src/auth";
import { checkRateLimit } from "../../../src/ratelimit";

interface Subscription {
  id: number;
  name: string;
  provider: string;
  start_date: string;
  end_date: string | null;
  cancel_url: string | null;
  note: string | null;
  created_at: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  await requireRole(context, "read");

  if (!context.env.DB) {
    return new Response(JSON.stringify({ error: { code: "d1_missing", message: "D1-Datenbank nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const result = await context.env.DB.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC").all<Subscription>();
  return new Response(JSON.stringify({ subscriptions: result.results || [] }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  await requireRole(context, "admin");

  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  if (!context.env.DB) {
    return new Response(JSON.stringify({ error: { code: "d1_missing", message: "D1-Datenbank nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const body: Partial<Subscription> = await context.request.json();
  const { name, provider, start_date, end_date, cancel_url, note } = body;

  if (!name || !provider || !start_date || typeof name !== "string" || typeof provider !== "string" || typeof start_date !== "string") {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "name, provider, start_date erforderlich" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const result = await context.env.DB.prepare(
    "INSERT INTO subscriptions (name, provider, start_date, end_date, cancel_url, note) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
  )
    .bind(name, provider, start_date, end_date || null, cancel_url || null, note || null)
    .first<Subscription>();

  return new Response(JSON.stringify({ subscription: result }), {
    status: 201,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  await requireRole(context, "admin");

  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  if (!context.env.DB) {
    return new Response(JSON.stringify({ error: { code: "d1_missing", message: "D1-Datenbank nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const id = parseInt((context.params.route as string[])?.[0] || "", 10);
  if (!id) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "ID erforderlich" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const body: Partial<Subscription> = await context.request.json();
  const { name, provider, start_date, end_date, cancel_url, note } = body;

  const result = await context.env.DB.prepare(
    "UPDATE subscriptions SET name = ?, provider = ?, start_date = ?, end_date = ?, cancel_url = ?, note = ? WHERE id = ? RETURNING *"
  )
    .bind(name || "", provider || "", start_date || "", end_date || null, cancel_url || null, note || null, id)
    .first<Subscription>();

  if (!result) {
    return new Response(JSON.stringify({ error: { code: "not_found", message: "Subscription nicht gefunden" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ subscription: result }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  await requireRole(context, "admin");

  if (!context.env.DB) {
    return new Response(JSON.stringify({ error: { code: "d1_missing", message: "D1-Datenbank nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const id = parseInt((context.params.route as string[])?.[0] || "", 10);
  if (!id) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "ID erforderlich" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const result = await context.env.DB.prepare("DELETE FROM subscriptions WHERE id = ? RETURNING *").bind(id).first<Subscription>();

  if (!result) {
    return new Response(JSON.stringify({ error: { code: "not_found", message: "Subscription nicht gefunden" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
