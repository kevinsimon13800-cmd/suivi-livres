import test from 'node:test';
import assert from 'node:assert/strict';
import { progress, validateBook, statusLabel, formatNumber } from '../js/logic.js';

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
  assert.deepEqual(r.value, { title: 'Mon roman', status: 'plan', genre: 'Fantasy', synopsis: '', public: true, words: 1200, goalWords: 0, chaptersDone: 2, chaptersTotal: 10 });
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
