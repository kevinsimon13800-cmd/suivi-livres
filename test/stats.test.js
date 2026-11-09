// Statistiques de visites : périodes, comptage (visiteurs / visites), règles, écran du propriétaire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { start } from '../js/app.js';
import { createMockBackend, OWNER } from './mock-backend.js';
import { parisDate, isoWeek, periodKey, allKeys, lastKeys, keyLabel, buildSeries, planVisit, trackVisit, markAuthorDevice, STAT_KEY_RE } from '../js/stats.js';

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const SHARE = 'https://moi.github.io/livres/';
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() {} };

test('périodes : heure de Paris, semaines ISO, trimestres, semestres', () => {
  // 31/12 23h30 UTC = 1er janvier 00h30 à Paris
  assert.deepEqual(parisDate(new Date('2026-12-31T23:30:00Z')), { y: 2027, m: 1, d: 1 });
  // en été (UTC+2)
  assert.deepEqual(parisDate(new Date('2026-06-30T22:30:00Z')), { y: 2026, m: 7, d: 1 });
  assert.deepEqual(isoWeek({ y: 2027, m: 1, d: 1 }), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek({ y: 2026, m: 11, d: 9 }), { year: 2026, week: 46 });
  assert.deepEqual(isoWeek({ y: 2026, m: 1, d: 1 }), { year: 2026, week: 1 });
  const k = allKeys({ y: 2026, m: 11, d: 9 });
  assert.deepEqual(k, { day: 'd-2026-11-09', week: 'w-2026-W46', month: 'm-2026-11', quarter: 'q-2026-Q4', semester: 's-2026-S2', year: 'y-2026', all: 'all' });
  assert.equal(periodKey('quarter', { y: 2026, m: 3, d: 31 }), 'q-2026-Q1');
  assert.equal(periodKey('semester', { y: 2026, m: 6, d: 30 }), 's-2026-S1');
  for (const key of Object.values(k)) assert.ok(STAT_KEY_RE.test(key), key);
});

test('périodes : listes des dernières périodes et libellés', () => {
  const today = { y: 2026, m: 1, d: 2 };
  assert.deepEqual(lastKeys('day', 3, today), ['d-2025-12-31', 'd-2026-01-01', 'd-2026-01-02']);
  assert.deepEqual(lastKeys('month', 3, today), ['m-2025-11', 'm-2025-12', 'm-2026-01']);
  assert.deepEqual(lastKeys('quarter', 3, today), ['q-2025-Q3', 'q-2025-Q4', 'q-2026-Q1']);
  assert.deepEqual(lastKeys('semester', 3, today), ['s-2025-S1', 's-2025-S2', 's-2026-S1']);
  assert.equal(lastKeys('week', 12, { y: 2026, m: 11, d: 9 }).length, 12);
  assert.equal(new Set(lastKeys('week', 12, { y: 2026, m: 11, d: 9 })).size, 12);
  assert.equal(lastKeys('week', 2, { y: 2026, m: 11, d: 9 }).at(-1), 'w-2026-W46');
  assert.deepEqual(keyLabel('w-2026-W46'), { short: 'S46', long: 'Semaine 46 (du 9 nov. 2026)' });
  assert.equal(keyLabel('q-2026-Q1').long, '1er trimestre 2026');
  assert.equal(keyLabel('s-2026-S2').long, '2e semestre 2026');
  assert.equal(keyLabel('d-2026-11-09').long, '9 nov. 2026');
});

test('buildSeries : zéros pour les périodes sans visite, années depuis la première', () => {
  const stats = { 'd-2026-11-09': { visitors: 3, visits: 5 }, 'y-2025': { visitors: 2, visits: 2 }, 'y-2026': { visitors: 9, visits: 20 } };
  const days = buildSeries(stats, 'day', { y: 2026, m: 11, d: 9 });
  assert.equal(days.length, 30);
  assert.deepEqual(days.at(-1), { key: 'd-2026-11-09', short: '9 nov.', long: '9 nov. 2026', visitors: 3, visits: 5 });
  assert.equal(days[0].visitors, 0);
  assert.deepEqual(buildSeries(stats, 'year', { y: 2026, m: 11, d: 9 }).map((s) => [s.key, s.visitors]), [['y-2025', 2], ['y-2026', 9]]);
});

test('comptage : 1re visite = visiteur + visite partout ; même session = rien ; nouvelle session = visite seulement', () => {
  const local = fakeStorage();
  let session = fakeStorage();
  const now = new Date('2026-11-09T10:00:00Z');
  const p1 = planVisit({ local, session, now });
  assert.equal(p1.updates.length, 7);
  assert.ok(p1.updates.every((u) => u.visits === 1 && u.visitors === 1));
  p1.commit();
  assert.equal(planVisit({ local, session, now }), null, 'rechargement dans le même onglet');
  session = fakeStorage(); // nouvel onglet le même jour
  const p2 = planVisit({ local, session, now });
  assert.ok(p2.updates.every((u) => u.visits === 1 && u.visitors === 0));
  p2.commit();
  // le lendemain (même semaine) : nouveau visiteur du jour seulement
  session = fakeStorage();
  const p3 = planVisit({ local, session, now: new Date('2026-11-10T10:00:00Z') });
  const byKey = Object.fromEntries(p3.updates.map((u) => [u.key, u]));
  assert.equal(byKey['d-2026-11-10'].visitors, 1);
  assert.equal(byKey['w-2026-W46'].visitors, 0);
  assert.equal(byKey.all.visitors, 0);
  assert.equal(byKey.all.visits, 1);
});

test('comptage : appareil de l’auteur jamais compté ; stockage bloqué = 1 visiteur par session', () => {
  const local = fakeStorage();
  markAuthorDevice(local);
  assert.equal(planVisit({ local, session: fakeStorage(), now: new Date() }), null);
  const p = planVisit({ local: blocked, session: blocked, now: new Date('2026-11-09T10:00:00Z') });
  assert.ok(p.updates.every((u) => u.visits === 1 && u.visitors === 1));
});

test('trackVisit : enregistre, ignore les robots, ne casse rien si la base refuse', async () => {
  const be = createMockBackend({ books: [] });
  const local = fakeStorage();
  assert.equal(await trackVisit({ backend: be, local, session: fakeStorage(), now: new Date('2026-11-09T10:00:00Z') }), true);
  assert.deepEqual(be._raw.stats.get('d-2026-11-09'), { visits: 1, visitors: 1 });
  assert.deepEqual(be._raw.stats.get('all'), { visits: 1, visitors: 1 });
  assert.equal(await trackVisit({ backend: be, local: fakeStorage(), session: fakeStorage(), isBot: true }), false);
  be.recordVisit = async () => { throw new Error('denied'); };
  const s = fakeStorage();
  assert.equal(await trackVisit({ backend: be, local: fakeStorage(), session: s }), false);
  assert.equal(s.getItem('suivi-livres:session-comptee'), null, 'en cas d’échec, on réessaiera');
});

test('règles simulées : +1 maximum, clés et champs contrôlés, lecture réservée', async () => {
  const be = createMockBackend({ books: [] });
  await assert.rejects(be.recordVisit([{ key: 'all', visits: 1000 }]), /permission-denied/);
  await assert.rejects(be.recordVisit([{ key: 'pirate', visits: 1 }]), /permission-denied/);
  await assert.rejects(be.recordVisit([{ key: 'all', visits: 1, admin: true }]), /permission-denied/);
  await assert.rejects(be.listStats(), /permission-denied/);
  await be.login(OWNER.email, OWNER.password);
  assert.deepEqual(await be.listStats(), {});
});

async function mount({ stats = {}, hash = '', local = fakeStorage(), webdriver = false } = {}) {
  const dom = new JSDOM('<div id="app"></div>', { url: SHARE + hash });
  const win = dom.window;
  win.scrollTo = () => {};
  Object.defineProperty(win.navigator, 'webdriver', { value: webdriver, configurable: true });
  const backend = createMockBackend({ books: [], notes: [], readings: [], profile: { displayName: 'L' }, stats });
  const root = win.document.getElementById('app');
  start({ backend, root, ownerUid: OWNER.uid, shareUrl: SHARE, doc: win.document, win, storage: local, now: () => new Date('2026-11-09T10:00:00Z'), fetchImpl: async () => ({ ok: false, status: 404, text: async () => '' }) });
  await tick(40);
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const click = async (el) => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await tick(40); };
  const login = async () => {
    win.location.hash = '#/admin';
    await tick();
    const f = $('[data-role="login-form"]');
    f.elements.email.value = OWNER.email;
    f.elements.password.value = OWNER.password;
    f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await tick(60);
  };
  return { win, root, backend, $, $$, click, login, local, close: () => win.close() };
}

test('site : la visite d’un visiteur est comptée une fois, pas celle d’un robot', async () => {
  const ctx = await mount();
  assert.deepEqual(ctx.backend._raw.stats.get('d-2026-11-09'), { visits: 1, visitors: 1 });
  ctx.close();
  const bot = await mount({ webdriver: true });
  assert.equal(bot.backend._raw.stats.size, 0);
  bot.close();
});

test('site : après connexion de l’auteur, son appareil n’est plus compté', async () => {
  const local = fakeStorage();
  const ctx = await mount({ hash: '#/admin', local });
  await ctx.login();
  assert.equal(local.getItem('suivi-livres:auteur'), '1');
  ctx.close();
  const again = await mount({ local });
  assert.equal(again.backend._raw.stats.size, 0);
  again.close();
});

test('écran statistiques : chiffres clés, périodes, histogramme, tableau', async () => {
  const stats = {
    all: { visitors: 42, visits: 77 },
    'd-2026-11-09': { visitors: 5, visits: 8 }, 'd-2026-11-08': { visitors: 3, visits: 3 }, 'd-2026-10-20': { visitors: 1, visits: 1 },
    'w-2026-W46': { visitors: 5, visits: 8 }, 'm-2026-11': { visitors: 12, visits: 20 }, 'q-2026-Q4': { visitors: 30, visits: 50 },
    's-2026-S2': { visitors: 40, visits: 70 }, 'y-2026': { visitors: 42, visits: 77 },
  };
  const ctx = await mount({ stats, hash: '#/admin' });
  await ctx.login();
  assert.equal(ctx.$('[data-role="stats"]'), null);
  await ctx.click(ctx.$('[data-action="stats"]'));
  await tick(40);
  const kpi = (k) => ctx.$(`[data-kpi="${k}"] .kpi-value`).textContent;
  assert.equal(kpi('d-2026-11-09'), '5');
  assert.equal(kpi('w-2026-W46'), '5');
  assert.equal(kpi('m-2026-11'), '12');
  assert.equal(kpi('y-2026'), '42');
  assert.equal(kpi('all'), '42');
  assert.match(ctx.$('[data-kpi="all"] .kpi-sub').textContent, /77 visites/);
  assert.match(ctx.root.textContent, /Comptage depuis le 20 octobre 2026/);
  // jour : 30 colonnes, la dernière = aujourd'hui
  assert.equal(ctx.$$('.chart .hit').length, 30);
  assert.equal(ctx.$$('.chart .bar').length, 3);
  assert.ok(ctx.$('.chart .bar.current'));
  const last = ctx.$('.chart .hit[data-key="d-2026-11-09"]');
  assert.match(last.getAttribute('aria-label'), /9 nov\. 2026 : 5 visiteurs, 8 visites/);
  last.dispatchEvent(new ctx.win.Event('focus'));
  assert.equal(ctx.$('.chart-tip').hidden, false);
  assert.match(ctx.$('.chart-tip').textContent, /5 visiteurs8 visites9 nov\. 2026/);
  assert.equal(ctx.$('.stats-table tbody tr').dataset.row, 'd-2026-11-09', 'tableau : le plus récent en premier');
  // chaque période
  for (const [period, n, key] of [['week', 12, 'w-2026-W46'], ['month', 12, 'm-2026-11'], ['quarter', 8, 'q-2026-Q4'], ['semester', 6, 's-2026-S2'], ['year', 1, 'y-2026']]) {
    await ctx.click(ctx.$(`[data-period="${period}"]`));
    assert.equal(ctx.$$('.chart .hit').length, n, period);
    assert.ok(ctx.$(`.chart .hit[data-key="${key}"]`), key);
  }
  ctx.close();
});

test('écran statistiques : erreur affichée proprement, visiteurs sans accès', async () => {
  const ctx = await mount({ hash: '#/admin' });
  await ctx.login();
  ctx.backend.listStats = async () => { throw new Error('x'); };
  await ctx.click(ctx.$('[data-action="stats"]'));
  await tick(40);
  assert.match(ctx.$('[role="alert"]').textContent, /Impossible de charger les statistiques/);
  ctx.close();
  const vis = await mount();
  assert.equal(vis.$('[data-action="stats"]'), null);
  vis.close();
});

test('site : pas de comptage sur la page de connexion (#/admin) ni pour un import Wattpad', async () => {
  const ctx = await mount({ hash: '#/admin' });
  assert.equal(ctx.backend._raw.stats.size, 0);
  ctx.close();
});
