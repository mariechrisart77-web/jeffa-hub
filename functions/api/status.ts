import { Env, intVar, floatVar } from "../../src/env";
import { getKey } from "../../src/keys";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const providers: Record<string, boolean> = {
    "google-ai-studio": Boolean(await getKey(context.env, "gemini")),
    openrouter: Boolean(await getKey(context.env, "openrouter")),
    grok: Boolean(await getKey(context.env, "xai")),
    venice: Boolean(await getKey(context.env, "venice")),
    hf: Boolean(await getKey(context.env, "hf")),
    vnaipro: Boolean(await getKey(context.env, "vnaipro")),
    groq: Boolean(await getKey(context.env, "groq")),
    mistral: Boolean(await getKey(context.env, "mistral")),
    runware: Boolean(await getKey(context.env, "runware")),
  };

  let gatewayReachable = false;
  let gatewayLatencyMs: number | null = null;

  const base = context.env.AI_GATEWAY_BASE_URL?.replace(/\/$/, "");
  if (base || (context.env.CF_ACCOUNT_ID && !context.env.CF_ACCOUNT_ID.startsWith("DEINE") && context.env.AI_GATEWAY_ID)) {
    const root = base ?? `https://gateway.ai.cloudflare.com/v1/${context.env.CF_ACCOUNT_ID}/${context.env.AI_GATEWAY_ID}`;
    const key = await getKey(context.env, "gemini");
    const started = Date.now();
    try {
      const url = new URL(`${root}/google-ai-studio/v1beta/models`);
      if (key) url.searchParams.set("key", key);
      const res = await fetch(url.toString(), {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      gatewayLatencyMs = Date.now() - started;
      gatewayReachable = res.status < 500;
    } catch {
      gatewayLatencyMs = Date.now() - started;
    }
  }

  const d1Available = Boolean(context.env.DB);

  const media = {
    image: Boolean(await getKey(context.env, "venice")) || Boolean(await getKey(context.env, "hf")),
    video: Boolean(await getKey(context.env, "hf")),
    tts: { browser: true, edge: true, hf: Boolean(await getKey(context.env, "hf") && context.env.HF_TTS_MODEL) },
  };

  let backup: Record<string, unknown> | null = null;
  try {
    const kv = context.env.KV!;
    const [backupStatus, restoreCheck] = (await Promise.all([
      kv.get("backup:status", "json"),
      kv.get("backup:restorecheck", "json")
    ])) as [any, any];
    if (backupStatus) {
      backup = {
        lastRun: backupStatus.lastRun,
        ok: backupStatus.ok,
        target: backupStatus.target,
        bytes: backupStatus.bytes,
        error: backupStatus.error,
        restore: restoreCheck ? { ok: restoreCheck.ok, at: restoreCheck.at } : null
      };
    }
  } catch {}

  return new Response(
    JSON.stringify({
      ok: true,
      providers,
      gateway: {
        configured: Boolean(base || (context.env.CF_ACCOUNT_ID && context.env.AI_GATEWAY_ID)),
        reachable: gatewayReachable,
        latencyMs: gatewayLatencyMs,
      },
      config: {
        defaultModel: context.env.DEFAULT_MODEL,
        historyLimit: intVar(context.env.HISTORY_LIMIT, 6),
        cacheTtl: intVar(context.env.CACHE_TTL, 3600),
        summaryEvery: intVar(context.env.SUMMARY_EVERY, 8),
        budgetDailyUsd: floatVar(context.env.BUDGET_DAILY_USD, 1),
        rateLimitPerMin: intVar(context.env.RATE_LIMIT_PER_MIN, 30),
      },
      d1: d1Available,
      media,
      backup,
      time: new Date().toISOString(),
    }),
    { headers: { "content-type": "application/json; charset=utf-8" } }
  );
};
