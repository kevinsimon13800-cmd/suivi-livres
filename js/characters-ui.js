// Personnages (auteure uniquement) : fiches, carte des liens (glisser pour déplacer), liens colorés par type.
import { REL_TYPES, validateCharacter, validateRelation, layout } from './atelier.js?v=7';
import { SMALL_ROSE } from './art.js?v=7';

const NS = 'http://www.w3.org/2000/svg';
const W = 600;
const H = 440;

export function createCharactersUI({ state, backend, win, doc, h, field, art, render, showToast }) {
  state.characters = [];
  state.relations = [];
  state.charError = '';
  state.charTab = 'fiches'; // fiches | carte
  state.charFilter = '';
  state.charEditing = null;
  state.charDraft = null;
  state.charErrors = {};
  state.relErrors = {};

  const has = typeof backend.listCharacters === 'function';

  async function load() {
    if (!has) return;
    try {
      const [chars, rels] = await Promise.all([backend.listCharacters(), backend.listRelations()]);
      state.characters = chars.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      state.relations = rels;
      state.charError = '';
    } catch (e) {
      state.charError = 'Impossible de charger les personnages. Vérifie ta connexion.';
    }
  }

  function open() {
    state.charEditing = null;
    state.charDraft = null;
    state.charErrors = {};
    state.view = 'characters';
    render();
    win.scrollTo?.(0, 0);
  }

  const stories = () => [...new Set([...(state.books || []).map((b) => b.title), ...state.characters.map((c) => c.story).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'fr'));
  const visible = () => state.characters.filter((c) => !state.charFilter || c.story === state.charFilter);
  const emptyDraft = () => ({ name: '', story: state.charFilter || '', role: '', age: '', appearance: '', traits: '', notes: '' });

  function openForm(c) {
    state.charEditing = c || null;
    state.charDraft = c ? { ...emptyDraft(), ...c } : emptyDraft();
    state.charErrors = {};
    render();
    win.scrollTo?.(0, 0);
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const f = ev.target.elements;
    const raw = { name: f.name.value, story: f.story.value, role: f.role.value, age: f.age.value, appearance: f.appearance.value, traits: f.traits.value, notes: f.notes.value };
    const res = validateCharacter(raw);
    if (!res.ok) {
      state.charDraft = raw;
      state.charErrors = res.errors;
      render();
      return;
    }
    try {
      const prev = state.charEditing;
      await backend.saveCharacter({ ...res.value, ...(prev && Number.isFinite(prev.x) ? { x: prev.x, y: prev.y } : {}), id: prev ? prev.id : undefined });
      state.charEditing = null;
      state.charDraft = null;
      state.charErrors = {};
      await load();
      render();
      showToast('Fiche enregistrée.');
    } catch (e) {
      state.charDraft = raw;
      state.charErrors = { form: 'Enregistrement refusé. Vérifie ta connexion.' };
      render();
    }
  }

  async function onDelete(c) {
    if (!win.confirm(`Supprimer la fiche « ${c.name} » et ses liens ? Cette action est définitive.`)) return;
    try {
      await backend.deleteCharacter(c.id);
      state.charEditing = null;
      state.charDraft = null;
      await load();
      render();
      showToast('Fiche supprimée.');
    } catch (e) {
      state.charErrors = { form: 'Suppression refusée. Vérifie ta connexion.' };
      render();
    }
  }

  // ---------- Fiches ----------

  function renderForm() {
    const d = state.charDraft;
    const e = state.charErrors;
    const listId = 'char-stories';
    return h(
      'form',
      { class: 'panel char-form', 'data-role': 'char-form', novalidate: true, onsubmit: onSubmit },
      h('h2', {}, art(SMALL_ROSE, 'inline-art'), state.charEditing ? ' Modifier la fiche' : ' Nouvelle fiche'),
      h(
        'div',
        { class: 'row2' },
        field('Nom', 'name', h('input', { class: 'input', name: 'name', value: d.name, maxlength: '80', autocomplete: 'off' }), e.name),
        field('Histoire', 'story', h('input', { class: 'input', name: 'story', value: d.story, list: listId, maxlength: '120', autocomplete: 'off', placeholder: 'Choisis ou écris un nom' }), e.story),
      ),
      h('datalist', { id: listId }, stories().map((t) => h('option', { value: t }))),
      h(
        'div',
        { class: 'row2' },
        field('Rôle', 'role', h('input', { class: 'input', name: 'role', value: d.role, maxlength: '80', autocomplete: 'off', placeholder: 'Protagoniste, mentor…' }), e.role),
        field('Âge', 'age', h('input', { class: 'input', name: 'age', value: d.age, maxlength: '20', autocomplete: 'off' }), e.age),
      ),
      field('Apparence', 'appearance', h('textarea', { class: 'input', name: 'appearance', rows: '2' }, d.appearance), e.appearance),
      field('Caractère', 'traits', h('textarea', { class: 'input', name: 'traits', rows: '2' }, d.traits), e.traits),
      field('Notes (passé, secrets, dates…)', 'notes', h('textarea', { class: 'input', name: 'notes', rows: '4' }, d.notes), e.notes),
      e.form ? h('p', { class: 'state error', role: 'alert' }, e.form) : null,
      h(
        'div',
        { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'submit', 'data-action': 'save-char' }, 'Enregistrer'),
        h('button', { class: 'btn', type: 'button', 'data-action': 'cancel-char', onclick: () => { state.charEditing = null; state.charDraft = null; render(); } }, 'Annuler'),
        state.charEditing ? h('button', { class: 'btn ghost danger', type: 'button', 'data-action': 'delete-char', onclick: () => onDelete(state.charEditing) }, 'Supprimer') : null,
      ),
    );
  }

  function renderCards() {
    const list = visible();
    if (!list.length) return h('p', { class: 'state' }, state.characters.length ? 'Aucun personnage pour cette histoire.' : 'Aucune fiche pour l’instant. Crée la première avec « + Nouvelle fiche ».');
    return h(
      'section',
      { class: 'char-grid', 'data-role': 'chars' },
      list.map((c) => h(
        'article',
        {
          class: 'char-card editable', 'data-char': c.id, role: 'button', tabindex: '0', 'aria-label': `Modifier la fiche de ${c.name}`,
          onclick: () => openForm(c),
          onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openForm(c); } },
        },
        h(
          'div',
          { class: 'char-head' },
          h('span', { class: 'char-avatar', 'aria-hidden': 'true' }, c.name.charAt(0).toUpperCase()),
          h('div', {}, h('h3', {}, c.name), h('p', { class: 'char-sub' }, [c.role, c.age ? `${c.age} ans` : ''].filter(Boolean).join(' · '))),
        ),
        c.story ? h('p', { class: 'genre' }, `📖 ${c.story}`) : null,
        c.traits ? h('p', { class: 'char-text' }, c.traits) : null,
      )),
    );
  }

  // ---------- Carte ----------

  const s = (tag, attrs = {}, ...kids) => {
    const el = doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    for (const c of kids.flat()) if (c !== null && c !== undefined) el.append(c.nodeType ? c : doc.createTextNode(String(c)));
    return el;
  };

  function drawMap(svg) {
    const chars = visible();
    const pos = layout(chars, W, H);
    const ids = new Set(chars.map((c) => c.id));
    const rels = state.relations.filter((r) => ids.has(r.from) && ids.has(r.to));
    const pairN = {};
    const pairI = {};
    rels.forEach((r) => { const k = [r.from, r.to].sort().join('|'); pairN[k] = (pairN[k] || 0) + 1; });
    const kids = [];
    rels.forEach((r) => {
      const k = [r.from, r.to].sort().join('|');
      pairI[k] = (pairI[k] || 0) + 1;
      const A = pos[r.from];
      const B = pos[r.to];
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = (pairI[k] - 1 - (pairN[k] - 1) / 2) * 16;
      const ox = (-dy / len) * off;
      const oy = (dx / len) * off;
      kids.push(
        s('g', { class: `rel rel-${r.type}`, 'data-rel': r.id },
          s('line', { x1: A.x + ox, y1: A.y + oy, x2: B.x + ox, y2: B.y + oy, stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round' }),
          s('text', { class: 'rel-label', x: (A.x + B.x) / 2 + ox, y: (A.y + B.y) / 2 + oy + 4, 'text-anchor': 'middle', fill: 'currentColor' }, r.label || REL_TYPES[r.type])),
      );
    });
    chars.forEach((c) => {
      const p = pos[c.id];
      kids.push(
        s('g', { class: 'node', 'data-node': c.id, tabindex: '0', role: 'button', 'aria-label': `${c.name} : ouvrir la fiche` },
          s('circle', { cx: p.x, cy: p.y, r: 32 }),
          s('text', { class: 'node-initial', x: p.x, y: p.y + 9, 'text-anchor': 'middle' }, c.name.charAt(0).toUpperCase()),
          s('text', { class: 'node-name', x: p.x, y: p.y + 56, 'text-anchor': 'middle' }, c.name)),
      );
    });
    svg.replaceChildren(...kids);
  }

  function bindDrag(svg) {
    let drag = null;
    const toSvg = (e) => {
      const r = svg.getBoundingClientRect();
      if (!r.width) return null;
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    svg.addEventListener('pointerdown', (e) => {
      const g = e.target.closest && e.target.closest('.node');
      if (!g) return;
      drag = { id: g.dataset.node, moved: false, sx: e.clientX, sy: e.clientY };
      try { svg.setPointerCapture(e.pointerId); } catch (x) { /* pas de capture */ }
      e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      const p = toSvg(e);
      const c = state.characters.find((x) => x.id === drag.id);
      if (!p || !c) return;
      drag.moved = true;
      c.x = Math.max(40, Math.min(W - 40, Math.round(p.x)));
      c.y = Math.max(40, Math.min(H - 64, Math.round(p.y)));
      drawMap(svg);
    });
    const end = async () => {
      if (!drag) return;
      const { id, moved } = drag;
      drag = null;
      const c = state.characters.find((x) => x.id === id);
      if (!c) return;
      if (!moved) { openForm(c); return; }
      try { await backend.saveCharacter({ ...c }); } catch (e) { showToast('Position non enregistrée.'); }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', () => { drag = null; });
    svg.addEventListener('keydown', (e) => {
      const g = e.target.closest && e.target.closest('.node');
      if (g && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const c = state.characters.find((x) => x.id === g.dataset.node);
        if (c) openForm(c);
      }
    });
  }

  async function onRelSubmit(ev) {
    ev.preventDefault();
    const f = ev.target.elements;
    const res = validateRelation({ from: f.from.value, to: f.to.value, type: f.type.value, label: f.label.value }, state.characters);
    if (!res.ok) {
      state.relErrors = res.errors;
      render();
      return;
    }
    try {
      await backend.saveRelation(res.value);
      state.relErrors = {};
      await load();
      render();
      showToast('Lien ajouté.');
    } catch (e) {
      state.relErrors = { form: 'Enregistrement refusé. Vérifie ta connexion.' };
      render();
    }
  }

  async function onRelDelete(r) {
    if (!win.confirm('Supprimer ce lien ?')) return;
    try {
      await backend.deleteRelation(r.id);
      await load();
      render();
    } catch (e) {
      showToast('Suppression refusée.');
    }
  }

  function renderMap() {
    const chars = visible();
    if (chars.length < 2) return h('p', { class: 'state' }, 'Il faut au moins deux fiches pour tracer des liens.');
    const e = state.relErrors;
    const ids = new Set(chars.map((c) => c.id));
    const rels = state.relations.filter((r) => ids.has(r.from) && ids.has(r.to));
    const name = (id) => (state.characters.find((c) => c.id === id) || {}).name || '?';
    const svg = s('svg', { class: 'char-map', viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'Carte des personnages', 'data-role': 'map' });
    drawMap(svg);
    bindDrag(svg);
    const opts = chars.map((c) => h('option', { value: c.id }, c.name));
    return h(
      'div',
      { class: 'char-mapwrap' },
      h('p', { class: 'hint center' }, 'Glisse un personnage pour le déplacer. Touche-le pour ouvrir sa fiche.'),
      svg,
      h('div', { class: 'legend' }, Object.entries(REL_TYPES).map(([k, v]) => h('span', { class: `rel-${k}` }, h('i', {}), v))),
      h(
        'form',
        { class: 'panel', 'data-role': 'rel-form', novalidate: true, onsubmit: onRelSubmit },
        h('h3', {}, 'Ajouter un lien'),
        h(
          'div',
          { class: 'row2' },
          field('De', 'from', h('select', { class: 'input', name: 'from' }, opts)),
          field('Vers', 'to', h('select', { class: 'input', name: 'to' }, chars.map((c, i) => h('option', { value: c.id, selected: i === 1 }, c.name)))),
        ),
        h(
          'div',
          { class: 'row2' },
          field('Type', 'type', h('select', { class: 'input', name: 'type' }, Object.entries(REL_TYPES).map(([k, v]) => h('option', { value: k }, v))), e.type),
          field('Précision (facultatif)', 'label', h('input', { class: 'input', name: 'label', maxlength: '40', autocomplete: 'off', placeholder: 'sœur, ex, mentor…' }), e.label),
        ),
        e.form ? h('p', { class: 'state error', role: 'alert' }, e.form) : null,
        h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', type: 'submit', 'data-action': 'add-rel' }, 'Ajouter le lien')),
      ),
      rels.length
        ? h(
            'ul',
            { class: 'rel-list', 'data-role': 'rels' },
            rels.map((r) => h(
              'li',
              { class: `rel-${r.type}`, 'data-rel-item': r.id },
              h('span', {}, h('strong', {}, name(r.from)), ' ', h('b', { class: 'rel-word' }, r.label || REL_TYPES[r.type]), ' ', h('strong', {}, name(r.to))),
              h('button', { class: 'btn small ghost danger', type: 'button', 'data-action': 'delete-rel', 'aria-label': 'Supprimer ce lien', onclick: () => onRelDelete(r) }, 'Supprimer'),
            )),
          )
        : null,
    );
  }

  function renderView() {
    const sts = stories();
    if (state.charFilter && !sts.includes(state.charFilter)) state.charFilter = '';
    const editing = !!state.charDraft;
    return h(
      'section',
      { class: 'chars-view', 'data-role': 'characters' },
      editing
        ? renderForm()
        : h(
            'div',
            {},
            h('h2', { class: 'center-h' }, art(SMALL_ROSE, 'inline-art'), ' Personnages'),
            state.charError ? h('p', { class: 'state error', role: 'alert' }, state.charError) : null,
            h(
              'div',
              { class: 'seg', role: 'tablist', 'aria-label': 'Affichage' },
              [['fiches', 'Fiches'], ['carte', 'Carte']].map(([id, label]) => h('button', {
                class: `seg-btn${state.charTab === id ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': state.charTab === id ? 'true' : 'false', 'data-tab': id,
                onclick: () => { state.charTab = id; render(); },
              }, label)),
            ),
            h(
              'div',
              { class: 'toolbar center' },
              state.charTab === 'fiches' ? h('button', { class: 'btn primary', type: 'button', 'data-action': 'add-char', onclick: () => openForm(null) }, '+ Nouvelle fiche') : null,
              sts.length
                ? h(
                    'select',
                    { class: 'input char-filter', 'aria-label': 'Filtrer par histoire', 'data-role': 'char-filter', onchange: (ev) => { state.charFilter = ev.target.value; render(); } },
                    h('option', { value: '' }, 'Toutes les histoires'),
                    sts.map((t) => h('option', { value: t, selected: t === state.charFilter }, t)),
                  )
                : null,
            ),
            state.charTab === 'fiches' ? renderCards() : renderMap(),
          ),
    );
  }

  return { load, open, render: renderView, openForm };
}
