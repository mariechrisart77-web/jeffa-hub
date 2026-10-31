import { Env } from './env';
import { hkdfDeriveKey, encryptJSON, decryptJSON } from './crypto';

export type Provider = 'gemini' | 'openrouter' | 'venice' | 'hf' | 'xai' | 'vnaipro' | 'groq' | 'mistral' | 'runware';

const ENV_MAP: Record<Provider, keyof Env> = {
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  venice: 'VENICE_API_KEY',
  hf: 'HF_TOKEN',
  xai: 'XAI_API_KEY',
  vnaipro: 'VNAIPRO_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  runware: 'RUNWARE_API_KEY',
};

interface VaultEntry {
  value: string;
  enabled: boolean;
  label?: string;
  updatedAt: number;
}

const cache = new Map<string, { key: string | undefined; expires: number }>();
const CACHE_TTL_MS = 30000;

export async function getKey(env: Env, provider: Provider): Promise<string | undefined> {
  const now = Date.now();
  const cached = cache.get(provider);
  if (cached && cached.expires > now) return cached.key;

  let key: string | undefined;

  if (env.KV && env.VAULT_SECRET) {
    try {
      const vaultKey = `vault:key:${provider}`;
      const encrypted = await env.KV.get(vaultKey);
      if (encrypted) {
        const aesKey = await hkdfDeriveKey(env.VAULT_SECRET, 'vault-salt', 'vault-encryption-key');
        const entry: VaultEntry = await decryptJSON(aesKey, encrypted);
        if (entry.enabled && entry.value) key = entry.value;
      }
    } catch (e) {
      console.warn(`vault read failed for ${provider}:`, (e as Error).message);
    }
  }

  if (!key) {
    const envKey = ENV_MAP[provider];
    key = env[envKey] as string | undefined;
  }

  cache.set(provider, { key, expires: now + CACHE_TTL_MS });
  return key;
}

export async function listKeys(env: Env): Promise<Array<{ provider: Provider; label?: string; enabled: boolean; source: 'vault' | 'env' | 'none'; last4?: string; updatedAt?: number }>> {
  const providers: Provider[] = ['gemini', 'openrouter', 'venice', 'hf', 'xai', 'vnaipro', 'groq', 'mistral', 'runware'];
  const result = [];

  for (const provider of providers) {
    let vaultEntry: VaultEntry | null = null;
    if (env.KV && env.VAULT_SECRET) {
      try {
        const encrypted = await env.KV.get(`vault:key:${provider}`);
        if (encrypted) {
          const aesKey = await hkdfDeriveKey(env.VAULT_SECRET, 'vault-salt', 'vault-encryption-key');
          vaultEntry = await decryptJSON(aesKey, encrypted);
        }
      } catch {}
    }

    const envValue = env[ENV_MAP[provider]] as string | undefined;

    if (vaultEntry) {
      result.push({
        provider,
        label: vaultEntry.label,
        enabled: vaultEntry.enabled,
        source: 'vault' as const,
        last4: vaultEntry.value ? vaultEntry.value.slice(-4) : undefined,
        updatedAt: vaultEntry.updatedAt,
      });
    } else if (envValue) {
      result.push({
        provider,
        enabled: true,
        source: 'env' as const,
        last4: envValue.slice(-4),
      });
    } else {
      result.push({ provider, enabled: false, source: 'none' as const });
    }
  }

  return result;
}

export async function setKey(env: Env, provider: Provider, value?: string, enabled?: boolean, label?: string): Promise<void> {
  if (!env.KV || !env.VAULT_SECRET) throw new Error('KV or VAULT_SECRET not configured');

  const vaultKey = `vault:key:${provider}`;
  const existing = await env.KV.get(vaultKey);
  let entry: VaultEntry = existing ? await decryptJSON(await hkdfDeriveKey(env.VAULT_SECRET, 'vault-salt', 'vault-encryption-key'), existing) : { value: '', enabled: true, updatedAt: 0 };

  if (value !== undefined) entry.value = value;
  if (enabled !== undefined) entry.enabled = enabled;
  if (label !== undefined) entry.label = label;
  entry.updatedAt = Date.now();

  const aesKey = await hkdfDeriveKey(env.VAULT_SECRET, 'vault-salt', 'vault-encryption-key');
  const encrypted = await encryptJSON(aesKey, entry);
  await env.KV.put(vaultKey, encrypted);
  cache.delete(provider);
}

export async function deleteKey(env: Env, provider: Provider): Promise<void> {
  if (!env.KV) throw new Error('KV not configured');
  await env.KV.delete(`vault:key:${provider}`);
  cache.delete(provider);
}

export async function revealKey(env: Env, provider: Provider): Promise<string | undefined> {
  if (!env.KV || !env.VAULT_SECRET) return undefined;
  const encrypted = await env.KV.get(`vault:key:${provider}`);
  if (!encrypted) return undefined;
  const aesKey = await hkdfDeriveKey(env.VAULT_SECRET, 'vault-salt', 'vault-encryption-key');
  const entry: VaultEntry = await decryptJSON(aesKey, encrypted);
  return entry.value;
}

/** Returns a shallow env copy whose provider key vars are resolved via the vault (falls back to env). */
export async function withKeys(env: Env): Promise<Env> {
  const [g, o, v, h, x, gq, ms, rw] = await Promise.all((['gemini', 'openrouter', 'venice', 'hf', 'xai', 'groq', 'mistral', 'runware'] as Provider[]).map((p) => getKey(env, p).catch(() => undefined)));
  return { ...env, GEMINI_API_KEY: g, OPENROUTER_API_KEY: o, VENICE_API_KEY: v, HF_TOKEN: h, XAI_API_KEY: x, GROQ_API_KEY: gq, MISTRAL_API_KEY: ms, RUNWARE_API_KEY: rw } as Env;
}
