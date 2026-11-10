// Backend réel : Firebase Authentication + Cloud Firestore (SDK chargé depuis le CDN officiel).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc, writeBatch, increment, runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export function createFirebaseBackend(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const now = () => new Date().toISOString();

  return {
    onAuthChange(cb) {
      return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null));
    },
    async login(email, password) {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return { uid: cred.user.uid, email: cred.user.email };
    },
    logout() {
      return signOut(auth);
    },
    // Visiteur : on filtre explicitement sur public == true (exigé par les règles Firestore).
    async listBooks({ publicOnly }) {
      const ref = collection(db, 'books');
      const snap = await getDocs(publicOnly ? query(ref, where('public', '==', true)) : ref);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async saveBook(book) {
      const { id, ...data } = book;
      if (id) {
        await setDoc(doc(db, 'books', id), { ...data, updatedAt: now() }, { merge: true });
        return id;
      }
      const ref = await addDoc(collection(db, 'books'), { ...data, createdAt: now(), updatedAt: now() });
      return ref.id;
    },
    async deleteBook(id) {
      await deleteDoc(doc(db, 'books', id));
    },
    // Notes-Idées : privées, lisibles et modifiables uniquement par le propriétaire (voir firestore.rules).
    async listNotes() {
      const snap = await getDocs(collection(db, 'notes'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async saveNote(note) {
      const { id, ...data } = note;
      if (id) {
        await setDoc(doc(db, 'notes', id), { ...data, updatedAt: now() }, { merge: true });
        return id;
      }
      const ref = await addDoc(collection(db, 'notes'), { ...data, createdAt: now(), updatedAt: now() });
      return ref.id;
    },
    async deleteNote(id) {
      await deleteDoc(doc(db, 'notes', id));
    },
    // Mes lectures : lisibles par tous (section publique), modifiables par le propriétaire seulement.
    async listReadings() {
      const snap = await getDocs(collection(db, 'readings'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async saveReading(reading) {
      const { id, ...data } = reading;
      if (id) {
        await setDoc(doc(db, 'readings', id), { ...data, updatedAt: now() }, { merge: true });
        return id;
      }
      const ref = await addDoc(collection(db, 'readings'), { ...data, createdAt: now(), updatedAt: now() });
      return ref.id;
    },
    async deleteReading(id) {
      await deleteDoc(doc(db, 'readings', id));
    },
    // Statistiques : chaque visite ajoute +1 (jamais plus, voir firestore.rules) ; lecture réservée au propriétaire.
    async recordVisit(updates) {
      const batch = writeBatch(db);
      for (const u of updates) {
        const data = {};
        if (u.visits) data.visits = increment(1);
        if (u.visitors) data.visitors = increment(1);
        if (Object.keys(data).length) batch.set(doc(db, 'stats', u.key), data, { merge: true });
      }
      await batch.commit();
    },
    async listStats() {
      const snap = await getDocs(collection(db, 'stats'));
      return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    },
    async getProfile() {
      const snap = await getDoc(doc(db, 'profile', 'main'));
      return snap.exists() ? snap.data() : null;
    },
    async saveProfile(profile) {
      await setDoc(doc(db, 'profile', 'main'), profile, { merge: true });
    },

    // ---------- Atelier (v7) ----------
    // Personnages et liens : privés, lecture et écriture réservées au propriétaire (comme les notes).
    async listCharacters() {
      const snap = await getDocs(collection(db, 'characters'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async saveCharacter(c) {
      const { id, ...data } = c;
      if (id) {
        await setDoc(doc(db, 'characters', id), data, { merge: true });
        return id;
      }
      const ref = await addDoc(collection(db, 'characters'), data);
      return ref.id;
    },
    // Supprime la fiche ET tous les liens qui partent de ce personnage ou y arrivent.
    async deleteCharacter(id) {
      const rels = collection(db, 'relations');
      const [a, b] = await Promise.all([
        getDocs(query(rels, where('from', '==', id))),
        getDocs(query(rels, where('to', '==', id))),
      ]);
      const batch = writeBatch(db);
      for (const d of [...a.docs, ...b.docs]) batch.delete(d.ref);
      batch.delete(doc(db, 'characters', id));
      await batch.commit();
    },
    async listRelations() {
      const snap = await getDocs(collection(db, 'relations'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async saveRelation(r) {
      const { id, ...data } = r;
      if (id) {
        await setDoc(doc(db, 'relations', id), data, { merge: true });
        return id;
      }
      const ref = await addDoc(collection(db, 'relations'), data);
      return ref.id;
    },
    async deleteRelation(id) {
      await deleteDoc(doc(db, 'relations', id));
    },

    // Prochain chapitre : document site/chapter, lisible par tous, modifiable par le propriétaire.
    async getChapter() {
      const snap = await getDoc(doc(db, 'site', 'chapter'));
      return snap.exists() ? snap.data() : null;
    },
    async saveChapter(c) {
      await setDoc(doc(db, 'site', 'chapter'), { ...c });
    },
    async deleteChapter() {
      await deleteDoc(doc(db, 'site', 'chapter'));
    },

    // Sondage : site/poll contient question, closed, rev et options { id, label } (sans les votes).
    // Les votes sont dans pollCounts/{rev}-{optionId} = { votes: entier }. Changer `rev` repart donc de zéro.
    async getPoll() {
      const snap = await getDoc(doc(db, 'site', 'poll'));
      if (!snap.exists()) return null;
      const p = snap.data();
      const options = Array.isArray(p.options) ? p.options : [];
      const counts = await Promise.all(options.map((o) => getDoc(doc(db, 'pollCounts', `${p.rev}-${o.id}`))));
      return {
        ...p,
        options: options.map((o, i) => ({ id: o.id, label: o.label, votes: counts[i].exists() ? counts[i].data().votes || 0 : 0 })),
      };
    },
    async savePoll(p) {
      const { question, closed, rev } = p;
      await setDoc(doc(db, 'site', 'poll'), {
        question, closed: !!closed, rev, options: p.options.map((o) => ({ id: o.id, label: o.label })),
      });
    },
    // Supprime le sondage et les compteurs de sa version en cours.
    async deletePoll() {
      const snap = await getDoc(doc(db, 'site', 'poll'));
      const batch = writeBatch(db);
      if (snap.exists()) {
        const p = snap.data();
        for (const o of p.options || []) batch.delete(doc(db, 'pollCounts', `${p.rev}-${o.id}`));
      }
      batch.delete(doc(db, 'site', 'poll'));
      await batch.commit();
    },
    // +1 sur le choix, -1 sur l'ancien choix s'il y en a un (jamais en dessous de 0).
    async votePoll({ optionId, previousId }) {
      const snap = await getDoc(doc(db, 'site', 'poll'));
      const p = snap.exists() ? snap.data() : null;
      const denied = () => Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
      if (!p || p.closed) throw denied();
      const options = p.options || [];
      if (!options.some((o) => o.id === optionId)) throw denied();
      if (previousId === optionId) return; // +1 puis -1 sur le même choix : rien ne change
      const prevOk = previousId && options.some((o) => o.id === previousId);
      const newRef = doc(db, 'pollCounts', `${p.rev}-${optionId}`);
      const prevRef = prevOk ? doc(db, 'pollCounts', `${p.rev}-${previousId}`) : null;
      await runTransaction(db, async (tx) => {
        const cur = await tx.get(newRef);
        const prev = prevRef ? await tx.get(prevRef) : null;
        if (cur.exists()) tx.update(newRef, { votes: (cur.data().votes || 0) + 1 });
        else tx.set(newRef, { votes: 1 });
        if (prev && prev.exists() && (prev.data().votes || 0) > 0) tx.update(prevRef, { votes: prev.data().votes - 1 });
      });
    },
  };
}
