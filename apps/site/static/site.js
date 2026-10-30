/* global document, window */

// Language: a choice made with the switch is remembered; on a first visit to the English page,
// a Spanish browser is sent to /es/ once.
const KEY = 'nyrgo-lang';
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
document.querySelectorAll('.lang a[data-lang]').forEach((a) => {
  a.addEventListener('click', () => {
    try {
      localStorage.setItem(KEY, a.dataset.lang);
    } catch {
      // private mode: the link still works, it just is not remembered
    }
  });
});
const chosen = read();
const here = document.documentElement.lang;
if (window.location.pathname === '/' && here === 'en') {
  const wanted =
    chosen ?? ((navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en');
  if (wanted === 'es') window.location.replace('/es/' + window.location.hash);
}

// Element filter for the creature grid.
const grid = document.getElementById('grid');
document.querySelectorAll('.filter').forEach((button) => {
  button.addEventListener('click', () => {
    const f = button.dataset.filter;
    document.querySelectorAll('.filter').forEach((b) => {
      b.classList.toggle('on', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    });
    grid.querySelectorAll('.creature').forEach((c) => {
      c.hidden = f !== 'all' && c.dataset.element !== f;
    });
  });
});
