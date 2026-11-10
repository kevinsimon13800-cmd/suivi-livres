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
  const readings = new Map((seed.readings || []).map((r) => [r.id, { ...r }]));
  let rseq = 0;
  // atelier : personnages et liens (propriétaire), chapitre annoncé et sondage (lecture publique)
  const characters = new Map((seed.characters || []).map((c) => [c.id, { ...c }]));
  const relations = new Map((seed.relations || []).map((r) => [r.id, { ...r }]));
  let chapter = seed.chapter || null;
  let poll = seed.poll ? JSON.parse(JSON.stringify(seed.poll)) : null;
  let cseq = 0;
  const stats = new Map(Object.entries(seed.stats || {}).map(([k, v]) => [k, { ...v }]));
  const STAT_KEY_RE = /^(all|d-\d{4}-\d{2}-\d{2}|w-\d{4}-W\d{2}|m-\d{4}-\d{2}|q-\d{4}-Q[1-4]|s-\d{4}-S[12]|y-\d{4})$/;
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
    // lectures : lecture publique, écriture réservée au propriétaire
    async listReadings() {
      return [...readings.values()].map((r) => ({ ...r }));
    },
    async saveReading(reading) {
      if (!isOwner()) throw denied();
      const { id, ...data } = reading;
      const now = new Date().toISOString();
      if (id) {
        readings.set(id, { ...readings.get(id), ...data, id, updatedAt: now });
        return id;
      }
      const nid = `lecture-${++rseq}`;
      readings.set(nid, { ...data, id: nid, createdAt: now, updatedAt: now });
      return nid;
    },
    async deleteReading(id) {
      if (!isOwner()) throw denied();
      readings.delete(id);
    },
    // stats : n'importe qui ajoute +1 (clé valide, champs visits/visitors seulement) ; lecture propriétaire
    async recordVisit(updates) {
      for (const u of updates) {
        if (!STAT_KEY_RE.test(u.key)) throw denied();
        if (![0, 1].includes(u.visits ?? 0) || ![0, 1].includes(u.visitors ?? 0)) throw denied();
        if (Object.keys(u).some((k) => !['key', 'visits', 'visitors'].includes(k))) throw denied();
      }
      for (const u of updates) {
        const cur = stats.get(u.key) || {};
        const next = { ...cur };
        if (u.visits) next.visits = (cur.visits || 0) + 1;
        if (u.visitors) next.visitors = (cur.visitors || 0) + 1;
        stats.set(u.key, next);
      }
      this.calls.recordVisit = (this.calls.recordVisit || 0) + 1;
    },
    async listStats() {
      if (!isOwner()) throw denied();
      return Object.fromEntries([...stats.entries()].map(([k, v]) => [k, { ...v }]));
    },
    // personnages et liens : lecture ET écriture réservées au propriétaire
    async listCharacters() {
      if (!isOwner()) throw denied();
      return [...characters.values()].map((c) => ({ ...c }));
    },
    async saveCharacter(c) {
      if (!isOwner()) throw denied();
      const { id, ...data } = c;
      if (id) { characters.set(id, { ...characters.get(id), ...data, id }); return id; }
      const nid = `perso-${++cseq}`;
      characters.set(nid, { ...data, id: nid });
      return nid;
    },
    async deleteCharacter(id) {
      if (!isOwner()) throw denied();
      characters.delete(id);
      for (const [rid, r] of relations) if (r.from === id || r.to === id) relations.delete(rid);
    },
    async listRelations() {
      if (!isOwner()) throw denied();
      return [...relations.values()].map((r) => ({ ...r }));
    },
    async saveRelation(r) {
      if (!isOwner()) throw denied();
      const { id, ...data } = r;
      const nid = id || `lien-${++cseq}`;
      relations.set(nid, { ...relations.get(nid), ...data, id: nid });
      return nid;
    },
    async deleteRelation(id) {
      if (!isOwner()) throw denied();
      relations.delete(id);
    },
    // prochain chapitre : lecture publique, écriture propriétaire
    async getChapter() {
      return chapter ? { ...chapter } : null;
    },
    async saveChapter(c) {
      if (!isOwner()) throw denied();
      chapter = { ...c };
    },
    async deleteChapter() {
      if (!isOwner()) throw denied();
      chapter = null;
    },
    // sondage : lecture publique, écriture propriétaire ; voter : tout le monde (+1 sur un choix, -1 sur l'ancien)
    async getPoll() {
      return poll ? JSON.parse(JSON.stringify(poll)) : null;
    },
    async savePoll(p) {
      if (!isOwner()) throw denied();
      poll = JSON.parse(JSON.stringify(p));
    },
    async deletePoll() {
      if (!isOwner()) throw denied();
      poll = null;
    },
    async votePoll({ optionId, previousId }) {
      if (!poll || poll.closed) throw denied();
      const o = poll.options.find((x) => x.id === optionId);
      if (!o) throw denied();
      o.votes = (o.votes || 0) + 1;
      const prev = previousId && poll.options.find((x) => x.id === previousId);
      if (prev && prev.votes > 0) prev.votes -= 1;
    },
    async getProfile() {
      return profile ? { ...profile } : null;
    },
    async saveProfile(p) {
      if (!isOwner()) throw denied();
      profile = { ...(profile || {}), ...p };
    },
    _raw: { books, notes, readings, stats, characters, relations, get chapter() { return chapter; }, get poll() { return poll; } },
  };
}
