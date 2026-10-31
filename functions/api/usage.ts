import { Env } from "../../src/env";
import { requireRole } from "../../src/auth";
import { queryUsage } from "../../src/usage";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  await requireRole(context, "read");

  const url = new URL(context.request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);

  if (days < 1 || days > 365) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "days muss zwischen 1 und 365 liegen" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const data = await queryUsage(context.env, days);

  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
