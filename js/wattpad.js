// Import d'une histoire Wattpad à partir d'un lien (ou du texte de partage qui contient le lien).
// La page publique d'une histoire Wattpad est lisible depuis un autre site (en-tête CORS ouvert) :
// on y relève titre, auteur, couverture, nombre de chapitres, statut et résumé.
// Wattpad peut changer sa page : en cas d'échec, l'utilisateur complète la fiche à la main.

const WP_HOST = /^(?:www\.|m\.)?wattpad\.com$/i;

/**
 * Trouve un lien Wattpad dans un texte libre (ex. « Lis "X" sur #Wattpad https://www.wattpad.com/story/123?utm… »).
 * Retourne { kind: 'story'|'part'|'short', id, url } ou null.
 */
export function parseWattpadLink(text) {
  const raw = String(text ?? '');
  const candidates = raw.match(/https?:\/\/[^\s"'<>]+/gi) || (/(^|\s)(www\.)?wattpad\.com\/\S+/i.test(raw) ? [`https://${raw.trim().replace(/^.*?((www\.)?wattpad\.com\/\S+).*$/i, '$1')}`] : []);
  for (const c of candidates) {
    let u;
    try { u = new URL(c.replace(/[),.;!?»]+$/, '')); } catch (e) { continue; }
    if (/^w\.tt$/i.test(u.hostname)) return { kind: 'short', id: '', url: `https://w.tt${u.pathname}` };
    if (!WP_HOST.test(u.hostname)) continue;
    let m = u.pathname.match(/^\/story\/(\d+)/);
    if (m) return { kind: 'story', id: m[1], url: `https://www.wattpad.com/story/${m[1]}` };
    m = u.pathname.match(/^\/(\d+)(?:-[^/]*)?\/?$/);
    if (m) return { kind: 'part', id: m[1], url: `https://www.wattpad.com/${m[1]}` };
    m = u.pathname.match(/^\/stories\/(\d+)/) || u.pathname.match(/^\/story\/(\d+)/);
    if (m) return { kind: 'story', id: m[1], url: `https://www.wattpad.com/story/${m[1]}` };
  }
  return null;
}

const decodeJsonString = (s) => {
  try { return JSON.parse(`"${s}"`); } catch (e) { return s; }
};
const decodeEntities = (s) => String(s)
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Dans une page de chapitre, retrouve l'identifiant de l'histoire (le plus cité). */
export function findStoryIdInHtml(html) {
  const counts = new Map();
  for (const m of String(html).matchAll(/\/story\/(\d+)/g)) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  let best = null;
  for (const [id, n] of counts) if (!best || n > best[1]) best = [id, n];
  return best ? best[0] : null;
}

/** Extrait les infos d'une histoire depuis le HTML de sa page. id facultatif (déduit sinon). */
export function extractStory(html, id) {
  const s = String(html);
  const sid = id || findStoryIdInHtml(s);
  if (!sid) return null;
  const idRe = escapeRe(sid);
  const out = { storyId: sid, url: `https://www.wattpad.com/story/${sid}`, title: '', author: '', cover: '', chaptersTotal: 0, storyCompleted: false, description: '' };

  // Bloc de métadonnées de la page : "title":"…","image":"…","banner":"…?id=<sid>…"
  const meta = s.match(new RegExp(`"title":"((?:[^"\\\\]|\\\\.)*)","image":"(https:[^"]*)","banner":"[^"]*id=${idRe}\\b`));
  if (meta) {
    out.title = decodeJsonString(meta[1]);
    out.cover = decodeJsonString(meta[2]);
    const after = s.slice(meta.index, meta.index + 4000);
    const au = after.match(/"story":\{[^{}]*?"author":"((?:[^"\\]|\\.)*)"/);
    if (au) out.author = decodeJsonString(au[1]);
    const before = s.slice(Math.max(0, meta.index - 6000), meta.index);
    const d = [...before.matchAll(/"description":"((?:[^"\\]|\\.)*)"/g)].pop();
    if (d) out.description = decodeJsonString(d[1]);
  }
  // Repli : <title>Titre - Auteur - Wattpad</title>
  if (!out.title || !out.author) {
    const t = s.match(/<title>([^<]*)<\/title>/i);
    if (t) {
      const parts = decodeEntities(t[1]).split(' - ');
      if (parts.length >= 3 && /wattpad/i.test(parts[parts.length - 1])) {
        if (!out.author) out.author = parts[parts.length - 2].trim();
        if (!out.title) out.title = parts.slice(0, -2).join(' - ').trim();
      } else if (!out.title) out.title = parts[0].trim();
    }
  }
  if (!out.cover) {
    const c = s.match(new RegExp(`https://img\\.wattpad\\.com/cover/${idRe}-[A-Za-z0-9\\-_.]+`));
    if (c) out.cover = c[0];
  }
  // Nombre de chapitres et statut, rattachés à l'URL de CETTE histoire (la page cite d'autres histoires)
  const np = s.match(new RegExp(`"url":"https://www\\.wattpad\\.com/story/${idRe}[^"]*","firstPartId":\\d+,"numParts":(\\d+)`));
  if (np) {
    out.chaptersTotal = Number(np[1]);
    const back = s.slice(Math.max(0, np.index - 4000), np.index);
    const comp = [...back.matchAll(/"completed":(true|false)/g)].pop();
    if (comp) out.storyCompleted = comp[1] === 'true';
  }
  if (out.cover && !/^https:\/\/img\.wattpad\.com\//.test(out.cover)) out.cover = '';
  out.title = out.title.slice(0, 150);
  out.author = out.author.slice(0, 100);
  out.description = out.description.slice(0, 3000);
  return out.title ? out : null;
}

/**
 * Importe une histoire à partir d'un texte contenant un lien Wattpad.
 * Lance une Error avec un message en français prêt à afficher.
 */
export async function importFromWattpad(text, fetchImpl) {
  const link = parseWattpadLink(text);
  if (!link) throw new Error('Aucun lien Wattpad trouvé. Copie le lien de l’histoire (Partager → Copier le lien).');
  const get = async (url) => {
    let res;
    try {
      res = await fetchImpl(url, { credentials: 'omit' });
    } catch (e) {
      throw new Error('Wattpad ne répond pas. Vérifie ta connexion et réessaie.');
    }
    if (!res.ok) throw new Error(res.status === 404 ? 'Histoire introuvable sur Wattpad (supprimée ou privée ?).' : 'Wattpad a refusé la demande. Réessaie plus tard.');
    return res.text();
  };
  let storyId = link.kind === 'story' ? link.id : null;
  let html = await get(link.url);
  if (!storyId) {
    storyId = findStoryIdInHtml(html);
    if (!storyId) throw new Error('Impossible de retrouver l’histoire à partir de ce lien.');
    html = await get(`https://www.wattpad.com/story/${storyId}`);
  }
  const story = extractStory(html, storyId);
  if (!story) throw new Error('Wattpad a changé sa page : impossible de lire cette histoire. Ajoute-la à la main.');
  return story;
}
