// v84b: reine Auswertung der Anbieter-Guthaben-Antworten (ohne fetch – Node-testbar).
// WICHTIG: Es werden NUR Zahlen (und ggf. Währung/Notiz) übernommen – niemals Schlüssel.

export const NO_BALANCE_API = ['gemini', 'hf', 'xai', 'groq', 'mistral'];

const FAIL_NOTE = 'Guthaben nicht abrufbar';

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function clamp0(v) {
  return v == null ? v : Math.max(0, v);
}

export function parseOpenRouter(keyJson, creditsJson) {
  try {
    const usedUsd = num(keyJson?.data?.usage);
    const limitUsd = num(keyJson?.data?.limit);
    const total = num(creditsJson?.data?.total_credits);
    const used = num(creditsJson?.data?.total_usage);
    const out = { unit: 'USD' };
    if (total != null && used != null) out.balanceUsd = clamp0(total - used);
    if (usedUsd != null) out.usedUsd = usedUsd;
    if (limitUsd != null) out.limitUsd = limitUsd;
    if (out.balanceUsd == null && out.usedUsd == null && out.limitUsd == null) return null;
    return out;
  } catch {
    return null;
  }
}

export function parseVenice(json) {
  try {
    const balances = json?.data?.balances;
    if (!balances || typeof balances !== 'object') return null;
    const usd = num(balances.USD);
    if (usd != null) return { unit: 'USD', balanceUsd: clamp0(usd) };
    const diem = num(balances.DIEM);
    if (diem != null) return { unit: 'DIEM', balanceUsd: clamp0(diem) };
    return { unit: 'USD', note: FAIL_NOTE };
  } catch {
    return null;
  }
}

export function parseVnaipro(subJson, usageJson) {
  try {
    const limitUsd = num(subJson?.hard_limit_usd);
    const usedCents = num(usageJson?.total_usage);
    const usedUsd = usedCents != null ? usedCents / 100 : undefined;
    const out = { unit: 'USD' };
    if (limitUsd != null) out.limitUsd = limitUsd;
    if (usedUsd != null) out.usedUsd = usedUsd;
    if (limitUsd != null && usedUsd != null) out.balanceUsd = clamp0(limitUsd - usedUsd);
    if (out.limitUsd == null && out.usedUsd == null) return null;
    return out;
  } catch {
    return null;
  }
}

export function parseRunware(json) {
  try {
    const item = Array.isArray(json?.data) ? json.data[0] : null;
    const bal = item?.balance;
    if (!bal || typeof bal !== 'object') return null;
    const amount = num(bal.amount);
    const free = num(bal.freeBalance);
    if (amount == null && free == null) return null;
    const sum = (amount || 0) + (free || 0);
    const currency = typeof bal.currency === 'string' ? bal.currency : undefined;
    // Nur Zahlen + Währung – die Anbieter-Antwort enthält auch apiKeys, das darf nie durchsickern.
    return { unit: currency === 'DIEM' ? 'DIEM' : 'USD', balanceUsd: clamp0(sum), currency };
  } catch {
    return null;
  }
}
