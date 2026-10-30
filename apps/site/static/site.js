/* global document */
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
