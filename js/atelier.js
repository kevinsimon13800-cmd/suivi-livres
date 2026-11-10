// Atelier d'écriture : fiches personnages, liens, prochain chapitre, sondage. Logique pure (validation, calculs).
import { isValidDate } from './logic.js?v=7';

export const REL_TYPES = { famille: 'Famille', amour: 'Amour', amitie: 'Amitié', rivalite: 'Rivalité', mentor: 'Mentor', autre: 'Autre' };

const str = (v) => String(v ?? '').trim();

export function validateCharacter(input) {
  const errors = {};
  const v = {
    name: str(input.name), story: str(input.story), role: str(input.role), age: str(input.age),
    appearance: str(input.appearance), traits: str(input.traits), notes: str(input.notes),
  };
  if (!v.name) errors.name = 'Le nom est obligatoire.';
  else if (v.name.length > 80) errors.name = '80 caractères maximum.';
  if (v.story.length > 120) errors.story = '120 caractères maximum.';
  if (v.role.length > 80) errors.role = '80 caractères maximum.';
  if (v.age.length > 20) errors.age = '20 caractères maximum.';
  if (v.appearance.length > 1000) errors.appearance = '1 000 caractères maximum.';
  if (v.traits.length > 1000) errors.traits = '1 000 caractères maximum.';
  if (v.notes.length > 5000) errors.notes = '5 000 caractères maximum.';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? v : null };
}

export function validateRelation(input, characters) {
  const errors = {};
  const ids = new Set((characters || []).map((c) => c.id));
  const from = str(input.from);
  const to = str(input.to);
  const type = str(input.type);
  const label = str(input.label);
  if (!ids.has(from) || !ids.has(to)) errors.form = 'Choisis deux personnages.';
  else if (from === to) errors.form = 'Un lien relie deux personnages différents.';
  if (!Object.hasOwn(REL_TYPES, type)) errors.type = 'Type de lien invalide.';
  if (label.length > 40) errors.label = '40 caractères maximum.';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { from, to, type, label } : null };
}

/** Position de départ des personnages sur la carte (cercle) tant que l'auteure ne les a pas déplacés. */
export function layout(characters, w = 600, h = 420) {
  const n = characters.length;
  const out = {};
  characters.forEach((c, i) => {
    if (Number.isFinite(c.x) && Number.isFinite(c.y)) {
      out[c.id] = { x: c.x, y: c.y };
    } else {
      const a = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
      out[c.id] = { x: Math.round(w / 2 + (w * 0.32) * Math.cos(a)), y: Math.round(h / 2 + (h * 0.32) * Math.sin(a)) };
    }
  });
  return out;
}

// ---------- Prochain chapitre ----------

export function validateChapter(input) {
  const errors = {};
  const story = str(input.story);
  const title = str(input.title);
  const date = str(input.date);
  const time = str(input.time);
  if (story.length > 120) errors.story = '120 caractères maximum.';
  if (title.length > 120) errors.title = '120 caractères maximum.';
  if (!isValidDate(date)) errors.date = 'Choisis une date.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = 'Choisis une heure.';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { story, title, date, time } : null };
}

/** Temps restant avant le chapitre (heure locale du visiteur). */
export function chapterRemaining(chapter, now = new Date()) {
  if (!chapter || !isValidDate(chapter.date || '') || !/^\d{2}:\d{2}$/.test(chapter.time || '')) return null;
  const [y, m, d] = chapter.date.split('-').map(Number);
  const [hh, mm] = chapter.time.split(':').map(Number);
  const ms = new Date(y, m - 1, d, hh, mm, 0).getTime() - now.getTime();
  if (ms <= 0) return { past: true, agoMs: -ms, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const s = Math.floor(ms / 1000);
  return { past: false, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

// ---------- Sondage ----------

export function validatePoll(input) {
  const errors = {};
  const question = str(input.question);
  const labels = String(input.optionsText ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (!question) errors.question = 'Écris la question.';
  else if (question.length > 200) errors.question = '200 caractères maximum.';
  if (labels.length < 2) errors.options = 'Il faut au moins 2 choix (un par ligne).';
  else if (labels.length > 8) errors.options = '8 choix maximum.';
  else if (labels.some((l) => l.length > 80)) errors.options = '80 caractères maximum par choix.';
  else if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) errors.options = 'Deux choix sont identiques.';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { question, labels } : null };
}

/**
 * Nouveau sondage à enregistrer. Si les choix sont inchangés (même ordre, mêmes textes), les votes sont gardés ;
 * sinon les votes repartent de zéro et `rev` augmente (les visiteurs peuvent alors voter de nouveau).
 */
export function buildPoll(prev, { question, labels }, newId) {
  const same = prev && Array.isArray(prev.options) && prev.options.length === labels.length && prev.options.every((o, i) => o.label === labels[i]);
  if (same) return { ...prev, question };
  return {
    question,
    closed: false,
    rev: (prev && prev.rev ? prev.rev : 0) + 1,
    options: labels.map((label) => ({ id: newId(), label, votes: 0 })),
  };
}

export function pollTotals(poll) {
  const total = poll.options.reduce((a, o) => a + (o.votes || 0), 0);
  return poll.options.map((o) => ({ ...o, pct: total ? Math.round(((o.votes || 0) / total) * 100) : 0 }));
}

/** Mémorise, sur l'appareil du visiteur, pour quel choix il a voté (une seule voix par sondage). */
export function createVoteStore(storage) {
  const key = (rev) => `sondage:vote:${rev}`;
  return {
    get(rev) {
      try { return (storage && storage.getItem(key(rev))) || ''; } catch (e) { return ''; }
    },
    set(rev, optionId) {
      try {
        if (!storage) return;
        if (optionId) storage.setItem(key(rev), optionId);
        else storage.removeItem(key(rev));
      } catch (e) { /* stockage indisponible : le vote compte quand même, mais pas la mémoire locale */ }
    },
  };
}
