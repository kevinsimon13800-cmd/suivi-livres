import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { start } from '../js/app.js';
import { createMockBackend, OWNER, OTHER } from './mock-backend.js';

const SHARE = 'https://moi.github.io/livres/';
const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));

const SEED = {
  profile: { displayName: 'Camille Écrit', bio: 'Auteure de fantasy.' },
  books: [
    { id: 'a', title: 'Les Cendres du Nord', status: 'ecriture', words: 25000, goalWords: 50000, chaptersDone: 5, chaptersTotal: 20, genre: 'Fantasy', synopsis: 'Une quête.', public: true, updatedAt: '2026-11-01T10:00:00.000Z' },
    { id: 'b', title: 'Brouillon secret', status: 'idee', words: 0, goalWords: 0, chaptersDone: 0, chaptersTotal: 0, genre: '', synopsis: '', public: false, updatedAt: '2026-11-05T10:00:00.000Z' },
    { id: 'c', title: 'Premier recueil', status: 'publie', words: 30000, goalWords: 30000, chaptersDone: 10, chaptersTotal: 10, genre: 'Nouvelles', synopsis: '', public: true, updatedAt: '2026-10-01T10:00:00.000Z' },
  ],
};

const clone = (o) => JSON.parse(JSON.stringify(o));

async function mount({ seed = clone(SEED), hash = '', confirmAnswer = true, backendPatch } = {}) {
  const dom = new JSDOM('<div id="app"></div>', { url: SHARE + hash });
  const win = dom.window;
  win.confirm = () => confirmAnswer;
  const backend = createMockBackend(seed);
  if (backendPatch) backendPatch(backend);
  const root = win.document.getElementById('app');
  const app = start({ backend, root, ownerUid: OWNER.uid, shareUrl: SHARE, doc: win.document, win });
  await tick();
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const click = async (el) => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await tick(); };
  const submit = async (form) => { form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); await tick(); };
  const set = (form, name, value) => { const el = form.elements[name]; if (el.type === 'checkbox') el.checked = value; else el.value = value; };
  const loginAs = async (acc) => {
    await click($('[data-action="admin-link"]'));
    await tick();
    const f = $('[data-role="login-form"]');
    set(f, 'email', acc.email);
    set(f, 'password', acc.password);
    await submit(f);
    await tick();
  };
  return { win, root, backend, app, $, $$, click, submit, set, loginAs, close: () => win.close() };
}

const titles = (ctx) => ctx.$$('.card h3').map((e) => e.textContent);

// ---------- Visiteur ----------

test('visiteur : voit uniquement les livres publics, triés par date de mise à jour', async () => {
  const ctx = await mount();
  assert.deepEqual(titles(ctx), ['Les Cendres du Nord', 'Premier recueil']);
  assert.ok(!ctx.root.textContent.includes('Brouillon secret'));
  assert.deepEqual(ctx.backend.calls.listBooks.at(-1), { publicOnly: true });
  ctx.close();
});

test('visiteur : aucune commande de modification, aucun badge Privé', async () => {
  const ctx = await mount();
  for (const a of ['add', 'edit', 'delete', 'profile', 'share', 'logout', 'preview']) {
    assert.equal(ctx.$(`[data-action="${a}"]`), null, `bouton ${a} ne doit pas exister`);
  }
  assert.equal(ctx.$('.pill.private'), null);
  assert.equal(ctx.$('form'), null);
  ctx.close();
});

test('visiteur : profil, avancement et mots affichés', async () => {
  const ctx = await mount();
  assert.equal(ctx.$('h1').textContent, 'Camille Écrit');
  assert.match(ctx.$('.bio').textContent, /fantasy/);
  const card = ctx.$('[data-book="a"]');
  assert.match(card.querySelector('.meta').textContent, /50 %/);
  assert.match(card.querySelector('.meta').textContent, /25\s?000\s*\/\s*50\s?000 mots/);
  assert.match(card.querySelector('.meta').textContent, /5\/20 chapitres/);
  assert.equal(card.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '50');
  assert.equal(ctx.$('[data-book="c"] [role="progressbar"]').getAttribute('aria-valuenow'), '100');
  ctx.close();
});

test('visiteur : un titre malveillant est affiché comme texte, jamais interprété', async () => {
  const seed = clone(SEED);
  seed.books[0].title = '<img src=x onerror="window.__pwn=1"><script>window.__pwn=2</script>';
  seed.books[0].synopsis = '<b>gras</b>';
  const ctx = await mount({ seed });
  assert.equal(ctx.$('.card img'), null);
  assert.equal(ctx.$('.card script'), null);
  assert.equal(ctx.$('.card b'), null);
  assert.ok(ctx.$('.card h3').textContent.includes('<img'));
  assert.equal(ctx.win.__pwn, undefined);
  ctx.close();
});

test('visiteur : état vide', async () => {
  const ctx = await mount({ seed: { books: [], profile: null } });
  assert.match(ctx.$('.state').textContent, /Aucun livre à afficher/);
  assert.equal(ctx.$('h1').textContent, 'Mes livres');
  ctx.close();
});

test('visiteur : erreur de chargement affichée proprement', async () => {
  const ctx = await mount({ backendPatch: (b) => { b.listBooks = async () => { throw new Error('réseau'); }; } });
  assert.match(ctx.$('[role="alert"]').textContent, /Impossible de charger/);
  ctx.close();
});

// ---------- Connexion ----------

test('connexion : lien discret "Espace auteur" ouvre le formulaire', async () => {
  const ctx = await mount();
  await ctx.click(ctx.$('[data-action="admin-link"]'));
  assert.ok(ctx.$('[data-role="login-form"]'));
  assert.equal(ctx.$('.card'), null);
  ctx.close();
});

test('connexion : accès direct par #/admin', async () => {
  const ctx = await mount({ hash: '#/admin' });
  assert.ok(ctx.$('[data-role="login-form"]'));
  ctx.close();
});

test('connexion : mauvais mot de passe → message générique, reste déconnecté', async () => {
  const ctx = await mount({ hash: '#/admin' });
  const f = ctx.$('[data-role="login-form"]');
  ctx.set(f, 'email', OWNER.email);
  ctx.set(f, 'password', 'faux');
  await ctx.submit(f);
  assert.equal(ctx.$('[role="alert"]').textContent, 'Identifiant ou mot de passe incorrect.');
  assert.ok(ctx.$('[data-role="login-form"]'));
  assert.equal(ctx.$('[data-action="add"]'), null);
  ctx.close();
});

test('connexion : un autre compte valide est refusé et déconnecté', async () => {
  const ctx = await mount({ hash: '#/admin' });
  const f = ctx.$('[data-role="login-form"]');
  ctx.set(f, 'email', OTHER.email);
  ctx.set(f, 'password', OTHER.password);
  await ctx.submit(f);
  await tick();
  assert.equal(ctx.$('[role="alert"]').textContent, 'Accès refusé.');
  assert.equal(ctx.$('[data-action="add"]'), null);
  ctx.close();
});

test('connexion : le propriétaire accède à son espace, voit ses livres privés', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  assert.ok(ctx.$('[data-action="add"]'));
  assert.equal(ctx.win.location.hash, '');
  assert.deepEqual(titles(ctx).sort(), ['Brouillon secret', 'Les Cendres du Nord', 'Premier recueil']);
  assert.equal(ctx.$$('.pill.private').length, 1);
  assert.deepEqual(ctx.backend.calls.listBooks.at(-1), { publicOnly: false });
  assert.equal(ctx.$('[data-action="admin-link"]'), null);
  ctx.close();
});

test('connexion : déconnexion ramène à la vue visiteur', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="logout"]'));
  await tick();
  assert.equal(ctx.$('[data-action="add"]'), null);
  assert.ok(!ctx.root.textContent.includes('Brouillon secret'));
  ctx.close();
});

// ---------- Propriétaire : CRUD ----------

test('propriétaire : ajoute un livre (privé par défaut) et il apparaît', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="add"]'));
  const f = ctx.$('[data-role="book-form"]');
  assert.equal(f.elements.public.checked, false);
  ctx.set(f, 'title', 'Nouveau roman');
  ctx.set(f, 'status', 'ecriture');
  ctx.set(f, 'words', '1000');
  ctx.set(f, 'goalWords', '4000');
  await ctx.submit(f);
  await tick();
  const card = ctx.$$('.card').find((c) => c.querySelector('h3').textContent === 'Nouveau roman');
  assert.ok(card, 'la carte du nouveau livre doit exister');
  assert.match(card.querySelector('.meta').textContent, /25 %/);
  assert.ok(card.querySelector('.pill.private'));
  assert.ok(ctx.$('[role="status"]'));
  ctx.close();
});

test('propriétaire : un livre ajouté en privé reste invisible aux visiteurs', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="add"]'));
  const f = ctx.$('[data-role="book-form"]');
  ctx.set(f, 'title', 'Très secret');
  await ctx.submit(f);
  await tick();
  const visitorView = await ctx.backend.listBooks({ publicOnly: true });
  assert.ok(!visitorView.some((b) => b.title === 'Très secret'));
  ctx.close();
});

test('propriétaire : titre vide → erreur, formulaire conservé, rien enregistré', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  const before = ctx.backend._raw.books.size;
  await ctx.click(ctx.$('[data-action="add"]'));
  const f = ctx.$('[data-role="book-form"]');
  ctx.set(f, 'genre', 'Polar');
  await ctx.submit(f);
  assert.match(ctx.$('.err').textContent, /titre est obligatoire/);
  assert.equal(ctx.$('[data-role="book-form"]').elements.genre.value, 'Polar');
  assert.equal(ctx.backend._raw.books.size, before);
  ctx.close();
});

test('propriétaire : nombre invalide et chapitres incohérents refusés', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="add"]'));
  const f = ctx.$('[data-role="book-form"]');
  ctx.set(f, 'title', 'X');
  ctx.set(f, 'words', '-4');
  ctx.set(f, 'chaptersDone', '9');
  ctx.set(f, 'chaptersTotal', '3');
  await ctx.submit(f);
  const errs = ctx.$$('.err').map((e) => e.textContent).join(' | ');
  assert.match(errs, /Entier positif/);
  assert.match(errs, /Ne peut pas dépasser/);
  ctx.close();
});

test('propriétaire : modifie un livre, avancement mis à jour', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-book="a"] [data-action="edit"]'));
  const f = ctx.$('[data-role="book-form"]');
  assert.equal(f.elements.title.value, 'Les Cendres du Nord');
  assert.equal(f.elements.status.value, 'ecriture');
  ctx.set(f, 'words', '40000');
  await ctx.submit(f);
  await tick();
  assert.match(ctx.$('[data-book="a"] .meta').textContent, /80 %/);
  assert.equal(ctx.backend._raw.books.get('a').words, 40000);
  assert.equal(ctx.backend._raw.books.size, 3, 'aucun doublon créé');
  ctx.close();
});

test('propriétaire : passer un livre en public le rend visible aux visiteurs', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-book="b"] [data-action="edit"]'));
  const f = ctx.$('[data-role="book-form"]');
  ctx.set(f, 'public', true);
  await ctx.submit(f);
  await tick();
  const visitorView = await ctx.backend.listBooks({ publicOnly: true });
  assert.ok(visitorView.some((b) => b.id === 'b'));
  ctx.close();
});

test('propriétaire : suppression confirmée', async () => {
  const ctx = await mount({ confirmAnswer: true });
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-book="c"] [data-action="delete"]'));
  await tick();
  assert.equal(ctx.$('[data-book="c"]'), null);
  assert.equal(ctx.backend._raw.books.has('c'), false);
  ctx.close();
});

test('propriétaire : suppression annulée → rien ne change', async () => {
  const ctx = await mount({ confirmAnswer: false });
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-book="c"] [data-action="delete"]'));
  await tick();
  assert.ok(ctx.$('[data-book="c"]'));
  assert.equal(ctx.backend._raw.books.has('c'), true);
  ctx.close();
});

test('propriétaire : échec d’enregistrement → message, saisie conservée', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  ctx.backend.saveBook = async () => { throw new Error('hors ligne'); };
  await ctx.click(ctx.$('[data-action="add"]'));
  const f = ctx.$('[data-role="book-form"]');
  ctx.set(f, 'title', 'Garde-moi');
  await ctx.submit(f);
  assert.match(ctx.$('[role="alert"]').textContent, /Enregistrement refusé/);
  assert.equal(ctx.$('[data-role="book-form"]').elements.title.value, 'Garde-moi');
  ctx.close();
});

test('propriétaire : annuler le formulaire revient à la liste sans rien créer', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="add"]'));
  await ctx.click(ctx.$('[data-action="cancel"]'));
  assert.equal(ctx.$('form'), null);
  assert.equal(ctx.backend._raw.books.size, 3);
  ctx.close();
});

// ---------- Profil, partage, aperçu ----------

test('propriétaire : modifie son profil public, visible côté visiteur', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="profile"]'));
  const f = ctx.$('[data-role="profile-form"]');
  ctx.set(f, 'displayName', 'Camille D.');
  ctx.set(f, 'bio', 'Nouvelle bio');
  await ctx.submit(f);
  assert.equal(ctx.$('h1').textContent, 'Camille D.');
  const p = await ctx.backend.getProfile();
  assert.equal(p.displayName, 'Camille D.');
  ctx.close();
});

test('partage : sans presse-papiers, affiche le lien à copier', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="share"]'));
  await tick();
  assert.equal(ctx.$('[data-role="share-url"]').value, SHARE);
  ctx.close();
});

test('partage : avec presse-papiers, copie le lien (sans #/admin)', async () => {
  const ctx = await mount();
  let copied = null;
  Object.defineProperty(ctx.win.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="share"]'));
  await tick();
  assert.equal(copied, SHARE);
  assert.ok(!copied.includes('#'));
  assert.match(ctx.$('[role="status"]').textContent, /copié/);
  ctx.close();
});

test('aperçu visiteur : masque privés et commandes, puis retour', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="preview"]'));
  assert.deepEqual(titles(ctx), ['Les Cendres du Nord', 'Premier recueil']);
  assert.equal(ctx.$('[data-action="edit"]'), null);
  assert.equal(ctx.$('[data-action="add"]'), null);
  await ctx.click(ctx.$('[data-action="end-preview"]'));
  assert.equal(ctx.$$('.card').length, 3);
  assert.ok(ctx.$('[data-action="add"]'));
  ctx.close();
});

// ---------- Sécurité (simulation des règles Firestore) ----------

test('règles simulées : un visiteur ne peut ni écrire, ni supprimer, ni lire les privés', async () => {
  const backend = createMockBackend(clone(SEED));
  await assert.rejects(backend.saveBook({ title: 'Pirate', status: 'plan' }), /permission-denied/);
  await assert.rejects(backend.saveBook({ id: 'a', title: 'Piraté' }), /permission-denied/);
  await assert.rejects(backend.deleteBook('a'), /permission-denied/);
  await assert.rejects(backend.saveProfile({ displayName: 'Pirate' }), /permission-denied/);
  await assert.rejects(backend.listBooks({ publicOnly: false }), /permission-denied/);
  assert.equal(backend._raw.books.get('a').title, 'Les Cendres du Nord');
});

test('règles simulées : un autre compte connecté ne peut pas écrire non plus', async () => {
  const backend = createMockBackend(clone(SEED));
  await backend.login(OTHER.email, OTHER.password);
  await assert.rejects(backend.saveBook({ title: 'Pirate', status: 'plan' }), /permission-denied/);
  await assert.rejects(backend.deleteBook('a'), /permission-denied/);
});
