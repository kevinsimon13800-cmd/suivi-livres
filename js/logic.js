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

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok
      ? { title, status, genre, synopsis, public: input.public === true || input.public === 'on', ...numbers }
      : null,
  };
}
