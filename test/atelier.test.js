// Logique pure des nouveautés v7 : périodes de lecture, fiches, liens, chapitre, sondage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PERIODS, rangeFor, inRange, countsNow, monthlySeries, undatedFinished } from '../js/periods.js';
import {
  validateCharacter, validateRelation, layout, validateChapter, chapterRemaining, validatePoll, buildPoll, pollTotals, createVoteStore,
} from '../js/atelier.js';

const T = '2026-11-10'; // mardi

test('périodes : cinq périodes, dans l’ordre demandé', () => {
  assert.deepEqual(PERIODS.map((p) => p.id), ['week', 'month', 'quarter', 'semester', 'year']);
});

test('périodes : bornes de la période en cours (semaine = lundi à dimanche)', () => {
  const r = (p, o = 0, t = T) => { const x = rangeFor(p, o, t); return [x.start, x.end]; };
  assert.deepEqual(r('week'), ['2026-11-09', '2026-11-16']);
  assert.deepEqual(r('month'), ['2026-11-01', '2026-12-01']);
  assert.deepEqual(r('quarter'), ['2026-10-01', '2027-01-01']);
  assert.deepEqual(r('semester'), ['2026-07-01', '2027-01-01']);
  assert.deepEqual(r('year'), ['2026-01-01', '2027-01-01']);
});

test('périodes : un lundi et un dimanche tombent dans la bonne semaine', () => {
  assert.deepEqual([rangeFor('week', 0, '2026-11-09').start, rangeFor('week', 0, '2026-11-09').end], ['2026-11-09', '2026-11-16']);
  assert.deepEqual([rangeFor('week', 0, '2026-11-15').start, rangeFor('week', 0, '2026-11-15').end], ['2026-11-09', '2026-11-16']);
  assert.equal(rangeFor('week', 0, '2026-11-16').start, '2026-11-16');
});

test('périodes : changement d’année (semaine à cheval, mois et trimestre précédents)', () => {
  const w = rangeFor('week', 0, '2027-01-03'); // dimanche
  assert.deepEqual([w.start, w.end], ['2026-12-28', '2027-01-04']);
  const m = rangeFor('month', -1, '2027-01-15');
  assert.deepEqual([m.start, m.end], ['2026-12-01', '2027-01-01']);
  const q = rangeFor('quarter', -1, '2027-02-01');
  assert.deepEqual([q.start, q.end], ['2026-10-01', '2027-01-01']);
  const s = rangeFor('semester', -1, '2027-02-01');
  assert.deepEqual([s.start, s.end], ['2026-07-01', '2027-01-01']);
  const y = rangeFor('year', -1, T);
  assert.deepEqual([y.start, y.end], ['2025-01-01', '2026-01-01']);
});

test('périodes : libellés lisibles', () => {
  assert.equal(rangeFor('month', 0, T).label, 'novembre 2026');
  assert.equal(rangeFor('quarter', 0, T).label, 'T4 2026');
  assert.equal(rangeFor('semester', 0, T).label, 'S2 2026');
  assert.equal(rangeFor('year', 0, T).label, '2026');
  assert.match(rangeFor('week', 0, T).label, /^9 nov\.? au 15 nov\.? 2026$/);
});

const R = (id, status, finishedAt, extra = {}) => ({ id, title: `L${id}`, status, finishedAt, ...extra });
const READINGS = [
  R('a', 'terminee', '2026-11-10'), // aujourd'hui
  R('b', 'terminee', '2026-11-09'), // lundi de la semaine
  R('c', 'terminee', '2026-11-08'), // dimanche d'avant
  R('d', 'terminee', '2026-10-31'), // octobre (même trimestre)
  R('e', 'terminee', '2026-08-15'), // même semestre, autre trimestre
  R('f', 'terminee', '2026-03-01'), // même année, autre semestre
  R('g', 'terminee', '2025-12-31'), // année précédente
  R('h', 'en-cours', '2026-11-10'), // pas terminée : ignorée
  R('i', 'terminee', ''), // sans date : non comptée
  R('j', 'terminee', '2026-13-45'), // date invalide : non comptée
];

test('compteur : décompte exact de chaque période en cours', () => {
  assert.deepEqual(countsNow(READINGS, T), { week: 2, month: 3, quarter: 4, semester: 5, year: 6 });
});

test('compteur : les bornes sont incluses au début et exclues à la fin', () => {
  const r = rangeFor('month', 0, T);
  const edge = [R('x', 'terminee', '2026-11-01'), R('y', 'terminee', '2026-12-01'), R('z', 'terminee', '2026-10-31')];
  assert.deepEqual(inRange(edge, r).map((x) => x.id), ['x']);
});

test('compteur : liste triée du plus récent au plus ancien, périodes précédentes', () => {
  assert.deepEqual(inRange(READINGS, rangeFor('month', 0, T)).map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(inRange(READINGS, rangeFor('month', -1, T)).map((x) => x.id), ['d']);
  assert.deepEqual(inRange(READINGS, rangeFor('week', -1, T)).map((x) => x.id), ['c']);
});

test('compteur : série mensuelle et lectures terminées sans date', () => {
  const s = monthlySeries(READINGS, 2026);
  assert.equal(s.length, 12);
  assert.deepEqual(s, [0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 3, 0]);
  assert.deepEqual(undatedFinished(READINGS).map((x) => x.id), ['i', 'j']);
  assert.deepEqual(countsNow([], T), { week: 0, month: 0, quarter: 0, semester: 0, year: 0 });
});

test('fiche personnage : nom obligatoire, limites, champs nettoyés', () => {
  assert.equal(validateCharacter({ name: '  ' }).ok, false);
  assert.equal(validateCharacter({ name: 'x'.repeat(81) }).errors.name, '80 caractères maximum.');
  const ok = validateCharacter({ name: ' Lyra ', story: ' Âmes ', age: ' 19 ' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { name: 'Lyra', story: 'Âmes', role: '', age: '19', appearance: '', traits: '', notes: '' });
  assert.equal(validateCharacter({ name: 'A', notes: 'x'.repeat(5001) }).ok, false);
});

test('liens : deux personnages différents, type connu', () => {
  const chars = [{ id: 'a' }, { id: 'b' }];
  assert.equal(validateRelation({ from: 'a', to: 'a', type: 'amour' }, chars).ok, false);
  assert.equal(validateRelation({ from: 'a', to: 'zz', type: 'amour' }, chars).ok, false);
  assert.equal(validateRelation({ from: 'a', to: 'b', type: 'pirate' }, chars).ok, false);
  assert.equal(validateRelation({ from: 'a', to: 'b', type: 'amour', label: 'x'.repeat(41) }, chars).ok, false);
  assert.deepEqual(validateRelation({ from: 'a', to: 'b', type: 'famille', label: ' sœur ' }, chars).value, { from: 'a', to: 'b', type: 'famille', label: 'sœur' });
});

test('carte : placement en cercle par défaut, position enregistrée respectée', () => {
  const l = layout([{ id: 'a' }, { id: 'b' }, { id: 'c', x: 50, y: 60 }]);
  assert.deepEqual(l.c, { x: 50, y: 60 });
  assert.ok(Object.values(l).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.notDeepEqual(l.a, l.b);
  assert.deepEqual(layout([]), {});
});

test('chapitre : date et heure valides exigées', () => {
  assert.equal(validateChapter({ date: '', time: '18:00' }).ok, false);
  assert.equal(validateChapter({ date: '2026-02-30', time: '18:00' }).ok, false);
  assert.equal(validateChapter({ date: '2026-12-01', time: '25:00' }).ok, false);
  assert.equal(validateChapter({ date: '2026-12-01', time: '18:60' }).ok, false);
  assert.deepEqual(validateChapter({ story: ' S ', title: ' C1 ', date: '2026-12-01', time: '07:05' }).value, { story: 'S', title: 'C1', date: '2026-12-01', time: '07:05' });
});

test('chapitre : temps restant exact, puis « en ligne »', () => {
  const ch = { date: '2026-11-13', time: '18:30' };
  const r = chapterRemaining(ch, new Date(2026, 10, 10, 16, 0, 0));
  assert.deepEqual(r, { past: false, days: 3, hours: 2, minutes: 30, seconds: 0 });
  assert.deepEqual(chapterRemaining(ch, new Date(2026, 10, 13, 18, 29, 59)), { past: false, days: 0, hours: 0, minutes: 0, seconds: 1 });
  assert.equal(chapterRemaining(ch, new Date(2026, 10, 13, 18, 30, 0)).past, true);
  assert.equal(chapterRemaining(ch, new Date(2026, 10, 13, 20, 30, 0)).agoMs, 2 * 3600 * 1000);
  assert.equal(chapterRemaining(null), null);
  assert.equal(chapterRemaining({ date: 'x', time: '18:00' }), null);
});

test('sondage : question, 2 à 8 choix distincts', () => {
  assert.equal(validatePoll({ question: '', optionsText: 'a\nb' }).ok, false);
  assert.equal(validatePoll({ question: 'Q', optionsText: 'a' }).ok, false);
  assert.equal(validatePoll({ question: 'Q', optionsText: 'a\n\n  \nb' }).ok, true);
  assert.equal(validatePoll({ question: 'Q', optionsText: Array.from({ length: 9 }, (_, i) => `c${i}`).join('\n') }).ok, false);
  assert.equal(validatePoll({ question: 'Q', optionsText: 'Oui\noui' }).ok, false);
  assert.deepEqual(validatePoll({ question: ' Q ', optionsText: ' a \n b ' }).value, { question: 'Q', labels: ['a', 'b'] });
});

test('sondage : choix inchangés = votes gardés ; choix modifiés = votes à zéro et nouvelle révision', () => {
  let n = 0;
  const id = () => `n${++n}`;
  const prev = { question: 'Q', closed: true, rev: 3, options: [{ id: 'o1', label: 'a', votes: 4 }, { id: 'o2', label: 'b', votes: 1 }] };
  const same = buildPoll(prev, { question: 'Q2', labels: ['a', 'b'] }, id);
  assert.equal(same.rev, 3);
  assert.equal(same.question, 'Q2');
  assert.deepEqual(same.options.map((o) => o.votes), [4, 1]);
  assert.equal(same.closed, true);
  const diff = buildPoll(prev, { question: 'Q', labels: ['a', 'c'] }, id);
  assert.equal(diff.rev, 4);
  assert.deepEqual(diff.options.map((o) => o.votes), [0, 0]);
  assert.equal(diff.closed, false);
  assert.equal(buildPoll(null, { question: 'Q', labels: ['a', 'b'] }, id).rev, 1);
});

test('sondage : pourcentages et mémoire du vote sur l’appareil', () => {
  const rows = pollTotals({ options: [{ id: 'a', label: 'A', votes: 1 }, { id: 'b', label: 'B', votes: 3 }] });
  assert.deepEqual(rows.map((o) => o.pct), [25, 75]);
  assert.deepEqual(pollTotals({ options: [{ id: 'a', label: 'A', votes: 0 }] }).map((o) => o.pct), [0]);
  const m = new Map();
  const store = createVoteStore({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) });
  assert.equal(store.get(1), '');
  store.set(1, 'o2');
  assert.equal(store.get(1), 'o2');
  assert.equal(store.get(2), '');
  store.set(1, '');
  assert.equal(store.get(1), '');
  const broken = createVoteStore({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } });
  assert.equal(broken.get(1), '');
  broken.set(1, 'o');
});
