// Backend simulé qui applique les MÊMES règles que firestore.rules :
// - lecture d'un livre : public == true, ou propriétaire
// - écriture : propriétaire uniquement
// - requête visiteur non filtrée sur public == true : refusée (comme Firestore)
export const OWNER = { uid: 'owner-uid', email: 'moi@exemple.fr', password: 'bon-mot-de-passe' };
export const OTHER = { uid: 'other-uid', email: 'autre@exemple.fr', password: 'autre-mdp' };

export function createMockBackend(seed = { books: [], profile: null, notes: [] }) {
  let user = null;
  let listener = null;
  let seq = 0;
  const books = new Map(seed.books.map((b) => [b.id, { ...b }]));
  let profile = seed.profile;
  const notes = new Map((seed.notes || []).map((n) => [n.id, { ...n }]));
  let nseq = 0;
  const accounts = [OWNER, OTHER];
  const isOwner = () => user && user.uid === OWNER.uid;
  const denied = () => Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
  const emit = () => listener && listener(user);

  return {
    calls: { listBooks: [] },
    onAuthChange(cb) {
      listener = cb;
      queueMicrotask(emit);
      return () => (listener = null);
    },
    async login(email, password) {
      const a = accounts.find((x) => x.email === email && x.password === password);
      if (!a) throw Object.assign(new Error('auth/invalid-credential'), { code: 'auth/invalid-credential' });
      user = { uid: a.uid, email: a.email };
      emit();
      return user;
    },
    async logout() {
      user = null;
      emit();
    },
    async listBooks({ publicOnly }) {
      this.calls.listBooks.push({ publicOnly });
      if (!isOwner() && !publicOnly) throw denied();
      return [...books.values()].filter((b) => (publicOnly ? b.public === true : true)).map((b) => ({ ...b }));
    },
    async saveBook(book) {
      if (!isOwner()) throw denied();
      const { id, ...data } = book;
      const now = new Date().toISOString();
      if (id) {
        books.set(id, { ...books.get(id), ...data, id, updatedAt: now });
        return id;
      }
      const nid = `b${++seq}`;
      books.set(nid, { ...data, id: nid, createdAt: now, updatedAt: now });
      return nid;
    },
    async deleteBook(id) {
      if (!isOwner()) throw denied();
      books.delete(id);
    },
    // notes : lecture ET écriture réservées au propriétaire
    async listNotes() {
      if (!isOwner()) throw denied();
      return [...notes.values()].map((n) => ({ ...n }));
    },
    async saveNote(note) {
      if (!isOwner()) throw denied();
      const { id, ...data } = note;
      const now = new Date().toISOString();
      if (id) {
        notes.set(id, { ...notes.get(id), ...data, id, updatedAt: now });
        return id;
      }
      const nid = `note-${++nseq}`;
      notes.set(nid, { ...data, id: nid, createdAt: now, updatedAt: now });
      return nid;
    },
    async deleteNote(id) {
      if (!isOwner()) throw denied();
      notes.delete(id);
    },
    async getProfile() {
      return profile ? { ...profile } : null;
    },
    async saveProfile(p) {
      if (!isOwner()) throw denied();
      profile = { ...(profile || {}), ...p };
    },
    _raw: { books, notes },
  };
}
