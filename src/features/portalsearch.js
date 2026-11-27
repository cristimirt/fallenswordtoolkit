import { loadSettings } from '../core/settings.js';
import { $ } from '../core/util.js';

// ---------------------------------------------------------------- portal search (world page)
// The game's portal window (#portalDialog) lists every destination, a few hundred of them. This puts a search box over the list:
// part of a name (several words in any order), the start of a level ("40" also finds 400) or a range of levels ("100-150"). It only
// hides rows. The rows stay the game's own, so travelling works as before; nothing here ever clicks one (it costs gold).
const CSS =
  '#portalDialog .fsbPs{display:flex;align-items:center;gap:8px;margin:0 0 8px;}' +
  '#portalDialog .fsbPs input{flex:1;min-width:0;box-sizing:border-box;padding:4px 8px;font:inherit;font-size:13px;color:#f3e3b8;background:#1c1006;border:1px solid #8a6a38;border-radius:4px;outline:none;}' +
  '#portalDialog .fsbPs input:focus{border-color:#e0b252;}' +
  '#portalDialog .fsbPs input::placeholder{color:#a98a52;}' +
  '#portalDialog .fsbPs input::-webkit-search-cancel-button{cursor:pointer;}' +
  '#portalDialog .fsbPs span{flex:none;font-size:12px;color:#c9b07e;white-space:nowrap;}' +
  '#portalDialog .fsbPsNone{padding:12px 0;text-align:center;color:#c9b07e;}';

export function matchPortal(query, name, level) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(q);
  if (range) return +level >= Math.min(+range[1], +range[2]) && +level <= Math.max(+range[1], +range[2]);
  if (/^\d+$/.test(q)) return String(level).startsWith(q);
  const n = name.toLowerCase();
  return q.split(/\s+/).every((w) => n.indexOf(w) !== -1);
}

export function initPortalSearch() {
  if (window.top !== window.self || !loadSettings().portalSearch) return;
  if (!/[?&]cmd=world(&|$)/.test(location.search)) return;
  const css = document.createElement('style');
  css.textContent = CSS;
  document.head.appendChild(css);

  const text = (row, cls) => ((row.querySelector('.' + cls) || {}).textContent || '').trim();
  function filter(dialog) {
    const box = dialog.querySelector('.fsbPs');
    if (!box) return;
    const query = box.querySelector('input').value;
    const rows = dialog.querySelectorAll('ul.portals > li.portal');
    let shown = 0;
    rows.forEach((row) => {
      const on = matchPortal(query, text(row, 'name'), text(row, 'level'));
      row.style.display = on ? '' : 'none';
      if (on) shown++;
    });
    const count = query.trim() ? shown + ' of ' + rows.length : '';
    const label = box.querySelector('span');
    if (label.textContent !== count) label.textContent = count; // written only when it changes: the observer below sees every write
    dialog.querySelector('.fsbPsNone').hidden = !(rows.length && !shown);
    const list = dialog.querySelector('.portal-container');
    if (list) list.scrollTop = 0;
  }

  // adds the box when the window has its list; true when it was added just now
  function addBox(dialog) {
    const container = dialog.querySelector('.portal-container');
    if (!container || dialog.querySelector('.fsbPs')) return false;
    const box = document.createElement('div');
    box.className = 'fsbPs';
    box.innerHTML = '<input type="search" placeholder="Search by name or level (e.g. 100-150)" autocomplete="off" spellcheck="false" aria-label="Search destinations"><span></span>';
    dialog.insertBefore(box, dialog.querySelector('.headings') || container);
    const none = document.createElement('div');
    none.className = 'fsbPsNone';
    none.textContent = 'No destination matches.';
    none.hidden = true;
    container.appendChild(none);
    const input = box.querySelector('input');
    input.addEventListener('input', () => filter(dialog));
    // typing here must not reach the game, which listens to the keyboard on the whole page; Escape on an empty box still closes
    ['keydown', 'keyup', 'keypress'].forEach((type) => input.addEventListener(type, (e) => {
      if (e.key === 'Escape') {
        if (!input.value) return;
        e.preventDefault();
        input.value = '';
        filter(dialog);
      }
      e.stopPropagation();
    }));
    return true;
  }

  const focus = (dialog) => { const input = dialog.querySelector('.fsbPs input'); if (input && input.offsetParent) input.focus({ preventScroll: true }); };
  // every time the window is opened: an empty box, ready to type in
  $(document).on('dialogopen', '#portalDialog', function () {
    addBox(this);
    const input = this.querySelector('.fsbPs input');
    if (input) input.value = '';
    filter(this);
    setTimeout(() => focus(this), 0);
  });

  // the game makes the window, and may fill or rebuild its list, at any time
  let rows = null;
  new MutationObserver(() => {
    const dialog = document.getElementById('portalDialog');
    if (!dialog) return;
    const added = addBox(dialog);
    const first = dialog.querySelector('ul.portals > li.portal');
    if (added || first !== rows) {
      rows = first;
      filter(dialog);
      if (added) focus(dialog);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
