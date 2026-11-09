// Logique pure (sans DOM, sans Firebase) : calcul de l'avancement et validation.

export const STATUSES = [
  { id: 'idee', label: 'Idée' },
  { id: 'plan', label: 'Plan' },
  { id: 'ecriture', label: 'Écriture' },
  { id: 'relecture', label: 'Relecture' },
  { id: 'publie', label: 'Publié' },
];

// Avancement par défaut quand ni objectif de mots ni nombre de chapitres ne sont renseignés.
const STATUS_PCT = { idee: 0, plan: 10, ecriture: 40, relecture: 85, publie: 100 };

const clamp = (n) => Math.max(0, Math.min(100, n));

export function statusLabel(id) {
  const s = STATUSES.find((x) => x.id === id);
  return s ? s.label : id;
}

/** Pourcentage d'avancement (0-100) d'un livre. */
export function progress(book) {
  if (!book) return 0;
  if (book.status === 'publie') return 100;
  const goal = Number(book.goalWords) || 0;
  const words = Number(book.words) || 0;
  if (goal > 0) return clamp(Math.round((words / goal) * 100));
  const total = Number(book.chaptersTotal) || 0;
  const done = Number(book.chaptersDone) || 0;
  if (total > 0) return clamp(Math.round((done / total) * 100));
  return STATUS_PCT[book.status] ?? 0;
}

export function formatNumber(n) {
  return (Number(n) || 0).toLocaleString('fr-FR');
}

function toInt(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return NaN;
  return n;
}

/**
 * Valide et normalise un livre saisi dans le formulaire.
 * Retourne { ok, errors, value }.
 */
export function validateBook(input) {
  const errors = {};
  const title = String(input.title ?? '').trim();
  if (!title) errors.title = 'Le titre est obligatoire.';
  else if (title.length > 120) errors.title = '120 caractères maximum.';

  const status = String(input.status ?? '');
  if (!STATUSES.some((s) => s.id === status)) errors.status = 'Étape invalide.';

  const numbers = {};
  for (const key of ['words', 'goalWords', 'chaptersDone', 'chaptersTotal']) {
    const n = toInt(input[key]);
    if (Number.isNaN(n)) errors[key] = 'Entier positif attendu.';
    numbers[key] = n;
  }
  if (!errors.chaptersDone && !errors.chaptersTotal && numbers.chaptersTotal > 0 && numbers.chaptersDone > numbers.chaptersTotal) {
    errors.chaptersDone = 'Ne peut pas dépasser le nombre total de chapitres.';
  }

  const genre = String(input.genre ?? '').trim();
  if (genre.length > 60) errors.genre = '60 caractères maximum.';
  const synopsis = String(input.synopsis ?? '').trim();
  if (synopsis.length > 1500) errors.synopsis = '1500 caractères maximum.';

  const tags = parseTags(input.tags);
  if (tags.length > MAX_TAGS) errors.tags = `${MAX_TAGS} étiquettes maximum.`;
  else if (tags.some((t) => t.length > 30)) errors.tags = '30 caractères maximum par étiquette.';

  const chapterTitles = parseLines(input.chapterTitles);
  if (chapterTitles.length > MAX_CHAPTERS) errors.chapterTitles = `${MAX_CHAPTERS} chapitres maximum.`;
  else if (chapterTitles.some((t) => t.length > 120)) errors.chapterTitles = '120 caractères maximum par titre de chapitre.';

  const releaseDate = String(input.releaseDate ?? '').trim();
  if (releaseDate && !isValidDate(releaseDate)) errors.releaseDate = 'Date invalide.';

  const cover = String(input.cover ?? '');
  if (cover && !isValidCover(cover)) errors.cover = 'Image invalide ou trop lourde.';

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok
      ? {
          title, status, genre, synopsis, tags, chapterTitles, releaseDate, cover,
          public: input.public === true || input.public === 'on', ...numbers,
        }
      : null,
  };
}

// ---------- Étiquettes, chapitres ----------

export const MAX_TAGS = 10;
export const MAX_CHAPTERS = 200;

/** "Romance, magie ,  Romance" → ['Romance', 'magie'] (sans doublon, sans vide). Accepte aussi un tableau. */
export function parseTags(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const t = String(raw).trim().replace(/\s+/g, ' ');
    if (!t) continue;
    const key = t.toLocaleLowerCase('fr-FR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Une ligne = un élément (lignes vides ignorées). Accepte aussi un tableau. */
export function parseLines(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/);
  return list.map((l) => String(l).trim()).filter(Boolean);
}

// ---------- Couverture ----------

export const MAX_COVER_CHARS = 450000; // ≈ 330 Ko d'image : reste loin de la limite de 1 Mo d'un document Firestore

export function isValidCover(value) {
  return typeof value === 'string'
    && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
    && value.length <= MAX_COVER_CHARS;
}

// ---------- Dates et compte à rebours ----------

export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Date locale du jour au format AAAA-MM-JJ. */
export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function formatDateFR(iso) {
  if (!isValidDate(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Compte à rebours jusqu'à la date de sortie.
 * Retourne null si pas de date, sinon { days, label, past }.
 */
export function countdown(releaseDate, today = todayISO()) {
  if (!releaseDate || !isValidDate(releaseDate) || !isValidDate(today)) return null;
  const toDays = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86400000;
  };
  const days = Math.round(toDays(releaseDate) - toDays(today));
  if (days > 1) return { days, past: false, label: `J-${days} · sortie le ${formatDateFR(releaseDate)}` };
  if (days === 1) return { days, past: false, label: `Sortie demain (${formatDateFR(releaseDate)})` };
  if (days === 0) return { days, past: false, label: 'Sortie aujourd’hui !' };
  return { days, past: true, label: `Sorti le ${formatDateFR(releaseDate)}` };
}

// ---------- Filtres ----------

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Filtre par texte (titre, genre, synopsis, étiquettes), genre exact et étiquette exacte. */
export function filterBooks(books, { q = '', genre = '', tag = '' } = {}) {
  const nq = norm(q).trim();
  return books.filter((b) => {
    if (genre && norm(b.genre) !== norm(genre)) return false;
    if (tag && !(b.tags || []).some((t) => norm(t) === norm(tag))) return false;
    if (nq) {
      const hay = norm([b.title, b.genre, b.synopsis, ...(b.tags || [])].join(' '));
      if (!hay.includes(nq)) return false;
    }
    return true;
  });
}

/** Genres et étiquettes présents (uniques, triés) pour construire les filtres. */
export function collectFacets(books) {
  const genres = new Map();
  const tags = new Map();
  for (const b of books) {
    if (b.genre && String(b.genre).trim()) genres.set(norm(b.genre), String(b.genre).trim());
    for (const t of b.tags || []) tags.set(norm(t), t);
  }
  const sort = (m) => [...m.values()].sort((a, b) => a.localeCompare(b, 'fr'));
  return { genres: sort(genres), tags: sort(tags) };
}

// ---------- Notes-Idées ----------

export function validateNote(input) {
  const errors = {};
  const title = String(input.title ?? '').trim();
  const body = String(input.body ?? '').trim();
  const bookId = String(input.bookId ?? '').trim();
  if (!title && !body) errors.title = 'Écris au moins un titre ou un texte.';
  if (title.length > 120) errors.title = '120 caractères maximum.';
  if (body.length > 10000) errors.body = '10 000 caractères maximum.';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { title, body, bookId } : null };
}
