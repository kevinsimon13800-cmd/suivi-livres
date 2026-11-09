// Backend réel : Firebase Authentication + Cloud Firestore (SDK chargé depuis le CDN officiel).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc,
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
    async getProfile() {
      const snap = await getDoc(doc(db, 'profile', 'main'));
      return snap.exists() ? snap.data() : null;
    },
    async saveProfile(profile) {
      await setDoc(doc(db, 'profile', 'main'), profile, { merge: true });
    },
  };
}
