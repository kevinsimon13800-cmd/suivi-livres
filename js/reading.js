// Coches de lecture des visiteurs : enregistrées uniquement sur leur appareil (localStorage).
// Rien n'est envoyé à la base : pas de compte, pas de risque d'abus, et l'auteur ne voit pas qui lit quoi.
const KEY = 'suivi-livres:lecture:v1';

function safeStorage(storage) {
  try {
    const probe = '__probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch (e) {
    return null; // navigation privée stricte, stockage bloqué… on garde alors les coches en mémoire
  }
}

export function createReadingStore(storage) {
  const store = storage ? safeStorage(storage) : null;
  let data = {};
  if (store) {
    try {
      const parsed = JSON.parse(store.getItem(KEY) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
    } catch (e) {
      data = {};
    }
  }
  const save = () => {
    if (!store) return;
    try { store.setItem(KEY, JSON.stringify(data)); } catch (e) { /* stockage plein : on ignore */ }
  };
  const entry = (bookId) => {
    const e = data[bookId];
    return {
      read: !!(e && e.read),
      chapters: Array.isArray(e && e.chapters) ? e.chapters.filter((n) => Number.isInteger(n) && n >= 0) : [],
    };
  };

  return {
    persistent: !!store,
    get: entry,
    isBookRead: (bookId) => entry(bookId).read,
    isChapterRead: (bookId, index) => entry(bookId).chapters.includes(index),
    /** Nombre de chapitres lus parmi `total` (ignore les index devenus hors limite). */
    countRead: (bookId, total) => entry(bookId).chapters.filter((n) => n < total).length,
    setBookRead(bookId, value) {
      const e = entry(bookId);
      data[bookId] = { ...e, read: !!value };
      save();
    },
    setChapterRead(bookId, index, value) {
      const e = entry(bookId);
      const set = new Set(e.chapters);
      if (value) set.add(index); else set.delete(index);
      data[bookId] = { ...e, chapters: [...set].sort((a, b) => a - b) };
      save();
    },
  };
}
