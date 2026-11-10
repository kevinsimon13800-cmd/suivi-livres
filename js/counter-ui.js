// « Livres lus » : compteur par semaine / mois / trimestre / semestre / année, au-dessus de la liste des lectures.
import { PERIODS, rangeFor, inRange, countsNow, monthlySeries, finishedReadings, undatedFinished } from './periods.js?v=7';
import { formatDateFR } from './logic.js?v=7';

export function createCounterUI({ state, h, today, isOwner }) {
  if (!state.counterPeriod) state.counterPeriod = 'month';
  if (typeof state.counterOffset !== 'number') state.counterOffset = 0;

  function build() {
    const readings = state.readings || [];
    const todayStr = today();
    const finished = finishedReadings(readings);
    const undated = undatedFinished(readings);
    if (!finished.length && !(isOwner() && undated.length)) {
      return h('div', { 'data-role': 'counter', hidden: true });
    }
    const redraw = (ev) => ev.currentTarget.closest('[data-role="counter"]').replaceWith(build());
    const counts = countsNow(readings, todayStr);
    const period = state.counterPeriod;
    const range = rangeFor(period, state.counterOffset, todayStr);
    const list = inRange(readings, range);
    const year = Number(range.start.slice(0, 4));
    const series = monthlySeries(readings, year);
    const max = Math.max(1, ...series);
    const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    return h(
      'section',
      { class: 'counter panel', 'data-role': 'counter', 'aria-label': 'Livres lus' },
      h('h3', {}, 'Livres lus'),
      h(
        'div',
        { class: 'counter-tiles' },
        PERIODS.map((p) => h(
          'button',
          {
            class: `counter-tile${p.id === period ? ' on' : ''}`, type: 'button', 'data-period': p.id, 'aria-pressed': p.id === period ? 'true' : 'false',
            onclick: (ev) => { state.counterPeriod = p.id; state.counterOffset = 0; redraw(ev); },
          },
          h('strong', {}, String(counts[p.id])),
          h('span', {}, p.label),
        )),
      ),
      h(
        'div',
        { class: 'counter-nav' },
        h('button', { class: 'btn small', type: 'button', 'data-action': 'counter-prev', 'aria-label': 'Période précédente', onclick: (ev) => { state.counterOffset -= 1; redraw(ev); } }, '‹'),
        h(
          'div',
          { class: 'counter-label' },
          h('strong', { 'data-role': 'counter-label' }, range.label),
          h('span', { 'data-role': 'counter-total' }, `${list.length} livre${list.length > 1 ? 's' : ''} lu${list.length > 1 ? 's' : ''}`),
        ),
        h('button', {
          class: 'btn small', type: 'button', 'data-action': 'counter-next', 'aria-label': 'Période suivante', disabled: state.counterOffset >= 0 ? true : null,
          onclick: (ev) => { state.counterOffset = Math.min(0, state.counterOffset + 1); redraw(ev); },
        }, '›'),
      ),
      list.length
        ? h(
            'ul',
            { class: 'counter-list' },
            list.map((r) => h(
              'li',
              { 'data-reading-done': r.id },
              h('span', { class: 'counter-title' }, r.title, r.author ? h('em', {}, ` · ${r.author}`) : null),
              h('span', { class: 'counter-date' }, formatDateFR(r.finishedAt)),
            )),
          )
        : h('p', { class: 'hint center' }, 'Aucun livre terminé sur cette période.'),
      h(
        'div',
        { class: 'counter-bars', role: 'img', 'aria-label': `Livres terminés par mois en ${year}` },
        series.map((n, i) => h(
          'div',
          { class: `cbar${n ? '' : ' zero'}`, title: `${n}` },
          h('span', { class: 'cbar-n' }, n ? String(n) : ''),
          h('i', { style: `height:${Math.round((n / max) * 100)}%` }),
          h('span', { class: 'cbar-m' }, MONTHS[i]),
        )),
      ),
      h('p', { class: 'hint center' }, `Livres terminés par mois en ${year}.`),
      isOwner() && undated.length
        ? h('p', { class: 'hint center', 'data-role': 'counter-undated' }, `${undated.length} lecture${undated.length > 1 ? 's' : ''} « Terminée${undated.length > 1 ? 's' : ''} » sans date de fin : non comptée${undated.length > 1 ? 's' : ''}. Ajoute la date pour qu’elle apparaisse ici.`)
        : null,
    );
  }

  return { render: build };
}
