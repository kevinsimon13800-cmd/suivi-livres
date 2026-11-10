// Compteur de livres lus : périodes (semaine, mois, trimestre, semestre, année). Logique pure, sans interface.
import { isValidDate } from './logic.js?v=7';

export const PERIODS = [
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
  { id: 'quarter', label: 'Trimestre' },
  { id: 'semester', label: 'Semestre' },
  { id: 'year', label: 'Année' },
];

const U = (y, m, d) => new Date(Date.UTC(y, m, d));
const iso = (dt) => dt.toISOString().slice(0, 10);
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return U(y, m - 1, d);
};
const fr = (dt, opts) => dt.toLocaleDateString('fr-FR', { ...opts, timeZone: 'UTC' });

/**
 * Période contenant `today` (décalée de `offset` périodes : 0 = en cours, -1 = précédente).
 * Retourne { start, end (exclue), label } en dates ISO. La semaine commence le lundi.
 */
export function rangeFor(period, offset, today) {
  const t = parse(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  let s;
  let e;
  if (period === 'week') {
    const dow = (t.getUTCDay() + 6) % 7;
    s = U(y, m, t.getUTCDate() - dow + 7 * offset);
    e = U(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + 7);
  } else if (period === 'month') {
    s = U(y, m + offset, 1);
    e = U(y, m + offset + 1, 1);
  } else if (period === 'quarter') {
    const q = Math.floor(m / 3) * 3;
    s = U(y, q + 3 * offset, 1);
    e = U(y, q + 3 * offset + 3, 1);
  } else if (period === 'semester') {
    const q = Math.floor(m / 6) * 6;
    s = U(y, q + 6 * offset, 1);
    e = U(y, q + 6 * offset + 6, 1);
  } else {
    s = U(y + offset, 0, 1);
    e = U(y + offset + 1, 0, 1);
  }
  const last = U(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate() - 1);
  let label;
  if (period === 'week') label = `${fr(s, { day: 'numeric', month: 'short' })} au ${fr(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  else if (period === 'month') label = fr(s, { month: 'long', year: 'numeric' });
  else if (period === 'quarter') label = `T${Math.floor(s.getUTCMonth() / 3) + 1} ${s.getUTCFullYear()}`;
  else if (period === 'semester') label = `S${Math.floor(s.getUTCMonth() / 6) + 1} ${s.getUTCFullYear()}`;
  else label = String(s.getUTCFullYear());
  return { start: iso(s), end: iso(e), label };
}

/** Lectures terminées avec une date de fin valide (seules celles-ci peuvent être placées dans une période). */
export const finishedReadings = (readings) => (readings || []).filter((r) => r.status === 'terminee' && isValidDate(r.finishedAt || ''));

/** Lectures terminées sans date de fin : non comptées, signalées à l'auteure. */
export const undatedFinished = (readings) => (readings || []).filter((r) => r.status === 'terminee' && !isValidDate(r.finishedAt || ''));

export function inRange(readings, range) {
  return finishedReadings(readings)
    .filter((r) => r.finishedAt >= range.start && r.finishedAt < range.end)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
}

/** Nombre de livres terminés dans la période en cours, pour chaque période. */
export function countsNow(readings, today) {
  return Object.fromEntries(PERIODS.map((p) => [p.id, inRange(readings, rangeFor(p.id, 0, today)).length]));
}

/** 12 valeurs : livres terminés par mois pour une année donnée. */
export function monthlySeries(readings, year) {
  const out = Array(12).fill(0);
  for (const r of finishedReadings(readings)) {
    if (Number(r.finishedAt.slice(0, 4)) === year) out[Number(r.finishedAt.slice(5, 7)) - 1] += 1;
  }
  return out;
}
