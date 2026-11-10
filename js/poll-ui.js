// Sondage : carte de vote (visible par tous, une voix par appareil) + écran de réglage (auteure).
import { validatePoll, buildPoll, pollTotals, createVoteStore } from './atelier.js?v=7';
import { SMALL_ROSE } from './art.js?v=7';

export function createPollUI({ state, backend, win, doc, h, field, art, render, showToast, storage }) {
  state.poll = state.poll || null;
  state.pollChanging = false;
  state.pollPeek = false;
  state.pollDraft = null;
  state.pollErrors = {};
  state.pollError = '';
  const votes = createVoteStore(storage);
  let seq = 0;
  const newId = () => `o${Date.now().toString(36)}${(seq += 1)}`;

  async function load() {
    try {
      state.poll = typeof backend.getPoll === 'function' ? await backend.getPoll() : null;
    } catch (e) {
      state.poll = null;
    }
  }

  async function vote(optionId, node) {
    const p = state.poll;
    if (!p || p.closed) return;
    const previousId = votes.get(p.rev);
    if (previousId === optionId) { state.pollChanging = false; node.replaceWith(renderPublic()); return; }
    try {
      await backend.votePoll({ optionId, previousId: previousId || undefined });
      votes.set(p.rev, optionId);
      state.pollChanging = false;
      state.pollPeek = false;
      state.pollError = '';
      await load();
    } catch (e) {
      state.pollError = 'Ton vote n’a pas pu être enregistré. Réessaie dans un instant.';
    }
    node.replaceWith(renderPublic());
  }

  function renderPublic() {
    const p = state.poll;
    if (!p || !Array.isArray(p.options) || p.options.length < 2) return h('div', { 'data-role': 'poll', hidden: true });
    const mine = votes.get(p.rev);
    const showResults = p.closed || (mine && !state.pollChanging) || state.pollPeek;
    const redraw = (ev) => ev.currentTarget.closest('[data-role="poll"]').replaceWith(renderPublic());
    const body = [];
    if (showResults) {
      const rows = pollTotals(p);
      const total = rows.reduce((a, o) => a + (o.votes || 0), 0);
      body.push(
        h('div', { class: 'poll-results' }, rows.map((o) => h(
          'div',
          { class: `poll-res${o.id === mine ? ' mine' : ''}`, 'data-option': o.id },
          h('i', { style: `width:${o.pct}%` }),
          h('span', { class: 'poll-label' }, o.label, o.id === mine ? ' (ton vote)' : ''),
          h('span', { class: 'poll-pct' }, h('strong', {}, `${o.pct} %`), ` · ${o.votes || 0}`),
        ))),
        h('p', { class: 'hint center', 'data-role': 'poll-total' }, `${total} vote${total > 1 ? 's' : ''}${p.closed ? ' · sondage fermé' : ''}`),
      );
      if (!p.closed && mine) body.push(h('div', { class: 'toolbar center' }, h('button', { class: 'btn small', type: 'button', 'data-action': 'poll-change', onclick: (ev) => { state.pollChanging = true; redraw(ev); } }, 'Changer mon vote')));
      if (!p.closed && !mine && state.pollPeek) body.push(h('div', { class: 'toolbar center' }, h('button', { class: 'btn small', type: 'button', 'data-action': 'poll-back', onclick: (ev) => { state.pollPeek = false; redraw(ev); } }, 'Retour au vote')));
    } else {
      body.push(
        h('div', { class: 'poll-options' }, p.options.map((o) => h(
          'button',
          {
            class: `btn poll-opt${o.id === mine ? ' on' : ''}`, type: 'button', 'data-vote': o.id,
            onclick: (ev) => vote(o.id, ev.currentTarget.closest('[data-role="poll"]')),
          },
          o.label,
        ))),
        mine
          ? h('div', { class: 'toolbar center' }, h('button', { class: 'btn small', type: 'button', 'data-action': 'poll-keep', onclick: (ev) => { state.pollChanging = false; redraw(ev); } }, 'Garder mon vote'))
          : h('div', { class: 'toolbar center' }, h('button', { class: 'btn small ghost', type: 'button', 'data-action': 'poll-peek', onclick: (ev) => { state.pollPeek = true; redraw(ev); } }, 'Voir les résultats')),
      );
    }
    return h(
      'section',
      { class: 'poll-card', 'data-role': 'poll', 'aria-label': 'Sondage' },
      h('p', { class: 'chapter-kicker' }, 'Sondage'),
      h('h3', { 'data-role': 'poll-question' }, p.question),
      ...body,
      state.pollError ? h('p', { class: 'state error', role: 'alert' }, state.pollError) : null,
    );
  }

  // ---------- Réglage (auteure) ----------

  function open() {
    const p = state.poll;
    state.pollDraft = p ? { question: p.question, optionsText: p.options.map((o) => o.label).join('\n') } : { question: '', optionsText: '' };
    state.pollErrors = {};
    state.view = 'poll';
    render();
    win.scrollTo?.(0, 0);
  }

  async function persist(next, toast) {
    try {
      await backend.savePoll(next);
      state.poll = next;
      state.pollChanging = false;
      state.pollPeek = false;
      state.view = 'list';
      render();
      showToast(toast);
    } catch (e) {
      state.pollErrors = { form: 'Enregistrement refusé. Vérifie ta connexion.' };
      render();
    }
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const f = ev.target.elements;
    const raw = { question: f.question.value, optionsText: f.options.value };
    const res = validatePoll(raw);
    if (!res.ok) {
      state.pollDraft = raw;
      state.pollErrors = res.errors;
      render();
      return;
    }
    const next = buildPoll(state.poll, res.value, newId);
    const changed = !state.poll || next.rev !== state.poll.rev;
    const hadVotes = state.poll && state.poll.options.some((o) => (o.votes || 0) > 0);
    if (changed && hadVotes && !win.confirm('Tu as changé les choix : les votes actuels seront remis à zéro. Continuer ?')) return;
    await persist(next, changed ? 'Nouveau sondage publié.' : 'Sondage enregistré.');
  }

  async function onToggle() {
    await persist({ ...state.poll, closed: !state.poll.closed }, state.poll.closed ? 'Sondage rouvert.' : 'Sondage fermé.');
  }

  async function onReset() {
    if (!win.confirm('Remettre tous les votes à zéro ?')) return;
    await persist({ ...state.poll, rev: (state.poll.rev || 0) + 1, options: state.poll.options.map((o) => ({ ...o, votes: 0 })) }, 'Votes remis à zéro.');
  }

  async function onDelete() {
    if (!win.confirm('Supprimer le sondage de la page d’accueil ?')) return;
    try {
      await backend.deletePoll();
      state.poll = null;
      state.view = 'list';
      render();
      showToast('Sondage supprimé.');
    } catch (e) {
      state.pollErrors = { form: 'Suppression refusée. Vérifie ta connexion.' };
      render();
    }
  }

  function renderAdmin() {
    const d = state.pollDraft || { question: '', optionsText: '' };
    const e = state.pollErrors;
    const p = state.poll;
    return h(
      'form',
      { class: 'panel', 'data-role': 'poll-form', novalidate: true, onsubmit: onSubmit },
      h('h2', {}, art(SMALL_ROSE, 'inline-art'), ' Sondage'),
      h('p', { class: 'hint' }, 'Les visiteurs votent sans compte, une voix par appareil. Modifier les choix remet les votes à zéro.'),
      field('Question', 'question', h('input', { class: 'input', name: 'question', value: d.question, maxlength: '200', autocomplete: 'off', placeholder: 'Ex. Quelle histoire dois-je écrire ensuite ?' }), e.question),
      field('Choix (un par ligne, de 2 à 8)', 'options', h('textarea', { class: 'input', name: 'options', rows: '5' }, d.optionsText), e.options),
      p ? h('p', { class: 'hint' }, `Votes actuels : ${p.options.reduce((a, o) => a + (o.votes || 0), 0)}${p.closed ? ' · sondage fermé' : ''}`) : null,
      e.form ? h('p', { class: 'state error', role: 'alert' }, e.form) : null,
      h(
        'div',
        { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'submit', 'data-action': 'save-poll' }, 'Enregistrer'),
        h('button', { class: 'btn', type: 'button', 'data-action': 'cancel-poll', onclick: () => { state.view = 'list'; render(); } }, 'Annuler'),
        p ? h('button', { class: 'btn', type: 'button', 'data-action': 'toggle-poll', onclick: onToggle }, p.closed ? 'Rouvrir' : 'Fermer le sondage') : null,
        p ? h('button', { class: 'btn', type: 'button', 'data-action': 'reset-poll', onclick: onReset }, 'Votes à zéro') : null,
        p ? h('button', { class: 'btn ghost danger', type: 'button', 'data-action': 'delete-poll', onclick: onDelete }, 'Supprimer') : null,
      ),
    );
  }

  return { load, open, renderPublic, renderAdmin };
}
