// Prochain chapitre : bandeau avec compte à rebours (visible par tous) + écran de réglage (auteure).
import { validateChapter, chapterRemaining } from './atelier.js?v=7';
import { formatDateFR } from './logic.js?v=7';
import { SMALL_ROSE } from './art.js?v=7';

export function createChapterUI({ state, backend, win, doc, h, field, art, render, showToast, now = () => new Date() }) {
  state.chapter = state.chapter || null;
  state.chapterDraft = null;
  state.chapterErrors = {};

  async function load() {
    try {
      state.chapter = typeof backend.getChapter === 'function' ? await backend.getChapter() : null;
    } catch (e) {
      state.chapter = null;
    }
  }

  function tickInto(box, chapter) {
    const draw = () => {
      const r = chapterRemaining(chapter, now());
      if (!r) return;
      if (r.past) {
        box.className = 'chapter-done';
        box.replaceChildren(h('strong', {}, 'Le chapitre est en ligne !'));
        return;
      }
      const cell = (n, l) => h('div', {}, h('strong', {}, String(n).padStart(2, '0')), h('span', {}, l));
      box.className = 'chapter-count';
      box.replaceChildren(cell(r.days, r.days > 1 ? 'jours' : 'jour'), cell(r.hours, 'heures'), cell(r.minutes, 'min'), cell(r.seconds, 'sec'));
    };
    draw();
    const id = win.setInterval(() => {
      if (!box.isConnected) { win.clearInterval(id); return; }
      draw();
    }, 1000);
  }

  function renderBanner() {
    const c = state.chapter;
    const r = c && chapterRemaining(c, now());
    if (!r || (r.past && r.agoMs > 24 * 3600 * 1000)) return null; // « en ligne » reste affiché 24 h, puis le bandeau disparaît
    const box = h('div', { 'data-role': 'chapter-count' });
    tickInto(box, c);
    return h(
      'section',
      { class: 'chapter-banner', 'data-role': 'chapter-banner', 'aria-label': 'Prochain chapitre' },
      h('p', { class: 'chapter-kicker' }, 'Prochain chapitre'),
      c.story ? h('p', { class: 'chapter-story', 'data-role': 'chapter-story' }, c.story) : null,
      c.title ? h('h3', { 'data-role': 'chapter-title' }, c.title) : null,
      box,
      h('p', { class: 'chapter-when', 'data-role': 'chapter-when' }, `${formatDateFR(c.date)} à ${c.time.replace(':', ' h ')}`),
    );
  }

  // ---------- Réglage (auteure) ----------

  function open() {
    const c = state.chapter;
    state.chapterDraft = c ? { story: c.story || '', title: c.title || '', date: c.date, time: c.time } : { story: '', title: '', date: '', time: '18:00' };
    state.chapterErrors = {};
    state.view = 'chapter';
    render();
    win.scrollTo?.(0, 0);
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const f = ev.target.elements;
    const raw = { story: f.story.value, title: f.title.value, date: f.date.value, time: f.time.value };
    const res = validateChapter(raw);
    if (!res.ok) {
      state.chapterDraft = raw;
      state.chapterErrors = res.errors;
      render();
      return;
    }
    try {
      await backend.saveChapter(res.value);
      state.chapter = res.value;
      state.view = 'list';
      render();
      showToast('Compte à rebours enregistré.');
    } catch (e) {
      state.chapterDraft = raw;
      state.chapterErrors = { form: 'Enregistrement refusé. Vérifie ta connexion.' };
      render();
    }
  }

  async function onRemove() {
    if (!win.confirm('Retirer le compte à rebours de la page d’accueil ?')) return;
    try {
      await backend.deleteChapter();
      state.chapter = null;
      state.view = 'list';
      render();
      showToast('Compte à rebours retiré.');
    } catch (e) {
      state.chapterErrors = { form: 'Suppression refusée. Vérifie ta connexion.' };
      render();
    }
  }

  function renderAdmin() {
    const d = state.chapterDraft || { story: '', title: '', date: '', time: '18:00' };
    const e = state.chapterErrors;
    const stories = [...new Set((state.books || []).map((b) => b.title))];
    const listId = 'chapter-stories';
    return h(
      'form',
      { class: 'panel', 'data-role': 'chapter-form', novalidate: true, onsubmit: onSubmit },
      h('h2', {}, art(SMALL_ROSE, 'inline-art'), ' Prochain chapitre'),
      h('p', { class: 'hint' }, 'Les visiteurs voient un compte à rebours sur la page d’accueil, à l’heure de leur appareil.'),
      field('Histoire', 'story', h('input', { class: 'input', name: 'story', value: d.story, list: listId, maxlength: '120', autocomplete: 'off', placeholder: 'Choisis une histoire ou écris un nom' }), e.story),
      h('datalist', { id: listId }, stories.map((t) => h('option', { value: t }))),
      field('Titre du chapitre (facultatif)', 'title', h('input', { class: 'input', name: 'title', value: d.title, maxlength: '120', autocomplete: 'off', placeholder: 'Ex. Chapitre 12' }), e.title),
      h(
        'div',
        { class: 'row2' },
        field('Date', 'date', h('input', { class: 'input', name: 'date', type: 'date', value: d.date }), e.date),
        field('Heure', 'time', h('input', { class: 'input', name: 'time', type: 'time', value: d.time }), e.time),
      ),
      e.form ? h('p', { class: 'state error', role: 'alert' }, e.form) : null,
      h(
        'div',
        { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'submit', 'data-action': 'save-chapter' }, 'Enregistrer'),
        h('button', { class: 'btn', type: 'button', 'data-action': 'cancel-chapter', onclick: () => { state.view = 'list'; render(); } }, 'Annuler'),
        state.chapter ? h('button', { class: 'btn ghost danger', type: 'button', 'data-action': 'remove-chapter', onclick: onRemove }, 'Retirer') : null,
      ),
    );
  }

  return { load, open, renderBanner, renderAdmin };
}
