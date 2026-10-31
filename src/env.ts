export interface Env {
  CF_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  AI_GATEWAY_BASE_URL?: string;
  CF_AIG_TOKEN?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  XAI_API_KEY?: string;
  VENICE_API_KEY?: string;
  HF_TOKEN?: string;
  VNAIPRO_API_KEY?: string;
  GROQ_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  RUNWARE_API_KEY?: string;
  VAULT_SECRET?: string;
  RP_ID?: string;
  DEFAULT_MODEL: string;
  IMG_DRYRUN_NOAUTH?: string; // nur lokal: dryRun ohne Auth mit body.profileData
  IMG_DRYRUN_LLM?: string;
  HISTORY_LIMIT: string;
  CACHE_TTL: string;
  MAX_OUTPUT_TOKENS: string;
  SUMMARY_EVERY: string;
  BUDGET_DAILY_USD: string;
  RATE_LIMIT_PER_MIN: string;
  FALLBACK_MODEL?: string;
  HF_VIDEO_MODEL?: string;
  HF_TTS_MODEL?: string;
  HF_VIDEO_PROVIDER?: string;
  BUDGET_GLOBAL_DAILY_USD?: string;
  DB?: D1Database;
  KV?: KVNamespace;
  IMAGES?: R2Bucket;
  BOT_WEBHOOK_URL?: string;
  BOT_WEBHOOK_KEY?: string;
  BOT_TOKEN_HASH?: string;
  VAPID_PRIVATE_JWK?: string;
  BILD_API_KEY?: string;
  BILD_URL?: string;
  BILD_TIMEOUT_MS?: string;
  LUMIAROUTER_API_KEY?: string; // v71: Vision-Bildcheck (Bild nach Generierung prüfen)
  KOLLAB_GEMINI_MODEL?: string; // v86: Modell für Kollab-Mitglieder
  CLAUDE_GATEWAY_MODEL?: string; // v86: Modell für Claude-Vorschläge
  IMG_CHECK_MODEL?: string; // Default: claude-haiku-4-5
  IMG_AUTOCHECK?: string; // '1' = Bildcheck standardmäßig an
  IMG_VISION_MAX_USD?: string; // Monatsdeckel für Vision-Checks (optional)
}

export function intVar(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

export function floatVar(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}
