import { toggleType, typeButtonsCss, typeButtonsHtml } from './typebuttons.js';

// The search box and the item type buttons over a shop's items (Arena Token Shop, PvP Ladder rewards, Loyalty rewards).
export const FILTER_CSS =
  '.fsbArBar{display:flex;flex-direction:column;align-items:center;gap:8px;margin:4px 0 14px;}' +
  '.fsbArBar input{width:260px;max-width:90%;box-sizing:border-box;height:24px;padding:0 8px;background:#e8c88e;border:1px solid #20170396;border-radius:4px;box-shadow:0 0 3px 0 #000;color:#3b2a14;font:bold 12px Arial,sans-serif;}' +
  '.fsbArBar input:hover,.fsbArBar input:focus{background:#f0d6a2;border-color:#3b2a14;outline:none;}' +
  '.fsbArBar .gsTypes{display:flex;justify-content:center;}' + typeButtonsCss('.fsbArBar') +
  '.fsbArNone{display:none;text-align:center;padding:10px;font:italic 12px Arial,sans-serif;}';

// list: the items, each with name, type (index in ITEM_TYPES, -1 not known); show(item, on) shows or hides one.
// Returns { bar, none, apply }: put the two elements where they belong, call apply() whenever what is known about the items changes.
export function createFilterBar(list, show) {
  const bar = document.createElement('div');
  bar.className = 'fsbArBar';
  bar.innerHTML = '<input type="text" placeholder="Search items…" aria-label="Search items" autocomplete="off"><span class="gsTypes"></span>';
  const none = document.createElement('div');
  none.className = 'fsbArNone';
  none.textContent = 'No item matches.';
  const search = bar.querySelector('input');
  const types = bar.querySelector('.gsTypes');
  const selected = new Set();
  function apply() {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    const counts = {};
    let shown = 0;
    list.forEach((it) => {
      const hit = words.every((w) => it.name.toLowerCase().indexOf(w) !== -1);
      if (hit) counts[it.type] = (counts[it.type] || 0) + 1; // an item of no known type (a key) counts under All only
      const on = hit && (!selected.size || selected.has(it.type));
      show(it, on);
      if (on) shown += 1;
    });
    types.innerHTML = typeButtonsHtml(selected, counts, list.map((it) => it.type).filter((t) => t >= 0));
    none.style.display = shown ? 'none' : 'block';
  }
  search.addEventListener('input', apply);
  // Enter must not send one of the page's forms
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  types.addEventListener('click', (e) => {
    const b = e.target.closest('.gsTyp');
    if (!b) return;
    e.preventDefault();
    toggleType(selected, b.dataset.t);
    apply();
  });
  return { bar, none, apply };
}
