// Interface : vue publique (lecture seule) + espace propriétaire (connexion, ajout, modification).
// Le backend est injecté (Firebase en production, simulation en test).
import { STATUSES, progress, validateBook, formatNumber, statusLabel } from './logic.js';

export function start({ backend, root, ownerUid, shareUrl, doc = document, win = window }) {
  const state = {
    user: null,
    books: [],
    profile: { displayName: 'Mes livres', bio: '' },
    view: 'list', // list | form | profile
    editing: null, // livre en cours d'édition (null = nouveau)
    draft: null,
    formErrors: {},
    loginError: '',
    loading: true,
    loadError: '',
    saveError: '',
    preview: false, // "voir comme visiteur"
    toast: '',
  };

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
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : doc.createTextNode(String(c)));
    }
    return el;
  }

  function showToast(msg) {
    state.toast = msg;
    render();
    win.setTimeout(() => {
      state.toast = '';
      render();
    }, 2500);
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
    state.loading = false;
    render();
  }

  // ---------- Vues ----------

  function renderHeader() {
    const owner = canEdit();
    return h(
      'header',
      { class: 'hero' },
      h('h1', {}, state.profile.displayName || 'Mes livres'),
      state.profile.bio ? h('p', { class: 'bio' }, state.profile.bio) : null,
      owner
        ? h(
            'div',
            { class: 'toolbar' },
            h('button', { class: 'btn primary', 'data-action': 'add', onclick: () => openForm(null) }, '+ Nouveau livre'),
            h('button', { class: 'btn', 'data-action': 'profile', onclick: () => ((state.view = 'profile'), render()) }, 'Mon profil'),
            h('button', { class: 'btn', 'data-action': 'share', onclick: onShare }, 'Lien de partage'),
            h('button', { class: 'btn', 'data-action': 'preview', onclick: () => ((state.preview = true), render()) }, 'Voir comme visiteur'),
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
      state.view = 'share';
      render();
    }
  }

  function renderShare() {
    return h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Lien de partage'),
      h('p', {}, 'Toute personne disposant de ce lien voit tes livres publics, en lecture seule.'),
      h('input', { class: 'input', readonly: true, value: shareUrl, 'data-role': 'share-url', onfocus: (e) => e.target.select() }),
      h('div', { class: 'toolbar' }, h('button', { class: 'btn', onclick: () => ((state.view = 'list'), render()) }, 'Fermer')),
    );
  }

  function renderBookCard(b) {
    const pct = progress(b);
    const owner = canEdit();
    return h(
      'article',
      { class: 'card', 'data-book': b.id },
      h(
        'div',
        { class: 'card-head' },
        h('h3', {}, b.title),
        h('span', { class: `badge st-${b.status}` }, statusLabel(b.status)),
      ),
      b.genre ? h('p', { class: 'genre' }, b.genre) : null,
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
    );
  }

  function renderList() {
    const visible = state.preview ? state.books.filter((b) => b.public) : state.books;
    if (state.loading) return h('p', { class: 'state' }, 'Chargement…');
    if (state.loadError) return h('p', { class: 'state error', role: 'alert' }, state.loadError);
    if (!visible.length) {
      return h('p', { class: 'state' }, canEdit() ? 'Aucun livre pour l’instant. Ajoute le premier avec « + Nouveau livre ».' : 'Aucun livre à afficher pour l’instant.');
    }
    return h('section', { class: 'grid' }, visible.map(renderBookCard));
  }

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
    state.draft = book
      ? { ...book }
      : { title: '', status: 'idee', genre: '', synopsis: '', words: 0, goalWords: 0, chaptersDone: 0, chaptersTotal: 0, public: false };
    state.view = 'form';
    render();
  }

  function renderForm() {
    const d = state.draft;
    const e = state.formErrors;
    const form = h(
      'form',
      { class: 'panel', 'data-role': 'book-form', novalidate: true, onsubmit: onSubmitBook },
      h('h2', {}, state.editing ? 'Modifier le livre' : 'Nouveau livre'),
      field('Titre', 'title', h('input', { class: 'input', name: 'title', value: d.title, maxlength: '120', autocomplete: 'off' }), e.title),
      field(
        'Étape',
        'status',
        h('select', { class: 'input', name: 'status' }, STATUSES.map((s) => h('option', { value: s.id, selected: s.id === d.status }, s.label))),
        e.status,
      ),
      field('Genre', 'genre', h('input', { class: 'input', name: 'genre', value: d.genre || '', maxlength: '60' }), e.genre),
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
        h('button', { class: 'btn primary', type: 'submit', 'data-action': 'save' }, 'Enregistrer'),
        h('button', { class: 'btn', type: 'button', 'data-action': 'cancel', onclick: () => ((state.view = 'list'), render()) }, 'Annuler'),
      ),
    );
    return form;
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
      public: f.public.checked,
    };
  }

  async function onSubmitBook(ev) {
    ev.preventDefault();
    const raw = readForm(ev.target);
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
          try {
            await backend.saveProfile(profile);
            state.profile = { ...state.profile, ...profile };
            state.view = 'list';
            render();
            showToast('Profil enregistré.');
          } catch (e) {
            state.saveError = 'Enregistrement refusé.';
            render();
          }
        },
      },
      h('h2', {}, 'Mon profil public'),
      field('Nom affiché', 'displayName', h('input', { class: 'input', name: 'displayName', value: state.profile.displayName, maxlength: '80' })),
      field('Présentation', 'bio', h('textarea', { class: 'input', name: 'bio', rows: '3', maxlength: '500' }, state.profile.bio || '')),
      state.saveError ? h('p', { class: 'state error', role: 'alert' }, state.saveError) : null,
      h(
        'div',
        { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer'),
        h('button', { class: 'btn', type: 'button', onclick: () => ((state.view = 'list'), render()) }, 'Annuler'),
      ),
    );
  }

  function renderLogin() {
    return h(
      'main',
      { class: 'wrap narrow' },
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

  function render() {
    root.replaceChildren();
    if (showLogin()) {
      root.append(renderLogin());
      return;
    }
    let body;
    if (canEdit() && state.view === 'form') body = renderForm();
    else if (canEdit() && state.view === 'profile') body = renderProfileForm();
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
          isOwner() ? null : h('a', { href: '#/admin', 'data-action': 'admin-link' }, 'Espace auteur'),
        ),
        state.toast ? h('div', { class: 'toast', role: 'status' }, state.toast) : null,
      ),
    );
  }

  win.addEventListener('hashchange', render);

  backend.onAuthChange(async (user) => {
    state.user = user;
    if (!isOwner()) {
      state.view = 'list';
      state.preview = false;
    }
    if (isOwner() && win.location.hash === '#/admin') win.location.hash = '';
    await refresh();
  });

  render();
  return { state, refresh };
}
