import { Env, intVar } from "./env";

const memoryLimits = new Map<string, number[]>();

/** IPv6 clients get many addresses per /64 – group them so rotation doesn't bypass limits. */
export function clientKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const parts = ip.split("::")[0].split(":");
  const full = ip.includes("::") ? [...parts, "0", "0", "0", "0"] : ip.split(":");
  return full.slice(0, 4).join(":") + "::/64";
}

export async function checkRateLimit(env: Env, rawIp: string): Promise<void> {
  const ip = clientKey(rawIp);
  const limit = intVar(env.RATE_LIMIT_PER_MIN, 30);
  const now = Date.now();
  const key = `ratelimit:${ip}`;
  const windowMs = 60000;

  if (env.DB) {
    // D1 is strongly consistent (KV reads are edge-cached and miss bursts).
    try {
      const since = now - windowMs;
      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_hits WHERE ip = ? AND ts > ?").bind(ip, since).first<{ n: number }>();
      if ((row?.n ?? 0) >= limit) throw new RateLimitError();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO rate_hits (ip, ts) VALUES (?, ?)").bind(ip, now),
        env.DB.prepare("DELETE FROM rate_hits WHERE ts < ?").bind(now - 10 * windowMs),
      ]);
      return;
    } catch (e) {
      if (e instanceof RateLimitError) throw e;
      console.warn("ratelimit d1 failed:", (e as Error).message);
    }
  }
  if (env.KV) {
    const val = await env.KV.get(key);
    const timestamps = val ? JSON.parse(val) : [];
    const recent = timestamps.filter((t: number) => now - t < windowMs);
    if (recent.length >= limit) throw new RateLimitError();
    recent.push(now);
    await env.KV.put(key, JSON.stringify(recent), { expirationTtl: 60 });
  } else {
    let timestamps = memoryLimits.get(key) || [];
    timestamps = timestamps.filter((t) => now - t < windowMs);
    if (timestamps.length >= limit) throw new RateLimitError();
    timestamps.push(now);
    memoryLimits.set(key, timestamps);
  }
}

export class RateLimitError extends Error {
  constructor() {
    super("Zu viele Anfragen");
    this.name = "RateLimitError";
  }
}
