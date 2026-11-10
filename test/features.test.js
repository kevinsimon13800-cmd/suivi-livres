// Tests d'interface des nouveautés : couvertures, compte à rebours, étiquettes/filtres,
// coches de lecture des visiteurs, Notes-Idées (privées).
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { start } from '../js/app.js';
import { createMockBackend, OWNER, OTHER } from './mock-backend.js';

const SHARE = 'https://moi.github.io/livres/';
const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQ==';

const SEED = () => ({
  profile: { displayName: 'Kévin', bio: '' },
  books: [
    {
      id: 'a', title: 'La Prêtresse', status: 'ecriture', words: 10, goalWords: 100, genre: 'Fantasy', tags: ['Grèce', 'romance'],
      releaseDate: '2026-11-21', cover: PNG, chapterTitles: ['L’oracle', 'Le temple', 'La lame'], public: true, updatedAt: '2026-11-08T10:00:00Z',
    },
    { id: 'b', title: 'Roses de Sparte', status: 'publie', genre: 'Romance', tags: ['Grèce'], releaseDate: '2026-06-01', public: true, updatedAt: '2026-11-01T10:00:00Z' },
    { id: 'c', title: 'Ancien livre', status: 'plan', public: true, updatedAt: '2026-10-01T10:00:00Z' }, // sans les nouveaux champs
    { id: 'd', title: 'Secret', status: 'idee', public: false, updatedAt: '2026-11-09T10:00:00Z' },
  ],
  notes: [{ id: 'n1', title: 'Idée de scène', body: 'Duel\nau lever du soleil', bookId: 'a', updatedAt: '2026-11-07T10:00:00Z' }],
});

function fakeStorage(shared) {
  const m = shared || new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

async function mount({ seed = SEED(), hash = '', storage = fakeStorage(), compressCover, backend, confirmAnswer = true } = {}) {
  const dom = new JSDOM('<div id="app"></div>', { url: SHARE + hash });
  const win = dom.window;
  win.confirm = () => confirmAnswer;
  win.scrollTo = () => {};
  const be = backend || createMockBackend(seed);
  const root = win.document.getElementById('app');
  const app = start({ backend: be, root, ownerUid: OWNER.uid, shareUrl: SHARE, doc: win.document, win, storage, compressCover, today: () => '2026-11-09' });
  await tick();
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const click = async (el) => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await tick(); };
  const change = async (el) => { el.dispatchEvent(new win.Event('change', { bubbles: true })); await tick(); };
  const input = async (el, v) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); await tick(); };
  const submit = async (form) => { form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); await tick(30); };
  const loginAs = async (acc) => {
    await click($('[data-action="admin-link"]'));
    const f = $('[data-role="login-form"]');
    f.elements.email.value = acc.email;
    f.elements.password.value = acc.password;
    await submit(f);
    await tick();
  };
  const titles = () => $$('.card h3').map((e) => e.textContent);
  return { win, root, backend: be, app, $, $$, click, change, input, submit, loginAs, titles, close: () => win.close() };
}

// Simule le choix d'un fichier dans <input type=file>
function chooseFile(ctx, el, file) {
  Object.defineProperty(el, 'files', { value: [file], configurable: true });
  return ctx.change(el);
}

// ---------- Visiteur ----------

test('visiteur : couverture affichée en image, sinon illustration avec le titre', async () => {
  const ctx = await mount();
  const img = ctx.$('[data-book="a"] .cover img');
  assert.ok(img);
  assert.equal(img.getAttribute('src'), PNG);
  assert.match(img.getAttribute('alt'), /La Prêtresse/);
  const ph = ctx.$('[data-book="b"] .cover.placeholder');
  assert.ok(ph);
  assert.equal(ph.querySelector('.cover-title').textContent, 'Roses de Sparte');
  ctx.close();
});

test('visiteur : une couverture invalide ou piégée n’est jamais insérée comme image', async () => {
  const seed = SEED();
  seed.books[0].cover = 'javascript:alert(1)';
  seed.books[1].cover = 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+';
  const ctx = await mount({ seed });
  assert.equal(ctx.$$('.cover img').length, 0);
  assert.equal(ctx.$$('.cover.placeholder').length, 3);
  ctx.close();
});

test('visiteur : compte à rebours avant la sortie, date de sortie après', async () => {
  const ctx = await mount();
  assert.match(ctx.$('[data-book="a"] [data-role="countdown"]').textContent, /^J-12 · sortie le 21 novembre 2026$/);
  const past = ctx.$('[data-book="b"] [data-role="countdown"]');
  assert.match(past.textContent, /Sorti le 1 juin 2026/);
  assert.ok(past.classList.contains('past'));
  assert.equal(ctx.$('[data-book="c"] [data-role="countdown"]'), null);
  ctx.close();
});

test('visiteur : un ancien livre sans les nouveaux champs s’affiche sans erreur', async () => {
  const ctx = await mount();
  const c = ctx.$('[data-book="c"]');
  assert.ok(c);
  assert.equal(c.querySelector('.tags'), null);
  assert.equal(c.querySelector('details'), null);
  assert.ok(c.querySelector('[data-role="book-read"]'));
  ctx.close();
});

test('visiteur : filtre par étiquette, puis retrait du filtre', async () => {
  const ctx = await mount();
  assert.deepEqual(ctx.titles(), ['La Prêtresse', 'Roses de Sparte', 'Ancien livre']);
  await ctx.click(ctx.$('.filters [data-tag="romance"]'));
  assert.deepEqual(ctx.titles(), ['La Prêtresse']);
  assert.equal(ctx.$('.filters [data-tag="romance"]').getAttribute('aria-pressed'), 'true');
  await ctx.click(ctx.$('.filters [data-tag="romance"]'));
  assert.equal(ctx.titles().length, 3);
  // clic sur une étiquette d'une carte
  await ctx.click(ctx.$('[data-book="b"] [data-tag="Grèce"]'));
  assert.deepEqual(ctx.titles(), ['La Prêtresse', 'Roses de Sparte']);
  ctx.close();
});

test('visiteur : recherche sans accents, garde le focus, filtre par genre, et "Tout afficher"', async () => {
  const ctx = await mount();
  const search = ctx.$('[data-role="search"]');
  search.focus();
  await ctx.input(search, 'pretresse');
  assert.deepEqual(ctx.titles(), ['La Prêtresse']);
  assert.equal(ctx.win.document.activeElement, search, 'le champ de recherche ne doit pas être recréé');
  await ctx.input(search, 'zzz');
  assert.equal(ctx.titles().length, 0);
  assert.match(ctx.root.textContent, /Aucun livre ne correspond/);
  await ctx.click(ctx.$('[data-action="clear-filters"]'));
  assert.equal(ctx.titles().length, 3);
  assert.equal(ctx.$('[data-role="search"]').value, '');
  const sel = ctx.$('[data-role="genre-filter"]');
  sel.value = 'Romance';
  await ctx.change(sel);
  assert.deepEqual(ctx.titles(), ['Roses de Sparte']);
  ctx.close();
});

test('visiteur : les livres privés n’alimentent pas les filtres', async () => {
  const seed = SEED();
  seed.books[3].tags = ['tag-secret'];
  seed.books[3].genre = 'Genre secret';
  const ctx = await mount({ seed });
  assert.ok(!ctx.root.textContent.includes('tag-secret'));
  assert.ok(!ctx.root.textContent.includes('Genre secret'));
  ctx.close();
});

test('visiteur : coche les chapitres lus et le livre lu, conservés au rechargement', async () => {
  const shared = new Map();
  const ctx = await mount({ storage: fakeStorage(shared) });
  const card = () => ctx.$('[data-book="a"]');
  assert.match(card().querySelector('.read-count').textContent, /0\/3 lus/);
  const boxes = card().querySelectorAll('[data-role="chapter-read"]');
  assert.equal(boxes.length, 3);
  assert.deepEqual([...card().querySelectorAll('.chapters li span')].map((s) => s.textContent), ['L’oracle', 'Le temple', 'La lame']);
  boxes[0].checked = true; await ctx.change(boxes[0]);
  boxes[2].checked = true; await ctx.change(boxes[2]);
  assert.match(card().querySelector('.read-count').textContent, /2\/3 lus/);
  const book = card().querySelector('[data-role="book-read"]');
  book.checked = true; await ctx.change(book);
  assert.ok(card().classList.contains('is-read'));
  // aucune écriture dans la base
  assert.equal(ctx.backend._raw.books.get('a').read, undefined);
  ctx.close();

  const again = await mount({ storage: fakeStorage(shared) });
  const c2 = again.$('[data-book="a"]');
  assert.match(c2.querySelector('.read-count').textContent, /2\/3 lus/);
  assert.equal(c2.querySelector('[data-role="book-read"]').checked, true);
  assert.deepEqual([...c2.querySelectorAll('[data-role="chapter-read"]')].map((b) => b.checked), [true, false, true]);
  assert.ok(c2.classList.contains('is-read'));
  assert.match(again.root.textContent, /gardées sur cet appareil/);
  again.close();
});

test('visiteur : stockage bloqué → les coches marchent quand même, avec un avertissement', async () => {
  const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() {} };
  const ctx = await mount({ storage: blocked });
  const box = ctx.$('[data-book="a"] [data-role="chapter-read"]');
  box.checked = true;
  await ctx.change(box);
  assert.match(ctx.$('[data-book="a"] .read-count').textContent, /1\/3/);
  assert.match(ctx.root.textContent, /perdues en fermant la page/);
  ctx.close();
});

test('visiteur : pas d’accès aux Notes-Idées (ni bouton, ni lecture dans la base)', async () => {
  const ctx = await mount();
  assert.equal(ctx.$('[data-action="notes"]'), null);
  assert.ok(!ctx.root.textContent.includes('Idée de scène'));
  await assert.rejects(ctx.backend.listNotes(), /permission-denied/);
  await assert.rejects(ctx.backend.saveNote({ title: 'pirate' }), /permission-denied/);
  await assert.rejects(ctx.backend.deleteNote('n1'), /permission-denied/);
  ctx.close();
});

test('règles simulées : un autre compte connecté ne lit ni n’écrit les notes', async () => {
  const be = createMockBackend(SEED());
  await be.login(OTHER.email, OTHER.password);
  await assert.rejects(be.listNotes(), /permission-denied/);
  await assert.rejects(be.saveNote({ title: 'x' }), /permission-denied/);
});

// ---------- Propriétaire : livres ----------

test('propriétaire : pas de cases de lecture, mais le nombre de chapitres listés', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  assert.equal(ctx.$('[data-role="reader"]'), null);
  assert.equal(ctx.$('[data-book="a"] [data-action="delete"]'), null, 'plus de boutons sur la carte');
  assert.equal(ctx.$('[data-book="a"] .btn'), null, 'carte allégée : aucun bouton');
  ctx.close();
});

test('propriétaire : ajoute une couverture — la saisie en cours est conservée — et enregistre tous les nouveaux champs', async () => {
  let received = null;
  const ctx = await mount({ compressCover: async (f) => { received = f; return JPG; } });
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="add"]'));
  let form = ctx.$('[data-role="book-form"]');
  form.elements.title.value = 'Nouveau roman';
  form.elements.tags.value = 'Grèce, épées, grèce';
  form.elements.releaseDate.value = '2027-02-14';
  form.elements.chapterTitles.value = 'Un\n\nDeux';
  form.elements.public.checked = true;
  await chooseFile(ctx, ctx.$('[data-role="cover-input"]'), { name: 'photo.jpg', type: 'image/jpeg', size: 1000 });
  await tick(30);
  assert.equal(received.name, 'photo.jpg');
  form = ctx.$('[data-role="book-form"]');
  assert.equal(form.elements.title.value, 'Nouveau roman', 'le titre tapé avant la photo est conservé');
  assert.equal(form.elements.tags.value, 'Grèce, épées, grèce');
  assert.equal(form.elements.public.checked, true);
  assert.equal(ctx.$('.cover-preview img').getAttribute('src'), JPG);
  await ctx.submit(form);
  const saved = [...ctx.backend._raw.books.values()].find((b) => b.title === 'Nouveau roman');
  assert.ok(saved);
  assert.equal(saved.cover, JPG);
  assert.deepEqual(saved.tags, ['Grèce', 'épées']);
  assert.deepEqual(saved.chapterTitles, ['Un', 'Deux']);
  assert.equal(saved.releaseDate, '2027-02-14');
  assert.equal(saved.public, true);
  assert.ok(ctx.$(`[data-book="${saved.id}"] .cover img`));
  assert.match(ctx.$(`[data-book="${saved.id}"] [data-role="countdown"]`).textContent, /J-97/);
  ctx.close();
});

test('propriétaire : modifier un livre pré-remplit étiquettes, chapitres, date, couverture ; retirer la couverture', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-book="a"]'));
  let form = ctx.$('[data-role="book-form"]');
  assert.equal(form.elements.tags.value, 'Grèce, romance');
  assert.equal(form.elements.chapterTitles.value, 'L’oracle\nLe temple\nLa lame');
  assert.equal(form.elements.releaseDate.value, '2026-11-21');
  assert.equal(ctx.$('.cover-preview img').getAttribute('src'), PNG);
  form.elements.title.value = 'Titre modifié';
  await ctx.click(ctx.$('[data-action="remove-cover"]'));
  form = ctx.$('[data-role="book-form"]');
  assert.equal(ctx.$('.cover-preview img'), null);
  assert.equal(form.elements.title.value, 'Titre modifié', 'retirer la couverture ne perd pas la saisie');
  await ctx.submit(form);
  const a = ctx.backend._raw.books.get('a');
  assert.equal(a.cover, '');
  assert.equal(a.title, 'Titre modifié');
  assert.deepEqual(a.tags, ['Grèce', 'romance']);
  ctx.close();
});

test('propriétaire : image refusée → message clair, formulaire intact, enregistrement possible sans couverture', async () => {
  const ctx = await mount({ compressCover: async () => { throw new Error('pas-une-image'); } });
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="add"]'));
  ctx.$('[data-role="book-form"]').elements.title.value = 'Avec mauvaise image';
  await chooseFile(ctx, ctx.$('[data-role="cover-input"]'), { name: 'doc.pdf', type: 'application/pdf', size: 10 });
  await tick(30);
  assert.match(ctx.$('.cover-actions .err').textContent, /pas une image/);
  const form = ctx.$('[data-role="book-form"]');
  assert.equal(form.elements.title.value, 'Avec mauvaise image');
  await ctx.submit(form);
  const saved = [...ctx.backend._raw.books.values()].find((b) => b.title === 'Avec mauvaise image');
  assert.equal(saved.cover, '');
  ctx.close();
});

test('propriétaire : compression qui renvoie une image trop lourde → refusée', async () => {
  const huge = 'data:image/jpeg;base64,' + 'A'.repeat(500000);
  const ctx = await mount({ compressCover: async () => huge });
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="add"]'));
  await chooseFile(ctx, ctx.$('[data-role="cover-input"]'), { name: 'x.jpg', type: 'image/jpeg', size: 10 });
  await tick(30);
  assert.equal(ctx.$('.cover-preview img'), null);
  assert.ok(ctx.$('.cover-actions .err'));
  ctx.close();
});

test('propriétaire : date de sortie invalide refusée avec message', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="add"]'));
  const form = ctx.$('[data-role="book-form"]');
  form.elements.title.value = 'X';
  // jsdom accepte la valeur brute d'un champ date
  Object.defineProperty(form.elements.releaseDate, 'value', { value: '2027-13-45', configurable: true });
  const before = ctx.backend._raw.books.size;
  await ctx.submit(form);
  assert.equal(ctx.backend._raw.books.size, before);
  assert.match(ctx.root.textContent, /Date invalide/);
  ctx.close();
});

// ---------- Propriétaire : Notes-Idées ----------

test('notes : liste, ajout, modification, suppression', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="notes"]'));
  await tick(30);
  const notes = () => ctx.$$('.note h3').map((e) => e.textContent);
  assert.deepEqual(notes(), ['Idée de scène']);
  assert.match(ctx.$('[data-note="n1"]').textContent, /📖 La Prêtresse/);
  assert.equal(ctx.$('[data-note="n1"] .note-body').textContent, 'Duel\nau lever du soleil');

  // ajout lié à un livre
  let form = ctx.$('[data-role="note-form"]');
  form.elements.title.value = 'Personnage : Lysandra';
  form.elements.body.value = 'Guerrière';
  form.elements.bookId.value = 'd';
  await ctx.submit(form);
  await tick(30);
  assert.equal(notes().length, 2);
  const added = [...ctx.backend._raw.notes.values()].find((n) => n.title === 'Personnage : Lysandra');
  assert.equal(added.bookId, 'd');
  assert.equal(ctx.backend._raw.notes.get('n1').title, 'Idée de scène', 'la note existante n’est pas écrasée');
  assert.equal(ctx.$('[data-role="note-form"]').elements.title.value, '', 'le formulaire se vide après ajout');

  // modification
  await ctx.click(ctx.$('[data-note="n1"]'));
  form = ctx.$('[data-role="note-form"]');
  assert.equal(form.elements.title.value, 'Idée de scène');
  assert.equal(form.elements.bookId.value, 'a');
  form.elements.body.value = 'Duel au crépuscule';
  await ctx.submit(form);
  await tick(30);
  assert.equal(ctx.backend._raw.notes.get('n1').body, 'Duel au crépuscule');
  assert.equal(ctx.backend._raw.notes.size, 2);

  // suppression
  await ctx.click(ctx.$('[data-note="n1"]'));
  await ctx.click(ctx.$('[data-role="note-form"] [data-action="delete-note"]'));
  await tick(30);
  assert.equal(ctx.backend._raw.notes.has('n1'), false);
  assert.deepEqual(notes(), ['Personnage : Lysandra']);
  ctx.close();
});

test('notes : note vide refusée, suppression annulée conserve la note', async () => {
  const ctx = await mount({ confirmAnswer: false });
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="notes"]'));
  await tick(30);
  await ctx.submit(ctx.$('[data-role="note-form"]'));
  assert.match(ctx.root.textContent, /Donne un nom à ta note ou choisis une de tes histoires/);
  assert.equal(ctx.backend._raw.notes.size, 1);
  await ctx.click(ctx.$('[data-note="n1"]'));
  await ctx.click(ctx.$('[data-role="note-form"] [data-action="delete-note"]'));
  assert.equal(ctx.backend._raw.notes.size, 1);
  ctx.close();
});

test('notes : la disparition du message « Note enregistrée » n’efface pas une nouvelle saisie', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="notes"]'));
  await tick(30);
  const form = ctx.$('[data-role="note-form"]');
  form.elements.title.value = 'Première';
  await ctx.submit(form);
  await tick(30);
  assert.ok(ctx.$('.toast'));
  const f2 = ctx.$('[data-role="note-form"]');
  f2.elements.title.value = 'En cours de frappe';
  await tick(2600); // le message disparaît
  assert.equal(ctx.$('.toast'), null);
  assert.equal(ctx.$('[data-role="note-form"]'), f2, 'le formulaire n’a pas été recréé');
  assert.equal(f2.elements.title.value, 'En cours de frappe');
  ctx.close();
});

test('notes : erreur de chargement affichée proprement', async () => {
  const be = createMockBackend(SEED());
  be.listNotes = async () => { throw new Error('offline'); };
  const ctx = await mount({ backend: be });
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="notes"]'));
  await tick(30);
  assert.match(ctx.$('[role="alert"]').textContent, /Impossible de charger tes notes/);
  ctx.close();
});

test('notes : un texte malveillant est affiché comme texte', async () => {
  const seed = SEED();
  seed.notes[0].title = '<img src=x onerror=alert(1)>';
  seed.notes[0].body = '<script>alert(1)</script>';
  const ctx = await mount({ seed });
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="notes"]'));
  await tick(30);
  assert.equal(ctx.$$('.note img').length, 0);
  assert.equal(ctx.$$('.note script').length, 0);
  assert.equal(ctx.$('.note h3').textContent, '<img src=x onerror=alert(1)>');
  ctx.close();
});

test('déconnexion depuis les notes : retour visiteur, notes effacées de la mémoire', async () => {
  const ctx = await mount();
  await ctx.loginAs(OWNER);
  await ctx.click(ctx.$('[data-action="notes"]'));
  await tick(30);
  await ctx.click(ctx.$('[data-action="logout"]'));
  await tick(30);
  assert.equal(ctx.$('[data-role="note-form"]'), null);
  assert.equal(ctx.app.state.notes.length, 0);
  assert.ok(ctx.$('[data-action="admin-link"]'));
  ctx.close();
});
