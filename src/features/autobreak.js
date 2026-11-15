import { adjustInventoryCount, requestFrag, withFst } from '../core/game.js';
import { RARITIES } from '../core/items.js';
import { loadSettings, recall, remember } from '../core/settings.js';
import { $, esc } from '../core/util.js';

// ---------------------------------------------------------------- automatic break down
// Runs on every game page, not only the backpack: every 5 seconds it asks the game for the bag (cmd=profile&subcmd=fetchinv)
// and breaks down what fits the settings. Settings and locks are read from localStorage each time, so changes made in
// another tab count straight away.
// Equipment only (helmet 0, armor 1, gloves 2, boots 3, weapon 4, shield 5, ring 6, amulet 7, rune 8), never locked,
// bound, guild tagged or a container. (Worn items are not in the bag data.)
export function autoBreakMatches(items, s, locked) {
  return (items || []).filter((it) =>
    it.t >= 0 && it.t <= 8 &&
    !it.c && !it.bn && !it.tg && !locked(it.a) &&
    s.autoBreakRar.indexOf(it.r === undefined ? 0 : it.r) !== -1 &&
    (s.autoBreakMin === null || it.l >= s.autoBreakMin) &&
    (s.autoBreakMax === null || it.l <= s.autoBreakMax));
}

export const abLocks = () => { try { return new Set(JSON.parse(recall('locked') || '[]').map(String)); } catch (e) { return new Set(); } };

const abFailed = new Set();

 // refused by the game: not tried again until the page is reloaded
let abBusy = false, abDrySig = '';

// Log of what was broken down (newest first, last 300): console line per item, kept in localStorage for the log window in the settings.
const AB_LOG = 'abLog';

const abLogRead = () => { try { return JSON.parse(recall(AB_LOG) || '[]'); } catch (e) { return []; } };

// The fragments in the game's answer, like "5 x Rare" (the message is only read, its wording is not known for certain: the whole text is kept when nothing is found)
function abFragments(text) {
  const out = [];
  const re = /(\d+)\s*(?:x\s*)?(Common|Rare|Unique|Legendary|Super Elite|Crystalline)\b/gi;
  let m;
  while ((m = re.exec(text))) out.push({ n: parseInt(m[1], 10), type: m[2].replace(/^./, (c) => c.toUpperCase()) });
  return out;
}

// a small notice in the corner of the screen, gone after 2.5 seconds
function abToast(text) {
  console.log('[Toolkit] ' + text);
  if (!$('#bpAbToastCss').length) {
    $('head').append('<style id="bpAbToastCss">#bpAbToasts{position:fixed;right:16px;bottom:16px;z-index:100001;display:flex;flex-direction:column;gap:6px;pointer-events:none}' +
      '.bpAbToast{max-width:320px;padding:8px 12px;background:#2b2417;color:#f0e2b8;border:1px solid #6b5a33;border-radius:4px;font:12px Arial,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.6);transition:opacity .4s}</style>');
  }
  let box = document.getElementById('bpAbToasts');
  if (!box) { box = document.createElement('div'); box.id = 'bpAbToasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'bpAbToast';
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, 2500);
}

 // for testing: __fsbToast('text') in the console
function abRecord(it, frags, note) {
  if (!it) return;
  const row = { t: Date.now(), n: it.n, l: it.l, r: it.r || 0 };
  if (frags && frags.length) row.f = frags;
  else if (note) row.m = note;
  console.log('[Toolkit] Broken down: ' + row.n + ' (level ' + row.l + ', ' + (RARITIES[row.r] || ['?'])[0] + ')' + (row.f ? ' -> ' + row.f.map((f) => f.n + ' x ' + f.type).join(', ') : row.m ? ' -> ' + row.m : ''));
  remember(AB_LOG, JSON.stringify([row].concat(abLogRead()).slice(0, 300)));
}

function showAbLog() {
  $('#bpAbLogWin').remove();
  const fmt = (t) => { const d = new Date(t), p = (n) => ('0' + n).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
  const rows = abLogRead().map((e) => '<div class="bpAbRow"><span class="bpAbT">' + fmt(e.t) + '</span> <b style="color:' + ((RARITIES[e.r] || [0, '#fff'])[1]) + '">' + esc(e.n) + '</b> <span class="bpAbL">level ' + e.l + '</span>' + (e.f ? '<br><span class="bpAbF">' + e.f.map((f) => f.n + ' x ' + esc(f.type) + ' fragments').join(', ') + '</span>' : e.m ? '<br><span class="bpAbF">' + esc(e.m) + '</span>' : '') + '</div>').join('');
  $('body').append('<div id="bpAbLogWin"><div class="bpAbBar"><span>Broken down items</span><span><a href="#" class="bpAbClear">Clear</a> <a href="#" class="bpAbX">&times;</a></span></div><div class="bpAbBody">' + (rows || '<div class="bpAbRow">Nothing has been broken down yet.</div>') + '</div></div>');
}

export const fetchBag = () => new Promise((resolve) => {
  $.ajax({ url: withFst('/index.php'), data: { cmd: 'profile', subcmd: 'fetchinv' }, dataType: 'json', success: (r) => resolve(r && r.items ? r.items : null), error: () => resolve(null) });
});

async function autoBreak() {
  if (abBusy) return;
  const s = loadSettings();
  if (!s.autoBreak || !s.autoBreakRar.length) return;
  abBusy = true;
  try {
    const items = await fetchBag();
    if (!items) return;
    let locked = abLocks();
    const hit = autoBreakMatches(items, s, (id) => locked.has(String(id))).filter((it) => !abFailed.has(String(it.a)));
    if (s.autoBreakDry) {
      const sig = hit.map((it) => it.a).join(',') || '-';
      if (sig === abDrySig) return;
      abDrySig = sig;
      console.log(hit.length
        ? '[Toolkit] Dry run: ' + hit.length + ' item(s) would be broken down:\n' + hit.map((it) => it.n + ' (level ' + it.l + ', ' + (RARITIES[it.r || 0] || ['?'])[0] + ')').join('\n')
        : '[Toolkit] Dry run: no item matches (equipment only; not locked, bound or guild tagged; rarity and level as set).');
      return;
    }
    const ids = hit.map((it) => String(it.a));
    const byId = {};
    hit.forEach((it) => { byId[String(it.a)] = it; });
    let ok = 0, bad = 0, reason = '';
    const total = {}; // fragments of the whole run, by type
    for (const id of ids) { // one item per request, so the answer (fragments gained) belongs to that item
      if (abLocks().has(id)) continue; // locked meanwhile: skipped
      const res = await requestFrag([id]);
      if (res && res.r == 1) { bad++; abFailed.add(id); reason = res.m || reason; continue; }
      ok++;
      const text = res && res.m ? $('<div>').html(res.m).text().replace(/\s+/g, ' ').trim() : '';
      const frags = abFragments(text);
      frags.forEach((f) => { total[f.type] = (total[f.type] || 0) + f.n; });
      abRecord(byId[id], frags, frags.length ? '' : text.slice(0, 140));
    }
    if (ok) {
      adjustInventoryCount(ok);
      if (window.__fsBackpack && typeof window.__fsBackpack._loadData === 'function') window.__fsBackpack._loadData(); // the backpack page shows the new bag
    }
    if (ok || bad) {
      const sum = Object.keys(total).map((k) => total[k] + ' x ' + k).join(', ');
      const msg = 'Automatic break down: ' + ok + ' item' + (ok === 1 ? '' : 's') + ' broken down' + (sum ? ' (' + sum + ' fragments)' : '') +
        (bad ? ', ' + bad + ' could not be (' + ($('<div>').html(reason).text() || 'refused by the game') + ')' : '') + '.';
      abToast(msg);
    }
  } finally { abBusy = false; }
}

export function installAutobreak() {
  window.__fsbToast = abToast;
  $(document).on('click', '#bpAbLogBtn', (e) => { e.preventDefault(); showAbLog(); });
  $(document).on('click', '#bpAbLogWin .bpAbX', (e) => { e.preventDefault(); $('#bpAbLogWin').remove(); });
  $(document).on('click', '#bpAbLogWin .bpAbClear', (e) => { e.preventDefault(); remember(AB_LOG, '[]'); showAbLog(); });
  // one tab at a time does it (Web Locks), so several open game tabs do not repeat each other's requests
  setInterval(() => {
    if (!loadSettings().autoBreak) return;
    if (navigator.locks && navigator.locks.request) navigator.locks.request('fsb-autobreak', { ifAvailable: true }, (lock) => (lock ? autoBreak() : undefined));
    else autoBreak();
  }, 5000);
}
