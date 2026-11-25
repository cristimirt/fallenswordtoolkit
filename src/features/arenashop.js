import { createFilterBar, FILTER_CSS } from '../core/filterbar.js';
import { withFst } from '../core/game.js';
import { RARITIES } from '../core/items.js';
import { itemIdOf, PAPER_COLORS, rarityOf, readItemTips } from '../core/itemtips.js';
import { loadSettings } from '../core/settings.js';
import { buyDialog, textBalance, writeNumber } from '../core/shopbuy.js';
import { ITEM_TYPES } from '../core/typebuttons.js';
import { ARENA_ITEMS } from '../data/arenaitems.js';

// ---------------------------------------------------------------- Arena Token shop
// The shop (cmd=arena&subcmd=shop, and the page shown after a purchase, subcmd=shopbuy) sells one item per click and reloads the
// page. Here the items are in a grid with a search box and item type buttons over it, every item has its name under it (the ones the
// shop has had are built in, data/arenaitems.js; a new one is read from its tooltip), and a click asks how many to buy
// (core/shopbuy.js; one purchase is the game's own address, index.php?cmd=arena&subcmd=shopbuy&shop_id=N).
const MAX_QTY = 10000; // the game's own limit for a quantity
const balance = textBalance(/You currently have\s*([\d,]+)\s*Arena Tokens/);

const CSS =
  '.fsbArShop{margin:0 auto;}' +
  FILTER_CSS +
  '.fsbArGrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px 4px;align-items:start;}' +
  '.fsbArCard{display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0;}' +
  '.fsbArCard.off{display:none;}' +
  '.fsbArCard>table{margin:0 auto !important;}' +
  // the picture in the middle of its frame (a small one, a ring or a rune, would sit at the left)
  '.fsbArCard a[id^="arena_shop_buy_"]{display:flex;align-items:center;justify-content:center;width:60px;height:90px;}' +
  '.fsbArCard a[id^="arena_shop_buy_"] img{display:block;margin:0 !important;float:none !important;}' +
  '.fsbArName{width:100%;min-height:27px;display:flex;align-items:center;justify-content:center;margin-top:4px;font:bold 11px/1.2 Arial,sans-serif;text-align:center;overflow-wrap:anywhere;}' +
  '';


export function initArenaShop() {
  if (window.top !== window.self || !loadSettings().arenaShop) return;
  if (!/[?&]cmd=arena\b/.test(location.search)) return;

  function setup() {
    const links = Array.from(document.querySelectorAll('a[id^="arena_shop_buy_"]'));
    if (!links.length) return;
    const css = document.createElement('style');
    css.textContent = CSS;
    document.head.appendChild(css);

    // one entry for each item: its card in the grid, and what is known about it
    const list = links.map((a) => {
      const img = a.querySelector('img[data-tipped*="fetchitem.php"]');
      const tip = img ? img.getAttribute('data-tipped') : '';
      const table = a.closest('table');
      const cell = table.parentElement; // the cell of the shop's own grid: the picture table, then the one with the token cost
      const prices = table.nextElementSibling;
      const cost = prices ? parseInt((/\d[\d,]*/.exec(prices.textContent) || ['0'])[0].replace(/,/g, ''), 10) : 0;
      const label = document.createElement('div');
      label.className = 'fsbArName';
      if (prices) prices.before(label);
      return { a, tip, img: img ? img.src : '', key: itemIdOf(tip), shopId: a.id.slice('arena_shop_buy_'.length), cost, cell, label, row: cell.closest('tr'), name: '', type: -1, color: PAPER_COLORS[0] };
    });

    // The shop's items sit in rows of a table, where hiding some would leave holes: they are moved into a grid of their own, in
    // the same order, in one row put where the first item row was.
    const rows = Array.from(new Set(list.map((it) => it.row)));
    const filters = createFilterBar(list, (it, on) => it.card.classList.toggle('off', !on));
    const holder = document.createElement('tr');
    holder.innerHTML = '<td colspan="' + Math.max(1, rows[0].cells.length) + '"><div class="fsbArShop"><div class="fsbArGrid"></div></div></td>';
    rows[0].before(holder);
    holder.querySelector('.fsbArShop').prepend(filters.bar);
    holder.querySelector('.fsbArShop').append(filters.none);
    const grid = holder.querySelector('.fsbArGrid');
    list.forEach((it) => {
      it.card = document.createElement('div');
      it.card.className = 'fsbArCard';
      while (it.cell.firstChild) it.card.appendChild(it.cell.firstChild);
      grid.appendChild(it.card);
    });
    rows.forEach((r) => { if (!r.textContent.trim() && !r.querySelector('img,input,a')) r.style.display = 'none'; });

    function describe(it, name, type, rarity) {
      it.name = name;
      it.type = type;
      it.rarity = rarity;
      it.color = PAPER_COLORS[rarity] || PAPER_COLORS[0];
      it.label.textContent = name;
      it.label.style.color = it.color;
    }
    // taken at the window, before the game's own "Are you sure?" sees the click
    window.addEventListener('click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[id^="arena_shop_buy_"]') : null;
      const it = a && list.find((x) => x.a === a);
      if (!it) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      buyDialog({
        name: it.name || 'item',
        color: (RARITIES[it.rarity] || RARITIES[0])[1],
        tip: it.tip,
        img: it.img,
        cost: it.cost,
        unit: 'Arena Tokens',
        max: MAX_QTY,
        balance,
        show: (n) => writeNumber(document.getElementById('pCC'), 'You currently have', n),
        bulk: true,
        request: (quantity) => ({ url: withFst('/index.php?cmd=arena&subcmd=shopbuy&shop_id=' + it.shopId + '&quantity=' + quantity) }),
      });
    }, true);

    const unknown = [];
    list.forEach((it) => {
      const known = ARENA_ITEMS[it.key];
      if (known) describe(it, known[0], known[1], known[2]);
      else if (it.key) unknown.push({ key: it.key, tip: it.tip });
    });
    filters.apply();
    // The shop's table is as wide as what is in it: the width it has with every item shown is kept, so nothing jumps while searching
    const shop = holder.querySelector('.fsbArShop');
    if (shop.offsetWidth) shop.style.width = shop.offsetWidth + 'px';
    // the headings of the shop ("Items" over the grid, "Combat Moves" further down) in the middle
    Array.from(holder.parentElement.children).forEach((r) => {
      if (!r.cells || !/^(Items|Combat Moves)$/i.test(r.textContent.trim())) return;
      Array.from(r.cells).forEach((c) => { c.removeAttribute('align'); [c].concat(Array.from(c.querySelectorAll('*'))).forEach((el) => el.style.setProperty('text-align', 'center', 'important')); });
    });
    if (unknown.length) {
      readItemTips(unknown, (key, info) => {
        list.filter((it) => it.key === key).forEach((it) => describe(it, info.n, ITEM_TYPES.indexOf(info.t), rarityOf(info)));
        filters.apply();
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
}
