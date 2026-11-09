// Illustrations décoratives (dessins au trait originaux) : temple grec, roses, épées croisées.
// Chaînes SVG constantes (aucune donnée utilisateur) : insérées telles quelles dans la page.

const rose = (x, y, r = 9) => `
  <g transform="translate(${x} ${y})">
    ${[0, 72, 144, 216, 288].map((a) => `<ellipse class="fill-rose" cx="0" cy="${-r * 0.48}" rx="${r * 0.5}" ry="${r * 0.52}" transform="rotate(${a})"/>`).join('')}
    <circle r="${r * 0.5}" class="fill-rose"/>
    <path d="M${-r * 0.28} ${r * 0.05} C ${-r * 0.3} ${-r * 0.35} ${r * 0.32} ${-r * 0.38} ${r * 0.3} ${r * 0.02} C ${r * 0.28} ${r * 0.28} ${-r * 0.1} ${r * 0.3} ${-r * 0.08} ${r * 0.02} C ${-r * 0.06} ${-r * 0.14} ${r * 0.12} ${-r * 0.12} ${r * 0.1} ${r * 0.02}"/>
  </g>`;

const leaf = (x, y, angle, len = 12) => `
  <path transform="translate(${x} ${y}) rotate(${angle})" class="fill-leaf"
        d="M0 0 C ${len * 0.35} ${-len * 0.35} ${len * 0.8} ${-len * 0.3} ${len} 0 C ${len * 0.8} ${len * 0.3} ${len * 0.35} ${len * 0.35} 0 0 Z M0 0 L ${len * 0.85} 0"/>`;

// Branche fleurie (dessinée vers la droite ; retournée par CSS pour le côté gauche)
const branch = `
  <path d="M4 58 C 30 52 46 40 62 40 S 96 30 112 18"/>
  ${leaf(22, 53, -30)}${leaf(34, 49, 35)}${leaf(52, 42, -40)}${leaf(70, 39, 30)}${leaf(88, 32, -35)}
  ${rose(46, 44, 8)}${rose(80, 34, 10)}${rose(112, 18, 7)}
  <circle cx="62" cy="52" r="2.2" class="fill-gold"/><circle cx="98" cy="44" r="2" class="fill-gold"/>`;

const temple = `
  <path class="fill-paper" d="M60 6 L112 30 L8 30 Z"/>
  <path d="M60 6 L112 30 L8 30 Z"/>
  <path d="M28 27 L60 13 L92 27"/>
  <circle cx="60" cy="22" r="3" class="fill-gold"/>
  <rect x="10" y="30" width="100" height="7" rx="1" class="fill-paper"/>
  <path d="M14 33.5 H106" stroke-dasharray="3 3"/>
  ${[22, 41, 60, 79, 98].map((x) => `
    <path d="M${x - 5} 37 h10 v3 h-10 z" class="fill-paper"/>
    <path d="M${x - 3.5} 40 V78 M${x + 3.5} 40 V78 M${x} 42 V76"/>
    <path d="M${x - 5} 78 h10 v3 h-10 z" class="fill-paper"/>`).join('')}
  <path d="M6 81 H114 M2 86 H118 M0 91 H120"/>`;

const sword = `
  <path class="fill-paper" d="M4 -3.2 L112 -2 L124 0 L112 2 L4 3.2 Z"/>
  <path d="M4 -3.2 L112 -2 L124 0 L112 2 L4 3.2 Z M8 0 H108"/>
  <path d="M0 -12 C 3 -8 3 8 0 12" stroke-width="3.2"/>
  <circle cx="0.5" cy="-13" r="2.2" class="fill-gold"/><circle cx="0.5" cy="13" r="2.2" class="fill-gold"/>
  <path d="M-2 -2.2 H-20 V2.2 H-2 Z" class="fill-paper"/>
  <path d="M-6 -2.2 L-9 2.2 M-11 -2.2 L-14 2.2 M-16 -2.2 L-19 2.2"/>
  <circle cx="-24" cy="0" r="4" class="fill-gold"/>`;

export const HERO_ART = `
<svg class="art art-hero" viewBox="0 0 380 100" role="img" aria-label="Temple grec entouré de roses" focusable="false">
  <g class="ink" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6">
    <g transform="translate(0 30) scale(-1 1) translate(-128 0)">${branch}</g>
    <g transform="translate(130 4)">${temple}</g>
    <g transform="translate(252 30)">${branch}</g>
  </g>
</svg>`;

export const SWORDS_DIVIDER = `
<svg class="art art-divider" viewBox="0 -14 300 68" aria-hidden="true" focusable="false">
  <g class="ink" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
    <path d="M10 20 H96 M204 20 H290"/>
    <g transform="translate(150 20) rotate(-18) translate(-60 0) scale(0.95)">${sword}</g>
    <g transform="translate(150 20) rotate(198) translate(-60 0) scale(0.95)">${sword}</g>
    ${rose(150, 20, 7)}
  </g>
</svg>`;

export const COVER_PLACEHOLDER = `
<svg class="art art-cover" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <g class="ink" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" transform="translate(0 14)">${temple}</g>
</svg>`;

export const SMALL_ROSE = `
<svg class="art art-rose" viewBox="-12 -12 24 24" aria-hidden="true" focusable="false">
  <g class="ink" fill="none" stroke-linecap="round" stroke-width="1.4">${rose(0, 0, 9)}</g>
</svg>`;
