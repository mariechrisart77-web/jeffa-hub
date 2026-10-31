import { Env } from "./env";

export interface UsageRecord {
  day: string;
  provider: string;
  model: string;
  promptTokens: number;
  outputTokens: number;
  requests: number;
  costUsd: number;
}

export async function trackUsage(
  env: Env,
  provider: string,
  model: string,
  promptTokens: number,
  outputTokens: number,
  costUsd: number
): Promise<void> {
  if (!env.DB) return;

  const day = new Date().toISOString().slice(0, 10);

  try {
    await env.DB.prepare(
      `INSERT INTO usage_daily (day, provider, model, prompt_tokens, output_tokens, requests, cost_usd)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(day, provider, model) DO UPDATE SET
         prompt_tokens = prompt_tokens + excluded.prompt_tokens,
         output_tokens = output_tokens + excluded.output_tokens,
         requests = requests + 1,
         cost_usd = cost_usd + excluded.cost_usd`
    )
      .bind(day, provider, model, promptTokens, outputTokens, costUsd)
      .run();
  } catch (e) {
    console.warn("trackUsage failed:", (e as Error).message);
  }
}

export async function queryUsage(env: Env, days: number): Promise<{ providers: Record<string, any>; days: any[] }> {
  if (!env.DB) return { providers: {}, days: [] };

  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const rows = await env.DB.prepare(
    `SELECT day, provider, model, prompt_tokens, output_tokens, requests, cost_usd
     FROM usage_daily WHERE day >= ? ORDER BY day DESC`
  )
    .bind(cutoff)
    .all<{
      day: string;
      provider: string;
      model: string;
      prompt_tokens: number;
      output_tokens: number;
      requests: number;
      cost_usd: number;
    }>();

  const providers: Record<string, any> = {};
  const dayMap: Record<string, any> = {};

  for (const r of rows.results || []) {
    if (!providers[r.provider]) {
      providers[r.provider] = { promptTokens: 0, outputTokens: 0, requests: 0, costUsd: 0, today: null };
    }
    providers[r.provider].promptTokens += r.prompt_tokens;
    providers[r.provider].outputTokens += r.output_tokens;
    providers[r.provider].requests += r.requests;
    providers[r.provider].costUsd += r.cost_usd;

    if (r.day === today) {
      if (!providers[r.provider].today) {
        providers[r.provider].today = { promptTokens: 0, outputTokens: 0, requests: 0, costUsd: 0 };
      }
      providers[r.provider].today.promptTokens += r.prompt_tokens;
      providers[r.provider].today.outputTokens += r.output_tokens;
      providers[r.provider].today.requests += r.requests;
      providers[r.provider].today.costUsd += r.cost_usd;
    }

    if (!dayMap[r.day]) dayMap[r.day] = { day: r.day, promptTokens: 0, outputTokens: 0, requests: 0, costUsd: 0 };
    dayMap[r.day].promptTokens += r.prompt_tokens;
    dayMap[r.day].outputTokens += r.output_tokens;
    dayMap[r.day].requests += r.requests;
    dayMap[r.day].costUsd += r.cost_usd;
  }

  return { providers, days: Object.values(dayMap) };
}
