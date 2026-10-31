// v84b: reine Anzeige-Funktion für Guthaben (ohne DOM – Node-testbar).

const FALLBACK = 'Guthaben nicht abrufbar';

function fmtUsd(n) {
  const v = Math.max(0, Number(n));
  return '$' + (Number.isFinite(v) ? v.toFixed(2) : '0.00');
}

function fmtNum(n) {
  const v = Math.max(0, Number(n));
  if (!Number.isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : String(v);
}

export function balanceLabel(b) {
  if (!b || typeof b !== 'object') return FALLBACK;
  const unit = b.unit === 'DIEM' ? 'DIEM' : 'USD';

  if (b.balanceUsd != null && Number.isFinite(Number(b.balanceUsd))) {
    if (unit === 'DIEM') return `${fmtNum(b.balanceUsd)} DIEM`;
    return fmtUsd(b.balanceUsd);
  }

  const hasUsed = b.usedUsd != null && Number.isFinite(Number(b.usedUsd));
  const hasLimit = b.limitUsd != null && Number.isFinite(Number(b.limitUsd));
  if (hasUsed && hasLimit) return `${fmtUsd(b.usedUsd)} von ${fmtUsd(b.limitUsd)} genutzt`;
  if (hasUsed) return `${fmtUsd(b.usedUsd)} genutzt`;
  if (hasLimit) return `Limit ${fmtUsd(b.limitUsd)}`;

  return b.note || FALLBACK;
}
