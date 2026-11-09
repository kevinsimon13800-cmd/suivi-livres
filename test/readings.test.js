// « Mes lectures » + import Wattpad : logique, extraction, interface, règles simulées.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { start } from '../js/app.js';
import { createMockBackend, OWNER, OTHER } from './mock-backend.js';
import {
  validateReading, moveReading, nextChapter, readingProgress, countByState, sortReadings, coverSrc, isWattpadCoverUrl, isWattpadUrl,
} from '../js/readings.js';
import { parseWattpadLink, extractStory, findStoryIdInHtml, importFromWattpad } from '../js/wattpad.js';

const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));
const SHARE = 'https://moi.github.io/livres/';
const COVER = 'https://img.wattpad.com/cover/111-256-abc.jpg';

// Page d'histoire factice reproduisant la structure de Wattpad (données inventées)
function storyHtml({ id = '111', title = 'La Lame d\\u0027Argent', author = 'Plume Rose', parts = 24, completed = false, other = true } = {}) {
  return `<!DOCTYPE html><html><head><title>La Lame d&#x27;Argent - ${author} - Wattpad</title></head><body><script>
  window.__d = {"meta":{"description":"Une pr\\u00eatresse et une \\u00e9p\\u00e9e.","keywords":"fantasy","title":"${title}","image":"${COVER.replace('111', id)}","banner":"https://www.wattpad.com/banner?id=${id}\\u0026v=1","story":{"votes":10,"author":"${author}","category":"Fantasy"}},
  "stories":[{"id":"${id}","completed":${completed},"tags":["x"],"url":"https://www.wattpad.com/story/${id}-la-lame","firstPartId":9,"numParts":${parts},"isPaywalled":false}${other ? ',{"id":"999","completed":true,"url":"https://www.wattpad.com/story/999-autre","firstPartId":8,"numParts":77}' : ''}]};
  </script><a href="/story/${id}-la-lame">x</a></body></html>`;
}
const partHtml = (id = '111') => `<html><body><a href="/story/${id}-la-lame"></a><a href="/story/${id}-la-lame"></a><a href="/story/555-pub"></a></body></html>`;

function fakeFetch(routes, calls = []) {
  return async (url) => {
    calls.push(url);
    const r = routes[url];
    if (r === 'network') throw new TypeError('Failed to fetch');
    if (r === undefined) return { ok: false, status: 404, text: async () => '' };
    if (typeof r === 'number') return { ok: false, status: r, text: async () => '' };
    return { ok: true, status: 200, text: async () => r };
  };
}

// ---------- Logique ----------

test('validateReading : cas valide et normalisation', () => {
  const r = validateReading({ title: ' Circé ', author: ' M. Miller ', status: 'en-cours', rating: '4', chapter: '3', chaptersTotal: '27', startedAt: '2026-11-01', review: ' top ', url: 'https://www.wattpad.com/story/1', cover: COVER, source: 'wattpad', storyCompleted: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { title: 'Circé', author: 'M. Miller', status: 'en-cours', rating: 4, chapter: 3, chaptersTotal: 27, startedAt: '2026-11-01', finishedAt: '', review: 'top', url: 'https://www.wattpad.com/story/1', cover: COVER, source: 'wattpad', storyCompleted: true, favorite: false });
});

test('validateReading : erreurs (titre, état, note, chapitres, dates, lien, couverture)', () => {
  const e = (o) => validateReading({ title: 'T', status: 'a-lire', ...o }).errors;
  assert.ok(e({ title: ' ' }).title);
  assert.ok(e({ status: 'lu' }).status);
  assert.ok(e({ rating: 6 }).rating);
  assert.ok(e({ rating: -1 }).rating);
  assert.ok(e({ chapter: 30, chaptersTotal: 27 }).chapter);
  assert.ok(e({ startedAt: '2026-02-30' }).startedAt);
  assert.ok(e({ startedAt: '2026-11-10', finishedAt: '2026-11-01' }).finishedAt);
  assert.ok(e({ url: 'https://evil.com/story/1' }).url);
  assert.ok(e({ url: 'javascript:alert(1)' }).url);
  assert.ok(e({ cover: 'https://evil.com/x.jpg' }).cover);
  assert.ok(e({ review: 'x'.repeat(3001) }).review);
  assert.equal(validateReading({ title: 'T', status: 'a-lire', source: 'pirate' }).value.source, 'manuel');
});

test('couvertures : photo compressée ou img.wattpad.com uniquement', () => {
  assert.equal(isWattpadCoverUrl(COVER), true);
  assert.equal(isWattpadCoverUrl('http://img.wattpad.com/cover/1.jpg'), false);
  assert.equal(isWattpadCoverUrl('https://img.wattpad.com.evil.com/1.jpg'), false);
  assert.equal(isWattpadCoverUrl('https://img.wattpad.com/a"onerror="x'), false);
  assert.equal(coverSrc('javascript:alert(1)'), '');
  assert.equal(coverSrc(COVER), COVER);
  assert.equal(isWattpadUrl('https://www.wattpad.com/story/12-abc'), true);
  assert.equal(isWattpadUrl('https://wattpad.com.evil.io/story/1'), false);
});

test('moveReading : dates et progression automatiques', () => {
  const base = { title: 'T', status: 'a-lire', chapter: 0, chaptersTotal: 20, startedAt: '', finishedAt: '' };
  const started = moveReading(base, 'en-cours', '2026-11-09');
  assert.equal(started.startedAt, '2026-11-09');
  assert.equal(started.finishedAt, '');
  const done = moveReading({ ...started, chapter: 5 }, 'terminee', '2026-11-20');
  assert.equal(done.finishedAt, '2026-11-20');
  assert.equal(done.startedAt, '2026-11-09');
  assert.equal(done.chapter, 20);
  // terminé directement depuis « à lire » : début = fin
  const direct = moveReading(base, 'terminee', '2026-11-09');
  assert.equal(direct.startedAt, '2026-11-09');
  // relecture : repart du début
  const reread = moveReading(done, 'en-cours', '2027-01-02');
  assert.equal(reread.chapter, 0);
  assert.equal(reread.startedAt, '2027-01-02');
  assert.equal(reread.finishedAt, '');
  // retour en « à lire » : l'historique est gardé
  assert.equal(moveReading(done, 'a-lire', '2027-01-02').finishedAt, '2026-11-20');
  // une date déjà saisie n'est pas écrasée
  assert.equal(moveReading({ ...base, startedAt: '2026-10-01' }, 'en-cours', '2026-11-09').startedAt, '2026-10-01');
});

test('nextChapter / readingProgress / countByState / sortReadings', () => {
  assert.equal(nextChapter({ chapter: 19, chaptersTotal: 20 }).chapter, 20);
  assert.equal(nextChapter({ chapter: 20, chaptersTotal: 20 }).chapter, 20);
  assert.equal(nextChapter({ chapter: 3, chaptersTotal: 0 }).chapter, 4);
  assert.equal(readingProgress({ status: 'en-cours', chapter: 5, chaptersTotal: 20 }), 25);
  assert.equal(readingProgress({ status: 'en-cours', chapter: 5, chaptersTotal: 0 }), null);
  assert.equal(readingProgress({ status: 'terminee' }), 100);
  assert.deepEqual(countByState([{ status: 'a-lire' }, { status: 'terminee' }, { status: 'terminee' }, { status: '???' }]), { 'a-lire': 1, 'en-cours': 0, terminee: 2 });
  const sorted = sortReadings([
    { id: 1, status: 'terminee', finishedAt: '2026-01-01', updatedAt: '2026-11-09' },
    { id: 2, status: 'terminee', finishedAt: '2026-06-01', updatedAt: '2026-06-01' },
  ]);
  assert.deepEqual(sorted.map((r) => r.id), [2, 1]);
});

// ---------- Wattpad ----------

test('parseWattpadLink : histoire, chapitre, texte de partage, lien court, refus', () => {
  assert.deepEqual(parseWattpadLink('Lis « X » sur #Wattpad https://www.wattpad.com/story/372376198-in-his?utm_source=ios&utm_medium=link'), { kind: 'story', id: '372376198', url: 'https://www.wattpad.com/story/372376198' });
  assert.deepEqual(parseWattpadLink('https://www.wattpad.com/1459139951-in-his-hands'), { kind: 'part', id: '1459139951', url: 'https://www.wattpad.com/1459139951' });
  assert.equal(parseWattpadLink('https://m.wattpad.com/story/42').id, '42');
  assert.equal(parseWattpadLink('wattpad.com/story/77-x').id, '77');
  assert.equal(parseWattpadLink('https://w.tt/abcd').kind, 'short');
  assert.equal(parseWattpadLink('https://evil.com/story/1'), null);
  assert.equal(parseWattpadLink('https://wattpad.com.evil.com/story/1'), null);
  assert.equal(parseWattpadLink('https://www.wattpad.com/user/plume'), null);
  assert.equal(parseWattpadLink(''), null);
});

test('extractStory : titre, auteur, couverture, chapitres et statut de LA bonne histoire', () => {
  const s = extractStory(storyHtml(), '111');
  assert.equal(s.title, 'La Lame d\'Argent');
  assert.equal(s.author, 'Plume Rose');
  assert.equal(s.cover, COVER);
  assert.equal(s.chaptersTotal, 24, 'ne prend pas le nombre de chapitres d’une autre histoire citée');
  assert.equal(s.storyCompleted, false);
  assert.equal(s.description, 'Une prêtresse et une épée.');
  assert.equal(s.url, 'https://www.wattpad.com/story/111');
  assert.equal(extractStory(storyHtml({ completed: true }), '111').storyCompleted, true);
});

test('extractStory : repli sur <title> si la structure change, null si rien', () => {
  const s = extractStory('<html><title>Le Titre - Une Autrice - Wattpad</title> https://img.wattpad.com/cover/5-256-z.jpg</html>', '5');
  assert.equal(s.title, 'Le Titre');
  assert.equal(s.author, 'Une Autrice');
  assert.equal(s.cover, 'https://img.wattpad.com/cover/5-256-z.jpg');
  assert.equal(s.chaptersTotal, 0);
  assert.equal(extractStory('<html></html>', '5'), null);
  assert.equal(findStoryIdInHtml(partHtml('321')), '321');
});

test('importFromWattpad : lien de chapitre → retrouve l’histoire', async () => {
  const calls = [];
  const f = fakeFetch({ 'https://www.wattpad.com/888': partHtml('111'), 'https://www.wattpad.com/story/111': storyHtml() }, calls);
  const s = await importFromWattpad('https://www.wattpad.com/888-chapitre-1', f);
  assert.equal(s.title, 'La Lame d\'Argent');
  assert.deepEqual(calls, ['https://www.wattpad.com/888', 'https://www.wattpad.com/story/111']);
});

test('importFromWattpad : messages d’erreur clairs', async () => {
  await assert.rejects(importFromWattpad('pas de lien', fakeFetch({})), /Aucun lien Wattpad/);
  await assert.rejects(importFromWattpad('https://www.wattpad.com/story/1', fakeFetch({})), /introuvable/);
  await assert.rejects(importFromWattpad('https://www.wattpad.com/story/1', fakeFetch({ 'https://www.wattpad.com/story/1': 'network' })), /ne répond pas/);
  await assert.rejects(importFromWattpad('https://www.wattpad.com/story/1', fakeFetch({ 'https://www.wattpad.com/story/1': 500 })), /refusé/);
  await assert.rejects(importFromWattpad('https://www.wattpad.com/story/1', fakeFetch({ 'https://www.wattpad.com/story/1': '<html>rien</html>' })), /changé sa page/);
});

// ---------- Interface ----------

const SEED = () => ({
  profile: { displayName: 'Lauriane', bio: '' },
  books: [{ id: 'a', title: 'Mon roman', status: 'ecriture', public: true, updatedAt: '2026-11-08T10:00:00Z' }],
  notes: [],
  readings: [
    { id: 'r1', title: 'Circé', author: 'M. Miller', status: 'en-cours', rating: 0, chapter: 7, chaptersTotal: 27, startedAt: '2026-11-01', finishedAt: '', review: '', url: '', cover: '', source: 'manuel', updatedAt: '2026-11-05T10:00:00Z' },
    { id: 'r2', title: 'Le Chant d’Achille', author: 'M. Miller', status: 'terminee', rating: 5, chapter: 33, chaptersTotal: 33, startedAt: '2026-09-01', finishedAt: '2026-09-20', review: 'Bouleversant <b>wow</b>', url: 'https://www.wattpad.com/story/42', cover: COVER, source: 'wattpad', updatedAt: '2026-09-20T10:00:00Z' },
  ],
});

async function mount({ seed = SEED(), url = SHARE + '#/lectures', fetchImpl = fakeFetch({ 'https://www.wattpad.com/story/111': storyHtml() }), confirmAnswer = true, session } = {}) {
  const dom = new JSDOM('<div id="app"></div>', { url });
  const win = dom.window;
  win.confirm = () => confirmAnswer;
  win.scrollTo = () => {};
  if (session) for (const [k, v] of Object.entries(session)) win.sessionStorage.setItem(k, v);
  const backend = createMockBackend(seed);
  const root = win.document.getElementById('app');
  const app = start({ backend, root, ownerUid: OWNER.uid, shareUrl: SHARE, doc: win.document, win, storage: null, today: () => '2026-11-09', fetchImpl });
  await tick(30);
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const click = async (el) => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await tick(30); };
  const submit = async (form) => { form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); await tick(40); };
  const login = async () => {
    if (!$('[data-role="login-form"]')) { win.location.hash = '#/admin'; await tick(); }
    const f = $('[data-role="login-form"]');
    f.elements.email.value = OWNER.email;
    f.elements.password.value = OWNER.password;
    await submit(f);
    await tick(60);
    // après connexion on arrive sur « Mes livres » ; on ouvre l'onglet « Mes lectures »
    if (win.location.hash !== '#/lectures') { win.location.hash = '#/lectures'; await tick(30); }
  };
  const cards = () => $$('.reading h3').map((e) => e.textContent);
  return { win, root, backend, app, $, $$, click, submit, login, cards, close: () => win.close() };
}

test('visiteur : onglet Mes lectures, catégories avec compteurs, aucune action', async () => {
  const ctx = await mount();
  assert.ok(ctx.$('[data-tab="readings"].on'));
  assert.deepEqual(ctx.$$('.seg-btn').map((b) => b.textContent), ['En cours 1', 'À lire 0', 'Terminées 1', 'Toutes 2']);
  assert.deepEqual(ctx.cards(), ['Circé'], 'par défaut : « En cours »');
  await ctx.click(ctx.$('[data-filter="terminee"]'));
  assert.deepEqual(ctx.cards(), ['Le Chant d’Achille']);
  const c = ctx.$('[data-reading="r2"]');
  assert.equal(c.querySelector('.stars').getAttribute('aria-label'), 'Note : 5 sur 5');
  assert.equal(c.querySelector('.r-review').textContent, 'Bouleversant <b>wow</b>', 'avis affiché en texte brut');
  assert.equal(c.querySelector('.r-review b'), null);
  assert.equal(c.querySelector('.wp-link').getAttribute('href'), 'https://www.wattpad.com/story/42');
  assert.equal(c.querySelector('.wp-link').getAttribute('rel'), 'noopener noreferrer');
  assert.equal(c.querySelector('.r-cover img').getAttribute('src'), COVER);
  assert.match(c.textContent, /Commencé le 1 septembre 2026 · Terminé le 20 septembre 2026/);
  for (const sel of ['[data-move]', '[data-action="wattpad-import"]', '[data-action="add-reading"]', '[data-action="edit-reading"]', '[data-action="delete-reading"]', 'form']) {
    assert.equal(ctx.$(sel), null, sel);
  }
  ctx.close();
});

test('visiteur : passer d’un onglet à l’autre', async () => {
  const ctx = await mount({ url: SHARE });
  assert.ok(ctx.$('.card'));
  assert.equal(ctx.$('.reading'), null);
  await ctx.click(ctx.$('[data-tab="readings"]'));
  assert.equal(ctx.win.location.hash, '#/lectures');
  assert.ok(ctx.$('.reading'));
  await ctx.click(ctx.$('[data-tab="books"]'));
  assert.ok(ctx.$('.card'));
  ctx.close();
});

test('propriétaire : import Wattpad → fiche pré-remplie → ajout dans « À lire »', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.click(ctx.$('[data-action="wattpad-import"]'));
  const f = ctx.$('[data-role="import-form"]');
  assert.equal(ctx.$('[data-action="open-wattpad"]').getAttribute('href'), 'https://www.wattpad.com/');
  f.elements.link.value = 'Lis « La Lame » sur #Wattpad https://www.wattpad.com/story/111-la-lame?utm_source=ios';
  await ctx.submit(f);
  await tick(40);
  const form = ctx.$('[data-role="reading-form"]');
  assert.ok(form, 'formulaire pré-rempli');
  assert.equal(form.elements.title.value, 'La Lame d\'Argent');
  assert.equal(form.elements.author.value, 'Plume Rose');
  assert.equal(form.elements.chaptersTotal.value, '24');
  assert.equal(form.elements.status.value, 'a-lire');
  assert.equal(form.elements.url.value, 'https://www.wattpad.com/story/111');
  assert.equal(ctx.$('.cover-preview img').getAttribute('src'), COVER);
  form.elements.review.value = 'Hâte !';
  await ctx.submit(form);
  const saved = [...ctx.backend._raw.readings.values()].find((r) => r.title === 'La Lame d\'Argent');
  assert.equal(saved.status, 'a-lire');
  assert.equal(saved.source, 'wattpad');
  assert.equal(saved.cover, COVER);
  assert.equal(saved.review, 'Hâte !');
  assert.equal(saved.description, undefined, 'le résumé Wattpad n’est pas recopié');
  assert.ok(ctx.$('.seg-btn.on[data-filter="a-lire"]'));
  assert.deepEqual(ctx.cards(), ['La Lame d\'Argent']);
  ctx.close();
});

test('propriétaire : import d’une histoire déjà présente → signalée, pas de doublon', async () => {
  const fetchImpl = fakeFetch({ 'https://www.wattpad.com/story/42': storyHtml({ id: '42' }) });
  const ctx = await mount({ fetchImpl });
  await ctx.login();
  await ctx.click(ctx.$('[data-action="wattpad-import"]'));
  const f = ctx.$('[data-role="import-form"]');
  f.elements.link.value = 'https://www.wattpad.com/story/42';
  await ctx.submit(f);
  assert.match(ctx.$('[data-role="import-form"] [role="alert"]').textContent, /déjà dans tes lectures \(Terminée\)/);
  assert.equal(ctx.backend._raw.readings.size, 2);
  ctx.close();
});

test('propriétaire : import en échec → message, le lien saisi reste, ajout manuel possible', async () => {
  const ctx = await mount({ fetchImpl: fakeFetch({}) });
  await ctx.login();
  await ctx.click(ctx.$('[data-action="wattpad-import"]'));
  const f = ctx.$('[data-role="import-form"]');
  f.elements.link.value = 'https://www.wattpad.com/story/7';
  await ctx.submit(f);
  assert.match(ctx.$('[role="alert"]').textContent, /introuvable/);
  assert.equal(ctx.$('[data-role="import-form"]').elements.link.value, 'https://www.wattpad.com/story/7');
  ctx.close();
});

test('propriétaire : ajout manuel « En cours » → date de début automatique', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.click(ctx.$('[data-action="add-reading"]'));
  const f = ctx.$('[data-role="reading-form"]');
  f.elements.title.value = 'Le Nom du vent';
  f.elements.author.value = 'P. Rothfuss';
  f.elements.status.value = 'en-cours';
  f.elements.chaptersTotal.value = '92';
  f.querySelector('input[name="rating"][value="4"]').checked = true;
  await ctx.submit(f);
  const r = [...ctx.backend._raw.readings.values()].find((x) => x.title === 'Le Nom du vent');
  assert.equal(r.status, 'en-cours');
  assert.equal(r.startedAt, '2026-11-09');
  assert.equal(r.rating, 4);
  assert.equal(r.source, 'manuel');
  ctx.close();
});

test('propriétaire : formulaire invalide → erreurs, saisie conservée, rien enregistré', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.click(ctx.$('[data-action="add-reading"]'));
  const f = ctx.$('[data-role="reading-form"]');
  f.elements.author.value = 'Quelqu’un';
  f.elements.chapter.value = '50';
  f.elements.chaptersTotal.value = '10';
  await ctx.submit(f);
  assert.match(ctx.root.textContent, /Le titre est obligatoire/);
  assert.match(ctx.root.textContent, /Ne peut pas dépasser/);
  assert.equal(ctx.$('[data-role="reading-form"]').elements.author.value, 'Quelqu’un');
  assert.equal(ctx.backend._raw.readings.size, 2);
  ctx.close();
});

test('propriétaire : changer d’état à tout moment (+1 chapitre, terminé, relire, à lire)', async () => {
  const ctx = await mount();
  await ctx.login();
  const card = () => ctx.$('[data-reading="r1"]');
  await ctx.click(card().querySelector('[data-action="next-chapter"]'));
  assert.equal(ctx.backend._raw.readings.get('r1').chapter, 8);
  assert.match(card().textContent, /Chapitre 8\/27/);
  await ctx.click(card().querySelector('[data-move="terminee"]'));
  let r = ctx.backend._raw.readings.get('r1');
  assert.equal(r.status, 'terminee');
  assert.equal(r.finishedAt, '2026-11-09');
  assert.equal(r.chapter, 27);
  assert.match(ctx.$('.toast').textContent, /Circé.*Terminée/);
  await ctx.click(ctx.$('[data-filter="terminee"]'));
  await ctx.click(card().querySelector('[data-move="en-cours"]'));
  r = ctx.backend._raw.readings.get('r1');
  assert.equal(r.status, 'en-cours');
  assert.equal(r.chapter, 0);
  assert.equal(r.finishedAt, '');
  await ctx.click(ctx.$('[data-filter="en-cours"]'));
  await ctx.click(card().querySelector('[data-move="a-lire"]'));
  assert.equal(ctx.backend._raw.readings.get('r1').status, 'a-lire');
  ctx.close();
});

test('propriétaire : modifier puis retirer une lecture (avec et sans confirmation)', async () => {
  const ctx = await mount({ confirmAnswer: false });
  await ctx.login();
  await ctx.click(ctx.$('[data-reading="r1"] [data-action="edit-reading"]'));
  const f = ctx.$('[data-role="reading-form"]');
  assert.equal(f.elements.title.value, 'Circé');
  f.elements.review.value = 'Magnifique';
  await ctx.submit(f);
  assert.equal(ctx.backend._raw.readings.get('r1').review, 'Magnifique');
  assert.equal(ctx.backend._raw.readings.get('r1').startedAt, '2026-11-01', 'même état : dates inchangées');
  await ctx.click(ctx.$('[data-reading="r1"] [data-action="delete-reading"]'));
  assert.ok(ctx.backend._raw.readings.has('r1'), 'annulé');
  ctx.win.confirm = () => true;
  await ctx.click(ctx.$('[data-reading="r1"] [data-action="delete-reading"]'));
  assert.equal(ctx.backend._raw.readings.has('r1'), false);
  ctx.close();
});

test('import automatique (?import=…) : déconnecté → connexion → ajouté directement dans « À lire »', async () => {
  const link = 'Je lis "La Lame" https://www.wattpad.com/story/111-la-lame?utm_source=ios&wp_page=x';
  const ctx = await mount({ url: `${SHARE}?import=${encodeURIComponent(link)}` });
  assert.equal(ctx.win.location.search, '', 'le paramètre est retiré de l’adresse');
  assert.equal(ctx.win.location.hash, '#/admin');
  assert.ok(ctx.$('[data-role="pending-import"]'));
  await ctx.login();
  await tick(80);
  const saved = [...ctx.backend._raw.readings.values()].find((r) => r.title === 'La Lame d\'Argent');
  assert.ok(saved, 'ajouté sans autre action');
  assert.equal(saved.status, 'a-lire');
  assert.equal(ctx.win.location.hash, '#/lectures');
  assert.ok(ctx.$(`[data-reading="${saved.id}"].flash`));
  assert.equal(ctx.win.sessionStorage.getItem('suivi-livres:import-wattpad'), null);
  ctx.close();
});

test('import automatique : lien non encodé (raccourci sans encodage) accepté', async () => {
  const ctx = await mount({ url: `${SHARE}?import=https://www.wattpad.com/story/111-la-lame?utm_source=ios&utm_medium=link` });
  await ctx.login();
  await tick(80);
  assert.ok([...ctx.backend._raw.readings.values()].some((r) => r.url === 'https://www.wattpad.com/story/111'));
  ctx.close();
});

test('import automatique : déjà présent → pas de doublon ; en échec → écran d’import avec le lien', async () => {
  let ctx = await mount({ url: `${SHARE}?import=${encodeURIComponent('https://www.wattpad.com/story/42')}`, fetchImpl: fakeFetch({ 'https://www.wattpad.com/story/42': storyHtml({ id: '42' }) }) });
  await ctx.login();
  await tick(80);
  assert.equal(ctx.backend._raw.readings.size, 2);
  assert.ok(ctx.$('[data-reading="r2"].flash'));
  ctx.close();

  ctx = await mount({ url: `${SHARE}?import=${encodeURIComponent('https://www.wattpad.com/story/7')}`, fetchImpl: fakeFetch({}) });
  await ctx.login();
  await tick(80);
  const f = ctx.$('[data-role="import-form"]');
  assert.ok(f);
  assert.equal(f.elements.link.value, 'https://www.wattpad.com/story/7');
  assert.match(ctx.$('[role="alert"]').textContent, /introuvable/);
  ctx.close();
});

test('import automatique : paramètre sans lien Wattpad ignoré', async () => {
  const ctx = await mount({ url: `${SHARE}?import=${encodeURIComponent('https://evil.com/x')}` });
  assert.notEqual(ctx.win.location.hash, '#/admin');
  assert.equal(ctx.app.state.pendingImport, '');
  ctx.close();
});

test('erreur de chargement des lectures : les livres restent affichés', async () => {
  const ctx = await mount({ url: SHARE });
  ctx.backend.listReadings = async () => { throw new Error('denied'); };
  await ctx.app.refresh();
  assert.ok(ctx.$('.card'));
  await ctx.click(ctx.$('[data-tab="readings"]'));
  assert.match(ctx.$('[role="alert"]').textContent, /Impossible de charger les lectures/);
  ctx.close();
});

test('règles simulées : lecture publique, écriture refusée aux visiteurs et autres comptes', async () => {
  const be = createMockBackend(SEED());
  assert.equal((await be.listReadings()).length, 2);
  await assert.rejects(be.saveReading({ title: 'Pirate', status: 'a-lire' }), /permission-denied/);
  await assert.rejects(be.deleteReading('r1'), /permission-denied/);
  await be.login(OTHER.email, OTHER.password);
  await assert.rejects(be.saveReading({ id: 'r1', status: 'terminee' }), /permission-denied/);
  assert.equal(be._raw.readings.get('r1').status, 'en-cours');
});


// ---------- Favoris ----------

test('favoris : validateReading accepte la case, ignore les valeurs bizarres', () => {
  assert.equal(validateReading({ title: 'T', status: 'a-lire', favorite: true }).value.favorite, true);
  assert.equal(validateReading({ title: 'T', status: 'a-lire', favorite: 'on' }).value.favorite, true);
  assert.equal(validateReading({ title: 'T', status: 'a-lire', favorite: 'oui' }).value.favorite, false);
  assert.equal(validateReading({ title: 'T', status: 'a-lire' }).value.favorite, false);
});

test('favoris : le propriétaire met / retire un cœur, filtre « ♥ Favoris », visible par les visiteurs', async () => {
  const ctx = await mount();
  await ctx.login();
  assert.equal(ctx.$('[data-filter="favoris"]'), null, 'pas de filtre tant qu’il n’y a aucun favori');
  const heart = () => ctx.$('[data-reading="r1"] [data-action="toggle-favorite"]');
  assert.equal(heart().getAttribute('aria-pressed'), 'false');
  await ctx.click(heart());
  assert.equal(ctx.backend._raw.readings.get('r1').favorite, true);
  assert.equal(heart().getAttribute('aria-pressed'), 'true');
  assert.ok(ctx.$('[data-reading="r1"]').classList.contains('is-fav'));
  assert.match(ctx.$('.toast').textContent, /ajouté aux favoris/);
  assert.match(ctx.$('[data-filter="favoris"]').textContent, /♥ Favoris 1/);
  await ctx.click(ctx.$('[data-filter="favoris"]'));
  assert.deepEqual(ctx.cards(), ['Circé']);
  // changer d'état garde le cœur
  await ctx.click(ctx.$('[data-reading="r1"] [data-move="terminee"]'));
  assert.equal(ctx.backend._raw.readings.get('r1').favorite, true);
  // le visiteur voit le cœur, sans bouton
  const vis = await mount({ seed: { ...SEED(), readings: [...ctx.backend._raw.readings.values()] } });
  await vis.click(vis.$('[data-filter="favoris"]'));
  assert.deepEqual(vis.cards(), ['Circé']);
  assert.ok(vis.$('[data-reading="r1"] .fav-badge'));
  assert.equal(vis.$('[data-action="toggle-favorite"]'), null);
  vis.close();
  // retirer
  await ctx.click(heart());
  assert.equal(ctx.backend._raw.readings.get('r1').favorite, false);
  assert.equal(ctx.$('[data-filter="favoris"]'), null);
  assert.ok(ctx.$('.reading'), 'retombe sur « Toutes » quand le dernier favori est retiré');
  ctx.close();
});

test('favoris : case « Mettre dans mes favoris » dans le formulaire', async () => {
  const ctx = await mount();
  await ctx.login();
  await ctx.click(ctx.$('[data-reading="r1"] [data-action="edit-reading"]'));
  const f = ctx.$('[data-role="reading-form"]');
  assert.equal(f.elements.favorite.checked, false);
  f.elements.favorite.checked = true;
  await ctx.submit(f);
  assert.equal(ctx.backend._raw.readings.get('r1').favorite, true);
  ctx.close();
});

test('règles simulées : un visiteur ne peut pas mettre un favori', async () => {
  const be = createMockBackend(SEED());
  await assert.rejects(be.saveReading({ id: 'r1', favorite: true }), /permission-denied/);
});
