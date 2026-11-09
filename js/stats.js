// Statistiques de visites : clés de période (heure de Paris), suivi des visites, préparation des séries.
// Visiteurs = appareils/navigateurs différents sur la période ; Visites = sessions (onglet ouvert).
// Les visites de l'auteur (appareil où il s'est connecté) ne sont pas comptées.

export const PERIODS = [
  { id: 'day', prefix: 'd', label: 'Jour', count: 30, current: 'Aujourd’hui' },
  { id: 'week', prefix: 'w', label: 'Semaine', count: 12, current: 'Cette semaine' },
  { id: 'month', prefix: 'm', label: 'Mois', count: 12, current: 'Ce mois-ci' },
  { id: 'quarter', prefix: 'q', label: 'Trimestre', count: 8, current: 'Ce trimestre' },
  { id: 'semester', prefix: 's', label: 'Semestre', count: 6, current: 'Ce semestre' },
  { id: 'year', prefix: 'y', label: 'Année', count: 0, current: 'Cette année' }, // 0 = depuis le début
];

export const STAT_KEY_RE = /^(all|d-\d{4}-\d{2}-\d{2}|w-\d{4}-W\d{2}|m-\d{4}-\d{2}|q-\d{4}-Q[1-4]|s-\d{4}-S[12]|y-\d{4})$/;

const pad = (n) => String(n).padStart(2, '0');

/** Date du jour à Paris, au format { y, m, d }. */
export function parisDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

const toUTC = ({ y, m, d }) => new Date(Date.UTC(y, m - 1, d));
const fromUTC = (dt) => ({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
export const addDays = (date, n) => fromUTC(new Date(toUTC(date).getTime() + n * 86400000));

/** Semaine ISO 8601 (lundi → dimanche) : { year, week }. */
export function isoWeek(date) {
  const dt = toUTC(date);
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return { year: dt.getUTCFullYear(), week: Math.ceil(((dt - yearStart) / 86400000 + 1) / 7) };
}

export function periodKey(period, date) {
  const { y, m, d } = date;
  switch (period) {
    case 'day': return `d-${y}-${pad(m)}-${pad(d)}`;
    case 'week': { const w = isoWeek(date); return `w-${w.year}-W${pad(w.week)}`; }
    case 'month': return `m-${y}-${pad(m)}`;
    case 'quarter': return `q-${y}-Q${Math.ceil(m / 3)}`;
    case 'semester': return `s-${y}-S${m <= 6 ? 1 : 2}`;
    case 'year': return `y-${y}`;
    case 'all': return 'all';
    default: throw new Error('période inconnue');
  }
}

/** Les clés de toutes les périodes contenant cette date (plus le total « all »). */
export function allKeys(date) {
  return Object.fromEntries([...PERIODS.map((p) => [p.id, periodKey(p.id, date)]), ['all', 'all']]);
}

/** Les n dernières clés d'une période (de la plus ancienne à la plus récente), jusqu'à aujourd'hui inclus. */
export function lastKeys(period, n, today) {
  const keys = [];
  if (period === 'day' || period === 'week') {
    let cur = today;
    const step = period === 'day' ? 1 : 7;
    while (keys.length < n) {
      const k = periodKey(period, cur);
      if (!keys.includes(k)) keys.unshift(k);
      cur = addDays(cur, -step);
    }
    return keys;
  }
  const monthsPer = { month: 1, quarter: 3, semester: 6, year: 12 }[period];
  let y = today.y;
  let m = today.m;
  while (keys.length < n) {
    keys.unshift(periodKey(period, { y, m, d: 1 }));
    m -= monthsPer;
    while (m < 1) { m += 12; y -= 1; }
  }
  return keys;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Libellé lisible d'une clé : court (axe) et long (infobulle / tableau). */
export function keyLabel(key) {
  let m;
  if ((m = key.match(/^d-(\d{4})-(\d{2})-(\d{2})$/))) {
    const short = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
    return { short, long: `${short} ${m[1]}` };
  }
  if ((m = key.match(/^w-(\d{4})-W(\d{2})$/))) {
    // lundi de la semaine ISO
    const jan4 = { y: Number(m[1]), m: 1, d: 4 };
    const day = toUTC(jan4).getUTCDay() || 7;
    const monday = addDays(jan4, 1 - day + (Number(m[2]) - 1) * 7);
    return { short: `S${Number(m[2])}`, long: `Semaine ${Number(m[2])} (du ${monday.d} ${MONTHS[monday.m - 1]} ${monday.y})` };
  }
  if ((m = key.match(/^m-(\d{4})-(\d{2})$/))) return { short: `${MONTHS[Number(m[2]) - 1]}`, long: `${MONTHS[Number(m[2]) - 1]} ${m[1]}` };
  if ((m = key.match(/^q-(\d{4})-Q([1-4])$/))) return { short: `T${m[2]} ${m[1].slice(2)}`, long: `${m[2]}${m[2] === '1' ? 'er' : 'e'} trimestre ${m[1]}` };
  if ((m = key.match(/^s-(\d{4})-S([12])$/))) return { short: `S${m[2]} ${m[1].slice(2)}`, long: `${m[2] === '1' ? '1er' : '2e'} semestre ${m[1]}` };
  if ((m = key.match(/^y-(\d{4})$/))) return { short: m[1], long: m[1] };
  return { short: key, long: key };
}

/** Série prête à tracer pour une période : [{ key, short, long, visitors, visits }]. */
export function buildSeries(stats, period, today) {
  const p = PERIODS.find((x) => x.id === period);
  let n = p.count;
  if (!n) {
    const years = Object.keys(stats).filter((k) => /^y-\d{4}$/.test(k)).map((k) => Number(k.slice(2)));
    const first = years.length ? Math.min(...years) : today.y;
    n = Math.max(1, today.y - first + 1);
  }
  return lastKeys(period, n, today).map((key) => ({
    key, ...keyLabel(key), visitors: Number(stats[key]?.visitors) || 0, visits: Number(stats[key]?.visits) || 0,
  }));
}

/** Premier jour compté (clé de jour la plus ancienne). */
export function firstDay(stats) {
  const days = Object.keys(stats).filter((k) => k.startsWith('d-')).sort();
  return days.length ? days[0].slice(2) : '';
}

// ---------- Suivi d'une visite ----------

const AUTHOR_KEY = 'suivi-livres:auteur';
const SEEN_KEY = 'suivi-livres:vu';
const SESSION_KEY = 'suivi-livres:session-comptee';

const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };

export function markAuthorDevice(local) {
  safe(() => local && local.setItem(AUTHOR_KEY, '1'));
}

/**
 * Prépare les incréments pour une visite. Retourne null si rien à compter.
 * - visits +1 sur chaque période : une fois par session (onglet)
 * - visitors +1 sur une période : la première fois que cet appareil vient dans cette période
 */
export function planVisit({ local, session, now = new Date() }) {
  if (safe(() => local && local.getItem(AUTHOR_KEY) === '1', false)) return null;
  const keys = allKeys(parisDate(now));
  const newSession = !safe(() => session && session.getItem(SESSION_KEY) === '1', false);
  const seen = safe(() => JSON.parse((local && local.getItem(SEEN_KEY)) || '{}'), {}) || {};
  const canRemember = safe(() => { local.setItem('__t', '1'); local.removeItem('__t'); return true; }, false);
  const updates = [];
  const nextSeen = {};
  for (const [period, key] of Object.entries(keys)) {
    // sans stockage local (navigation privée stricte) : on compte un visiteur par session
    const newVisitor = canRemember ? seen[period] !== key : newSession;
    nextSeen[period] = key;
    if (newSession || newVisitor) updates.push({ key, visits: newSession ? 1 : 0, visitors: newVisitor ? 1 : 0 });
  }
  return !updates.length ? null : { updates, commit: () => {
    safe(() => session && session.setItem(SESSION_KEY, '1'));
    safe(() => local && local.setItem(SEEN_KEY, JSON.stringify(nextSeen)));
  } };
}

/** Enregistre la visite (silencieux en cas d'échec : ne doit jamais gêner l'affichage). */
export async function trackVisit({ backend, local, session, now, isBot = false }) {
  if (isBot || typeof backend.recordVisit !== 'function') return false;
  const plan = planVisit({ local, session, now });
  if (!plan) return false;
  try {
    await backend.recordVisit(plan.updates);
    plan.commit();
    return true;
  } catch (e) {
    return false;
  }
}
