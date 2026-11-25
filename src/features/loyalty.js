import { buffTag, loadSkills } from '../core/buffs.js';
import { createFilterBar, FILTER_CSS } from '../core/filterbar.js';
import { withFst } from '../core/game.js';
import { RARITIES } from '../core/items.js';
import { itemIdOf, PAPER_COLORS, rarityOf, readItemTips } from '../core/itemtips.js';
import { loadSettings } from '../core/settings.js';
import { buyDialog, goldBalance, textBalance, writeNumber } from '../core/shopbuy.js';
import { ITEM_TYPES } from '../core/typebuttons.js';
import { $, esc } from '../core/util.js';

// ---------------------------------------------------------------- reward pages: Loyalty and PvP Ladder rewards
// Both list what can be bought with a kind of token; the name and the buffs only show when you hover each item, and a Buy button
// buys one, at once. This writes next to every item its name, type and quality, and for potions the buffs (skill, level, duration),
// for any other item the lines of its tooltip (read once and kept in the browser, core/itemtips.js); puts a search box and item
// type buttons over the list; and makes Buy ask how many (core/shopbuy.js). The purchase is the Buy button's own form, with that quantity.
const MAX_QTY = 1000; // the game's own limit for a quantity
const PAGES = [
  {
    on: 'loyaltyInfo', cmd: /[?&]cmd=points\b/, sub: /[?&]subcmd=(loyalty|doloyalty)\b/, unit: 'Allegiance Tokens',
    balance: textBalance(/You currently have\s*([\d,]+)/), after: 'You currently have',
  },
  {
    on: 'ladderInfo', cmd: /[?&]cmd=pvpladder\b/, sub: /[?&]subcmd=(rewards|doreward)\b/, unit: 'PvP Ladder Tokens',
    balance: textBalance(/PvP Ladder Tokens:\s*([\d,]+)/), after: 'PvP Ladder Tokens',
  },
];
export function initLoyalty() {
  const page = PAGES.find((p) => p.cmd.test(location.search) && p.sub.test(location.search));
  if (window.top !== window.self || !page || !loadSettings()[page.on]) return;
  const css = document.createElement('style');
  css.textContent = FILTER_CSS +
    // fixed column widths, so that the table does not move while searching
    'table.fsbLoyTable{table-layout:fixed;}' +
    'td.fsbLoy table.fsbLoyT{max-width:100%;}' +
    'td.fsbLoy{text-align:left;vertical-align:middle;padding:2px 10px;font:12px/1.35 Arial,sans-serif;color:#3b2a14;}' +
    '.fsbLoy b{display:block;font-size:13px;cursor:help;}.fsbLoy small{display:block;opacity:.85;margin-bottom:3px;}' +
    '.fsbLoy .lx{display:block;opacity:.85;}' +
    '.fsbLoy table.fsbLoyT{border-collapse:collapse;font-size:11px;margin-top:2px;}' +
    '.fsbLoy table.fsbLoyT th{background:#3b2a14;color:#e9d3a0;text-align:left;padding:1px 8px;font-weight:bold;}' +
    '.fsbLoy table.fsbLoyT td{padding:1px 8px;border-bottom:1px solid #20170333;}' +
    '.fsbLoy table.fsbLoyT td.n{text-align:right;}' +
    '.fsbLoy table.fsbLoyT td.s{white-space:nowrap;}' +
    '.fsbLoy table.fsbLoyT td.s span{display:inline-flex !important;align-items:center;gap:5px;cursor:help;}' +
    '.fsbLoy table.fsbLoyT td.s img{display:inline-block !important;flex:none;width:18px;height:18px;margin:0 !important;float:none !important;}';
  document.head.appendChild(css);

  // the new column: a cell after the one with the icon in every item row, a heading over it, and the wider rows that span the table
  function addColumn(row, table) {
    if (!table.dataset.fsbLoyCols) {
      table.dataset.fsbLoyCols = '1';
      Array.from(table.rows).forEach((r) => {
        const c = r.cells[0];
        if (!c) return;
        if (c.colSpan > 1) { c.colSpan += 1; return; }
        if (/^\s*Item\s*$/.test(c.textContent) && r.cells.length > 1) {
          const h = c.cloneNode(true); // the heading looks like the others (bold, same colour)
          const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.trim()) { n.nodeValue = 'Details'; break; }
          c.after(h);
          c.style.width = '1%'; c.style.padding = '0 14px'; // the icon column is only a little wider than the icon
        }
      });
    }
    const cell = row.cells[0].cloneNode(false);
    cell.className = 'fsbLoy';
    row.cells[0].after(cell);
    row.cells[0].style.width = '1%';
    row.cells[0].style.padding = '0 14px';
    return cell;
  }
  // the other lines of a tooltip, without those that say nothing about the item
  const extra = (info) => info.x.split(' · ').filter((x) => !/^(Quest|Quest Usage|No quests found|Used in recipes:?|\[Click.*|Right click.*|Ctrl-click.*)$/.test(x)).join(' · ');
  function show(it, info) {
    const q = rarityOf(info);
    // the name carries the same tooltip as the icon
    it.cell.innerHTML = '<b class="tip-dynamic" style="color:' + (PAPER_COLORS[q] || '#3b2a14') + '" data-tipped="' + esc(it.tip) + '">' + esc(info.n) + '</b><small>' + esc([info.t, info.q].filter(Boolean).join(' · ')) + '</small>' +
      (info.b.length ? '<table class="fsbLoyT"><tr><th>Skill</th><th>Level</th><th>Duration</th></tr>' + info.b.map((b) => '<tr>' + '<td class="s">' + buffTag(b[0], b[1]) + '</td>' + '<td class="n">' + esc(b[1]) + '</td><td class="n">' + esc(b[2]) + '</td></tr>').join('') + '</table>' : '') +
      (extra(info) ? '<span class="lx">' + esc(extra(info)) + '</span>' : '');
  }
  // what one purchase of the row costs, as chosen on the page: the Loyalty page offers gold for some items
  function priceOf(it) {
    const radio = it.row.querySelector('input[type=radio][name=use_gold]:checked');
    let line = radio && radio.closest('tr');
    if (!line) {
      const coin = Array.from(it.row.querySelectorAll('img')).find((i) => !i.classList.contains('tip-dynamic') && !i.closest('.fsbLoy'));
      line = coin && coin.closest('tr');
    }
    const m = line && /\d[\d,]*/.exec(line.textContent);
    const gold = !!radio && radio.value === '1';
    return { cost: m ? parseInt(m[0].replace(/,/g, ''), 10) : 0, gold };
  }
  function buy(it) {
    const price = priceOf(it);
    buyDialog({
      name: it.name || 'item',
      color: (RARITIES[it.rarity] || RARITIES[0])[1],
      tip: it.tip,
      img: it.img,
      cost: price.cost,
      unit: price.gold ? 'Gold' : page.unit,
      max: MAX_QTY,
      balance: price.gold ? goldBalance : page.balance,
      show: (n) => (price.gold ? writeNumber(document.getElementById('statbar-gold'), '', n) : writeNumber(document.getElementById('pCC'), page.after, n)),
      bulk: true,
      request: (quantity) => {
        // what the Buy button's form sends, with the way of paying as it was when the dialog opened
        const data = {};
        Array.from(it.form.elements).forEach((e) => { if (e.name && e.type !== 'submit' && e.type !== 'radio') data[e.name] = e.value; });
        if (it.row.querySelector('input[name=use_gold]')) data.use_gold = price.gold ? '1' : '0';
        data.quantity = String(quantity);
        return { url: withFst('/index.php'), type: 'POST', data };
      },
    });
  }

  async function run() {
    const items = [];
    let table = null;
    document.querySelectorAll('[data-tipped*="fetchitem.php"]').forEach((el) => {
      const tip = el.getAttribute('data-tipped') || '';
      const key = itemIdOf(tip);
      const img = el.tagName === 'IMG' ? el : el.querySelector('img');
      if (!key || !img || !/items\/\d+/.test(img.src)) return;
      const row = img.closest('tr'), t = row && row.closest('table');
      if (!row || !t || row.dataset.fsbLoyRow || !row.cells[0] || !row.cells[0].contains(img)) return;
      row.dataset.fsbLoyRow = '1';
      const send = row.querySelector('input[type=submit]');
      table = table || t;
      items.push({ cell: addColumn(row, t), row, key, tip, img: img.src, form: send && send.form, name: '', type: -1, rarity: 0 });
    });
    if (!table) return;

    // the columns: the picture, the details (what is left), the cost and the button
    table.classList.add('fsbLoyTable');
    const head = table.rows[0].cells;
    if (head.length >= 4) {
      head[0].style.width = '100px';
      head[1].style.width = 'auto';
      head[head.length - 2].style.width = '110px';
      head[head.length - 1].style.width = '70px';
    }
    // the lines between the items may span one column more than there is, which would take part of the details' width
    Array.from(table.rows).forEach((r) => { if (r.cells.length === 1 && r.cells[0].colSpan > head.length) r.cells[0].colSpan = head.length; });
    // search and types over the list; a row goes together with the line under it
    const filters = createFilterBar(items, (it, on) => {
      const line = it.row.nextElementSibling;
      it.row.style.display = on ? '' : 'none';
      if (line && !line.dataset.fsbLoyRow && line.cells.length === 1) line.style.display = on ? '' : 'none';
    });
    table.before(filters.bar);
    table.after(filters.none);
    filters.apply();

    // Buy asks how many (this takes the place of the form's own sending, which buys one at once)
    window.addEventListener('submit', (e) => {
      const it = items.find((x) => x.form === e.target);
      if (!it) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      buy(it);
    }, true);

    const describeItem = (key, info) => {
      items.filter((x) => x.key === key).forEach((x) => {
        x.name = info.n;
        x.type = ITEM_TYPES.indexOf(info.t);
        x.rarity = Math.max(0, rarityOf(info));
        show(x, info);
      });
      filters.apply();
    };
    await loadSkills();
    await readItemTips(items, describeItem);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
}
