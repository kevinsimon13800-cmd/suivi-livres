// Réseaux sociaux du profil : normalisation des liens + pictogrammes décoratifs (dessins originaux).

export const SOCIALS = [
  { id: 'instagram', label: 'Instagram', placeholder: '@tonpseudo ou lien Instagram' },
  { id: 'wattpad', label: 'Wattpad', placeholder: '@tonpseudo ou lien de ton profil Wattpad' },
];

/**
 * Transforme ce que l'utilisateur tape (@pseudo, pseudo, lien complet…) en lien de profil propre.
 * Retourne { ok, url, handle, error }. Une saisie vide est valide (= pas de lien).
 */
export function normalizeSocial(kind, input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: true, url: '', handle: '' };
  if (raw.length > 200) return { ok: false, error: 'Lien trop long.' };
  let handle = '';
  if (kind === 'instagram') {
    const m = raw.match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([A-Za-z0-9._]+)\/?(?:[?#].*)?$/i);
    if (m) handle = m[1];
    else if (/^@?[A-Za-z0-9._]+$/.test(raw)) handle = raw.replace(/^@/, '');
    if (!handle || handle.length > 30 || /^(p|reel|reels|stories|explore|accounts)$/i.test(handle)) {
      return { ok: false, error: 'Indique ton pseudo Instagram (ex. @lauriane) ou le lien de ton profil.' };
    }
    return { ok: true, handle, url: `https://www.instagram.com/${handle}/` };
  }
  if (kind === 'wattpad') {
    const m = raw.match(/^(?:https?:\/\/)?(?:www\.|m\.)?wattpad\.com\/user\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/i);
    if (m) handle = m[1];
    else if (/^@?[A-Za-z0-9_-]+$/.test(raw)) handle = raw.replace(/^@/, '');
    if (!handle || handle.length > 40) {
      return { ok: false, error: 'Indique ton pseudo Wattpad (ex. @lauriane) ou le lien de ton profil (wattpad.com/user/…).' };
    }
    return { ok: true, handle, url: `https://www.wattpad.com/user/${handle}` };
  }
  return { ok: false, error: 'Réseau inconnu.' };
}

/** Vérifie un lien déjà enregistré avant de l'afficher (protection si la base contient autre chose). */
export function safeSocialUrl(kind, url) {
  if (typeof url !== 'string' || !url) return '';
  const r = normalizeSocial(kind, url);
  return r.ok && r.url === url ? url : '';
}

// Pictogrammes originaux au trait (blanc sur médaillon rose) — pas les logos des marques.
const ICONS = {
  // appareil photo vintage avec flash
  instagram: `
    <path d="M14 22 h6 l3 -4 h14 l3 4 h10 a4 4 0 0 1 4 4 v20 a4 4 0 0 1 -4 4 h-36 a4 4 0 0 1 -4 -4 v-20 a4 4 0 0 1 4 -4 z"/>
    <circle cx="32" cy="36" r="8.5"/><circle cx="32" cy="36" r="3.5"/>
    <path d="M45 27 h3"/><path d="M17 18 v4"/>`,
  // livre ouvert et plume
  wattpad: `
    <path d="M32 24 C 26 20 18 20 12 22 V48 C 18 46 26 46 32 50 C 38 46 46 46 52 48 V22 C 46 20 38 20 32 24 Z"/>
    <path d="M32 24 V50"/>
    <path d="M17 29 C 21 28 25 28 28 29 M17 35 C 21 34 25 34 28 35 M17 41 C 21 40 25 40 28 41"/>
    <path d="M50 10 C 42 14 38 22 37 32 C 41 28 47 22 50 10 Z"/><path d="M37 32 L35 36"/>`,
};

export function socialIconSvg(kind) {
  return `<svg class="social-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind] || ''}</g>
  </svg>`;
}

// Petite couronne de feuillage autour des médaillons
export const SOCIAL_WREATH = `<svg class="social-wreath" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <g fill="none" stroke-linecap="round">
    <path d="M22 78 C 10 64 10 38 24 24" stroke="#c39a4d" stroke-width="1.4"/>
    <path d="M78 78 C 90 64 90 38 76 24" stroke="#c39a4d" stroke-width="1.4"/>
    ${[[17, 66, -60], [13, 52, -85], [15, 38, -110], [83, 66, 60], [87, 52, 85], [85, 38, 110]].map(([x, y, a]) => `
      <path transform="translate(${x} ${y}) rotate(${a})" d="M0 0 C 2 -3 6 -3 8 0 C 6 3 2 3 0 0 Z" fill="#dfe7d5" stroke="#9fb38d" stroke-width="1"/>`).join('')}
    <circle cx="26" cy="21" r="4" fill="#f6cbd4" stroke="#c76b84" stroke-width="1.2"/>
    <circle cx="74" cy="21" r="4" fill="#f6cbd4" stroke="#c76b84" stroke-width="1.2"/>
    <circle cx="50" cy="90" r="2.4" fill="#c39a4d"/>
  </g>
</svg>`;
