// Central cost tracking logic – plain ESM for Node tests
export const BUDGET_OPTIONS = [5, 10, 20, 30, 50, 100];
export const DEFAULT_BUDGET = 20;

export function ampel(spent, budget) {
  const pct = (spent / budget) * 100;
  if (pct >= 100) return 'stop';
  if (pct >= 80) return 'red';
  if (pct >= 50) return 'yellow';
  return 'green';
}

export function forecast(monthSpent, now) {
  const d = new Date(now);
  const dayOfMonth = d.getUTCDate();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (dayOfMonth === 0) return 0;
  return (monthSpent / dayOfMonth) * daysInMonth;
}

export function groupOf(provider) {
  const map = {
    'venice': 'Venice',
    'venice-image': 'Venice',
    'openrouter': 'OpenRouter',
    'vnaipro': 'Claude Gateway (VNAIPro)',
    'google-ai-studio': 'Gemini',
    'grok': 'xAI',
    'groq': 'Groq',
    'mistral': 'Mistral',
    'runware': 'Runware',
  };
  if (provider.startsWith('gpu-')) return 'GPU-Server';
  return map[provider] || provider;
}

export function summarize(rows, now) {
  const d = new Date(now);
  const currentMonth = d.toISOString().slice(0, 7);
  const today = d.toISOString().slice(0, 10);
  
  let monthSpent = 0;
  let todaySpent = 0;
  const byProvider = {};
  
  for (const r of rows) {
    if (!r.day.startsWith(currentMonth)) continue;
    const cost = r.cost_usd || 0;
    monthSpent += cost;
    if (r.day === today) todaySpent += cost;
    
    const group = groupOf(r.provider);
    if (!byProvider[group]) byProvider[group] = { today: 0, month: 0 };
    byProvider[group].month += cost;
    if (r.day === today) byProvider[group].today += cost;
  }
  
  return {
    today: todaySpent,
    month: monthSpent,
    forecast: forecast(monthSpent, now),
    byProvider,
  };
}

export function budgetAllowsGpu({ monthSpent, budget }) {
  if (monthSpent >= budget) {
    return { ok: false, reason: 'Monats-Budget erreicht' };
  }
  return { ok: true };
}

export function gpuIdleShouldStop(lastActivityMs, nowMs, minutes = 30) {
  return nowMs - lastActivityMs >= minutes * 60 * 1000;
}
