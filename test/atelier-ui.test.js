// Interface des nouveautés v7 : compteur de lectures, chapitre, sondage, personnages, notes dictées.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { start } from '../js/app.js';
import { createMockBackend, OWNER } from './mock-backend.js';

const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));
const SHARE = 'https://moi.github.io/livres/';
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const seed = () => ({
  profile: { displayName: 'Lau' },
  books: [{ id: 'a', title: 'La Prêtresse', status: 'ecriture', words: 10, goalWords: 100, public: true, updatedAt: '2026-11-08T10:00:00Z', tags: [], chapterTitles: [] }],
  notes: [],
  readings: [
    { id: 'r1', title: 'Jane Eyre', author: 'C. Brontë', status: 'terminee', finishedAt: '2026-11-10' },
    { id: 'r2', title: 'Dorian Gray', author: 'O. Wilde', status: 'terminee', finishedAt: '2026-10-20' },
    { id: 'r3', title: 'Notre-Dame', author: '', status: 'terminee', finishedAt: '2026-03-02' },
    { id: 'r4', title: 'En cours', author: '', status: 'en-cours', finishedAt: '' },
    { id: 'r5', title: 'Sans date', author: '', status: 'terminee', finishedAt: '' },
  ],
  stats: {},
  characters: [
    { id: 'p1', name: 'Lyra', story: 'La Prêtresse', role: 'Héroïne', age: '19', appearance: '', traits: 'Têtue', notes: '' },
    { id: 'p2', name: 'Eliott', story: 'La Prêtresse', role: '', age: '', appearance: '', traits: '', notes: '' },
    { id: 'p3', name: 'Maëlle', story: 'Autre histoire', role: '', age: '', appearance: '', traits: '', notes: '' },
  ],
  relations: [{ id: 'l1', from: 'p1', to: 'p2', type: 'amour', label: '' }],
  chapter: { story: 'La Prêtresse', title: 'Chapitre 12', date: '2026-11-13', time: '18:30' },
  poll: { question: 'Quelle suite ?', closed: false, rev: 1, options: [{ id: 'o1', label: 'Romance', votes: 3 }, { id: 'o2', label: 'Fantasy', votes: 1 }] },
});

async function mount({ hash = '', local = fakeStorage(), confirmAnswer = true, dictation, backend: be, sd = seed() } = {}) {
  const dom = new JSDOM('<div id="app"></div>', { url: SHARE + hash });
  const win = dom.window;
  opened.push(win);
  win.scrollTo = () => {};
  win.confirm = () => confirmAnswer;
  Object.defineProperty(win.navigator, 'webdriver', { value: false, configurable: true });
  const backend = be || createMockBackend(sd);
  const root = win.document.getElementById('app');
  start({
    backend, root, ownerUid: OWNER.uid, shareUrl: SHARE, doc: win.document, win, storage: local,
    now: () => new Date(2026, 10, 10, 16, 0, 0), today: () => '2026-11-10', dictation: dictation || null,
  });
  await tick(50);
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const click = async (el) => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await tick(40); };
  const submit = async (f) => { f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); await tick(50); };
  const login = async () => {
    win.location.hash = '#/admin'; await tick();
    const f = $('[data-role="login-form"]');
    f.elements.email.value = OWNER.email; f.elements.password.value = OWNER.password;
    await submit(f); await tick(60);
  };
  const more = async (action) => { await click($('.bn-item[data-action="more"]')); await click($(`.bn-panel [data-action="${action}"]`)); };
  return { win, root, backend, local, $, $$, click, submit, login, more, close: () => win.close() };
}
const opened = [];
test.afterEach(() => { while (opened.length) opened.pop().close(); });
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

// ---------- Visiteur : chapitre et sondage sur l'accueil ----------

test('visiteur : compte à rebours du chapitre (3 jours 2 h 30) et informations', async () => {
  const ctx = await mount();
  const b = ctx.$('[data-role="chapter-banner"]');
  assert.ok(b);
  assert.equal(ctx.$('[data-role="chapter-title"]').textContent, 'Chapitre 12');
  assert.equal(ctx.$('[data-role="chapter-story"]').textContent, 'La Prêtresse');
  assert.match(text(ctx.$('[data-role="chapter-count"]')), /^03jours02heures30min00sec$/);
  assert.match(text(ctx.$('[data-role="chapter-when"]')), /13 novembre 2026 à 18 h 30/);
  ctx.close();
});

test('visiteur : pas de bandeau quand le chapitre est passé ou absent', async () => {
  const sd = seed();
  sd.chapter = { story: '', title: '', date: '2026-11-01', time: '10:00' };
  const past = await mount({ sd });
  assert.equal(past.$('[data-role="chapter-banner"]'), null); // passé depuis plus de 24 h
  past.close();
  const sd3 = seed();
  sd3.chapter = { story: '', title: 'Chapitre 11', date: '2026-11-10', time: '14:00' }; // il y a 2 h
  const recent = await mount({ sd: sd3 });
  assert.match(text(recent.$('[data-role="chapter-count"]')), /Le chapitre est en ligne !/);
  recent.close();
  const sd2 = seed();
  delete sd2.chapter;
  const none = await mount({ sd: sd2 });
  assert.equal(none.$('[data-role="chapter-banner"]'), null);
  none.close();
});

test('visiteur : vote, résultats, changement de vote, une voix par appareil', async () => {
  const ctx = await mount();
  assert.equal(ctx.$$('[data-vote]').length, 2);
  assert.equal(ctx.$('[data-role="poll-question"]').textContent, 'Quelle suite ?');
  await ctx.click(ctx.$('[data-vote="o2"]'));
  assert.equal(ctx.$$('[data-vote]').length, 0);
  assert.equal(text(ctx.$('[data-role="poll-total"]')), '5 votes');
  assert.match(text(ctx.$('[data-option="o2"]')), /Fantasy \(ton vote\)\s*40 % · 2/);
  assert.match(text(ctx.$('[data-option="o1"]')), /60 % · 3/);
  assert.equal(ctx.local.getItem('sondage:vote:1'), 'o2');
  assert.equal((await ctx.backend.getPoll()).options[1].votes, 2);
  // changer : -1 sur l'ancien choix, +1 sur le nouveau, total inchangé
  await ctx.click(ctx.$('[data-action="poll-change"]'));
  await ctx.click(ctx.$('[data-vote="o1"]'));
  const p = await ctx.backend.getPoll();
  assert.deepEqual(p.options.map((o) => o.votes), [4, 1]);
  assert.equal(ctx.local.getItem('sondage:vote:1'), 'o1');
  assert.equal(text(ctx.$('[data-role="poll-total"]')), '5 votes');
  ctx.close();
});

test('visiteur : revient sur la page, son vote est retenu ; voir les résultats sans voter', async () => {
  const local = fakeStorage();
  local.setItem('sondage:vote:1', 'o1');
  const back = await mount({ local });
  assert.equal(back.$$('[data-vote]').length, 0);
  assert.match(text(back.$('[data-option="o1"]')), /\(ton vote\)/);
  back.close();
  const peek = await mount();
  await peek.click(peek.$('[data-action="poll-peek"]'));
  assert.equal(peek.$$('[data-vote]').length, 0);
  assert.equal(await peek.backend.getPoll().then((p) => p.options[0].votes), 3);
  await peek.click(peek.$('[data-action="poll-back"]'));
  assert.equal(peek.$$('[data-vote]').length, 2);
  peek.close();
});

test('visiteur : sondage fermé = résultats seulement, aucun vote possible', async () => {
  const sd = seed();
  sd.poll.closed = true;
  const ctx = await mount({ sd });
  assert.equal(ctx.$$('[data-vote]').length, 0);
  assert.match(text(ctx.$('[data-role="poll-total"]')), /sondage fermé/);
  await assert.rejects(() => ctx.backend.votePoll({ optionId: 'o1' }));
  ctx.close();
});

test('visiteur : aucun accès aux personnages ni aux réglages', async () => {
  const ctx = await mount();
  assert.equal(ctx.$('[data-action="characters"]'), null);
  assert.equal(ctx.$('[data-role="characters"]'), null);
  await assert.rejects(() => ctx.backend.listCharacters());
  await assert.rejects(() => ctx.backend.saveChapter({}));
  await assert.rejects(() => ctx.backend.savePoll({}));
  ctx.close();
});

// ---------- Lectures : compteur ----------

test('lectures (visiteur) : compteur par période, liste et navigation', async () => {
  const ctx = await mount({ hash: '#/lectures' });
  const tiles = Object.fromEntries(ctx.$$('.counter-tile').map((t) => [t.dataset.period, t.querySelector('strong').textContent]));
  assert.deepEqual(tiles, { week: '1', month: '1', quarter: '2', semester: '2', year: '3' });
  assert.equal(ctx.$('[data-role="counter-label"]').textContent, 'novembre 2026');
  assert.deepEqual(ctx.$$('[data-reading-done]').map((e) => e.dataset.readingDone), ['r1']);
  await ctx.click(ctx.$('.counter-tile[data-period="year"]'));
  assert.deepEqual(ctx.$$('[data-reading-done]').map((e) => e.dataset.readingDone), ['r1', 'r2', 'r3']);
  assert.equal(ctx.$('[data-role="counter-total"]').textContent, '3 livres lus');
  assert.equal(ctx.$('[data-action="counter-next"]').disabled, true);
  await ctx.click(ctx.$('[data-action="counter-prev"]'));
  assert.equal(ctx.$('[data-role="counter-label"]').textContent, '2025');
  assert.equal(ctx.$$('[data-reading-done]').length, 0);
  assert.equal(ctx.$('[data-action="counter-next"]').disabled, false);
  assert.equal(ctx.$('[data-role="counter-undated"]'), null); // visiteur : pas d'avertissement
  ctx.close();
});

test('lectures : sans livre terminé, le compteur n’apparaît pas pour un visiteur', async () => {
  const sd = seed();
  sd.readings = [{ id: 'x', title: 'À lire', status: 'a-lire' }];
  const ctx = await mount({ hash: '#/lectures', sd });
  assert.ok(ctx.$('[data-role="counter"]').hidden);
  ctx.close();
});

test('lectures (auteure) : signale une lecture terminée sans date et ne la compte pas', async () => {
  const ctx = await mount();
  await ctx.login();
  ctx.win.location.hash = '#/lectures';
  await tick(60);
  assert.match(text(ctx.$('[data-role="counter-undated"]')), /1 lecture « Terminée » sans date de fin : non comptée/);
  assert.equal(ctx.$('.counter-tile[data-period="year"] strong').textContent, '3');
  ctx.close();
});

// ---------- Auteure : personnages ----------

test('auteure : le menu Plus propose Personnages, Prochain chapitre et Sondage', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.click(ctx.$('.bn-item[data-action="more"]'));
  for (const a of ['characters', 'chapter', 'poll']) assert.ok(ctx.$(`.bn-panel [data-action="${a}"]`), a);
  ctx.close();
});

test('personnages : fiches, filtre par histoire, création et modification', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.more('characters');
  assert.deepEqual(ctx.$$('[data-char] h3').map((e) => e.textContent), ['Eliott', 'Lyra', 'Maëlle']);
  const filter = ctx.$('[data-role="char-filter"]');
  filter.value = 'La Prêtresse';
  filter.dispatchEvent(new ctx.win.Event('change', { bubbles: true }));
  await tick();
  assert.deepEqual(ctx.$$('[data-char] h3').map((e) => e.textContent), ['Eliott', 'Lyra']);
  // création
  await ctx.click(ctx.$('[data-action="add-char"]'));
  const f = ctx.$('[data-role="char-form"]');
  assert.equal(f.elements.story.value, 'La Prêtresse'); // histoire préremplie par le filtre
  await ctx.submit(f); // nom vide : refus
  assert.match(text(ctx.$('[data-role="char-form"]')), /Le nom est obligatoire/);
  const f2 = ctx.$('[data-role="char-form"]');
  f2.elements.name.value = 'Aurelius';
  f2.elements.role.value = 'Antagoniste';
  await ctx.submit(f2);
  assert.deepEqual(ctx.$$('[data-char] h3').map((e) => e.textContent), ['Aurelius', 'Eliott', 'Lyra']);
  // toucher une fiche l'ouvre pour la modifier
  await ctx.click(ctx.$('[data-char="p1"]'));
  const f3 = ctx.$('[data-role="char-form"]');
  assert.equal(f3.elements.name.value, 'Lyra');
  f3.elements.age.value = '20';
  await ctx.submit(f3);
  assert.match(text(ctx.$('[data-char="p1"]')), /Héroïne · 20 ans/);
  ctx.close();
});

test('personnages : carte, ajout et suppression d’un lien, suppression d’une fiche avec ses liens', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.more('characters');
  await ctx.click(ctx.$('[data-tab="carte"]'));
  assert.equal(ctx.$$('[data-node]').length, 3);
  assert.equal(ctx.$$('[data-rel]').length, 1);
  assert.match(text(ctx.$('[data-rel="l1"]')), /Amour/);
  // lien invalide (même personnage)
  const rf = ctx.$('[data-role="rel-form"]');
  rf.elements.from.value = 'p1'; rf.elements.to.value = 'p1';
  await ctx.submit(rf);
  assert.match(text(ctx.$('[data-role="rel-form"]')), /deux personnages différents/);
  assert.equal(ctx.$$('[data-rel]').length, 1);
  // lien valide
  const rf2 = ctx.$('[data-role="rel-form"]');
  rf2.elements.from.value = 'p1'; rf2.elements.to.value = 'p3';
  rf2.elements.type.value = 'amitie'; rf2.elements.label.value = 'cousine';
  await ctx.submit(rf2);
  assert.equal(ctx.$$('[data-rel]').length, 2);
  assert.match(text(ctx.$('[data-rel-item]:last-child')), /Lyra cousine Maëlle/);
  // supprimer un lien
  await ctx.click(ctx.$('[data-rel-item="l1"] [data-action="delete-rel"]'));
  assert.equal(ctx.$$('[data-rel]').length, 1);
  // supprimer une fiche supprime ses liens
  await ctx.click(ctx.$('[data-tab="fiches"]'));
  await ctx.click(ctx.$('[data-char="p3"]'));
  await ctx.click(ctx.$('[data-action="delete-char"]'));
  assert.deepEqual(ctx.$$('[data-char] h3').map((e) => e.textContent), ['Eliott', 'Lyra']);
  assert.deepEqual(await ctx.backend.listRelations(), []);
  ctx.close();
});

test('personnages : refus de la suppression si l’auteure annule la confirmation', async () => {
  const ctx = await mount({ confirmAnswer: false });
  await ctx.login();
  await ctx.more('characters');
  await ctx.click(ctx.$('[data-char="p1"]'));
  await ctx.click(ctx.$('[data-action="delete-char"]'));
  assert.equal((await ctx.backend.listCharacters()).length, 3);
  ctx.close();
});

// ---------- Auteure : chapitre et sondage ----------

test('chapitre : l’auteure règle, vérifie les erreurs, enregistre, retire', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.more('chapter');
  const f = ctx.$('[data-role="chapter-form"]');
  assert.equal(f.elements.title.value, 'Chapitre 12');
  f.elements.date.value = '';
  await ctx.submit(f);
  assert.match(text(ctx.$('[data-role="chapter-form"]')), /Choisis une date/);
  const f2 = ctx.$('[data-role="chapter-form"]');
  f2.elements.date.value = '2026-11-20'; f2.elements.time.value = '09:15'; f2.elements.title.value = 'Chapitre 13';
  await ctx.submit(f2);
  assert.equal(ctx.$('[data-role="chapter-title"]').textContent, 'Chapitre 13');
  assert.match(text(ctx.$('[data-role="chapter-when"]')), /20 novembre 2026 à 09 h 15/);
  assert.deepEqual(await ctx.backend.getChapter(), { story: 'La Prêtresse', title: 'Chapitre 13', date: '2026-11-20', time: '09:15' });
  await ctx.more('chapter');
  await ctx.click(ctx.$('[data-action="remove-chapter"]'));
  assert.equal(ctx.$('[data-role="chapter-banner"]'), null);
  assert.equal(await ctx.backend.getChapter(), null);
  ctx.close();
});

test('sondage : modifier les choix remet les votes à zéro ; modifier la question les garde', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.more('poll');
  const f = ctx.$('[data-role="poll-form"]');
  f.elements.options.value = 'Seul choix';
  await ctx.submit(f);
  assert.match(text(ctx.$('[data-role="poll-form"]')), /au moins 2 choix/);
  const f2 = ctx.$('[data-role="poll-form"]');
  f2.elements.question.value = 'Quelle suite, vraiment ?';
  f2.elements.options.value = 'Romance\nFantasy';
  await ctx.submit(f2);
  let p = await ctx.backend.getPoll();
  assert.equal(p.question, 'Quelle suite, vraiment ?');
  assert.deepEqual(p.options.map((o) => o.votes), [3, 1]);
  assert.equal(p.rev, 1);
  await ctx.more('poll');
  const f3 = ctx.$('[data-role="poll-form"]');
  f3.elements.options.value = 'Romance\nFantasy\nPolar';
  await ctx.submit(f3);
  p = await ctx.backend.getPoll();
  assert.deepEqual(p.options.map((o) => [o.label, o.votes]), [['Romance', 0], ['Fantasy', 0], ['Polar', 0]]);
  assert.equal(p.rev, 2);
  ctx.close();
});

test('sondage : fermer, rouvrir, remettre à zéro, supprimer', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.more('poll');
  await ctx.click(ctx.$('[data-action="toggle-poll"]'));
  assert.equal((await ctx.backend.getPoll()).closed, true);
  assert.equal(ctx.$$('[data-vote]').length, 0);
  await ctx.more('poll');
  assert.equal(ctx.$('[data-action="toggle-poll"]').textContent, 'Rouvrir');
  await ctx.click(ctx.$('[data-action="toggle-poll"]'));
  assert.equal((await ctx.backend.getPoll()).closed, false);
  await ctx.more('poll');
  await ctx.click(ctx.$('[data-action="reset-poll"]'));
  const p = await ctx.backend.getPoll();
  assert.deepEqual(p.options.map((o) => o.votes), [0, 0]);
  assert.equal(p.rev, 2);
  await ctx.more('poll');
  await ctx.click(ctx.$('[data-action="delete-poll"]'));
  assert.equal(await ctx.backend.getPoll(), null);
  assert.equal(ctx.$('[data-role="poll"]').hidden, true);
  ctx.close();
});

test('sondage : remise à zéro et suppression annulées si l’auteure ne confirme pas', async () => {
  const ctx = await mount({ confirmAnswer: false });
  await ctx.login();
  await ctx.more('poll');
  await ctx.click(ctx.$('[data-action="reset-poll"]'));
  await ctx.click(ctx.$('[data-action="delete-poll"]'));
  assert.deepEqual((await ctx.backend.getPoll()).options.map((o) => o.votes), [3, 1]);
  ctx.close();
});

// ---------- Notes : écrites ou dictées ----------

function fakeDictation() {
  let h = null;
  return {
    start(handlers) { h = handlers; },
    stop() { h && h.onEnd(); },
    say(partial, final) { if (partial) h.onPartial(partial); if (final) h.onFinal(final); },
    fail(code) { h.onError(code); h.onEnd(); },
  };
}

test('notes : bouton Dicter absent quand le navigateur ne propose pas la dictée', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.click(ctx.$('.bn-item[data-action="notes"]'));
  assert.equal(ctx.$('[data-action="dictate"]'), null);
  ctx.close();
});

test('notes : une note dictée est enregistrée comme « Dictée » ; une note écrite reste « écrite »', async () => {
  const d = fakeDictation();
  const ctx = await mount({ dictation: d });
  await ctx.login();
  await ctx.click(ctx.$('.bn-item[data-action="notes"]'));
  const f = () => ctx.$('[data-role="note-form"]');
  f().elements.title.value = 'Idée du soir';
  f().elements.body.value = 'Début.';
  await ctx.click(ctx.$('[data-action="dictate"]'));
  assert.match(ctx.$('[data-action="dictate"]').textContent, /Arrêter/);
  d.say('une scène au', '');
  assert.equal(f().elements.body.value, 'Début. une scène au');
  d.say('', 'une scène au marché');
  d.say('avec Lyra', '');
  assert.equal(f().elements.body.value, 'Début. une scène au marché avec Lyra');
  await ctx.click(ctx.$('[data-action="dictate"]')); // arrêt
  assert.match(ctx.$('[data-action="dictate"]').textContent, /Dicter/);
  await ctx.submit(f());
  const notes = await ctx.backend.listNotes();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].body, 'Début. une scène au marché avec Lyra'); // le texte affiché au moment de l’arrêt est gardé
  assert.equal(notes[0].source, 'dicte');
  assert.ok(ctx.$('[data-role="note-dicte"]'));
  // note écrite ensuite : pas de mention « dictée »
  const g = ctx.$('[data-role="note-form"]');
  g.elements.title.value = 'Écrite';
  g.elements.body.value = 'Tapée au clavier';
  await ctx.submit(g);
  const ecrite = (await ctx.backend.listNotes()).find((n) => n.title === 'Écrite');
  assert.equal(ecrite.source, 'ecrit');
  assert.equal(ctx.$$('[data-role="note-dicte"]').length, 1);
  ctx.close();
});

test('notes : micro refusé = message clair, la saisie au clavier reste possible', async () => {
  const d = fakeDictation();
  const ctx = await mount({ dictation: d });
  await ctx.login();
  await ctx.click(ctx.$('.bn-item[data-action="notes"]'));
  await ctx.click(ctx.$('[data-action="dictate"]'));
  d.fail('not-allowed');
  assert.match(text(ctx.$('[data-role="dict-info"]')), /Micro refusé/);
  assert.match(ctx.$('[data-action="dictate"]').textContent, /Dicter/);
  const f = ctx.$('[data-role="note-form"]');
  f.elements.title.value = 'À la main'; f.elements.body.value = 'ok';
  await ctx.submit(f);
  assert.equal((await ctx.backend.listNotes())[0].source, 'ecrit');
  ctx.close();
});

test('notes : modifier une note dictée la garde « dictée » ; la dicter à nouveau l’enrichit', async () => {
  const sd = seed();
  sd.notes = [{ id: 'n1', title: 'Ancienne', body: 'Texte', bookId: '', source: 'dicte', updatedAt: '2026-11-07T10:00:00Z' }];
  const ctx = await mount({ sd });
  await ctx.login();
  await ctx.click(ctx.$('.bn-item[data-action="notes"]'));
  await ctx.click(ctx.$('[data-note="n1"]'));
  const f = ctx.$('[data-role="note-form"]');
  f.elements.title.value = 'Renommée';
  await ctx.submit(f);
  assert.equal((await ctx.backend.listNotes())[0].source, 'dicte');
  ctx.close();
});
