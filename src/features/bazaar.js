import { buffTag, loadSkills } from '../core/buffs.js';
import { withFst } from '../core/game.js';
import { RARITIES } from '../core/items.js';
import { itemIdOf, PAPER_COLORS, rarityOf, readItemTips } from '../core/itemtips.js';
import { loadSettings } from '../core/settings.js';
import { buyDialog, goldBalance, writeNumber } from '../core/shopbuy.js';
import { esc } from '../core/util.js';
import { BAZAAR_OTHERS } from '../data/bazaaritems.js';
import { POTIONS } from '../data/skillpotions.js';

// ---------------------------------------------------------------- Potion Bazaar
// Under every potion: its name and its buffs (skill, level, duration). They are built in (data/skillpotions.js, the Skills Guide's
// potions, and data/bazaaritems.js), so they show at once; only something new is read from its tooltip (core/itemtips.js). The Fallen Sword
// Helper, when it is there, takes the game's potions off the page and puts its own in (#bazaar), with its own quantity boxes: the
// names and buffs go under those too, and buying stays the Helper's. While the game's own links are on the page (no Helper, or the
// Helper not working here) a click asks how many (core/shopbuy.js); the whole quantity goes in one request, which the game's
// bazaar takes: index.php?cmd=potionbazaar&subcmd=buyitem&item_id=N&quantity=Q.
const MAX_QTY = 100; // the Helper's limit for this shop
const OWN = 'a[href*="subcmd=buyitem"]'; // the game's own way to buy

const CSS =
  '.fsbBz{margin:3px auto 4px;max-width:132px;font:11px/1.3 Arial,sans-serif;color:#3b2a14;text-align:center;}' +
  '.fsbBz>b{display:block;font-size:11px;line-height:1.2;cursor:help;overflow-wrap:anywhere;}' +
  '.fsbBz .bf{margin-top:3px;padding-top:2px;border-top:1px solid #20170333;}' +
  '.fsbBz .bf span.tip-static{display:inline-flex !important;align-items:center;gap:3px;cursor:help;}' +
  '.fsbBz .bf img{display:inline-block !important;flex:none;width:14px !important;height:14px !important;margin:0 !important;float:none !important;}' +
  '.fsbBz .bf small{display:block;font-size:10px;opacity:.8;}';

// what is built in about an item, as readItemTips would say it (null: nothing)
function builtIn(key) {
  const p = POTIONS.find((x) => String(x[0]) === key);
  if (p) return { n: p[1], t: 'Potion', q: p[2], c: '', b: p[3].map((b) => [b[0], String(b[1]), b[2] + 'm']) };
  const o = BAZAAR_OTHERS[key];
  return o ? { n: o[0], t: o[1], q: o[2], c: '', b: [] } : null;
}

const priceOf = (img) => {
  // under the game's picture: the table with the cost, a gold coin beside the figure
  const box = img.closest('table') && img.closest('table').nextElementSibling;
  const coin = box && box.querySelector('img[src*="/currency/"]');
  const m = coin && /\d[\d,]*/.exec(coin.closest('tr').textContent);
  return m ? parseInt(m[0].replace(/,/g, ''), 10) : 0;
};

export function initBazaar() {
  if (window.top !== window.self || !loadSettings().bazaarInfo) return;
  if (!/[?&]cmd=potionbazaar\b/.test(location.search)) return;

  const infos = {}; // item id -> what its tooltip says
  const asked = new Set();
  let skillsReady = false;

  function write(box, info, tip) {
    const color = PAPER_COLORS[rarityOf(info)] || PAPER_COLORS[0];
    box.innerHTML = '<b class="tip-dynamic" style="color:' + color + '" data-tipped="' + esc(tip).replace(/"/g, '&quot;') + '">' + esc(info.n) + '</b>' +
      info.b.map((b) => '<div class="bf">' + buffTag(b[0], b[1]) + '<small>Lv ' + esc(b[1]) + ' · ' + esc(b[2]) + '</small></div>').join('') +
      // something sold here that gives no buff (a plant): what it is
      (info.b.length ? '' : '<div class="bf"><small>' + esc([info.t, info.q].filter(Boolean).join(' · ')) + '</small></div>');
  }

  // a place for the name and buffs of every potion on the page that has none yet (the game's, and the Helper's once it has them)
  function decorate() {
    const root = document.getElementById('pCC');
    if (!root || !skillsReady) return;
    const todo = [];
    root.querySelectorAll('img[data-tipped*="fetchitem.php"]').forEach((img) => {
      if (img.dataset.fsbBz || img.closest('.fsbArDlg')) return;
      const tip = img.getAttribute('data-tipped');
      const key = itemIdOf(tip);
      if (!key) return;
      const box = document.createElement('div');
      box.className = 'fsbBz';
      if (img.closest('#bazaar')) img.after(box);
      else if (img.closest(OWN)) {
        // a first row of the cost's table: the Helper reads the page by what stands next to what, and this leaves that as it was
        const prices = img.closest('table').nextElementSibling;
        if (!prices || !prices.rows) return;
        // the picture over the middle of its name, and every potion's column as wide as the next, from the top
        img.closest('table').style.margin = '0 auto';
        const column = prices.parentElement;
        column.style.width = '120px';
        column.style.verticalAlign = 'top';
        const cell = prices.insertRow(0).insertCell();
        cell.align = 'center';
        cell.appendChild(box);
      } else return;
      img.dataset.fsbBz = '1';
      box.dataset.fsbBzKey = key;
      box.dataset.fsbBzTip = tip;
      if (!infos[key]) { const known = builtIn(key); if (known) infos[key] = known; }
      if (infos[key]) write(box, infos[key], tip);
      else if (!asked.has(key)) { asked.add(key); todo.push({ key, tip }); }
    });
    if (todo.length) {
      readItemTips(todo, (key, info) => {
        infos[key] = info;
        document.querySelectorAll('.fsbBz[data-fsb-bz-key="' + key + '"]').forEach((box) => write(box, info, box.dataset.fsbBzTip));
      });
    }
  }

  function buy(link) {
    const img = link.querySelector('img');
    const tip = (img && img.getAttribute('data-tipped')) || '';
    const info = infos[itemIdOf(tip)];
    const id = /[?&]item_id=(\d+)/.exec(link.getAttribute('href'));
    if (!id) return;
    buyDialog({
      name: info ? info.n : 'potion',
      color: (RARITIES[info ? Math.max(0, rarityOf(info)) : 0] || RARITIES[0])[1],
      tip,
      img: img ? img.src : '',
      cost: img ? priceOf(img) : 0,
      unit: 'Gold',
      max: MAX_QTY,
      balance: goldBalance,
      show: (n) => writeNumber(document.getElementById('statbar-gold'), '', n),
      // all of them in one request; the game says whether it went through
      bulk: (message) => /you (successfully )?purchased/i.test(message),
      request: (quantity) => ({ url: withFst('/index.php?cmd=potionbazaar&subcmd=buyitem&item_id=' + id[1] + '&quantity=' + quantity) }),
    });
  }

  function setup() {
    const root = document.getElementById('pCC');
    if (!root) return;
    const css = document.createElement('style');
    css.textContent = CSS;
    document.head.appendChild(css);

    // taken at the window, before the game's own "Are you sure?" sees the click. Only the game's links: the Helper has buttons
    window.addEventListener('click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('#pCC ' + OWN) : null;
      if (!a || a.closest('#bazaar')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      buy(a);
    }, true);

    loadSkills().then(() => {
      skillsReady = true;
      decorate();
      // the Helper builds its potions later than this
      new MutationObserver(decorate).observe(root, { childList: true, subtree: true });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
}
