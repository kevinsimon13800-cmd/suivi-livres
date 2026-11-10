// Écran « Statistiques » (propriétaire uniquement) : chiffres clés + histogramme par période + tableau.
import { PERIODS, buildSeries, allKeys, parisDate, firstDay } from './stats.js?v=7';
import { formatDateFR } from './logic.js?v=7';

const SVGNS = 'http://www.w3.org/2000/svg';

function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function createStatsUI({ state, backend, win, doc, h, render, now = () => new Date() }) {
  async function open() {
    state.statsLoading = true;
    state.statsError = '';
    render();
    try {
      state.stats = await backend.listStats();
    } catch (e) {
      state.statsError = 'Impossible de charger les statistiques. Vérifie ta connexion.';
    }
    state.statsLoading = false;
    render();
  }

  const fmt = (n) => (Number(n) || 0).toLocaleString('fr-FR');

  function tiles(stats) {
    const keys = allKeys(parisDate(now()));
    const items = [
      ['Aujourd’hui', keys.day], ['Cette semaine', keys.week], ['Ce mois-ci', keys.month], ['Cette année', keys.year], ['Depuis le début', 'all'],
    ];
    return h('div', { class: 'kpis' }, items.map(([label, key]) => h(
      'div',
      { class: 'kpi', 'data-kpi': key },
      h('span', { class: 'kpi-label' }, label),
      h('strong', { class: 'kpi-value' }, fmt(stats[key]?.visitors)),
      h('span', { class: 'kpi-sub' }, `visiteur${(stats[key]?.visitors || 0) > 1 ? 's' : ''} · ${fmt(stats[key]?.visits)} visite${(stats[key]?.visits || 0) > 1 ? 's' : ''}`),
    )));
  }

  function chart(series) {
    // sur téléphone, un repère plus étroit garde des libellés lisibles (le SVG est mis à l'échelle)
    const narrow = (win.innerWidth || 1024) < 560;
    const W = narrow ? 380 : 640; const H = narrow ? 200 : 220; const L = 30; const R = 6; const T = 12; const B = 26;
    const max = niceMax(Math.max(0, ...series.map((s) => s.visitors)));
    const n = series.length;
    const slot = (W - L - R) / n;
    const barW = Math.max(3, Math.min(36, slot - 2)); // 2px d'espace entre barres
    const y = (v) => T + (H - T - B) * (1 - v / max);

    const wrap = h('div', { class: 'chart-wrap' });
    const tip = h('div', { class: 'chart-tip', role: 'status', hidden: true });
    const svg = doc.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Visiteurs par période');
    const el = (name, attrs, text) => {
      const e = doc.createElementNS(SVGNS, name);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      if (text !== undefined) e.textContent = text;
      svg.append(e);
      return e;
    };
    // grille discrète + valeurs
    for (const v of [0, max / 2, max]) {
      el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' });
      el('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, fmt(v));
    }
    const every = Math.ceil(n / (narrow ? 5 : 8));
    series.forEach((s, i) => {
      const cx = L + slot * i + slot / 2;
      if ((n - 1 - i) % every === 0) el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'tick' }, s.short);
      if (s.visitors > 0) {
        const top = y(s.visitors);
        const hgt = Math.max(2, y(0) - top);
        const r = Math.min(4, barW / 2, hgt);
        // barre arrondie en haut, ancrée sur l'axe
        el('path', {
          class: `bar${i === n - 1 ? ' current' : ''}`,
          d: `M${cx - barW / 2} ${y(0)} V${top + r} Q${cx - barW / 2} ${top} ${cx - barW / 2 + r} ${top} H${cx + barW / 2 - r} Q${cx + barW / 2} ${top} ${cx + barW / 2} ${top + r} V${y(0)} Z`,
        });
      }
      // zone de survol = toute la colonne (plus grande que la barre)
      const hit = el('rect', { x: L + slot * i, y: T, width: slot, height: H - T - B, class: 'hit', tabindex: 0, 'data-key': s.key });
      hit.setAttribute('aria-label', `${s.long} : ${s.visitors} visiteurs, ${s.visits} visites`);
      const show = () => {
        tip.replaceChildren(
          h('strong', {}, `${fmt(s.visitors)} visiteur${s.visitors > 1 ? 's' : ''}`),
          h('span', {}, `${fmt(s.visits)} visite${s.visits > 1 ? 's' : ''}`),
          h('span', { class: 'tip-label' }, s.long),
        );
        tip.hidden = false;
        const pct = ((cx) / W) * 100;
        tip.style.left = `${Math.min(85, Math.max(15, pct))}%`;
        hit.classList.add('on');
      };
      const hide = () => { tip.hidden = true; hit.classList.remove('on'); };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('focus', show);
      hit.addEventListener('blur', hide);
    });
    wrap.append(svg, tip);
    return wrap;
  }

  function table(series) {
    return h(
      'details',
      { class: 'stats-table' },
      h('summary', {}, 'Voir le tableau'),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Période'), h('th', { scope: 'col' }, 'Visiteurs'), h('th', { scope: 'col' }, 'Visites'))),
        h('tbody', {}, [...series].reverse().map((s) => h('tr', { 'data-row': s.key },
          h('th', { scope: 'row' }, s.long), h('td', {}, fmt(s.visitors)), h('td', {}, fmt(s.visits)))))),
    );
  }

  function renderView() {
    const stats = state.stats || {};
    const period = state.statsPeriod || 'day';
    const p = PERIODS.find((x) => x.id === period);
    const series = buildSeries(stats, period, parisDate(now()));
    const since = firstDay(stats);
    return h(
      'section',
      { class: 'panel stats', 'data-role': 'stats' },
      h('h2', {}, '📈 Statistiques de visites'),
      state.statsLoading ? h('p', { class: 'state' }, 'Chargement…') : null,
      state.statsError ? h('p', { class: 'state error', role: 'alert' }, state.statsError) : null,
      !state.statsLoading && !state.statsError
        ? [
            tiles(stats),
            h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Période' }, PERIODS.map((x) => h('button', {
              class: `seg-btn${x.id === period ? ' on' : ''}`, role: 'tab', 'aria-selected': x.id === period ? 'true' : 'false', 'data-period': x.id,
              onclick: () => { state.statsPeriod = x.id; render(); },
            }, x.label))),
            h('p', { class: 'chart-title' }, `Visiteurs par ${p.label.toLowerCase()}`, h('span', { class: 'hint' }, p.count ? ` — ${series.length} dernier${series.length > 1 ? 's' : ''}` : ' — depuis le début')),
            chart(series),
            table(series),
            h('p', { class: 'hint' },
              since ? `Comptage depuis le ${formatDateFR(since)}. ` : 'Aucune visite comptée pour l’instant. ',
              'Visiteurs = appareils différents sur la période ; visites = ouvertures du site. Tes propres visites ne sont pas comptées : ni quand tu es connectée, ni sur un appareil déjà utilisé pour te connecter.'),
            state.persoUrl ? h('p', { class: 'hint', 'data-role': 'perso-hint' }, 'Nouvel appareil, ou appli ajoutée à l’écran d’accueil de l’iPhone (elle garde sa propre mémoire) : ouvre une fois ', h('strong', { class: 'perso-url' }, state.persoUrl), ' pour ne plus compter tes visites là-bas.') : null,
          ]
        : null,
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn', 'data-action': 'refresh-stats', onclick: open }, 'Actualiser'),
        h('button', { class: 'btn ghost', 'data-action': 'back-books', onclick: () => { state.view = 'list'; render(); } }, '← Retour')),
    );
  }

  return { open, render: renderView };
}
