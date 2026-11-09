// Réseaux sociaux du profil : normalisation, affichage public, saisie dans « Mon profil ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { start } from '../js/app.js';
import { createMockBackend, OWNER } from './mock-backend.js';
import { normalizeSocial, safeSocialUrl } from '../js/socials.js';

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const SHARE = 'https://moi.github.io/livres/';

test('normalizeSocial : Instagram (pseudo, @pseudo, liens avec paramètres)', () => {
  const ok = (v) => normalizeSocial('instagram', v).url;
  assert.equal(ok('lauriane.ecrit'), 'https://www.instagram.com/lauriane.ecrit/');
  assert.equal(ok('@lauriane_ecrit'), 'https://www.instagram.com/lauriane_ecrit/');
  assert.equal(ok('https://www.instagram.com/lauriane.ecrit/?igsh=abc123'), 'https://www.instagram.com/lauriane.ecrit/');
  assert.equal(ok('instagram.com/lauriane'), 'https://www.instagram.com/lauriane/');
  assert.equal(ok('  '), '');
  for (const bad of ['https://evil.com/lauriane', 'javascript:alert(1)', 'https://www.instagram.com/p/Cxyz', 'lau riane', 'x'.repeat(31), 'https://instagram.com.evil.io/x']) {
    assert.equal(normalizeSocial('instagram', bad).ok, false, bad);
  }
});

test('normalizeSocial : Wattpad (pseudo, @pseudo, lien de profil)', () => {
  const ok = (v) => normalizeSocial('wattpad', v).url;
  assert.equal(ok('LaurianeD'), 'https://www.wattpad.com/user/LaurianeD');
  assert.equal(ok('@Lau_riane-13'), 'https://www.wattpad.com/user/Lau_riane-13');
  assert.equal(ok('https://www.wattpad.com/user/LaurianeD?utm_source=ios'), 'https://www.wattpad.com/user/LaurianeD');
  assert.equal(ok('wattpad.com/user/LaurianeD/'), 'https://www.wattpad.com/user/LaurianeD');
  for (const bad of ['https://www.wattpad.com/story/123', 'https://evil.com/user/x', 'a b', 'javascript:alert(1)']) {
    assert.equal(normalizeSocial('wattpad', bad).ok, false, bad);
  }
});

test('safeSocialUrl : n’affiche que des liens propres', () => {
  assert.equal(safeSocialUrl('instagram', 'https://www.instagram.com/lau/'), 'https://www.instagram.com/lau/');
  assert.equal(safeSocialUrl('instagram', 'javascript:alert(1)'), '');
  assert.equal(safeSocialUrl('wattpad', 'https://evil.com/user/x'), '');
  assert.equal(safeSocialUrl('wattpad', undefined), '');
});

async function mount(profile, hash = '') {
  const dom = new JSDOM('<div id="app"></div>', { url: SHARE + hash });
  const win = dom.window;
  win.scrollTo = () => {};
  const backend = createMockBackend({ books: [], notes: [], readings: [], profile });
  const root = win.document.getElementById('app');
  start({ backend, root, ownerUid: OWNER.uid, shareUrl: SHARE, doc: win.document, win, storage: null, fetchImpl: async () => ({ ok: false, status: 404, text: async () => '' }) });
  await tick();
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const submit = async (form) => { form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); await tick(40); };
  const click = async (el) => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await tick(30); };
  return { win, root, backend, $, $$, submit, click, close: () => win.close() };
}

test('visiteur : icônes cliquables vers les réseaux, nouvel onglet, sur les deux onglets', async () => {
  const ctx = await mount({ displayName: 'Lauriane', instagram: 'https://www.instagram.com/lau.ecrit/', wattpad: 'https://www.wattpad.com/user/LauD' });
  const links = ctx.$$('.socials a');
  assert.deepEqual(links.map((a) => a.dataset.social), ['instagram', 'wattpad']);
  assert.equal(links[0].getAttribute('href'), 'https://www.instagram.com/lau.ecrit/');
  assert.equal(links[1].getAttribute('href'), 'https://www.wattpad.com/user/LauD');
  for (const a of links) {
    assert.equal(a.getAttribute('target'), '_blank');
    assert.match(a.getAttribute('rel'), /noopener/);
    assert.match(a.getAttribute('aria-label'), /nouvel onglet/);
    assert.ok(a.querySelector('svg.social-icon'));
  }
  ctx.win.location.hash = '#/lectures';
  await tick(30);
  assert.equal(ctx.$$('.socials a').length, 2);
  ctx.close();
});

test('visiteur : pas de bloc si aucun réseau, lien piégé en base ignoré', async () => {
  let ctx = await mount({ displayName: 'L' });
  assert.equal(ctx.$('.socials'), null);
  ctx.close();
  ctx = await mount({ displayName: 'L', instagram: 'javascript:alert(1)', wattpad: 'https://www.wattpad.com/user/Ok' });
  assert.deepEqual(ctx.$$('.socials a').map((a) => a.dataset.social), ['wattpad']);
  ctx.close();
});

async function loginAndOpenProfile(ctx) {
  ctx.win.location.hash = '#/admin';
  await tick();
  const f = ctx.$('[data-role="login-form"]');
  f.elements.email.value = OWNER.email;
  f.elements.password.value = OWNER.password;
  await ctx.submit(f);
  await tick(40);
  await ctx.click(ctx.$('[data-action="profile"]'));
}

test('propriétaire : ajoute ses réseaux (pseudo ou lien) → liens propres enregistrés et affichés', async () => {
  const ctx = await mount({ displayName: 'Lauriane', bio: '' });
  await loginAndOpenProfile(ctx);
  const f = ctx.$('[data-role="profile-form"]');
  f.elements.instagram.value = '@lau.ecrit';
  f.elements.wattpad.value = 'https://www.wattpad.com/user/LauD?utm_source=ios';
  await ctx.submit(f);
  const raw = await ctx.backend.getProfile();
  assert.equal(raw.instagram, 'https://www.instagram.com/lau.ecrit/');
  assert.equal(raw.wattpad, 'https://www.wattpad.com/user/LauD');
  assert.equal(ctx.$$('.socials a').length, 2);
  // vider un champ retire l'icône
  await ctx.click(ctx.$('[data-action="profile"]'));
  const f2 = ctx.$('[data-role="profile-form"]');
  assert.equal(f2.elements.instagram.value, 'https://www.instagram.com/lau.ecrit/');
  f2.elements.instagram.value = '';
  await ctx.submit(f2);
  assert.equal((await ctx.backend.getProfile()).instagram, '');
  assert.deepEqual(ctx.$$('.socials a').map((a) => a.dataset.social), ['wattpad']);
  ctx.close();
});

test('propriétaire : lien invalide → message, saisie conservée, rien enregistré', async () => {
  const ctx = await mount({ displayName: 'Lauriane', bio: 'Bio' });
  await loginAndOpenProfile(ctx);
  const f = ctx.$('[data-role="profile-form"]');
  f.elements.displayName.value = 'Lauriane D.';
  f.elements.instagram.value = 'https://evil.com/x';
  await ctx.submit(f);
  assert.match(ctx.root.textContent, /pseudo Instagram/);
  const f2 = ctx.$('[data-role="profile-form"]');
  assert.equal(f2.elements.instagram.value, 'https://evil.com/x');
  assert.equal(f2.elements.displayName.value, 'Lauriane D.');
  assert.equal((await ctx.backend.getProfile()).displayName, 'Lauriane');
  ctx.close();
});
