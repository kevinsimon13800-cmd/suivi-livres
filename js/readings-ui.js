// Interface « Mes lectures » : liste publique par état, gestion par le propriétaire, import Wattpad.
import {
  READING_STATES, STATE_SINGULAR, validateReading, moveReading, nextChapter, readingProgress,
  countByState, sortReadings, coverSrc, isWattpadCoverUrl, countFavorites,
} from './readings.js?v=7';
import { importFromWattpad, parseWattpadLink } from './wattpad.js?v=7';
import { formatDateFR, isValidCover } from './logic.js?v=7';
import { COVER_PLACEHOLDER } from './art.js?v=7';

const PENDING_KEY = 'suivi-livres:import-wattpad';

export function createReadingsUI({
  state, backend, win, doc, h, art, field, render, showToast, canEdit, isOwner, today, compressCover, fetchImpl,
}) {
  const emptyDraft = () => ({
    title: '', author: '', status: 'a-lire', rating: 0, chapter: 0, chaptersTotal: 0, startedAt: '', finishedAt: '',
    review: '', url: '', cover: '', source: 'manuel', storyCompleted: false, favorite: false,
  });

  // ---------- Chargement ----------

  async function load() {
    try {
      const list = await backend.listReadings();
      state.readings = sortReadings(list);
      state.readingsError = '';
    } catch (e) {
      state.readingsError = 'Impossible de charger les lectures.';
    }
  }

  const rerenderKeepScroll = () => {
    const y = win.scrollY || 0;
    render();
    win.scrollTo?.(0, y);
  };

  // ---------- Paramètre ?import= (raccourci iPhone / favori) ----------

  function session() {
    try { return win.sessionStorage; } catch (e) { return null; }
  }

  function takeImportParam() {
    let value = '';
    const search = String(win.location.search || '');
    const i = search.indexOf('import=');
    if (i >= 0) {
      const raw = search.slice(i + 'import='.length);
      try { value = decodeURIComponent(raw.replace(/\+/g, ' ')); } catch (e) { value = raw; }
      try {
        win.history?.replaceState?.(null, '', win.location.pathname + (win.location.hash || ''));
      } catch (e) { /* ignore */ }
      try { session()?.setItem(PENDING_KEY, value); } catch (e) { /* ignore */ }
    } else {
      try { value = session()?.getItem(PENDING_KEY) || ''; } catch (e) { value = ''; }
    }
    return parseWattpadLink(value) ? value : '';
  }

  function clearPending() {
    state.pendingImport = '';
    try { session()?.removeItem(PENDING_KEY); } catch (e) { /* ignore */ }
  }

  const findDuplicate = (url) => state.readings.find((r) => r.url && url && r.url === url);

  // « hop, elle apparaît » : import + ajout direct dans « À lire »
  async function autoImport() {
    const text = state.pendingImport;
    clearPending();
    if (!text || !canEdit()) return;
    if (win.location.hash !== '#/lectures') win.location.hash = '#/lectures';
    state.view = 'list';
    state.readingView = 'list';
    showToast('Import Wattpad en cours…');
    try {
      const story = await importFromWattpad(text, fetchImpl);
      const dup = findDuplicate(story.url);
      if (dup) {
        state.highlightReading = dup.id;
        state.readingFilter = dup.status;
        render();
        showToast(`« ${dup.title} » est déjà dans tes lectures (${STATE_SINGULAR[dup.status]}).`);
        return;
      }
      const value = { ...emptyDraft(), ...fromStory(story), status: 'a-lire' };
      const id = await backend.saveReading(value);
      await load();
      state.highlightReading = id;
      state.readingFilter = 'a-lire';
      render();
      showToast(`« ${value.title} » ajouté à « À lire ».`);
    } catch (e) {
      state.readingView = 'import';
      state.importText = text;
      state.importError = e && e.message ? e.message : 'Import impossible.';
      render();
    }
  }

  function fromStory(story) {
    return {
      title: story.title,
      author: story.author,
      url: story.url,
      cover: isWattpadCoverUrl(story.cover) ? story.cover : '',
      chaptersTotal: story.chaptersTotal || 0,
      storyCompleted: !!story.storyCompleted,
      review: '',
      source: 'wattpad',
      description: story.description || '',
    };
  }

  // ---------- Actions ----------

  async function persist(next, toast) {
    try {
      const { id, title, author, status, rating, chapter, chaptersTotal, startedAt, finishedAt, review, url, cover, source, storyCompleted } = next;
      const favorite = next.favorite === true;
      await backend.saveReading({ id, title, author, status, rating, chapter, chaptersTotal, startedAt, finishedAt, review, url, cover, source, storyCompleted, favorite });
      const i = state.readings.findIndex((r) => r.id === next.id);
      if (i >= 0) state.readings[i] = { ...state.readings[i], ...next, updatedAt: new Date().toISOString() };
      state.readings = sortReadings(state.readings);
      rerenderKeepScroll();
      if (toast) showToast(toast);
    } catch (e) {
      showToast('Modification refusée. Vérifie ta connexion.');
    }
  }

  const onMove = (r, status) => {
    state.highlightReading = r.id;
    return persist(moveReading(r, status, today()), `« ${r.title} » → ${STATE_SINGULAR[status]}`);
  };
  const onNextChapter = (r) => persist(nextChapter(r), null);
  const onToggleFavorite = (r) => persist({ ...r, favorite: r.favorite !== true }, r.favorite === true ? `« ${r.title} » retiré des favoris.` : `« ${r.title} » ajouté aux favoris ♥`);

  async function onDelete(r) {
    if (!win.confirm(`Retirer « ${r.title} » de tes lectures ? Cette action est définitive.`)) return;
    try {
      await backend.deleteReading(r.id);
      state.readings = state.readings.filter((x) => x.id !== r.id);
      rerenderKeepScroll();
      showToast('Lecture retirée.');
    } catch (e) {
      showToast('Suppression refusée.');
    }
  }

  function openForm(r, preset) {
    state.readingEditing = r || null;
    state.readingDraft = r ? { ...emptyDraft(), ...r } : { ...emptyDraft(), ...(preset || {}) };
    state.readingErrors = {};
    state.readingCoverError = '';
    state.readingCoverBusy = false;
    state.readingView = 'form';
    render();
    win.scrollTo?.(0, 0);
  }

  function openImport() {
    state.readingView = 'import';
    state.importError = '';
    state.importBusy = false;
    render();
    win.scrollTo?.(0, 0);
  }

  const backToList = () => {
    state.readingView = 'list';
    state.readingEditing = null;
    render();
  };

  // ---------- Rendu : liste ----------

  function stars(n) {
    const v = Math.max(0, Math.min(5, Number(n) || 0));
    if (!v) return null;
    return h('span', { class: 'stars', role: 'img', 'aria-label': `Note : ${v} sur 5` }, '★'.repeat(v), h('span', { class: 'off' }, '★'.repeat(5 - v)));
  }

  function renderCover(r) {
    const src = coverSrc(r.cover);
    if (src) return h('div', { class: 'r-cover' }, h('img', { src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }));
    return art(COVER_PLACEHOLDER, 'r-cover placeholder');
  }

  function renderCard(r) {
    const owner = canEdit();
    const pct = readingProgress(r);
    const others = READING_STATES.filter((s) => s.id !== r.status);
    return h(
      'article',
      { class: `reading${state.highlightReading === r.id ? ' flash' : ''}${r.favorite ? ' is-fav' : ''}`, 'data-reading': r.id },
      renderCover(r),
      h(
        'div',
        { class: 'r-body' },
        h('div', { class: 'card-head' },
          h('h3', {}, r.title),
          h('div', { class: 'head-right' },
            owner
              ? h('button', {
                  class: `fav-btn${r.favorite ? ' on' : ''}`, type: 'button', 'data-action': 'toggle-favorite',
                  'aria-pressed': r.favorite ? 'true' : 'false', 'aria-label': r.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
                  title: r.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', onclick: () => onToggleFavorite(r),
                }, r.favorite ? '♥' : '♡')
              : (r.favorite ? h('span', { class: 'fav-badge', role: 'img', 'aria-label': 'Coup de cœur', title: 'Coup de cœur' }, '♥') : null),
            h('span', { class: `badge rs-${r.status}` }, STATE_SINGULAR[r.status] || r.status))),
        r.author ? h('p', { class: 'r-author' }, `de ${r.author}`) : null,
        h('div', { class: 'r-line' },
          stars(r.rating),
          r.url ? h('a', { class: 'wp-link', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, 'Wattpad ↗') : null,
          r.source === 'wattpad' && r.chaptersTotal ? h('span', { class: 'hint' }, r.storyCompleted ? 'histoire terminée' : 'histoire en cours d’écriture') : null),
        pct !== null && r.status !== 'a-lire'
          ? h('div', { class: 'r-progress' },
              h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
                h('div', { class: 'bar-fill', style: `width:${pct}%` })),
              h('span', { class: 'hint' }, `Chapitre ${r.chapter || 0}/${r.chaptersTotal}`))
          : (r.status === 'a-lire' && r.chaptersTotal ? h('p', { class: 'hint' }, `${r.chaptersTotal} chapitres`) : null),
        r.startedAt || r.finishedAt
          ? h('p', { class: 'date' },
              r.startedAt ? `Commencé le ${formatDateFR(r.startedAt)}` : '',
              r.startedAt && r.finishedAt ? ' · ' : '',
              r.finishedAt ? `Terminé le ${formatDateFR(r.finishedAt)}` : '')
          : null,
        r.review ? h('p', { class: 'r-review' }, r.review) : null,
        owner
          ? h('div', { class: 'card-actions' },
              r.status === 'en-cours' ? h('button', { class: 'btn small', 'data-action': 'next-chapter', onclick: () => onNextChapter(r) }, '+1 chapitre') : null,
              others.map((s) => h('button', { class: `btn small${s.id === 'terminee' ? ' ok' : ''}`, 'data-move': s.id, onclick: () => onMove(r, s.id) },
                s.id === 'terminee' ? 'Terminé ✓' : s.id === 'en-cours' ? (r.status === 'terminee' ? 'Relire' : 'Commencer') : 'À lire')),
              h('button', { class: 'btn small ghost', 'data-action': 'edit-reading', onclick: () => openForm(r) }, 'Modifier'),
              h('button', { class: 'btn small danger', 'data-action': 'delete-reading', onclick: () => onDelete(r) }, 'Retirer'))
          : null,
      ),
    );
  }

  function renderList() {
    const counts = countByState(state.readings);
    const total = state.readings.length;
    let filter = state.readingFilter;
    if (!filter) filter = counts['en-cours'] ? 'en-cours' : counts['a-lire'] ? 'a-lire' : counts.terminee ? 'terminee' : 'all';
    const favCount = countFavorites(state.readings);
    if (filter === 'favoris' && !favCount) filter = 'all';
    const shown = filter === 'all' ? state.readings : filter === 'favoris' ? state.readings.filter((r) => r.favorite === true) : state.readings.filter((r) => r.status === filter);
    const owner = canEdit();
    return h(
      'section',
      { class: 'readings', 'data-role': 'readings' },
      owner
        ? h('div', { class: 'toolbar center' },
            h('button', { class: 'btn primary', 'data-action': 'wattpad-import', onclick: openImport }, '⇣ Importer depuis Wattpad'),
            h('button', { class: 'btn', 'data-action': 'add-reading', onclick: () => openForm(null) }, '+ Ajouter à la main'))
        : null,
      state.readingsError ? h('p', { class: 'state error', role: 'alert' }, state.readingsError) : null,
      total
        ? h('div', { class: 'seg', role: 'tablist', 'aria-label': 'États' },
            [...READING_STATES, ...(favCount ? [{ id: 'favoris', label: '♥ Favoris' }] : []), { id: 'all', label: 'Toutes', icon: '' }].map((s) => h('button', {
              class: `seg-btn${filter === s.id ? ' on' : ''}`, role: 'tab', 'aria-selected': filter === s.id ? 'true' : 'false', 'data-filter': s.id,
              onclick: () => { state.readingFilter = s.id; state.highlightReading = ''; rerenderKeepScroll(); },
            }, `${s.label} `, h('span', { class: 'count' }, String(s.id === 'all' ? total : s.id === 'favoris' ? favCount : counts[s.id])))))
        : null,
      !total && !state.readingsError
        ? h('p', { class: 'state' }, owner ? 'Aucune lecture pour l’instant. Importe une histoire Wattpad ou ajoute un livre à la main.' : 'Aucune lecture partagée pour l’instant.')
        : shown.length
          ? h('div', { class: 'reading-list' }, shown.map(renderCard))
          : total ? h('p', { class: 'state' }, 'Rien dans cette catégorie.') : null,
    );
  }

  // ---------- Rendu : formulaire ----------

  function readForm(form) {
    const f = form.elements;
    return {
      title: f.title.value,
      author: f.author.value,
      status: f.status.value,
      rating: f.rating.value,
      chapter: f.chapter.value,
      chaptersTotal: f.chaptersTotal.value,
      startedAt: f.startedAt.value,
      finishedAt: f.finishedAt.value,
      review: f.review.value,
      url: f.url.value,
      favorite: f.favorite.checked,
    };
  }

  async function onCoverChosen(ev) {
    const form = ev.target.form;
    const file = ev.target.files && ev.target.files[0];
    state.readingDraft = { ...state.readingDraft, ...readForm(form) };
    if (!file) return;
    state.readingCoverError = '';
    state.readingCoverBusy = true;
    render();
    try {
      if (!compressCover) throw new Error('indisponible');
      const data = await compressCover(file);
      if (!isValidCover(data)) throw new Error('invalide');
      state.readingDraft.cover = data;
    } catch (e) {
      state.readingCoverError = e && e.message === 'pas-une-image' ? 'Ce fichier n’est pas une image.' : 'Impossible d’utiliser cette image.';
    }
    state.readingCoverBusy = false;
    render();
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    if (state.readingCoverBusy) return;
    const d = state.readingDraft;
    const raw = { ...readForm(ev.target), cover: d.cover || '', source: d.source, storyCompleted: d.storyCompleted };
    const res = validateReading(raw);
    if (!res.ok) {
      state.readingDraft = { ...d, ...raw };
      state.readingErrors = res.errors;
      render();
      return;
    }
    let value = res.value;
    const prev = state.readingEditing;
    if (!prev || prev.status !== value.status) value = moveReading(value, value.status, today());
    try {
      const id = await backend.saveReading({ ...value, id: prev ? prev.id : undefined });
      await load();
      state.highlightReading = id;
      state.readingFilter = value.status;
      state.readingView = 'list';
      state.readingEditing = null;
      render();
      showToast(prev ? 'Lecture modifiée.' : `Ajouté à « ${STATE_SINGULAR[value.status]} ».`);
    } catch (e) {
      state.readingDraft = { ...d, ...raw };
      state.readingErrors = { form: 'Enregistrement refusé. Vérifie ta connexion.' };
      render();
    }
  }

  function renderForm() {
    const d = state.readingDraft;
    const e = state.readingErrors;
    const src = coverSrc(d.cover);
    const rating = Number(d.rating) || 0;
    return h(
      'form',
      { class: 'panel', 'data-role': 'reading-form', novalidate: true, onsubmit: onSubmit },
      h('h2', {}, state.readingEditing ? 'Modifier la lecture' : d.source === 'wattpad' ? 'Importé depuis Wattpad' : 'Ajouter une lecture'),
      d.source === 'wattpad' && !state.readingEditing ? h('p', { class: 'hint' }, 'Vérifie les infos, choisis l’état, puis enregistre.') : null,
      h('div', { class: 'cover-field' },
        h('div', { class: 'cover-preview' }, src ? h('img', { src, alt: 'Couverture', referrerpolicy: 'no-referrer' }) : art(COVER_PLACEHOLDER, 'cover placeholder small')),
        h('div', { class: 'cover-actions' },
          h('span', { class: 'label' }, 'Couverture'),
          h('label', { class: 'btn small file-btn' }, src ? 'Changer la photo' : 'Choisir une photo',
            h('input', { type: 'file', accept: 'image/*', 'data-role': 'reading-cover-input', onchange: onCoverChosen })),
          src ? h('button', { class: 'btn small ghost', type: 'button', 'data-action': 'remove-reading-cover',
            onclick: (ev) => { state.readingDraft = { ...state.readingDraft, ...readForm(ev.target.form), cover: '' }; render(); } }, 'Retirer') : null,
          state.readingCoverBusy ? h('span', { class: 'hint', role: 'status' }, 'Préparation de l’image…') : null,
          state.readingCoverError ? h('span', { class: 'err', role: 'alert' }, state.readingCoverError) : null,
          e.cover ? h('span', { class: 'err', role: 'alert' }, e.cover) : null)),
      field('Titre', 'title', h('input', { class: 'input', name: 'title', value: d.title, maxlength: '150', autocomplete: 'off' }), e.title),
      h('div', { class: 'row' },
        field('Auteur', 'author', h('input', { class: 'input', name: 'author', value: d.author || '', maxlength: '100' }), e.author),
        field('État', 'status', h('select', { class: 'input', name: 'status' },
          READING_STATES.map((s) => h('option', { value: s.id, selected: s.id === d.status }, STATE_SINGULAR[s.id]))), e.status)),
      h('fieldset', { class: 'rating-field' },
        h('legend', { class: 'label' }, 'Ma note'),
        h('div', { class: 'rating-input' },
          [0, 1, 2, 3, 4, 5].map((n) => h('label', { class: `star-opt${n === 0 ? ' none' : ''}`, title: n ? `${n} sur 5` : 'Pas de note' },
            h('input', { type: 'radio', name: 'rating', value: String(n), checked: rating === n }),
            h('span', { 'aria-hidden': 'true' }, n ? '★' : '—'),
            h('span', { class: 'sr' }, n ? `${n} étoile${n > 1 ? 's' : ''}` : 'Pas de note')))),
        e.rating ? h('span', { class: 'err', role: 'alert' }, e.rating) : null),
      h('div', { class: 'row' },
        field('Chapitre en cours', 'chapter', h('input', { class: 'input', name: 'chapter', type: 'number', min: '0', inputmode: 'numeric', value: d.chapter || 0 }), e.chapter),
        field('Nombre de chapitres', 'chaptersTotal', h('input', { class: 'input', name: 'chaptersTotal', type: 'number', min: '0', inputmode: 'numeric', value: d.chaptersTotal || 0 }), e.chaptersTotal)),
      h('div', { class: 'row' },
        field('Commencé le', 'startedAt', h('input', { class: 'input', name: 'startedAt', type: 'date', value: d.startedAt || '' }), e.startedAt),
        field('Terminé le', 'finishedAt', h('input', { class: 'input', name: 'finishedAt', type: 'date', value: d.finishedAt || '' }), e.finishedAt)),
      h('p', { class: 'hint' }, 'Les dates se remplissent toutes seules quand tu changes l’état (si elles sont vides).'),
      field('Mon avis', 'review', h('textarea', { class: 'input', name: 'review', rows: '4', maxlength: '3000', placeholder: 'Ce que j’en ai pensé, mes passages préférés…' }, d.review || ''), e.review, 'Visible par les visiteurs.'),
      h('label', { class: 'check fav-check' }, h('input', { type: 'checkbox', name: 'favorite', checked: d.favorite === true }), h('span', {}, '♥ Mettre dans mes favoris')),
      field('Lien Wattpad (facultatif)', 'url', h('input', { class: 'input', name: 'url', type: 'url', value: d.url || '', placeholder: 'https://www.wattpad.com/story/…' }), e.url),
      e.form ? h('p', { class: 'state error', role: 'alert' }, e.form) : null,
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'submit', 'data-action': 'save-reading', disabled: state.readingCoverBusy }, 'Enregistrer'),
        h('button', { class: 'btn', type: 'button', 'data-action': 'cancel-reading', onclick: backToList }, 'Annuler')),
    );
  }

  // ---------- Rendu : import Wattpad ----------

  async function onImport(ev) {
    ev.preventDefault();
    const text = ev.target.elements.link.value;
    state.importText = text;
    state.importError = '';
    state.importBusy = true;
    render();
    try {
      const story = await importFromWattpad(text, fetchImpl);
      state.importBusy = false;
      const dup = findDuplicate(story.url);
      if (dup) {
        state.importError = `« ${dup.title} » est déjà dans tes lectures (${STATE_SINGULAR[dup.status]}).`;
        render();
        return;
      }
      state.importText = '';
      openForm(null, { ...fromStory(story), status: 'a-lire' });
    } catch (e) {
      state.importBusy = false;
      state.importError = e && e.message ? e.message : 'Import impossible.';
      render();
    }
  }

  async function onPaste(ev) {
    const input = ev.target.form.elements.link;
    try {
      const t = await win.navigator.clipboard.readText();
      input.value = t;
      state.importText = t;
      if (parseWattpadLink(t)) ev.target.form.requestSubmit?.();
    } catch (e) {
      input.focus();
      state.importError = 'Collage automatique refusé : appuie longuement dans le champ puis « Coller ».';
      render();
    }
  }

  function renderImport() {
    const base = win.location.origin + win.location.pathname;
    const bookmarklet = `javascript:location.href='${base}?import='+encodeURIComponent(location.href)`;
    return h(
      'div',
      { class: 'import-view' },
      h('form', { class: 'panel', 'data-role': 'import-form', novalidate: true, onsubmit: onImport },
        h('h2', {}, 'Importer depuis Wattpad'),
        h('ol', { class: 'steps' },
          h('li', {}, h('a', { class: 'btn small', href: 'https://www.wattpad.com/', target: '_blank', rel: 'noopener noreferrer', 'data-action': 'open-wattpad' }, 'Ouvrir Wattpad ↗'), ' et choisis l’histoire.'),
          h('li', {}, 'Touche ', h('strong', {}, 'Partager → Copier le lien'), '.'),
          h('li', {}, 'Reviens ici et touche ', h('strong', {}, 'Coller'), ' : la fiche se remplit toute seule.')),
        h('div', { class: 'paste-row' },
          h('input', { class: 'input', name: 'link', value: state.importText, placeholder: 'Lien de l’histoire Wattpad', autocomplete: 'off', 'aria-label': 'Lien Wattpad' }),
          h('button', { class: 'btn', type: 'button', 'data-action': 'paste', onclick: onPaste }, '📋 Coller')),
        state.importBusy ? h('p', { class: 'hint', role: 'status' }, 'Lecture de l’histoire sur Wattpad…') : null,
        state.importError ? h('p', { class: 'state error', role: 'alert' }, state.importError) : null,
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn primary', type: 'submit', 'data-action': 'do-import', disabled: state.importBusy }, 'Importer'),
          h('button', { class: 'btn', type: 'button', onclick: () => openForm(null) }, 'Ajouter à la main'),
          h('button', { class: 'btn ghost', type: 'button', 'data-action': 'cancel-import', onclick: backToList }, 'Annuler'))),
      h('details', { class: 'panel help', 'data-role': 'shortcut-help' },
        h('summary', {}, '⚡ En un seul geste depuis l’app Wattpad (iPhone)'),
        h('p', {}, 'Une fois ce raccourci créé, dans Wattpad tu touches ', h('strong', {}, 'Partager → Mes lectures'), ' : ton site s’ouvre et l’histoire est ajoutée directement dans « À lire ».'),
        h('ol', { class: 'steps' },
          h('li', {}, 'Ouvre l’app ', h('strong', {}, 'Raccourcis'), ', touche ', h('strong', {}, '+'), ' et nomme le raccourci « Mes lectures ».'),
          h('li', {}, 'Dans ses réglages (ⓘ), active ', h('strong', {}, 'Afficher dans la feuille de partage'), '.'),
          h('li', {}, 'Ajoute l’action ', h('strong', {}, 'Encoder en URL'), ' (sur « Entrée du raccourci »).'),
          h('li', {}, 'Ajoute l’action ', h('strong', {}, 'URL'), ' avec : ', h('code', { 'data-role': 'shortcut-url' }, `${base}?import=`), ' suivi de la variable « Texte encodé ».'),
          h('li', {}, 'Ajoute l’action ', h('strong', {}, 'Ouvrir les URL'), '.')),
        h('p', { class: 'hint' }, 'Les noms exacts des actions peuvent varier légèrement selon la version d’iOS. Si Wattpad ne propose pas ton raccourci dans « Partager », ouvre l’histoire dans Safari et partage depuis Safari.')),
      h('details', { class: 'panel help' },
        h('summary', {}, '💻 Sur ordinateur : bouton favori'),
        h('p', {}, 'Glisse ce bouton dans ta barre de favoris. Sur une histoire Wattpad, clique dessus : elle est ajoutée à « À lire ».'),
        h('a', { class: 'btn small', href: bookmarklet, 'data-role': 'bookmarklet', onclick: (ev) => { ev.preventDefault(); showToast('Glisse ce bouton dans ta barre de favoris.'); } }, '➕ Mes lectures')),
    );
  }

  function renderView() {
    if (canEdit() && state.readingView === 'form' && state.readingDraft) return renderForm();
    if (canEdit() && state.readingView === 'import') return renderImport();
    return renderList();
  }

  return { load, render: renderView, takeImportParam, autoImport, openForm, openImport };
}
