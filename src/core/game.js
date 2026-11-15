import { $, esc } from './util.js';

// The stat bar shows "current / max" backpack slots (<dt id="statbar-inventory">34 / 38</dt>).
// Lower the current number after items are removed, same as the game does for a discard.
export function adjustInventoryCount(removed) {
  const el = document.getElementById('statbar-inventory');
  if (!el || !removed) return;
  for (const node of el.childNodes) {
    if (node.nodeType !== 3) continue;
    const m = node.nodeValue.match(/(\d+)(\s*\/\s*)(\d+)/);
    if (!m) continue;
    const now = Math.max(0, parseInt(m[1], 10) - removed);
    node.nodeValue = node.nodeValue.replace(m[0], now + m[2] + m[3]);
    return;
  }
}

// Every request to the game carries the fst token: the game's fsUrl() adds it; if that is missing, the token of the page's own links is used.
export function withFst(u) {
  let r = typeof window.fsUrl === 'function' ? window.fsUrl(u) : u;
  if (!/[?&]fst=/.test(r)) {
    const a = document.querySelector('a[href*="fst="]');
    const m = a && a.getAttribute('href').match(/[?&]fst=([^&#]+)/);
    if (m) r += (r.indexOf('?') < 0 ? '?' : '&') + 'fst=' + m[1];
  }
  return r;
}

// One request per chunk. Resolves with the parsed JSON, or a fake error object.
const requestItems = (subcmd, key, ids) =>
  new Promise((resolve) => {
    $.ajax({
      url: withFst('/index.php'),
      data: { cmd: 'profile', subcmd, [key]: ids, ajax: 1 },
      dataType: 'json',
      success: resolve,
      error: (xhr, status, err) =>
        resolve({ r: 1, m: 'Request failed (' + esc(err || status) + '). Please try again.' }),
    });
  });

// index.php?cmd=profile&subcmd=dofragitems&fragIndex[]=<inv id>&ajax=1  (break down)
export const requestFrag = (ids) => requestItems('dofragitems', 'fragIndex[]', ids);
