// Petits outils du DOM pour les scènes de jeu, qui sont dessinées à la main.
/** @param {string} sel @param {ParentNode} [root] @returns {any} */
export const $ = (sel, root = document) => root.querySelector(sel);
/** @param {string} sel @param {ParentNode} [root] @returns {any[]} */
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

// Préférences gardées dans le navigateur. Un navigateur qui refuse le stockage (navigation
// privée stricte) fait simplement perdre les préférences.
const safe = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};
export const store = {
  get: (k) => safe(() => localStorage.getItem(`slots.${k}`)),
  set: (k, v) => void safe(() => localStorage.setItem(`slots.${k}`, v)),
  del: (k) => void safe(() => localStorage.removeItem(`slots.${k}`)),
};
