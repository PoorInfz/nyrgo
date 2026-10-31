/* global document, window */

// Language: a choice made with the switch is remembered; on a first visit to the English page,
// a browser in another language we have is sent to that page once.
const KEY = 'nyrgo-lang';
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const switcher = document.querySelector('details.lang');
document.querySelectorAll('.lang a[data-lang]').forEach((a) => {
  a.addEventListener('click', () => {
    try {
      localStorage.setItem(KEY, a.dataset.lang);
    } catch {
      // private mode: the link still works, it just is not remembered
    }
  });
});
if (switcher) {
  document.addEventListener('click', (e) => {
    if (switcher.open && !switcher.contains(e.target)) switcher.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && switcher.open) {
      switcher.open = false;
      switcher.querySelector('summary').focus();
    }
  });
}
const have = (document.documentElement.dataset.langs || 'en').split(',');
const match = (tag) => {
  const base = (tag || '').toLowerCase().split('-')[0];
  return have.includes(base) ? base : null;
};
const chosen = match(read());
const here = document.documentElement.lang;
if (window.location.pathname === '/' && here === 'en') {
  const wanted =
    chosen ?? (navigator.languages || [navigator.language]).map(match).find(Boolean) ?? 'en';
  if (wanted !== 'en') window.location.replace('/' + wanted + '/' + window.location.hash);
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
