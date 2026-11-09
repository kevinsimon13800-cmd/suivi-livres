// Interface : vue publique (lecture seule) + espace propriétaire (connexion, livres, Notes-Idées).
// Le backend est injecté (Firebase en production, simulation en test).
import {
  STATUSES, progress, validateBook, validateNote, formatNumber, statusLabel,
  countdown, todayISO, filterBooks, collectFacets, isValidCover,
} from './logic.js?v=4';
import { createReadingStore } from './reading.js?v=4';
import { HERO_ART, SWORDS_DIVIDER, COVER_PLACEHOLDER, SMALL_ROSE } from './art.js?v=4';
import { createReadingsUI } from './readings-ui.js?v=4';
import { SOCIALS, normalizeSocial, safeSocialUrl, socialIconSvg, SOCIAL_WREATH } from './socials.js?v=4';

export function start({
  backend, root, ownerUid, shareUrl, doc = document, win = window,
  compressCover = null, storage, today = () => todayISO(),
  fetchImpl = (typeof win.fetch === 'function' ? win.fetch.bind(win) : null),
}) {
  const state = {
    user: null,
    books: [],
    profile: { displayName: 'Mes livres', bio: '' },
    view: 'list', // list | form | profile | share | notes
    editing: null, // livre en cours d'édition (null = nouveau)
    draft: null,
    formErrors: {},
    coverBusy: false,
    coverError: '',
    loginError: '',
    loading: true,
    loadError: '',
    saveError: '',
    preview: false, // "voir comme visiteur"
    filter: { q: '', genre: '', tag: '' },
    notes: [],
    notesLoading: false,
    notesError: '',
    noteEditing: null,
    noteDraft: { title: '', body: '', bookId: '' },
    noteErrors: {},
    // Mes lectures
    readings: [],
    readingsError: '',
    readingFilter: '',
    readingView: 'list', // list | form | import
    readingEditing: null,
    readingDraft: null,
    readingErrors: {},
    readingCoverBusy: false,
    readingCoverError: '',
    importText: '',
    importBusy: false,
    importError: '',
    pendingImport: '',
    highlightReading: '',
  };

  let localStore = storage;
  if (localStore === undefined) {
    try { localStore = win.localStorage; } catch (e) { localStore = null; }
  }
  const reading = createReadingStore(localStore);

  const isOwner = () => !!state.user && state.user.uid === ownerUid;
  const showLogin = () => win.location.hash === '#/admin' && !isOwner();
  const canEdit = () => isOwner() && !state.preview;

  function h(tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : doc.createTextNode(String(c)));
    }
    return el;
  }

  // Illustration constante (jamais de donnée utilisateur dedans)
  function art(svg, cls = 'art-wrap') {
    const d = doc.createElement('div');
    d.className = cls;
    d.innerHTML = svg;
    return d;
  }

  // Message temporaire, sans redessiner la page (pour ne pas effacer une saisie en cours)
  function showToast(msg) {
    root.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    (root.querySelector('main') || root).append(t);
    win.setTimeout(() => t.remove(), 2500);
  }

  async function refresh() {
    state.loading = true;
    render();
    try {
      const [books, profile] = await Promise.all([
        backend.listBooks({ publicOnly: !isOwner() }),
        backend.getProfile(),
      ]);
      state.books = [...books].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      if (profile) state.profile = { ...state.profile, ...profile };
      state.loadError = '';
    } catch (e) {
      state.loadError = 'Impossible de charger les données. Réessaie dans un instant.';
    }
    await readingsUI.load();
    state.loading = false;
    render();
  }

  const isReadingsTab = () => win.location.hash === '#/lectures';

  const go = (view) => {
    state.view = view;
    if (view !== 'list' && isReadingsTab()) win.location.hash = '';
    render();
    win.scrollTo?.(0, 0);
  };

  function renderTabs() {
    const onReadings = isReadingsTab();
    return h(
      'nav',
      { class: 'tabs', 'aria-label': 'Sections' },
      h('a', { class: `tab${onReadings ? '' : ' on'}`, href: '#', 'data-tab': 'books', 'aria-current': onReadings ? null : 'page',
        onclick: (e) => { e.preventDefault(); state.view = 'list'; win.location.hash = ''; render(); } }, '📚 Mes livres'),
      h('a', { class: `tab${onReadings ? ' on' : ''}`, href: '#/lectures', 'data-tab': 'readings', 'aria-current': onReadings ? 'page' : null,
        onclick: (e) => { e.preventDefault(); state.view = 'list'; win.location.hash = '#/lectures'; render(); } }, '📖 Mes lectures'),
    );
  }

  // ---------- En-tête ----------

  function renderHeader() {
    const owner = canEdit();
    return h(
      'header',
      { class: 'hero' },
      art(HERO_ART, 'hero-art'),
      h('h1', {}, state.profile.displayName || 'Mes livres'),
      state.profile.bio ? h('p', { class: 'bio' }, state.profile.bio) : null,
      renderSocials(),
      art(SWORDS_DIVIDER, 'divider'),
      renderTabs(),
      owner
        ? h(
            'nav',
            { class: 'toolbar', 'aria-label': 'Espace auteur' },
            h('button', { class: 'btn primary', 'data-action': 'add', onclick: () => openForm(null) }, '+ Nouveau livre'),
            h('button', { class: `btn${state.view === 'notes' ? ' active' : ''}`, 'data-action': 'notes', onclick: openNotes }, '✎ Notes-Idées'),
            h('button', { class: 'btn', 'data-action': 'profile', onclick: () => { state.profileDraft = null; state.profileErrors = {}; state.saveError = ''; go('profile'); } }, 'Mon profil'),
            h('button', { class: 'btn', 'data-action': 'share', onclick: onShare }, 'Lien de partage'),
            h('button', { class: 'btn', 'data-action': 'preview', onclick: () => ((state.preview = true), go('list')) }, 'Voir comme visiteur'),
            h('button', { class: 'btn ghost', 'data-action': 'logout', onclick: () => backend.logout() }, 'Déconnexion'),
          )
        : null,
      isOwner() && state.preview
        ? h(
            'div',
            { class: 'toolbar' },
            h('span', { class: 'pill' }, 'Aperçu visiteur'),
            h('button', { class: 'btn', 'data-action': 'end-preview', onclick: () => ((state.preview = false), render()) }, 'Revenir à mon espace'),
          )
        : null,
    );
  }

  async function onShare() {
    try {
      await win.navigator.clipboard.writeText(shareUrl);
      showToast('Lien copié.');
    } catch (e) {
      go('share');
    }
  }

  function renderShare() {
    return h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Lien de partage'),
      h('p', {}, 'Toute personne disposant de ce lien voit tes livres publics, en lecture seule.'),
      h('input', { class: 'input', readonly: true, value: shareUrl, 'data-role': 'share-url', onfocus: (e) => e.target.select() }),
      h('div', { class: 'toolbar' }, h('button', { class: 'btn', onclick: () => go('list') }, 'Fermer')),
    );
  }

  // ---------- Liste des livres ----------

  const visibleBooks = () => (state.preview ? state.books.filter((b) => b.public) : state.books);

  function renderCover(b) {
    if (isValidCover(b.cover)) {
      return h('div', { class: 'cover' }, h('img', { src: b.cover, alt: `Couverture de « ${b.title} »`, loading: 'lazy', decoding: 'async' }));
    }
    const ph = art(COVER_PLACEHOLDER, 'cover placeholder');
    ph.append(h('span', { class: 'cover-title' }, b.title));
    return ph;
  }

  function renderReader(b) {
    // Coches de lecture du visiteur (enregistrées sur son appareil uniquement)
    const chapters = Array.isArray(b.chapterTitles) ? b.chapterTitles : [];
    const countEl = h('span', { class: 'read-count' });
    const updateCount = () => {
      countEl.textContent = `${reading.countRead(b.id, chapters.length)}/${chapters.length} lus`;
    };
    updateCount();
    return h(
      'div',
      { class: 'reader', 'data-role': 'reader' },
      h(
        'label',
        { class: 'check read-book' },
        h('input', {
          type: 'checkbox',
          'data-role': 'book-read',
          checked: reading.isBookRead(b.id),
          onchange: (e) => {
            reading.setBookRead(b.id, e.target.checked);
            e.target.closest('.card')?.classList.toggle('is-read', e.target.checked);
          },
        }),
        h('span', {}, 'J’ai lu ce livre'),
      ),
      chapters.length
        ? h(
            'details',
            { class: 'chapters' },
            h('summary', {}, 'Chapitres · ', countEl),
            h(
              'ol',
              {},
              chapters.map((title, i) => h(
                'li',
                {},
                h(
                  'label',
                  { class: 'check' },
                  h('input', {
                    type: 'checkbox',
                    'data-role': 'chapter-read',
                    'data-index': String(i),
                    checked: reading.isChapterRead(b.id, i),
                    onchange: (e) => { reading.setChapterRead(b.id, i, e.target.checked); updateCount(); },
                  }),
                  h('span', {}, title),
                ),
              )),
            ),
          )
        : null,
    );
  }

  function renderBookCard(b) {
    const pct = progress(b);
    const owner = canEdit();
    const cd = countdown(b.releaseDate, today());
    const tags = Array.isArray(b.tags) ? b.tags : [];
    const chapters = Array.isArray(b.chapterTitles) ? b.chapterTitles : [];
    const readFlag = !owner && reading.isBookRead(b.id);
    return h(
      'article',
      { class: `card${readFlag ? ' is-read' : ''}`, 'data-book': b.id },
      renderCover(b),
      h(
        'div',
        { class: 'card-body' },
        h(
          'div',
          { class: 'card-head' },
          h('h3', {}, b.title),
          h('span', { class: `badge st-${b.status}` }, statusLabel(b.status)),
        ),
        b.genre ? h('p', { class: 'genre' }, b.genre) : null,
        cd ? h('p', { class: `countdown${cd.past ? ' past' : ''}`, 'data-role': 'countdown' }, cd.label) : null,
        tags.length
          ? h('div', { class: 'tags' }, tags.map((t) => h('button', {
              class: `tag${state.filter.tag === t ? ' on' : ''}`, type: 'button', 'data-tag': t,
              onclick: () => setFilter({ tag: state.filter.tag === t ? '' : t }),
            }, `#${t}`)))
          : null,
        b.synopsis ? h('p', { class: 'synopsis' }, b.synopsis) : null,
        h(
          'div',
          { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
          h('div', { class: 'bar-fill', style: `width:${pct}%` }),
        ),
        h(
          'p',
          { class: 'meta' },
          h('strong', {}, `${pct} %`),
          b.goalWords > 0
            ? ` · ${formatNumber(b.words)} / ${formatNumber(b.goalWords)} mots`
            : b.words > 0
              ? ` · ${formatNumber(b.words)} mots`
              : '',
          b.chaptersTotal > 0 ? ` · ${b.chaptersDone}/${b.chaptersTotal} chapitres` : '',
        ),
        owner
          ? (chapters.length ? h('p', { class: 'date' }, `${chapters.length} titre${chapters.length > 1 ? 's' : ''} de chapitre visible${chapters.length > 1 ? 's' : ''} par les lecteurs`) : null)
          : renderReader(b),
        b.updatedAt ? h('p', { class: 'date' }, `Mis à jour le ${new Date(b.updatedAt).toLocaleDateString('fr-FR')}`) : null,
        owner
          ? h(
              'div',
              { class: 'card-actions' },
              !b.public ? h('span', { class: 'pill private' }, 'Privé') : null,
              h('button', { class: 'btn small', 'data-action': 'edit', onclick: () => openForm(b) }, 'Modifier'),
              h('button', { class: 'btn small danger', 'data-action': 'delete', onclick: () => onDelete(b) }, 'Supprimer'),
            )
          : null,
      ),
    );
  }

  function setFilter(patch) {
    state.filter = { ...state.filter, ...patch };
    const filters = root.querySelector('[data-role="filters"]');
    if (filters) filters.replaceWith(renderFilters());
    updateGrid();
  }

  function renderFilters() {
    const books = visibleBooks();
    const { genres, tags } = collectFacets(books);
    const f = state.filter;
    return h(
      'div',
      { class: 'filters', 'data-role': 'filters' },
      h('input', {
        class: 'input search', type: 'search', placeholder: 'Rechercher un titre, un genre…', 'aria-label': 'Rechercher',
        value: f.q, 'data-role': 'search',
        oninput: (e) => { state.filter.q = e.target.value; updateGrid(); },
      }),
      genres.length
        ? h(
            'select',
            { class: 'input', 'aria-label': 'Genre', 'data-role': 'genre-filter', onchange: (e) => setFilter({ genre: e.target.value }) },
            h('option', { value: '' }, 'Tous les genres'),
            genres.map((g) => h('option', { value: g, selected: g === f.genre }, g)),
          )
        : null,
      tags.length
        ? h('div', { class: 'tags' }, tags.map((t) => h('button', {
            class: `tag${f.tag === t ? ' on' : ''}`, type: 'button', 'data-tag': t, 'aria-pressed': f.tag === t ? 'true' : 'false',
            onclick: () => setFilter({ tag: f.tag === t ? '' : t }),
          }, `#${t}`)))
        : null,
    );
  }

  function renderGrid() {
    const all = visibleBooks();
    const shown = filterBooks(all, state.filter);
    if (!shown.length) {
      return h(
        'div',
        { 'data-role': 'grid' },
        h('p', { class: 'state' }, 'Aucun livre ne correspond à ta recherche. '),
        h('button', { class: 'btn small', 'data-action': 'clear-filters', onclick: () => setFilter({ q: '', genre: '', tag: '' }) }, 'Tout afficher'),
      );
    }
    return h('section', { class: 'grid', 'data-role': 'grid' }, shown.map(renderBookCard));
  }

  function updateGrid() {
    const grid = root.querySelector('[data-role="grid"]');
    if (grid) grid.replaceWith(renderGrid());
  }

  function renderList() {
    const visible = visibleBooks();
    if (state.loading) return h('p', { class: 'state' }, 'Chargement…');
    if (state.loadError) return h('p', { class: 'state error', role: 'alert' }, state.loadError);
    if (!visible.length) {
      return h('p', { class: 'state' }, canEdit() ? 'Aucun livre pour l’instant. Ajoute le premier avec « + Nouveau livre ».' : 'Aucun livre à afficher pour l’instant.');
    }
    return h(
      'div',
      { class: 'list' },
      visible.length > 1 ? renderFilters() : null,
      renderGrid(),
      !canEdit() && visible.some((b) => (b.chapterTitles || []).length)
        ? h('p', { class: 'hint center' }, reading.persistent
          ? 'Tes coches de lecture sont gardées sur cet appareil uniquement.'
          : 'Ton navigateur bloque l’enregistrement : tes coches seront perdues en fermant la page.')
        : null,
    );
  }

  // ---------- Formulaire livre ----------

  function field(label, name, control, error, hint) {
    return h(
      'label',
      { class: 'field' },
      h('span', { class: 'label' }, label),
      control,
      hint ? h('span', { class: 'hint' }, hint) : null,
      error ? h('span', { class: 'err', role: 'alert' }, error) : null,
    );
  }

  function openForm(book) {
    state.editing = book;
    state.formErrors = {};
    state.saveError = '';
    state.coverError = '';
    state.coverBusy = false;
    state.draft = book
      ? {
          ...book,
          tags: (book.tags || []).join(', '),
          chapterTitles: (book.chapterTitles || []).join('\n'),
          releaseDate: book.releaseDate || '',
          cover: book.cover || '',
        }
      : {
          title: '', status: 'idee', genre: '', synopsis: '', words: 0, goalWords: 0, chaptersDone: 0, chaptersTotal: 0,
          public: false, tags: '', chapterTitles: '', releaseDate: '', cover: '',
        };
    go('form');
  }

  async function onCoverChosen(ev) {
    const form = ev.target.form;
    const file = ev.target.files && ev.target.files[0];
    state.draft = { ...state.draft, ...readForm(form) };
    if (!file) return;
    state.coverError = '';
    state.coverBusy = true;
    render();
    try {
      if (!compressCover) throw new Error('indisponible');
      const data = await compressCover(file);
      if (!isValidCover(data)) throw new Error('invalide');
      state.draft.cover = data;
    } catch (e) {
      state.coverError = e && e.message === 'pas-une-image'
        ? 'Ce fichier n’est pas une image.'
        : 'Impossible d’utiliser cette image. Essaie une photo JPEG ou PNG.';
    }
    state.coverBusy = false;
    render();
  }

  function renderCoverField() {
    const d = state.draft;
    const has = isValidCover(d.cover);
    return h(
      'div',
      { class: 'cover-field' },
      h('div', { class: 'cover-preview' }, has ? h('img', { src: d.cover, alt: 'Aperçu de la couverture' }) : art(COVER_PLACEHOLDER, 'cover placeholder small')),
      h(
        'div',
        { class: 'cover-actions' },
        h('span', { class: 'label' }, 'Couverture'),
        h(
          'label',
          { class: 'btn small file-btn' },
          has ? 'Changer la photo' : 'Choisir une photo',
          h('input', { type: 'file', accept: 'image/*', name: 'coverFile', 'data-role': 'cover-input', onchange: onCoverChosen }),
        ),
        has
          ? h('button', {
              class: 'btn small ghost', type: 'button', 'data-action': 'remove-cover',
              onclick: (e) => { state.draft = { ...state.draft, ...readForm(e.target.form), cover: '' }; render(); },
            }, 'Retirer')
          : null,
        state.coverBusy ? h('span', { class: 'hint', role: 'status' }, 'Préparation de l’image…') : null,
        state.coverError ? h('span', { class: 'err', role: 'alert' }, state.coverError) : null,
        state.formErrors.cover ? h('span', { class: 'err', role: 'alert' }, state.formErrors.cover) : null,
        h('span', { class: 'hint' }, 'La photo est réduite automatiquement (format portrait conseillé).'),
      ),
    );
  }

  function renderForm() {
    const d = state.draft;
    const e = state.formErrors;
    return h(
      'form',
      { class: 'panel', 'data-role': 'book-form', novalidate: true, onsubmit: onSubmitBook },
      h('h2', {}, state.editing ? 'Modifier le livre' : 'Nouveau livre'),
      renderCoverField(),
      field('Titre', 'title', h('input', { class: 'input', name: 'title', value: d.title, maxlength: '120', autocomplete: 'off' }), e.title),
      h(
        'div',
        { class: 'row' },
        field(
          'Étape',
          'status',
          h('select', { class: 'input', name: 'status' }, STATUSES.map((s) => h('option', { value: s.id, selected: s.id === d.status }, s.label))),
          e.status,
        ),
        field('Date de sortie prévue', 'releaseDate', h('input', { class: 'input', name: 'releaseDate', type: 'date', value: d.releaseDate || '' }), e.releaseDate, 'Affiche un compte à rebours.'),
      ),
      h(
        'div',
        { class: 'row' },
        field('Genre', 'genre', h('input', { class: 'input', name: 'genre', value: d.genre || '', maxlength: '60', placeholder: 'Ex. Fantasy' }), e.genre),
        field('Étiquettes', 'tags', h('input', { class: 'input', name: 'tags', value: d.tags || '', placeholder: 'Ex. Grèce antique, romance' }), e.tags, 'Séparées par des virgules.'),
      ),
      field('Synopsis', 'synopsis', h('textarea', { class: 'input', name: 'synopsis', rows: '3', maxlength: '1500' }, d.synopsis || ''), e.synopsis),
      h(
        'div',
        { class: 'row' },
        field('Mots écrits', 'words', h('input', { class: 'input', name: 'words', type: 'number', min: '0', inputmode: 'numeric', value: d.words }), e.words),
        field('Objectif de mots', 'goalWords', h('input', { class: 'input', name: 'goalWords', type: 'number', min: '0', inputmode: 'numeric', value: d.goalWords }), e.goalWords),
      ),
      h(
        'div',
        { class: 'row' },
        field('Chapitres terminés', 'chaptersDone', h('input', { class: 'input', name: 'chaptersDone', type: 'number', min: '0', inputmode: 'numeric', value: d.chaptersDone }), e.chaptersDone),
        field('Chapitres prévus', 'chaptersTotal', h('input', { class: 'input', name: 'chaptersTotal', type: 'number', min: '0', inputmode: 'numeric', value: d.chaptersTotal }), e.chaptersTotal),
      ),
      h('p', { class: 'hint' }, 'Avancement : calculé sur l’objectif de mots s’il est renseigné, sinon sur les chapitres, sinon selon l’étape.'),
      field(
        'Titres des chapitres (pour les lecteurs)',
        'chapterTitles',
        h('textarea', { class: 'input', name: 'chapterTitles', rows: '4', placeholder: 'Chapitre 1 – L’oracle\nChapitre 2 – …' }, d.chapterTitles || ''),
        e.chapterTitles,
        'Un titre par ligne. Les visiteurs pourront cocher les chapitres lus.',
      ),
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', name: 'public', checked: d.public === true }),
        h('span', {}, 'Visible par les visiteurs (sinon le livre reste privé)'),
      ),
      state.saveError ? h('p', { class: 'state error', role: 'alert' }, state.saveError) : null,
      h(
        'div',
        { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'submit', 'data-action': 'save', disabled: state.coverBusy }, 'Enregistrer'),
        h('button', { class: 'btn', type: 'button', 'data-action': 'cancel', onclick: () => go('list') }, 'Annuler'),
      ),
    );
  }

  function readForm(form) {
    const f = form.elements;
    return {
      title: f.title.value,
      status: f.status.value,
      genre: f.genre.value,
      synopsis: f.synopsis.value,
      words: f.words.value,
      goalWords: f.goalWords.value,
      chaptersDone: f.chaptersDone.value,
      chaptersTotal: f.chaptersTotal.value,
      tags: f.tags.value,
      chapterTitles: f.chapterTitles.value,
      releaseDate: f.releaseDate.value,
      public: f.public.checked,
    };
  }

  async function onSubmitBook(ev) {
    ev.preventDefault();
    if (state.coverBusy) return;
    const raw = { ...readForm(ev.target), cover: state.draft.cover || '' };
    const res = validateBook(raw);
    if (!res.ok) {
      state.draft = { ...raw };
      state.formErrors = res.errors;
      render();
      return;
    }
    try {
      await backend.saveBook({ ...res.value, id: state.editing ? state.editing.id : undefined });
      state.view = 'list';
      await refresh();
      showToast('Livre enregistré.');
    } catch (e) {
      state.draft = { ...raw };
      state.saveError = 'Enregistrement refusé. Vérifie ta connexion.';
      render();
    }
  }

  async function onDelete(b) {
    if (!win.confirm(`Supprimer « ${b.title} » ? Cette action est définitive.`)) return;
    try {
      await backend.deleteBook(b.id);
      await refresh();
      showToast('Livre supprimé.');
    } catch (e) {
      state.loadError = 'Suppression refusée.';
      render();
    }
  }

  // ---------- Notes-Idées (privées) ----------

  async function openNotes() {
    state.noteEditing = null;
    state.noteDraft = { title: '', body: '', bookId: '' };
    state.noteErrors = {};
    state.notesError = '';
    state.notesLoading = true;
    go('notes');
    await loadNotes();
  }

  async function loadNotes() {
    try {
      const notes = await backend.listNotes();
      state.notes = [...notes].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      state.notesError = '';
    } catch (e) {
      state.notesError = 'Impossible de charger tes notes. Vérifie ta connexion.';
    }
    state.notesLoading = false;
    if (state.view === 'notes') render();
  }

  function editNote(n) {
    state.noteEditing = n;
    state.noteDraft = { title: n.title || '', body: n.body || '', bookId: n.bookId || '' };
    state.noteErrors = {};
    render();
    root.querySelector('[data-role="note-form"] [name="title"]')?.focus();
  }

  async function onSubmitNote(ev) {
    ev.preventDefault();
    const f = ev.target.elements;
    const raw = { title: f.title.value, body: f.body.value, bookId: f.bookId.value };
    const res = validateNote(raw);
    if (!res.ok) {
      state.noteDraft = raw;
      state.noteErrors = res.errors;
      render();
      return;
    }
    try {
      await backend.saveNote({ ...res.value, id: state.noteEditing ? state.noteEditing.id : undefined });
      state.noteEditing = null;
      state.noteDraft = { title: '', body: '', bookId: '' };
      state.noteErrors = {};
      await loadNotes();
      render();
      showToast('Note enregistrée.');
    } catch (e) {
      state.noteDraft = raw;
      state.noteErrors = { form: 'Enregistrement refusé. Vérifie ta connexion.' };
      render();
    }
  }

  async function onDeleteNote(n) {
    if (!win.confirm(`Supprimer la note « ${n.title || 'sans titre'} » ? Cette action est définitive.`)) return;
    try {
      await backend.deleteNote(n.id);
      if (state.noteEditing && state.noteEditing.id === n.id) {
        state.noteEditing = null;
        state.noteDraft = { title: '', body: '', bookId: '' };
      }
      await loadNotes();
      render();
      showToast('Note supprimée.');
    } catch (e) {
      state.notesError = 'Suppression refusée.';
      render();
    }
  }

  function renderNotes() {
    const d = state.noteDraft;
    const e = state.noteErrors;
    const bookTitle = (id) => (state.books.find((b) => b.id === id) || {}).title;
    return h(
      'div',
      { class: 'notes-view' },
      h(
        'form',
        { class: 'panel note-form', 'data-role': 'note-form', novalidate: true, onsubmit: onSubmitNote },
        h('h2', {}, art(SMALL_ROSE, 'inline-art'), state.noteEditing ? ' Modifier la note' : ' Notes-Idées'),
        h('p', { class: 'hint' }, 'Tes projets, idées de scènes, personnages… Visibles par toi seule.'),
        field('Titre', 'title', h('input', { class: 'input', name: 'title', value: d.title, maxlength: '120', autocomplete: 'off', placeholder: 'Ex. Idée : la prêtresse d’Athéna' }), e.title),
        field('Note', 'body', h('textarea', { class: 'input', name: 'body', rows: '6' }, d.body), e.body),
        field(
          'Lier à un livre (facultatif)',
          'bookId',
          h('select', { class: 'input', name: 'bookId' },
            h('option', { value: '' }, 'Aucun'),
            state.books.map((b) => h('option', { value: b.id, selected: b.id === d.bookId }, b.title))),
        ),
        e.form ? h('p', { class: 'state error', role: 'alert' }, e.form) : null,
        h(
          'div',
          { class: 'toolbar' },
          h('button', { class: 'btn primary', type: 'submit', 'data-action': 'save-note' }, state.noteEditing ? 'Enregistrer' : 'Ajouter la note'),
          state.noteEditing
            ? h('button', {
                class: 'btn', type: 'button', 'data-action': 'cancel-note',
                onclick: () => { state.noteEditing = null; state.noteDraft = { title: '', body: '', bookId: '' }; state.noteErrors = {}; render(); },
              }, 'Annuler')
            : null,
          h('button', { class: 'btn ghost', type: 'button', 'data-action': 'back-books', onclick: () => go('list') }, '← Mes livres'),
        ),
      ),
      state.notesLoading
        ? h('p', { class: 'state' }, 'Chargement des notes…')
        : state.notesError
          ? h('p', { class: 'state error', role: 'alert' }, state.notesError)
          : !state.notes.length
            ? h('p', { class: 'state' }, 'Aucune note pour l’instant.')
            : h(
                'section',
                { class: 'notes', 'data-role': 'notes' },
                state.notes.map((n) => h(
                  'article',
                  { class: 'note', 'data-note': n.id },
                  n.title ? h('h3', {}, n.title) : null,
                  n.bookId && bookTitle(n.bookId) ? h('p', { class: 'genre' }, `📖 ${bookTitle(n.bookId)}`) : null,
                  n.body ? h('p', { class: 'note-body' }, n.body) : null,
                  n.updatedAt ? h('p', { class: 'date' }, `Modifiée le ${new Date(n.updatedAt).toLocaleDateString('fr-FR')}`) : null,
                  h(
                    'div',
                    { class: 'card-actions' },
                    h('button', { class: 'btn small', 'data-action': 'edit-note', onclick: () => editNote(n) }, 'Modifier'),
                    h('button', { class: 'btn small danger', 'data-action': 'delete-note', onclick: () => onDeleteNote(n) }, 'Supprimer'),
                  ),
                )),
              ),
    );
  }

  // ---------- Réseaux sociaux ----------

  function renderSocials() {
    const links = SOCIALS.map((s) => ({ ...s, url: safeSocialUrl(s.id, state.profile[s.id]) })).filter((s) => s.url);
    if (!links.length) return null;
    return h(
      'nav',
      { class: 'socials', 'aria-label': 'Mes réseaux sociaux' },
      links.map((s) => {
        const a = h('a', {
          class: `social social-${s.id}`, href: s.url, target: '_blank', rel: 'noopener noreferrer me',
          'data-social': s.id, 'aria-label': `${s.label} (nouvel onglet)`,
        });
        const medal = doc.createElement('span');
        medal.className = 'social-medal';
        medal.innerHTML = SOCIAL_WREATH + `<span class="social-disc">${socialIconSvg(s.id)}</span>`; // SVG constants only
        a.append(medal, h('span', { class: 'social-label' }, s.label));
        return a;
      }),
    );
  }

  // ---------- Profil ----------

  function renderProfileForm() {
    return h(
      'form',
      {
        class: 'panel',
        'data-role': 'profile-form',
        onsubmit: async (ev) => {
          ev.preventDefault();
          const f = ev.target.elements;
          const profile = { displayName: f.displayName.value.trim().slice(0, 80) || 'Mes livres', bio: f.bio.value.trim().slice(0, 500) };
          const errors = {};
          for (const s of SOCIALS) {
            const r = normalizeSocial(s.id, f[s.id].value);
            if (r.ok) profile[s.id] = r.url; else errors[s.id] = r.error;
          }
          if (Object.keys(errors).length) {
            state.profileErrors = errors;
            state.profileDraft = { displayName: f.displayName.value, bio: f.bio.value, ...Object.fromEntries(SOCIALS.map((s) => [s.id, f[s.id].value])) };
            render();
            return;
          }
          try {
            await backend.saveProfile(profile);
            state.profile = { ...state.profile, ...profile };
            state.saveError = '';
            state.profileErrors = {};
            state.profileDraft = null;
            go('list');
            showToast('Profil enregistré.');
          } catch (e) {
            state.saveError = 'Enregistrement refusé.';
            render();
          }
        },
      },
      h('h2', {}, 'Mon profil public'),
      field('Nom affiché', 'displayName', h('input', { class: 'input', name: 'displayName', value: (state.profileDraft || state.profile).displayName, maxlength: '80' })),
      field('Présentation', 'bio', h('textarea', { class: 'input', name: 'bio', rows: '3', maxlength: '500' }, (state.profileDraft || state.profile).bio || '')),
      h('h3', { class: 'subhead' }, 'Mes réseaux sociaux'),
      h('p', { class: 'hint' }, 'Ton pseudo ou le lien de ton profil. Laisse vide pour ne pas afficher l’icône.'),
      SOCIALS.map((s) => field(
        s.label,
        s.id,
        h('input', {
          class: 'input', name: s.id, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: s.placeholder,
          value: state.profileDraft ? state.profileDraft[s.id] : (state.profile[s.id] || ''),
        }),
        (state.profileErrors || {})[s.id],
      )),
      state.saveError ? h('p', { class: 'state error', role: 'alert' }, state.saveError) : null,
      h(
        'div',
        { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer'),
        h('button', { class: 'btn', type: 'button', onclick: () => go('list') }, 'Annuler'),
      ),
    );
  }

  // ---------- Connexion ----------

  function renderLogin() {
    return h(
      'main',
      { class: 'wrap narrow' },
      art(HERO_ART, 'hero-art'),
      h(
        'form',
        {
          class: 'panel',
          'data-role': 'login-form',
          onsubmit: async (ev) => {
            ev.preventDefault();
            const f = ev.target.elements;
            state.loginError = '';
            try {
              const user = await backend.login(f.email.value.trim(), f.password.value);
              if (!user || user.uid !== ownerUid) {
                await backend.logout();
                state.loginError = 'Accès refusé.';
                render();
              }
              // sinon : onAuthChange prend le relais
            } catch (e) {
              state.loginError = 'Identifiant ou mot de passe incorrect.';
              render();
            }
          },
        },
        h('h1', {}, 'Connexion'),
        state.pendingImport ? h('p', { class: 'hint', 'data-role': 'pending-import' }, 'Connecte-toi : l’histoire Wattpad sera ajoutée à « À lire » juste après.') : null,
        field('Adresse e-mail', 'email', h('input', { class: 'input', name: 'email', type: 'email', autocomplete: 'username', required: true })),
        field('Mot de passe', 'password', h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
        state.loginError ? h('p', { class: 'state error', role: 'alert' }, state.loginError) : null,
        h(
          'div',
          { class: 'toolbar' },
          h('button', { class: 'btn primary', type: 'submit', 'data-action': 'login' }, 'Se connecter'),
          h('a', { class: 'btn ghost', href: '#', 'data-action': 'back', onclick: () => (win.location.hash = '') }, 'Retour'),
        ),
      ),
    );
  }

  // ---------- Rendu ----------

  function render() {
    root.replaceChildren();
    if (showLogin()) {
      root.append(renderLogin());
      return;
    }
    let body;
    if (isReadingsTab() && state.view === 'list') body = readingsUI.render();
    else if (canEdit() && state.view === 'form') body = renderForm();
    else if (canEdit() && state.view === 'profile') body = renderProfileForm();
    else if (canEdit() && state.view === 'notes') body = renderNotes();
    else if (canEdit() && state.view === 'share') body = h('div', {}, renderShare(), renderList());
    else body = renderList();

    root.append(
      h(
        'main',
        { class: 'wrap' },
        renderHeader(),
        body,
        h(
          'footer',
          { class: 'foot' },
          art(SMALL_ROSE, 'inline-art'),
          isOwner() ? null : h('a', { href: '#/admin', 'data-action': 'admin-link' }, 'Espace auteur'),
        ),
      ),
    );
  }

  win.addEventListener('hashchange', render);

  const readingsUI = createReadingsUI({
    state, backend, win, doc, h, art, field, render, showToast, canEdit, isOwner, today, compressCover, fetchImpl,
  });

  // Import automatique : le site est ouvert avec ?import=<lien Wattpad> (raccourci iPhone ou favori)
  state.pendingImport = readingsUI.takeImportParam();

  backend.onAuthChange(async (user) => {
    state.user = user;
    if (!isOwner()) {
      state.view = 'list';
      state.preview = false;
      state.notes = [];
      state.readingView = 'list';
    }
    if (state.pendingImport && !user) {
      if (win.location.hash !== '#/admin') win.location.hash = '#/admin';
    } else if (isOwner() && win.location.hash === '#/admin') {
      win.location.hash = state.pendingImport ? '#/lectures' : '';
    }
    await refresh();
    if (isOwner() && state.pendingImport) await readingsUI.autoImport();
  });

  render();
  return { state, refresh, reading, readingsUI };
}
