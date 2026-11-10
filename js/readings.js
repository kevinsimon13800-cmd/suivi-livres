// « Mes lectures » : logique pure (validation, changements d'état, couverture distante).
import { isValidDate, isValidCover, todayISO } from './logic.js?v=6';

export const READING_STATES = [
  { id: 'en-cours', label: 'En cours', icon: '📖' },
  { id: 'a-lire', label: 'À lire', icon: '🔖' },
  { id: 'terminee', label: 'Terminées', icon: '✓' },
];
export const STATE_SINGULAR = { 'a-lire': 'À lire', 'en-cours': 'En cours', terminee: 'Terminée' };

/** Couverture Wattpad (lien https vers img.wattpad.com uniquement). */
export function isWattpadCoverUrl(v) {
  return typeof v === 'string' && v.length <= 500 && /^https:\/\/img\.wattpad\.com\/[A-Za-z0-9\-._~/%?=&]+$/.test(v);
}

/** Lien d'histoire Wattpad acceptable (https, domaine wattpad.com). */
export function isWattpadUrl(v) {
  return typeof v === 'string' && v.length <= 500 && /^https:\/\/(www\.|m\.)?wattpad\.com\/[A-Za-z0-9\-._~/%?=&#]*$/.test(v);
}

/** Source d'image affichable : photo compressée (data URL) ou couverture Wattpad. Sinon ''. */
export function coverSrc(v) {
  return isValidCover(v) || isWattpadCoverUrl(v) ? v : '';
}

function toInt(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return NaN;
  return n;
}

export function validateReading(input) {
  const errors = {};
  const title = String(input.title ?? '').trim();
  if (!title) errors.title = 'Le titre est obligatoire.';
  else if (title.length > 150) errors.title = '150 caractères maximum.';
  const author = String(input.author ?? '').trim();
  if (author.length > 100) errors.author = '100 caractères maximum.';
  const status = String(input.status ?? '');
  if (!READING_STATES.some((s) => s.id === status)) errors.status = 'État invalide.';

  const rating = toInt(input.rating);
  if (Number.isNaN(rating) || rating > 5) errors.rating = 'Note de 0 à 5.';
  const chapter = toInt(input.chapter);
  const chaptersTotal = toInt(input.chaptersTotal);
  if (Number.isNaN(chapter)) errors.chapter = 'Entier positif attendu.';
  if (Number.isNaN(chaptersTotal)) errors.chaptersTotal = 'Entier positif attendu.';
  if (!errors.chapter && !errors.chaptersTotal && chaptersTotal > 0 && chapter > chaptersTotal) {
    errors.chapter = 'Ne peut pas dépasser le nombre de chapitres.';
  }

  const startedAt = String(input.startedAt ?? '').trim();
  const finishedAt = String(input.finishedAt ?? '').trim();
  if (startedAt && !isValidDate(startedAt)) errors.startedAt = 'Date invalide.';
  if (finishedAt && !isValidDate(finishedAt)) errors.finishedAt = 'Date invalide.';
  if (!errors.startedAt && !errors.finishedAt && startedAt && finishedAt && finishedAt < startedAt) {
    errors.finishedAt = 'La fin ne peut pas précéder le début.';
  }

  const review = String(input.review ?? '').trim();
  if (review.length > 3000) errors.review = '3000 caractères maximum.';

  const url = String(input.url ?? '').trim();
  if (url && !isWattpadUrl(url)) errors.url = 'Lien Wattpad invalide.';
  const cover = String(input.cover ?? '');
  if (cover && !coverSrc(cover)) errors.cover = 'Image invalide ou trop lourde.';

  const source = input.source === 'wattpad' ? 'wattpad' : 'manuel';
  const storyCompleted = input.storyCompleted === true;
  const favorite = input.favorite === true || input.favorite === 'on';

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok
      ? { title, author, status, rating, chapter, chaptersTotal, startedAt, finishedAt, review, url, cover, source, storyCompleted, favorite }
      : null,
  };
}

/**
 * Passe une lecture dans un autre état et complète les dates automatiquement :
 * - en cours : date de début = aujourd'hui si vide
 * - terminée : date de fin = aujourd'hui si vide, début rempli si vide, progression au dernier chapitre
 * - à lire : on garde l'historique (dates), rien n'est effacé
 */
export function moveReading(reading, status, today = todayISO()) {
  const r = { ...reading, status };
  if (status === 'en-cours') {
    if (reading.status === 'terminee') {
      // relecture : on repart du début
      r.startedAt = today;
      r.chapter = 0;
    } else if (!r.startedAt) r.startedAt = today;
    r.finishedAt = '';
  }
  if (status === 'terminee') {
    if (!r.finishedAt) r.finishedAt = today;
    if (!r.startedAt) r.startedAt = r.finishedAt;
    if (Number(r.chaptersTotal) > 0) r.chapter = Number(r.chaptersTotal);
  }
  return r;
}

/** Avance d'un chapitre (sans dépasser le total s'il est connu). */
export function nextChapter(reading) {
  const total = Number(reading.chaptersTotal) || 0;
  const cur = Number(reading.chapter) || 0;
  return { ...reading, chapter: total > 0 ? Math.min(total, cur + 1) : cur + 1 };
}

export function readingProgress(r) {
  if (r.status === 'terminee') return 100;
  const total = Number(r.chaptersTotal) || 0;
  if (!total) return null;
  return Math.max(0, Math.min(100, Math.round(((Number(r.chapter) || 0) / total) * 100)));
}

export function countByState(readings) {
  const c = { 'a-lire': 0, 'en-cours': 0, terminee: 0 };
  for (const r of readings) if (c[r.status] !== undefined) c[r.status]++;
  return c;
}

/** Tri : en cours / à lire par dernière mise à jour ; terminées par date de fin (récentes d'abord). */
export function sortReadings(list) {
  const key = (r) => (r.status === 'terminee' ? (r.finishedAt || '') + (r.updatedAt || '') : r.updatedAt || '');
  return [...list].sort((a, b) => String(key(b)).localeCompare(String(key(a))));
}

export const countFavorites = (readings) => readings.filter((r) => r.favorite === true).length;
