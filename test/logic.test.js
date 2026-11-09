import test from 'node:test';
import assert from 'node:assert/strict';
import {
  progress, validateBook, statusLabel, formatNumber, parseTags, parseLines, isValidCover, isValidDate,
  countdown, filterBooks, collectFacets, validateNote, MAX_COVER_CHARS,
} from '../js/logic.js';
import { createReadingStore } from '../js/reading.js';

test('progress : basé sur les mots quand un objectif existe', () => {
  assert.equal(progress({ status: 'ecriture', words: 25000, goalWords: 50000 }), 50);
  assert.equal(progress({ status: 'ecriture', words: 0, goalWords: 50000 }), 0);
});

test('progress : plafonné à 100 et jamais négatif', () => {
  assert.equal(progress({ status: 'ecriture', words: 90000, goalWords: 50000 }), 100);
  assert.equal(progress({ status: 'ecriture', words: -5, goalWords: 100 }), 0);
});

test('progress : sans objectif, utilise les chapitres', () => {
  assert.equal(progress({ status: 'ecriture', chaptersDone: 3, chaptersTotal: 12 }), 25);
});

test('progress : sans mots ni chapitres, dépend de l’étape', () => {
  assert.equal(progress({ status: 'idee' }), 0);
  assert.equal(progress({ status: 'plan' }), 10);
  assert.equal(progress({ status: 'ecriture' }), 40);
  assert.equal(progress({ status: 'relecture' }), 85);
});

test('progress : un livre publié est à 100 %', () => {
  assert.equal(progress({ status: 'publie', words: 10, goalWords: 50000 }), 100);
});

test('progress : tolère les données absentes', () => {
  assert.equal(progress(null), 0);
  assert.equal(progress({}), 0);
});

test('validateBook : cas valide, normalisation', () => {
  const r = validateBook({ title: '  Mon roman ', status: 'plan', words: '1200', goalWords: '', chaptersDone: '2', chaptersTotal: '10', genre: ' Fantasy ', synopsis: '', public: 'on' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { title: 'Mon roman', status: 'plan', genre: 'Fantasy', synopsis: '', tags: [], chapterTitles: [], releaseDate: '', cover: '', public: true, words: 1200, goalWords: 0, chaptersDone: 2, chaptersTotal: 10 });
});

test('validateBook : titre obligatoire et limité', () => {
  assert.ok(validateBook({ title: '   ', status: 'plan' }).errors.title);
  assert.ok(validateBook({ title: 'x'.repeat(121), status: 'plan' }).errors.title);
  assert.equal(validateBook({ title: 'x'.repeat(120), status: 'plan' }).ok, true);
});

test('validateBook : étape inconnue refusée', () => {
  assert.ok(validateBook({ title: 'A', status: 'nimporte' }).errors.status);
});

test('validateBook : nombres invalides refusés', () => {
  for (const bad of ['-1', '1.5', 'abc', '1e400']) {
    const r = validateBook({ title: 'A', status: 'plan', words: bad });
    assert.ok(r.errors.words, `devrait refuser ${bad}`);
    assert.equal(r.ok, false);
  }
});

test('validateBook : chapitres terminés > prévus refusé, mais ok si total = 0', () => {
  assert.ok(validateBook({ title: 'A', status: 'plan', chaptersDone: 5, chaptersTotal: 3 }).errors.chaptersDone);
  assert.equal(validateBook({ title: 'A', status: 'plan', chaptersDone: 5, chaptersTotal: 0 }).ok, true);
});

test('validateBook : public vaut false par défaut (privé)', () => {
  assert.equal(validateBook({ title: 'A', status: 'plan' }).value.public, false);
});

test('statusLabel / formatNumber', () => {
  assert.equal(statusLabel('ecriture'), 'Écriture');
  assert.equal(statusLabel('inconnu'), 'inconnu');
  assert.match(formatNumber(12345), /12\s?345/);
  assert.equal(formatNumber(undefined), '0');
});


// ---------- Nouveautés : étiquettes, chapitres, couverture, date, filtres, notes ----------

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('parseTags : découpe, nettoie, sans doublon (insensible à la casse)', () => {
  assert.deepEqual(parseTags('Romance, magie ,  romance,, Grèce  antique'), ['Romance', 'magie', 'Grèce antique']);
  assert.deepEqual(parseTags(''), []);
  assert.deepEqual(parseTags(['a', ' a ', 'b']), ['a', 'b']);
});

test('parseLines : une ligne par chapitre, lignes vides ignorées', () => {
  assert.deepEqual(parseLines('Ch 1\r\n\n  Ch 2  \n'), ['Ch 1', 'Ch 2']);
});

test('validateBook : étiquettes, chapitres, date et couverture normalisés', () => {
  const r = validateBook({ title: 'T', status: 'plan', tags: 'A, b', chapterTitles: 'Un\nDeux', releaseDate: '2027-03-14', cover: PNG });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.tags, ['A', 'b']);
  assert.deepEqual(r.value.chapterTitles, ['Un', 'Deux']);
  assert.equal(r.value.releaseDate, '2027-03-14');
  assert.equal(r.value.cover, PNG);
});

test('validateBook : limites étiquettes / chapitres / date / couverture', () => {
  assert.ok(validateBook({ title: 'T', status: 'plan', tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(',') }).errors.tags);
  assert.ok(validateBook({ title: 'T', status: 'plan', tags: 'x'.repeat(31) }).errors.tags);
  assert.ok(validateBook({ title: 'T', status: 'plan', chapterTitles: Array.from({ length: 201 }, (_, i) => `c${i}`).join('\n') }).errors.chapterTitles);
  assert.ok(validateBook({ title: 'T', status: 'plan', releaseDate: '2027-02-30' }).errors.releaseDate);
  assert.ok(validateBook({ title: 'T', status: 'plan', cover: 'javascript:alert(1)' }).errors.cover);
  assert.ok(validateBook({ title: 'T', status: 'plan', cover: 'data:image/svg+xml;base64,PHN2Zz4=' }).errors.cover);
});

test('isValidCover : seulement JPEG/PNG/WebP en base64, taille plafonnée', () => {
  assert.equal(isValidCover(PNG), true);
  assert.equal(isValidCover('data:image/jpeg;base64,' + 'A'.repeat(MAX_COVER_CHARS)), false);
  assert.equal(isValidCover('data:image/jpeg;base64,AAA" onerror="x'), false);
  assert.equal(isValidCover(''), false);
  assert.equal(isValidCover(undefined), false);
});

test('isValidDate : vraies dates uniquement', () => {
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('2027-02-29'), false);
  assert.equal(isValidDate('14/03/2027'), false);
});

test('countdown : futur, demain, aujourd’hui, passé, absent', () => {
  assert.equal(countdown('2026-11-21', '2026-11-09').days, 12);
  assert.match(countdown('2026-11-21', '2026-11-09').label, /^J-12 · sortie le 21 novembre 2026$/);
  assert.match(countdown('2026-11-10', '2026-11-09').label, /demain/);
  assert.match(countdown('2026-11-09', '2026-11-09').label, /aujourd’hui/);
  const past = countdown('2026-06-01', '2026-11-09');
  assert.equal(past.past, true);
  assert.match(past.label, /^Sorti le 1 juin 2026$/);
  assert.equal(countdown('', '2026-11-09'), null);
  assert.equal(countdown('n’importe quoi', '2026-11-09'), null);
  // passage à l'heure d'hiver/été sans décalage d'un jour
  assert.equal(countdown('2027-04-01', '2027-03-01').days, 31);
});

test('filterBooks : texte (sans accents), genre, étiquette, combinés', () => {
  const books = [
    { id: 1, title: 'Épée d’Athéna', genre: 'Fantasy', tags: ['Grèce'], synopsis: '' },
    { id: 2, title: 'Roses', genre: 'Romance', tags: ['grèce', 'Amour'], synopsis: 'Un temple' },
    { id: 3, title: 'Sans rien' },
  ];
  assert.deepEqual(filterBooks(books, { q: 'epee' }).map((b) => b.id), [1]);
  assert.deepEqual(filterBooks(books, { q: 'TEMPLE' }).map((b) => b.id), [2]);
  assert.deepEqual(filterBooks(books, { genre: 'romance' }).map((b) => b.id), [2]);
  assert.deepEqual(filterBooks(books, { tag: 'Grece' }).map((b) => b.id), [1, 2]);
  assert.deepEqual(filterBooks(books, { tag: 'grèce', genre: 'Fantasy' }).map((b) => b.id), [1]);
  assert.equal(filterBooks(books, {}).length, 3);
});

test('collectFacets : genres et étiquettes uniques et triés', () => {
  const f = collectFacets([{ genre: 'Romance', tags: ['b', 'A'] }, { genre: 'romance', tags: ['a'] }, { genre: ' ', tags: [] }, {}]);
  assert.deepEqual(f.genres, ['romance']);
  assert.deepEqual(f.tags.map((t) => t.toLowerCase()), ['a', 'b']);
});

test('validateNote : titre ou texte requis, limites', () => {
  assert.ok(validateNote({ title: ' ', body: ' ' }).errors.title);
  assert.equal(validateNote({ title: '', body: 'Une idée' }).ok, true);
  assert.deepEqual(validateNote({ title: ' Idée ', body: ' x ', bookId: 'a' }).value, { title: 'Idée', body: 'x', bookId: 'a' });
  assert.ok(validateNote({ title: 'x'.repeat(121) }).errors.title);
  assert.ok(validateNote({ title: 't', body: 'x'.repeat(10001) }).errors.body);
});

// ---------- Coches de lecture (stockage local) ----------

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

test('lecture : coches conservées d’une session à l’autre', () => {
  const st = fakeStorage();
  const r1 = createReadingStore(st);
  r1.setBookRead('a', true);
  r1.setChapterRead('a', 2, true);
  r1.setChapterRead('a', 0, true);
  r1.setChapterRead('a', 2, false);
  const r2 = createReadingStore(st);
  assert.equal(r2.persistent, true);
  assert.equal(r2.isBookRead('a'), true);
  assert.equal(r2.isChapterRead('a', 0), true);
  assert.equal(r2.isChapterRead('a', 2), false);
  assert.equal(r2.countRead('a', 3), 1);
  assert.equal(r2.isBookRead('b'), false);
});

test('lecture : chapitres supprimés par l’auteur ignorés dans le compte', () => {
  const r = createReadingStore(fakeStorage());
  r.setChapterRead('a', 5, true);
  r.setChapterRead('a', 1, true);
  assert.equal(r.countRead('a', 3), 1);
});

test('lecture : stockage bloqué ou corrompu → fonctionne en mémoire sans planter', () => {
  const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); }, removeItem() {} };
  const r = createReadingStore(blocked);
  assert.equal(r.persistent, false);
  r.setBookRead('a', true);
  assert.equal(r.isBookRead('a'), true);
  const st = fakeStorage();
  st.setItem('suivi-livres:lecture:v1', '{pas du json');
  assert.equal(createReadingStore(st).isBookRead('a'), false);
  st.setItem('suivi-livres:lecture:v1', JSON.stringify({ a: { read: true, chapters: ['x', -1, 2] } }));
  assert.deepEqual(createReadingStore(st).get('a').chapters, [2]);
  assert.equal(createReadingStore(null).persistent, false);
});
