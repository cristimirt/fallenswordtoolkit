import { withFst } from '../core/game.js';
import { RARITIES } from '../core/items.js';
import { FSB, loadSettings, recall, remember } from '../core/settings.js';
import { $, esc } from '../core/util.js';
import { bonus, perPoint } from './skillguide.js';

// ---------------------------------------------------------------- Loyalty page: item information
// The Loyalty page (cmd=points&subcmd=loyalty) lists what can be bought with loyalty points; the name and the buffs only show when
// you hover each item. This writes them next to every item: name, type and quality, and for potions the buffs (skill, level,
// duration), for any other item the lines of its tooltip. The tooltip of each item (fetchitem.php, the one the game shows on hover)
// is read once, one at a time, and kept in the browser (FSB_loyaltyTips) for 30 days: what is sold there almost never changes.
const KEY = 'loyaltyTips';
const MAX_AGE = 30 * 24 * 3600 * 1000;
const LIGHT = ['#3b2a14', '#007a7a', '#a000a0', '#a87400', '#c00000', '#6a3fb5', '#1a8a1a']; // the quality colours, darker for the paper
const CDN = 'https://cdn2.fallensword.com/';
const snorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseTip(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) { const x = n.nodeValue.replace(/\s+/g, ' ').trim(); if (x) nodes.push(x); }
  if (nodes.length < 2) return null;
  const tq = /^(.*?)\s+-\s+(.+)$/.exec(nodes[1]);
  const rest = nodes.slice(tq ? 2 : 1);
  const d = rest.indexOf('Duration');
  const buffs = [];
  if (d !== -1) {
    for (let i = d + 1; i + 2 < rest.length && /^\d+$/.test(rest[i + 1]) && /^\d+\s*[mhd]/i.test(rest[i + 2]); i += 3) buffs.push([rest[i], rest[i + 1], rest[i + 2]]);
  }
  const extra = buffs.length ? '' : rest.filter((x) => !/^Note:/.test(x)).join(' · ').slice(0, 220);
  return { n: nodes[0], t: tq ? tq[1] : '', q: tq ? tq[2] : '', b: buffs, x: extra, at: Date.now() };
}

export function initLoyalty() {
  if (window.top !== window.self || !loadSettings().loyaltyInfo) return;
  if (!/[?&]cmd=points\b/.test(location.search) || !/[?&]subcmd=loyalty\b/.test(location.search)) return;
  const css = document.createElement('style');
  css.textContent =
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

  let cache = {};
  try { cache = JSON.parse(recall(KEY) || '{}') || {}; } catch (e) { cache = {}; }
  const save = () => {
    const now = Date.now();
    Object.keys(cache).forEach((k) => { if (!cache[k] || now - cache[k].at > MAX_AGE) delete cache[k]; });
    remember(KEY, JSON.stringify(cache));
  };
  const keyOf = (tip) => { const m = /item_id=(\d+)/.exec(tip); return m ? m[1] : ''; };
  const fresh = (k) => cache[k] && Date.now() - cache[k].at <= MAX_AGE;

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
  function show(it, info) {
    const q = RARITIES.findIndex((r) => r[0].toLowerCase() === String(info.q).toLowerCase());
    // the name carries the same tooltip as the icon
    it.cell.innerHTML = '<b class="tip-dynamic" style="color:' + (LIGHT[q] || '#3b2a14') + '" data-tipped="' + esc(it.tip) + '">' + esc(info.n) + '</b><small>' + esc([info.t, info.q].filter(Boolean).join(' · ')) + '</small>' +
      (info.b.length ? '<table class="fsbLoyT"><tr><th>Skill</th><th>Level</th><th>Duration</th></tr>' + info.b.map((b) => '<tr>' + buffCell(b[0], b[1]) + '<td class="n">' + esc(b[1]) + '</td><td class="n">' + esc(b[2]) + '</td></tr>').join('') + '</table>' : '') +
      (info.x ? '<span class="lx">' + esc(info.x) + '</span>' : '');
  }
  // the skills of the game (id for the icon, description for the tooltip): the Skills Guide page, read once and kept for 30 days
  let skills = null; // snorm(name) -> [id, description text]
  try { const o = JSON.parse(recall('loyaltySkills') || 'null'); if (o && Date.now() - o.at <= MAX_AGE && o.s) skills = o.s; } catch (e) { /* none */ }
  async function loadSkills() {
    if (skills) return false;
    const t = await new Promise((resolve) => { $.ajax({ url: withFst('/index.php'), data: { cmd: 'skills', subcmd: 'guide' }, dataType: 'text', success: resolve, error: () => resolve(null) }); });
    if (!t) return false;
    const doc = new DOMParser().parseFromString(t, 'text/html');
    const s = {};
    doc.querySelectorAll('tr').forEach((r) => {
      const td = r.querySelectorAll(':scope > td');
      const im = td[0] && td[0].querySelector('img');
      const id = im && /skills\/(\d+)\./.exec(im.getAttribute('src') || '');
      if (td.length >= 3 && id) s[snorm(td[1].textContent)] = [+id[1], td[2].textContent.replace(/\s+/g, ' ').trim()];
    });
    if (!Object.keys(s).length) return false;
    skills = s;
    remember('loyaltySkills', JSON.stringify({ at: Date.now(), s }));
    return true;
  }
  // the description of a skill with its per point value worked out for the level: "+0.2% per point increase ..." at 100 -> "+20% per point increase ..."
  // (the figure is replaced, in green); a description without a plain per point value is shown as it is
  function describe(desc, lvl) {
    const pp = perPoint(desc);
    if (!pp) return esc(desc);
    if (/\bevery\b|\bper \d+ points|\bper 50\b/i.test(desc)) return esc(desc);
    const m = /([+-]?\d+(?:\.\d+)?)(%| ?seconds?|s)?\s*(?:[a-z' ]{0,30}?)[, ]*per point/i.exec(desc) || /^([+-]?\d+(?:\.\d+)?)(%)/.exec(desc);
    if (!m) return esc(desc);
    const len = m[1].length + (m[2] ? m[2].length : 0);
    return esc(desc.slice(0, m.index)) + '<b style="color:#5fdc5f">' + esc(bonus(pp, lvl)) + '</b>' + esc(desc.slice(m.index + len));
  }
  const buffCell = (name, lvl) => {
    const k = skills && skills[snorm(name)];
    if (!k) return '<td class="s">' + esc(name) + '</td>';
    const tip = '<div style="max-width:280px;white-space:normal"><b>' + esc(name) + '</b><br>' + describe(k[1], parseInt(lvl, 10)) + '</div>';
    return '<td class="s"><span class="tip-static" data-tipped="' + esc(tip).replace(/"/g, '&quot;') + '"><img src="' + CDN + 'skills/' + k[0] + '.png" alt="">' + esc(name) + '</span></td>';
  };
  const getTip = (u) => new Promise((resolve) => { $.ajax({ url: withFst('/' + u.replace(/^\//, '')), dataType: 'text', success: (t) => resolve({ ok: true, t }), error: (x) => resolve({ ok: false, status: x.status }) }); });

  async function run() {
    const items = [];
    document.querySelectorAll('[data-tipped*="fetchitem.php"]').forEach((el) => {
      const tip = el.getAttribute('data-tipped') || '';
      const key = keyOf(tip);
      const img = el.tagName === 'IMG' ? el : el.querySelector('img');
      if (!key || !img || !/items\/\d+/.test(img.src)) return;
      const row = img.closest('tr'), table = row && row.closest('table');
      if (!row || !table || row.dataset.fsbLoyRow || !row.cells[0] || !row.cells[0].contains(img)) return;
      row.dataset.fsbLoyRow = '1';
      items.push({ cell: addColumn(row, table), key, tip });
    });
    await loadSkills();
    items.forEach((it) => { if (fresh(it.key)) show(it, cache[it.key]); });
    let fails = 0;
    for (const it of items) {
      if (fresh(it.key)) continue;
      for (;;) {
        const res = await getTip(it.tip);
        if (res.ok) {
          const info = parseTip(res.t);
          if (info) { cache[it.key] = info; save(); items.filter((x) => x.key === it.key).forEach((x) => show(x, info)); }
          fails = 0;
          break;
        }
        // the game answers 503 when asked too fast: wait longer and try again, give up for this visit after a few
        if (++fails >= 4 || !(res.status === 503 || res.status === 429 || !res.status)) return;
        await sleep(2500 * fails);
      }
      await sleep(300 + Math.random() * 200);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
}
