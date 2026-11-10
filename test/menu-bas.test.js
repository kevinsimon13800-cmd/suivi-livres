// Menu du bas, livres et notes touchables, notes « histoire ou nom », visites de l'auteur non comptées.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { start } from '../js/app.js';
import { createMockBackend, OWNER } from './mock-backend.js';

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const SHARE = 'https://moi.github.io/livres/';
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const seed = () => ({
  profile: { displayName: 'Lau' },
  books: [
    { id: 'a', title: 'La Prêtresse', status: 'ecriture', words: 10, goalWords: 100, public: true, updatedAt: '2026-11-08T10:00:00Z', tags: [], chapterTitles: [] },
    { id: 'b', title: 'Brouillon', status: 'idee', public: false, updatedAt: '2026-11-07T10:00:00Z', tags: [], chapterTitles: [] },
  ],
  notes: [{ id: 'n1', title: 'Idée', body: 'Duel', bookId: 'a', updatedAt: '2026-11-07T10:00:00Z' }],
  readings: [],
  stats: {},
});

async function mount({ search = '', hash = '', local = fakeStorage(), confirmAnswer = true } = {}) {
  const dom = new JSDOM('<div id="app"></div>', { url: SHARE + search + hash });
  const win = dom.window;
  win.scrollTo = () => {};
  win.confirm = () => confirmAnswer;
  Object.defineProperty(win.navigator, 'webdriver', { value: false, configurable: true });
  const backend = createMockBackend(seed());
  const root = win.document.getElementById('app');
  start({ backend, root, ownerUid: OWNER.uid, shareUrl: SHARE, doc: win.document, win, storage: local, now: () => new Date('2026-11-09T10:00:00Z') });
  await tick(40);
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const click = async (el) => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await tick(40); };
  const key = async (el, k) => { el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); await tick(40); };
  const submit = async (f) => { f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); await tick(40); };
  const login = async () => {
    win.location.hash = '#/admin'; await tick();
    const f = $('[data-role="login-form"]');
    f.elements.email.value = OWNER.email; f.elements.password.value = OWNER.password;
    await submit(f); await tick(60);
  };
  return { win, root, backend, local, $, $$, click, key, submit, login, close: () => win.close() };
}
const labels = (ctx) => ctx.$$('.bnav .bn-bar .bn-label').map((e) => e.textContent);

test('menu du bas : visiteur = Livres, Lectures, Auteur ; aucune barre d’outils dans l’en-tête', async () => {
  const ctx = await mount();
  assert.deepEqual(labels(ctx), ['Livres', 'Lectures', 'Auteur']);
  assert.equal(ctx.$('.tabs'), null);
  assert.equal(ctx.$('header .toolbar'), null);
  assert.equal(ctx.$('.bn-item[data-tab="books"]').getAttribute('aria-current'), 'page');
  ctx.close();
});

test('menu du bas : auteur = Livres, Lectures, Écrire, Notes, Plus ; onglets actifs et navigation', async () => {
  const ctx = await mount();
  await ctx.login();
  assert.deepEqual(labels(ctx), ['Livres', 'Lectures', 'Écrire', 'Notes', 'Plus']);
  await ctx.click(ctx.$('.bn-item[data-tab="readings"]'));
  assert.equal(ctx.win.location.hash, '#/lectures');
  assert.equal(ctx.$('.bn-item[data-tab="readings"]').getAttribute('aria-current'), 'page');
  assert.equal(ctx.$('.bn-item[data-tab="books"]').getAttribute('aria-current'), null);
  await ctx.click(ctx.$('.bn-item[data-action="notes"]'));
  assert.ok(ctx.$('[data-role="note-form"]'));
  assert.equal(ctx.$('.bn-item[data-action="notes"]').getAttribute('aria-current'), 'page');
  await ctx.click(ctx.$('.bn-item[data-tab="books"]'));
  assert.ok(ctx.$('[data-book="a"]'));
  await ctx.click(ctx.$('.bn-item[data-action="add"]'));
  assert.ok(ctx.$('[data-role="book-form"]'));
  ctx.close();
});

test('menu du bas : « Plus » ouvre le panneau, chaque entrée agit puis le referme', async () => {
  const ctx = await mount();
  await ctx.login();
  assert.equal(ctx.$('.bn-sheet').classList.contains('open'), false);
  await ctx.click(ctx.$('[data-action="more"]'));
  assert.equal(ctx.$('.bn-sheet').classList.contains('open'), true);
  assert.equal(ctx.$('[data-action="more"]').getAttribute('aria-expanded'), 'true');
  await ctx.click(ctx.$('.bn-scrim'));
  assert.equal(ctx.$('.bn-sheet').classList.contains('open'), false);
  await ctx.click(ctx.$('[data-action="more"]'));
  await ctx.click(ctx.$('.bn-panel [data-action="stats"]'));
  assert.ok(ctx.$('[data-role="stats"]'));
  assert.equal(ctx.$('.bn-sheet').classList.contains('open'), false);
  await ctx.click(ctx.$('[data-action="more"]'));
  await ctx.click(ctx.$('.bn-panel [data-action="profile"]'));
  assert.ok(ctx.$('form.panel'));
  await ctx.click(ctx.$('[data-action="more"]'));
  await ctx.click(ctx.$('.bn-panel [data-action="preview"]'));
  assert.deepEqual(labels(ctx), ['Livres', 'Lectures', 'Mon espace']);
  await ctx.click(ctx.$('[data-action="end-preview-nav"]'));
  assert.equal(labels(ctx).length, 5);
  await ctx.click(ctx.$('[data-action="more"]'));
  await ctx.click(ctx.$('.bn-panel [data-action="logout"]'));
  assert.deepEqual(labels(ctx), ['Livres', 'Lectures', 'Auteur']);
  ctx.close();
});

test('livres : toucher la carte ouvre le formulaire (clic et clavier), tags exclus, sans boutons sur la carte', async () => {
  const ctx = await mount();
  await ctx.login();
  assert.equal(ctx.$('[data-book="a"] .btn'), null);
  assert.equal(ctx.$('[data-book="a"]').getAttribute('role'), 'button');
  assert.match(ctx.$('[data-book="b"]').textContent, /Privé/);
  await ctx.key(ctx.$('[data-book="a"]'), 'Enter');
  assert.equal(ctx.$('[data-role="book-form"]').elements.title.value, 'La Prêtresse');
  assert.ok(ctx.$('[data-role="book-form"] [data-action="delete"]'), 'suppression disponible dans le formulaire');
  await ctx.click(ctx.$('[data-action="cancel"]'));
  await ctx.click(ctx.$('.bn-item[data-action="add"]'));
  assert.equal(ctx.$('[data-role="book-form"] [data-action="delete"]'), null, 'pas de suppression sur un nouveau livre');
  ctx.close();
});

test('livres : un visiteur ne peut rien ouvrir en touchant une carte', async () => {
  const ctx = await mount();
  await ctx.click(ctx.$('[data-book="a"]'));
  assert.equal(ctx.$('form'), null);
  assert.equal(ctx.$('[data-book="a"]').getAttribute('role'), null);
  ctx.close();
});

test('notes : le formulaire de création est affiché directement, les notes existantes dessous', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.click(ctx.$('.bn-item[data-action="notes"]'));
  assert.ok(ctx.$('[data-role="note-form"]'));
  assert.equal(ctx.$('[data-note="n1"]').getAttribute('role'), 'button');
  assert.equal(ctx.$('[data-note="n1"] .btn'), null, 'pas de boutons sur la note');
  assert.equal(ctx.$('[data-role="note-form"] [data-action="delete-note"]'), null, 'pas de suppression pour une nouvelle note');
  ctx.close();
});

test('notes : sans histoire il faut un nom, avec une histoire le titre est facultatif', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.click(ctx.$('.bn-item[data-action="notes"]'));
  let f = ctx.$('[data-role="note-form"]');
  assert.match(ctx.root.textContent, /Nom de la note ou du projet/);
  f.elements.body.value = 'Une reine des abeilles';
  await ctx.submit(f);
  assert.match(ctx.root.textContent, /Donne un nom à ta note ou choisis une de tes histoires/);
  assert.equal(ctx.backend._raw.notes.size, 1);
  // nom libre
  f = ctx.$('[data-role="note-form"]');
  assert.equal(f.elements.body.value, 'Une reine des abeilles', 'la saisie est conservée');
  f.elements.title.value = 'Futur projet';
  await ctx.submit(f);
  const free = [...ctx.backend._raw.notes.values()].find((n) => n.title === 'Futur projet');
  assert.ok(free); assert.equal(free.bookId, '');
  // histoire sans titre : l'étiquette change
  f = ctx.$('[data-role="note-form"]');
  f.elements.bookId.value = 'b';
  f.elements.bookId.dispatchEvent(new ctx.win.Event('change', { bubbles: true }));
  await tick();
  assert.match(ctx.root.textContent, /Titre \(facultatif\)/);
  f = ctx.$('[data-role="note-form"]');
  assert.equal(f.elements.bookId.value, 'b', 'le choix de l’histoire est conservé');
  f.elements.body.value = 'Scène du duel';
  await ctx.submit(f);
  const linked = [...ctx.backend._raw.notes.values()].find((n) => n.body === 'Scène du duel');
  assert.equal(linked.bookId, 'b'); assert.equal(linked.title, '');
  assert.match(ctx.$(`[data-note="${linked.id}"]`).textContent, /📖 Brouillon/);
  ctx.close();
});

test('statistiques : ni l’auteur connecté ni un appareil marqué ?perso ne sont comptés ; un visiteur l’est', async () => {
  // visiteur normal : compté
  let ctx = await mount();
  assert.ok(ctx.backend._raw.stats.get('all'), 'le visiteur est compté');
  ctx.close();
  // appareil marqué par ?perso : pas compté, paramètre retiré de l’adresse, appareil mémorisé
  const local = fakeStorage();
  ctx = await mount({ search: '?perso', local });
  assert.equal(ctx.backend._raw.stats.size, 0);
  assert.equal(ctx.win.location.search, '');
  assert.equal(local.getItem('suivi-livres:auteur'), '1');
  ctx.close();
  // visite suivante sans paramètre sur le même appareil : toujours pas comptée
  ctx = await mount({ local });
  assert.equal(ctx.backend._raw.stats.size, 0);
  ctx.close();
  // auteur connecté : pas compté, et l’appareil est ensuite reconnu
  const local2 = fakeStorage();
  ctx = await mount({ local: local2, hash: '#/admin' });
  await ctx.login();
  assert.equal(ctx.backend._raw.stats.size, 0);
  assert.equal(local2.getItem('suivi-livres:auteur'), '1');
  ctx.close();
});

test('statistiques : l’écran propose le lien ?perso pour un nouvel appareil', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.click(ctx.$('[data-action="more"]'));
  await ctx.click(ctx.$('.bn-panel [data-action="stats"]'));
  assert.equal(ctx.$('.perso-url').textContent, `${SHARE}?perso`);
  ctx.close();
});
