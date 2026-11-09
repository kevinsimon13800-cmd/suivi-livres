// Réduit et compresse une photo de couverture dans le navigateur avant de l'enregistrer.
// Résultat : une image JPEG en "data URL" d'environ 30 à 120 Ko, stockée directement dans le livre
// (pas besoin de Firebase Storage, qui exige le forfait payant).
import { MAX_COVER_CHARS } from './logic.js?v=4';

const MAX_W = 600;
const MAX_H = 900;

function loadImage(file, win) {
  return new Promise((resolve, reject) => {
    const url = win.URL.createObjectURL(file);
    const img = new win.Image();
    img.onload = () => { win.URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { win.URL.revokeObjectURL(url); reject(new Error('image-illisible')); };
    img.src = url;
  });
}

export async function compressCover(file, win = window) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('pas-une-image');
  if (file.size > 25 * 1024 * 1024) throw new Error('trop-lourde');
  const img = await loadImage(file, win);
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) throw new Error('image-illisible');
  let scale = Math.min(1, MAX_W / w0, MAX_H / h0);
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = win.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // fond blanc pour les PNG transparents
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.82, 0.7, 0.58]) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (data.length <= MAX_COVER_CHARS * 0.6) return data;
    }
    scale *= 0.75;
  }
  throw new Error('trop-lourde');
}
