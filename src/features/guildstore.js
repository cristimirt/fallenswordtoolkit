import { adjustInventoryCount, withFst } from '../core/game.js';
import { CRAFT_COLORS, RARITIES, norm } from '../core/items.js';
import { FSB, loadSettings, recall, remember } from '../core/settings.js';
import { $, esc } from '../core/util.js';
import { fetchBag } from './autobreak.js';
import { COMPOSE, POTIONS } from '../data/skillpotions.js';
import { searchSelect } from './searchselect.js';

// ---------------------------------------------------------------- guild store window
// The "Store" link of the Guild menu (a.guild_openGuildStore) opens the game's own window of the guild store: a grid of big icons,
// two level boxes and a Set switch. This replaces it (setting guildStore, FST tab > Guild) with a window that lists the items, with
// their name, type, level and quality and a lot more filters, can also list the guild tagged items that are in the backpacks of the
// other members (the data of the Guild Inventory page: they cannot be taken, they only show where an item is), and can deposit
// items from your backpack into the store, which until now was only possible on cmd=guild&subcmd=inventory&subcmd2=storeitems.
//
// Requests, all the game's own:
//   index.php?cmd=guild&subcmd=fetchinv                                the store: a (store id), b (item id), n, t (type), l (level), tg, c (tag cost), eq, s (set), extra
//   index.php?cmd=export&subcmd=guild_store&inc_tagged=1                every tagged item of the guild: the store (player_id -1) and the members' bags; rarity, craft, forge, stats
//   index.php?cmd=export&subcmd=guild_members&guild_id=..                the members (id, username, level, rank, last login)
//   index.php?cmd=guild&subcmd=inventory&subcmd2=takeitem&guildstore_id=..&ajax=1      take one item ({ r: 1, m } when it did not work)
//   index.php?cmd=guild&subcmd=inventory&subcmd2=storeitems             the page that lists what can be deposited (storeIndex[] = inventory ids)
//   app.php?browser=1&v=9&cmd=guild&subcmd=inventory&subcmd2=dostoreitems&items[]=<inventory id>   deposit ({ s: true } or { e: { message } })
const TYPES = ['Helmet', 'Armor', 'Gloves', 'Boots', 'Weapon', 'Shield', 'Ring', 'Amulet', 'Rune', 'Quest Item', 'Potion', 'Component', 'Resource', 'Recipe', 'Container', 'Composed', 'Frag Stash'];
const CDN = 'https://cdn2.fallensword.com/';
const CRAFT_NAMES = ['Perfect', 'Excellent', 'Very Good', 'Good', 'Average', 'Poor', 'Very Poor'];
const UNCRAFTED_COLOR = '#888888';
// a member's item that is equipped: a small shield with a sword on it (the tooltip says what it is)
// guild tagged: a small padlock
const LOCK = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="#3b2a14" stroke-width="1.6"/><rect x="2.5" y="7" width="11" height="8" rx="1.5" fill="#8a6a38" stroke="#3b2a14" stroke-width="1"/><circle cx="8" cy="10.5" r="1.2" fill="#f6e8c4"/></svg>';
const EQ_BADGE = ' <span class="gsEq" title="Equipped"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 14 3v5c0 3.4-2.9 5.8-6 7-3.1-1.2-6-3.6-6-7V3z" fill="#8a6a38" stroke="#3b2a14" stroke-width="1"/><path d="M5.2 11.2 10.6 4.4M4.6 9l3.2 3.2" fill="none" stroke="#f6e8c4" stroke-width="1.4" stroke-linecap="round"/></svg></span>';
// the craft qualities in colours that can be read on the parchment (the game's own colours are for a dark page)
const CRAFT_DARK = ['#8a7400', '#b07000', '#c05a00', '#c03000', '#b00000', '#880000', '#600000'];
// craft quality of an item of the export ("Excellent +5": the quality is the words before the number); -1 = not crafted / not known
const craftIdx = (txt) => { const t = String(txt || '').replace(/\s*\+?\d+\s*$/, '').trim().toLowerCase(); return CRAFT_NAMES.findIndex((n) => n.toLowerCase() === t); };
const PER_PAGE = 50;
const PER_PAGE_TILES = 40;
// the quality colours of the game are made for a dark page: darker ones for the parchment
const LIGHT = ['#3b2a14', '#007a7a', '#a000a0', '#a87400', '#c00000', '#6a3fb5', '#1a8a1a'];
const INV_URL = 'index.php?cmd=notepad&blank=1&subcmd=guildinvmgr';
const DEPOSIT_URL = 'index.php?cmd=guild&subcmd=inventory&subcmd2=storeitems';

const getJson = (data) => new Promise((resolve) => {
  $.ajax({ url: withFst('/index.php'), data, dataType: 'json', success: resolve, error: () => resolve(null) });
});
const getText = (data) => new Promise((resolve) => {
  $.ajax({ url: withFst('/index.php'), data, dataType: 'text', success: resolve, error: () => resolve(null) });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (html) => $('<div>').html(html == null ? '' : html).text().replace(/\s+/g, ' ').trim();

export function initGuildStore() {
  if (window.top !== window.self || !loadSettings().guildStore) return;
  const POS_KEY = FSB + 'gsPos';
  const css = document.createElement('style');
  css.textContent =
    '#fsbGsOv{position:fixed;left:0;top:0;right:0;bottom:0;z-index:99989;background:rgba(10,6,2,.6);}' +
    '#fsbGs{position:fixed;z-index:99990;width:780px;max-width:calc(100vw - 8px);max-height:calc(100vh - 8px);display:flex;flex-direction:column;box-sizing:border-box;background:#d6b277;color:#3b2a14;border:1px solid #20170396;border-radius:4px;box-shadow:0 0 8px 0 #000;font:12px Arial,sans-serif;}' +
    '#fsbGs .gsHead{cursor:move;user-select:none;touch-action:none;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 8px;background:#b79862;font-weight:bold;font-size:13px;border-radius:3px 3px 0 0;}' +
    '#fsbGs .gsHead .gsLinks{font-weight:normal;font-size:11px;}#fsbGs .gsHead a{color:#5a3a10;}' +
    '#fsbGs .gsX{cursor:pointer;background:none;border:0;color:#3b2a14;font-size:18px;line-height:14px;padding:0 2px;}#fsbGs .gsX:hover{color:#8a1f0f;}' +
    '#fsbGs .gsTabs{display:flex;gap:4px;padding:6px 8px 0;}' +
    '#fsbGs .gsTab{cursor:pointer;padding:3px 12px;background:#c9a869;border:1px solid #20170396;border-bottom:0;border-radius:4px 4px 0 0;color:#3b2a14;font:bold 12px Arial,sans-serif;}' +
    '#fsbGs .gsTab.on{background:#e9d3a0;}' +
    '#fsbGs .gsBody{display:flex;flex-direction:column;min-height:0;padding:6px 8px 8px;border-top:1px solid #20170396;background:#e9d3a0;}' +
    '#fsbGs .gsBar{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin-bottom:6px;}' +
    '#fsbGs .gsBar label{display:inline-flex;align-items:center;gap:4px;cursor:pointer;}' +
    '#fsbGs input[type=text],#fsbGs input[type=number],#fsbGs select{background:#f6e8c4;color:#3b2a14;border:1px solid #20170396;border-radius:3px;padding:1px 4px;font:12px Arial,sans-serif;}' +
    '#fsbGs input[type=text]{width:150px;}#fsbGs input[type=number]{width:52px;}' +
    '#fsbGs .gsBtn{cursor:pointer;background:#e9d3a0;color:#3b2a14;border:1px solid #20170396;border-radius:3px;padding:2px 10px;font:12px Arial,sans-serif;box-shadow:0 0 2px #00000066;}' +
    '#fsbGs .gsBtn:hover{background:#f3e2b8;}#fsbGs .gsBtn:disabled{opacity:.5;cursor:default;}' +
    '#fsbGs .gsBtn.go{background:#c9dc9a;}#fsbGs .gsBtn.go:hover{background:#d6e8a8;}' +
    '#fsbGs .gsSw,#fsbGs .gsSw *{cursor:pointer !important;}#fsbGs .gsSw{position:relative;display:inline-block;flex:none;}#fsbGs .gsSw input{position:absolute;opacity:0;width:100%;height:100%;margin:0;}' +
    '#fsbGs .gsSw .trk{display:block;box-sizing:content-box;width:26px;height:13px;border:1px solid #20170396;border-radius:8px;background:#b79862;position:relative;transition:background .15s;}' +
    '#fsbGs .gsSw .trk::after{content:"";position:absolute;top:2px;left:2px;width:9px;height:9px;border-radius:50%;background:#f6e8c4;border:1px solid #20170396;box-sizing:border-box;transition:left .15s;}' +
    '#fsbGs .gsSw input:checked+.trk{background:#5f8f2a;}#fsbGs .gsSw input:checked+.trk::after{left:15px;}' +
    '#fsbGs .gsHelp{border-bottom:1px dotted #3b2a14;cursor:help;}' +
    '#fsbGs .gsList{overflow-y:auto;min-height:120px;max-height:calc(100vh - 250px);border:1px solid #20170396;border-radius:3px;background:#f6e8c4;scrollbar-width:thin;scrollbar-color:#8a6a38 #d9b774;}' +
    '#fsbGs .gsList::-webkit-scrollbar{width:9px;height:9px;}#fsbGs .gsList::-webkit-scrollbar-track{background:#d9b774;border-radius:4px;box-shadow:inset 0 0 2px #20170399;}' +
    '#fsbGs .gsList::-webkit-scrollbar-thumb{background:#8a6a38;border:1px solid #20170396;border-radius:4px;}#fsbGs .gsList::-webkit-scrollbar-thumb:hover{background:#6b5230;}' +
    '#fsbGs table{width:100%;border-collapse:collapse;}' +
    '#fsbGs th{position:sticky;top:0;z-index:1;background:#c9a869;text-align:left;padding:3px 5px;border-bottom:1px solid #20170396;white-space:nowrap;user-select:none;}' +
    '#fsbGs th.s{cursor:pointer;}#fsbGs th.s:hover{background:#d6b277;}' +
    '#fsbGs td{padding:2px 5px;border-bottom:1px solid #20170322;vertical-align:middle;}' +
    '#fsbGs tr:hover td{background:#f9efd2;}' +
    '#fsbGs td.c{width:20px;}#fsbGs td.i{width:26px;padding:1px 3px;}#fsbGs td.i img{display:block;width:24px;height:24px;object-fit:contain;}' +
    '#fsbGs td.n a{color:inherit;text-decoration:none;font-weight:bold;cursor:help;}' +
    '#fsbGs .bpAhHtml{display:inline-flex;flex:none;line-height:0;}#fsbGs .bpBuffBox .bpBoxSw.bpAhHtml{margin-top:-8px;left:2px;}' +
    '#fsbGs .gsTypes{display:flex;flex-wrap:wrap;gap:5px;}' +
    '#fsbGs .gsTyp{position:relative;box-sizing:border-box;margin:0;padding:2px;cursor:pointer;background:#e6d6ab;border:2px solid #8a6a3a;border-radius:4px;box-shadow:inset 0 1px 0 rgba(255,255,255,.5);}' +
    '#fsbGs .gsTyp:hover{background:#f0e3bf;}#fsbGs .gsTyp.on{background:#c8dc86;border-color:#4f6f12;box-shadow:inset 0 2px 4px rgba(0,0,0,.35);}#fsbGs .gsTyp.z:not(.on){opacity:.4;}' +
    '#fsbGs .gsTyp i{display:block;width:18px;height:18px;background:url(' + CDN + 'ui/misc/backpack_tabs2.png) 0 0 no-repeat;}' +
    '#fsbGs .gsTyp i.gsTx{background:none;font:bold 9px/18px Arial,sans-serif;color:#3b2a14;text-align:center;font-style:normal;}' +
    '#fsbGs .gsCnt{position:absolute;right:-4px;bottom:-5px;min-width:13px;height:13px;padding:0 3px;box-sizing:border-box;border-radius:7px;background:#2b2620;border:1px solid #8a6a3a;color:#fff;font:bold 9px/11px Arial,sans-serif;text-align:center;pointer-events:none;}' +
    '#fsbGs .gsEq{display:inline-block;vertical-align:middle;margin-left:3px;line-height:0;cursor:default;}' +
    '#fsbGs .bpBuffBox.bpAh{display:inline-block;}#fsbGs .bpBuffBox.bpAh input[type=text]{background:#e8c88e;border:1px solid #20170396;border-radius:4px;height:22px;padding:0 20px 0 6px;font:bold 11px Arial,sans-serif;color:#3b2a14;box-shadow:0 0 3px 0 #000;}' +
    '#fsbGs .bpBuffBox.bpAh.bpHasSw input[type=text]{padding-left:24px;}#fsbGs .bpBuffBox.bpAh input[type=text]:hover,#fsbGs .bpBuffBox.bpAh input[type=text]:focus{background:#f0d6a2;border-color:#3b2a14;outline:none;}' +
    '#fsbGs a.gsPl{color:#5a3a10;text-decoration:underline dotted;cursor:pointer;}#fsbGs a.gsPl:hover{color:#8a1f0f;}' +
    '#fsbGs td.n small{display:block;font-weight:normal;opacity:.75;}' +
    '#fsbGs td.num{text-align:right;}' +
    // the hellforge level: a diamond with the number inside
    '#fsbGs td.gsTg{text-align:center;line-height:0;}#fsbGs td.gsHfc{text-align:center;}#fsbGs .gsHf{position:relative;display:inline-block;width:22px;height:22px;vertical-align:middle;}' +
    '#fsbGs .gsHf i,#fsbGs .gsHfRow i{position:absolute;left:3px;top:3px;width:16px;height:16px;box-sizing:border-box;transform:rotate(45deg);background:conic-gradient(from -45deg,rgb(255,142,54) 0deg,rgb(255,142,54) 90deg,rgb(204,82,18) 90deg,rgb(204,82,18) 180deg,rgb(232,104,30) 180deg,rgb(232,104,30) 270deg,rgb(255,167,92) 270deg,rgb(255,167,92) 360deg);box-shadow:0 0 0 1px #000,1px 1px 0 rgba(255,240,210,.3) inset;}' +
    '#fsbGs .gsHfRow{display:inline-flex;align-items:center;}#fsbGs .gsHfRow i{position:static;display:inline-block;width:9px;height:9px;margin:3px 5px;}' +
    '#fsbGs .gsHf b{position:absolute;left:0;right:0;top:0;line-height:22px;text-align:center;color:#fff;font:bold 11px/22px Arial,sans-serif;text-shadow:0 0 2px #000;}' +
    '#fsbGs .gsFoot{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px;margin-top:6px;}' +
    '#fsbGs .gsMsg{margin-top:4px;min-height:16px;}#fsbGs .gsMsg.bad{color:#a00000;}#fsbGs .gsMsg.ok{color:#2d6a1c;}' +
    '#fsbGs .gsEmpty{padding:14px;text-align:center;opacity:.8;}' +
    '#fsbGs .gsPager a{cursor:pointer;color:#5a3a10;padding:0 3px;}' +
    '#fsbGs .gsView{display:inline-flex;}#fsbGs .gsView button{border-radius:0;margin:0;}#fsbGs .gsView button:first-child{border-radius:3px 0 0 3px;}#fsbGs .gsView button:last-child{border-radius:0 3px 3px 0;border-left:0;}' +
    '#fsbGs .gsView button.on{background:#b79862;font-weight:bold;}' +
    '#fsbGs .gsGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:6px;padding:6px;}' +
    '#fsbGs .gsTile{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px 4px;text-align:center;}' +
    '#fsbGs .gsTile.sel .inventory-item-slot{box-shadow:0 0 0 2px #3f7a12;}' +
    '#fsbGs .gsGrid.s75{grid-template-columns:repeat(auto-fill,minmax(88px,1fr));}#fsbGs .gsGrid.s75 .inventory-item-slot{zoom:.75;}' +
    '#fsbGs .gsGrid.s50{grid-template-columns:repeat(auto-fill,minmax(72px,1fr));}#fsbGs .gsGrid.s50 .inventory-item-slot{zoom:.5;}' +
    '#fsbGs .gsTile .inventory-item-slot{margin:6px 0 4px;cursor:pointer;}' +
    '#fsbGs .gsTile .gsPick{position:absolute;top:3px;left:3px;margin:0;}' +
    // the selection boxes in the colours of the window: parchment when empty, brown with a light tick when selected
    '#fsbGs input.gsPick,#fsbGs #gsAll{-webkit-appearance:none;appearance:none;width:15px;height:15px;margin:0;vertical-align:middle;cursor:pointer;background:#f6e8c4 center/11px 11px no-repeat;border:1px solid #20170396;border-radius:3px;box-shadow:inset 0 1px 2px #20170333;}' +
    '#fsbGs input.gsPick:hover,#fsbGs #gsAll:hover{background-color:#fbf1d6;border-color:#3b2a14;}' +
    '#fsbGs input.gsPick:checked,#fsbGs #gsAll:checked{background-color:#8a6a38;border-color:#3b2a14;background-image:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 12%22%3E%3Cpolyline points=%222,6.5 5,9.5 10,2.5%22 fill=%22none%22 stroke=%22%23f6e8c4%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E");}' +
    '#fsbGs input.gsPick:focus-visible,#fsbGs #gsAll:focus-visible{outline:2px solid #5f8f2a;outline-offset:1px;}' +
    '#fsbGs .gsRars{display:inline-flex;align-items:center;gap:3px;}' +
    '#fsbGs .gsRar{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;cursor:pointer;border:1px solid transparent;border-radius:3px;}' +
    '#fsbGs .gsRar i{display:block;width:10px;height:10px;transform:rotate(45deg);box-shadow:0 0 0 1px #000;}' +
    '#fsbGs .gsRar:hover{background:#f3e2b8;}#fsbGs .gsRar.on{background:#b79862;border-color:#20170396;}' +
    '#fsbGs .gsTile .gsTn{font-weight:bold;text-decoration:none;cursor:help;line-height:1.2;word-break:break-word;}' +
    '#fsbGs .gsTile small{opacity:.8;line-height:1.2;}#fsbGs .gsTile .gsBtn{margin-top:auto;padding:1px 8px;}';
  document.head.appendChild(css);

  let box = null;
  let tab = recall('gsTab') === 'put' ? 'put' : 'take';
  const F = { q: '', types: new Set(), rars: new Set(), min: '', max: '', set: '', eq: '', dup: '', equipped: '', tagged: '', hf: '', craft: '', buff: '', player: '' };
  let withMembers = recall('gsMembers') === '1';
  let sort = { k: 'name', d: 1 };
  let view = recall('gsView') === 'tiles' ? 'tiles' : 'list'; // the list, or big icons with the name under them
  let size = [50, 75, 100].indexOf(parseInt(recall('gsSize'), 10)) !== -1 ? parseInt(recall('gsSize'), 10) : 100; // the size of the items in the tiles view, in %
  const perPage = () => (view === 'tiles' ? PER_PAGE_TILES : PER_PAGE);
  let page = 0;
  const sel = new Set();
  let busy = false;
  let seq = 0; // a load that was started before the window was closed or the tab changed is dropped
  // data
  let store = null, exp = null, members = null, mine = null, myId = 0, guildId = 0;
  let rows = [];

  const place = (x, y) => {
    const r = box.getBoundingClientRect();
    x = Math.min(Math.max(0, x), Math.max(0, innerWidth - r.width));
    y = Math.min(Math.max(0, y), Math.max(0, innerHeight - r.height));
    box.style.left = x + 'px';
    box.style.top = y + 'px';
  };
  const setMsg = (t, cls) => { const m = box && box.querySelector('.gsMsg'); if (m) { m.className = 'gsMsg' + (cls ? ' ' + cls : ''); m.textContent = t; } };
  // while the window is open the page behind it is covered and does not scroll (the lists inside the window still do)
  let overlay = null, pageLock = null;
  function lockPage() {
    overlay = document.createElement('div');
    overlay.id = 'fsbGsOv';
    overlay.addEventListener('click', () => { if (!busy) close(); }); // a click outside the window closes it
    document.body.appendChild(overlay);
    pageLock = [document.documentElement.style.overflow, document.body.style.overflow];
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }
  function unlockPage() {
    if (overlay) { overlay.remove(); overlay = null; }
    if (pageLock) { document.documentElement.style.overflow = pageLock[0]; document.body.style.overflow = pageLock[1]; pageLock = null; }
  }
  function close() {
    seq++;
    if (box) { box.remove(); box = null; }
    unlockPage();
    document.removeEventListener('keydown', onKey);
  }
  const onKey = (e) => { if (e.key === 'Escape' && !busy) close(); };

  // ---------- data -> rows ----------
  const cleanSet = (s) => String(s || '').replace(/\\'/g, "'");
  const nameOfMember = (id) => (members && members[id] && members[id].name) || ('Player ' + id);
  // "3 hours ago" from the unix time of the last login
  const ago = (t) => {
    if (!t) return 'unknown';
    const s = Math.max(0, Date.now() / 1000 - (t > 1e11 ? t / 1000 : t));
    const u = [[86400, 'day'], [3600, 'hour'], [60, 'minute']].find((x) => s >= x[0]);
    if (!u) return 'just now';
    const n = Math.floor(s / u[0]);
    return n + ' ' + u[1] + (n === 1 ? '' : 's') + ' ago';
  };
  // the name of a member: a link to the profile, and on hover the level, the rank in the guild and the last activity
  const playerLink = (id) => {
    const m = members && members[id];
    const tip = m ? '<div style="white-space:nowrap"><b>' + esc(m.name) + '</b><br>Level ' + esc(m.level) + '<br>Rank: ' + esc(m.rank || '?') + '<br>Last activity: ' + esc(ago(m.last)) + '</div>' : '';
    return '<a href="' + esc(withFst('/index.php?cmd=profile&player_id=' + id)) + '" target="_blank" rel="noopener" class="gsPl' + (tip ? ' tip-static' : '') + '"' + (tip ? ' data-tipped="' + esc(tip).replace(/"/g, '&quot;') + '"' : '') + '>' + esc(nameOfMember(id)) + '</a>';
  };
  function storeRows() {
    const byInv = new Map(((exp && exp.items) || []).map((o) => [o.inv_id, o]));
    const out = (store || []).map((s) => {
      const e = byInv.get(s.a) || {};
      const st = e.stats || {};
      return {
        id: s.a, item: s.b, name: s.t === 15 && s.extra && s.extra.name ? s.extra.name : s.n, type: s.t, lvl: s.l, rar: e.rarity, set: cleanSet(st.set_name) || (s.s ? 'Set item' : ''), tagged: !!s.tg, eq: !!s.eq,
        cr: craftIdx(e.craft), craft: e.craft || '', forge: e.forge || 0, owner: -1, cost: s.c, extra: s.extra,
      };
    });
    if (withMembers && exp && exp.items) {
      exp.items.forEach((o) => {
        if (o.player_id === -1) return;
        const st = o.stats || {};
        out.push({
          id: o.inv_id, item: o.item_id, name: o.item_name, type: o.type, lvl: st.min_level, rar: o.rarity, set: cleanSet(st.set_name), tagged: true,
          eq: o.type >= 0 && o.type <= 8, cr: craftIdx(o.craft), craft: o.craft || '', forge: o.forge || 0, owner: o.player_id, equipped: !!o.equipped,
        });
      });
    }
    return out;
  }
  function depositRows() {
    return (mine || []).map((b) => ({
      id: b.a, item: b.b, name: b.n, type: b.t, lvl: b.l, rar: b.r, set: b.s ? 'Set item' : '', tagged: !!b.tg, eq: !!b.eq, cr: b.cf === undefined ? -1 : Array.isArray(b.ca) && b.ca.length ? b.cf : -2, craft: '', forge: b.hf || 0, owner: -2,
    }));
  }

  // ---------- potion buffs ----------
  // the buffs of a potion: [[skill, level, minutes], ...]. Plain potions: the item guide data; composed potions (any name the player gave them):
  // the tooltip of the item, read in the background once the Buff filter is in use (tipBuffs); null = not known yet
  // every buff a potion can give (the item guide data and the composing skills), so the filter lists all of them, not only those in the list
  const ALL_BUFFS = Array.from(new Set(POTIONS.flatMap((p) => p[3].map((b) => b[0])).concat(Object.keys(COMPOSE)))).sort((a, b) => a.localeCompare(b));
  const canon = (n) => ALL_BUFFS.find((x) => norm(x) === norm(n)) || n; // the tooltip's spelling of a skill -> the one of the list
  const POT = new Map(POTIONS.map((p) => [p[0], p[3]]));
  // cache of the composed potions: inventory id -> [name, buffs]. A composed potion never changes, so it is kept in the browser
  // (gsComposed2) and each potion's tooltip is read only once; the newest COMPOSED_MAX are kept
  const COMPOSED_MAX = 3000;
  const tipBuffs = new Map();
  try { const o = JSON.parse(recall('gsComposed2') || '{}'); Object.keys(o).forEach((k) => { if (Array.isArray(o[k]) && Array.isArray(o[k][1]) && o[k][1].length) tipBuffs.set(Number(k), o[k]); }); } catch (e) { /* no cache */ }
  const saveComposed = () => {
    const keys = Array.from(tipBuffs.keys()).slice(-COMPOSED_MAX), o = {};
    keys.forEach((k) => { o[k] = tipBuffs.get(k); });
    remember('gsComposed2', JSON.stringify(o));
  };
  const buffsOf = (r) => (r.type === 10 ? POT.get(r.item) || [] : r.type === 15 ? (tipBuffs.get(r.id) || [])[1] || null : []);
  const applyCached = (r) => { const c = r.type === 15 && r.name === 'Composing Item' ? tipBuffs.get(r.id) : null; if (c && c[0]) r.name = c[0]; };
  // The tooltips are read one at a time with a pause between them (the game answers 503 when asked too fast); on a 503 or 429 it waits
  // longer and tries the same potion again, and gives up for now after a few in a row. One run at a time, taking what is in the list
  // at that moment; a potion that cannot be read is not asked again until the window is opened again.
  const unread = new Set();
  let reading = false;
  const getTip = (u) => new Promise((resolve) => { $.ajax({ url: withFst('/' + u), dataType: 'text', success: (t) => resolve({ ok: true, t }), error: (x) => resolve({ ok: false, status: x.status }) }); });
  async function readTips() {
    if (reading) return;
    reading = true;
    let fails = 0;
    let n = 0;
    try {
      while (box) {
        const r = rows.find((x) => x.type === 15 && !tipBuffs.has(x.id) && !unread.has(x.id));
        if (!r) break;
        const res = await getTip(tipOf(r));
        if (!res.ok) {
          if (res.status === 503 || res.status === 429 || !res.status) { if (++fails >= 4) break; await sleep(2500 * fails); continue; }
          unread.add(r.id);
          continue;
        }
        fails = 0;
        const t = new DOMParser().parseFromString(res.t, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
        const head = /^(.*?)\s+Composed Potion/.exec(t);
        const nm = head && head[1] ? head[1] : r.name;
        const seg = /Duration(.*?)(?:Min Level|Note:|$)/.exec(t);
        const out = [];
        if (seg) { const re = /\s*(.+?)\s+(\d+)\s+(\d+)\s*[mh]/g; let m; while ((m = re.exec(seg[1]))) out.push([canon(m[1].trim()), +m[2], +m[3]]); }
        if (!out.length) { unread.add(r.id); continue; }
        if (r.name === 'Composing Item') r.name = nm;
        tipBuffs.set(r.id, [nm, out]);
        if (++n % 20 === 0) saveComposed();
        if (n % 10 === 0 && box && F.buff !== '') drawList();
        await sleep(300 + Math.random() * 200);
      }
    } finally {
      reading = false;
      saveComposed();
      if (box && (n || fails >= 4)) { const keep = document.activeElement && document.activeElement.id; drawBody(false); if (keep) { const el = box.querySelector('#' + keep); if (el) el.focus(); } }
    }
  }

  // ---------- filtering and sorting ----------
  function visible(noType) {
    const q = norm(F.q).split(/\s+/).filter(Boolean);
    const dupCount = new Map();
    rows.forEach((r) => dupCount.set(r.item, (dupCount.get(r.item) || 0) + 1));
    const min = F.min === '' ? null : parseInt(F.min, 10), max = F.max === '' ? null : parseInt(F.max, 10);
    let out = rows.filter((r) => {
      if (q.length) { const hay = norm(r.name + ' ' + r.set + ' ' + (r.owner >= 0 ? nameOfMember(r.owner) : '')); if (!q.every((w) => hay.indexOf(w) !== -1)) return false; }
      if (!noType && F.types.size && !F.types.has(r.type)) return false; // the selected types: any of them
      if (F.player !== '' && r.owner !== +F.player) return false;
      if (F.rars.size && !F.rars.has(r.rar || 0)) return false;
      if (min !== null && !(r.lvl >= min)) return false;
      if (max !== null && !(r.lvl <= max)) return false;
      const yn = (v, has) => (v === 'yes' ? !has : v === 'no' && has); // a filter of yes / no: true = the item does not pass
      if (yn(F.set, !!r.set) || yn(F.eq, !!r.eq) || yn(F.equipped, !!r.equipped)) return false;
      if (F.tagged === 'yes' ? !r.tagged : F.tagged === 'no' && r.tagged) return false;
      if (yn(F.dup, (dupCount.get(r.item) || 0) >= 2)) return false;
      if (F.hf === 'none' ? r.forge > 0 : F.hf !== '' && r.forge !== +F.hf) return false;
      if (F.craft === 'none' ? r.cr >= 0 : F.craft !== '' && r.cr !== +F.craft) return false;
      if (F.buff !== '' && !(buffsOf(r) || []).some((b) => b[0] === F.buff)) return false;
      return true;
    });
    if (noType) return out; // only counted
    const k = sort.k, d = sort.d;
    const val = (r) => (k === 'name' ? norm(r.name) : k === 'type' ? r.type : k === 'lvl' ? (r.lvl == null ? -1 : r.lvl) : k === 'rar' ? (r.rar == null ? -1 : r.rar) : k === 'owner' ? norm(r.owner >= 0 ? nameOfMember(r.owner) : '') : k === 'cr' ? r.cr : k === 'forge' ? r.forge || 0 : 0);
    out = out.map((r, i) => [r, i]).sort((a, b) => { const x = val(a[0]), y = val(b[0]); return (x < y ? -1 : x > y ? 1 : a[1] - b[1]) * d; }).map((p) => p[0]);
    return out;
  }

  // ---------- drawing ----------
  const imgOf = (r) => (r.type === 15 && r.extra && r.extra.design != null ? CDN + 'composing/' + r.extra.design + '_' + r.extra.color + '.png' : CDN + 'items/' + r.item + '.gif');
  const tipOf = (r) => {
    const u = r.owner === -1 ? 'fetchitem.php?item_id=' + r.item + '&inv_id=' + r.id + '&t=4&p=' + guildId + '&extra=3'
      : r.owner === -2 ? 'fetchitem.php?item_id=' + r.item + '&inv_id=' + r.id + '&t=0&p=' + myId
        : 'fetchitem.php?item_id=' + r.item + '&inv_id=' + r.id + '&t=7&p=' + r.owner;
    return u;
  };
  const sw = (id, on, label, tip) =>
    '<label><span class="gsSw"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="trk"></span></span>' + label +
    (tip ? ' <span class="gsHelp tip-static" data-tipped="' + esc('<div style="max-width:240px;white-space:normal">' + tip + '</div>').replace(/"/g, '&quot;') + '">[?]</span>' : '') + '</label>';
  const HF_OPT = [['', 'Hell Forged: any'], ['none', 'Not hell forged'], ['1', 'Hell Forge 1'], ['2', 'Hell Forge 2'], ['3', 'Hell Forge 3'], ['4', 'Hell Forge 4'], ['5', 'Hell Forge 5']];
  const CRAFT_OPT = [['', 'Crafted: any'], ['none', 'Not crafted']].concat(CRAFT_NAMES.map((n, i) => [String(i), n]));
  const opts = (list, cur) => list.map((o) => '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('');
  const ynSel = (id, cur, labels) => '<select id="' + id + '">' + opts([['', labels[0]], ['yes', labels[1]], ['no', labels[2]]], cur) + '</select>';
  // the item type buttons (the game's own icons of the guild store window), each with how many items it would show under the other filters
  const ICON_TYPES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16];
  const TYPE_X = (t) => -20 * (t > 11 ? t - 1 : t); // the icons are in the sprite in this order: type 11 has none
  function typesHtml() {
    // every type the game has an icon for (there are no components in a guild store), also those with no item; another type in the list is added
    const have = Array.from(new Set(ICON_TYPES.concat(rows.map((r) => r.type)))).sort((a, b) => a - b);
    const left = {};
    visible(true).forEach((r) => { left[r.type] = (left[r.type] || 0) + 1; });
    const total = Object.keys(left).reduce((n, t) => n + left[t], 0);
    const btn = (t, name, n, inner) => '<button type="button" class="gsTyp' + ((t === '' ? !F.types.size : F.types.has(t)) ? ' on' : '') + (n ? '' : ' z') + '" data-t="' + t + '" title="' + esc(name) + '">' + inner + '<span class="gsCnt">' + n + '</span></button>';
    return btn('', 'All types', total, '<i style="background-position:-340px 0"></i>') +
      have.map((t) => btn(t, TYPES[t] || 'Type ' + t, left[t] || 0, ICON_TYPES.indexOf(t) === -1 ? '<i class="gsTx">' + esc((TYPES[t] || '?').slice(0, 3)) + '</i>' : '<i style="background-position:' + TYPE_X(t) + 'px 0"></i>')).join('');
  }
  function barHtml() {
    const bc = {};
    rows.forEach((r) => { (buffsOf(r) || []).forEach((b) => { bc[b[0]] = (bc[b[0]] || 0) + 1; }); });
    const pend = rows.some((r) => r.type === 15 && !tipBuffs.has(r.id));
    const names = ALL_BUFFS.concat(Object.keys(bc).filter((b) => ALL_BUFFS.indexOf(b) === -1)).sort((a, b) => a.localeCompare(b));
    const bOpts = '<option value="">Buff: any</option>' + names
      .map((b) => '<option value="' + esc(b) + '"' + (b === F.buff ? ' selected' : '') + '>' + esc(b) + (bc[b] ? ' (' + bc[b] + ')' : '') + '</option>').join('');
    const own = {};
    ((exp && exp.items) || []).forEach((o) => { if (o.player_id !== -1) own[o.player_id] = (own[o.player_id] || 0) + 1; });
    const pOpts = '<option value="">Player: any</option>' + Object.keys(members || {}).sort((a, b) => nameOfMember(a).localeCompare(nameOfMember(b), undefined, { sensitivity: 'base' }))
      .map((id) => '<option value="' + id + '"' + (String(id) === String(F.player) ? ' selected' : '') + '>' + esc(nameOfMember(id)) + (own[id] ? ' (' + own[id] + ')' : '') + '</option>').join('');
    const rar = RARITIES.map((r, i) => '<span class="gsRar' + (F.rars.has(i) ? ' on' : '') + '" role="button" tabindex="0" data-r="' + i + '" title="' + esc(r[0]) + '"><i style="background:' + r[1] + '"></i></span>').join('');
    return '<div class="gsBar"><span class="gsTypes">' + typesHtml() + '</span></div><div class="gsBar">' +
      '<input type="text" id="gsQ" placeholder="Search name' + (tab === 'take' && withMembers ? ' or member' : '') + '" value="' + esc(F.q) + '" autocomplete="off" spellcheck="false">' +
      '<span>Level <input type="number" id="gsMin" min="0" placeholder="min" value="' + esc(F.min) + '"> - <input type="number" id="gsMax" min="0" placeholder="max" value="' + esc(F.max) + '"></span>' +
      '<span class="gsRars">Quality: ' + rar + '</span>' +
      '</div><div class="gsBar">' +
      '<select id="gsHf">' + opts(HF_OPT, F.hf) + '</select><select id="gsCraft">' + opts(CRAFT_OPT, F.craft) + '</select><select id="gsBuff" title="Only the potions (composed or not) that give this buff">' + bOpts + '</select>' + (tab === 'take' && members ? '<select id="gsPlayer" title="Only the items this guild member has">' + pOpts + '</select>' : '') + (pend ? '<small id="gsBuffMsg">reading composed potions...</small>' : '') +
      ynSel('gsSet', F.set, ['Set: Any', 'Set item', 'Not a set item']) + ynSel('gsEq', F.eq, ['Equippable: Any', 'Equippable', 'Not equippable']) + '<select id="gsTagged">' + opts([['', 'Guild Tagged: Any'], ['yes', 'Tagged'], ['no', 'Untagged']], F.tagged) + '</select>' + ynSel('gsDup', F.dup, ['Duplicates: Any', 'Duplicates', 'No duplicates']) +
      (tab === 'take' ? sw('gsMem', withMembers, 'Members&#39; items', 'Also list the guild tagged items that are in the backpacks of the other members, the ones on the Guild Inventory page.') : '') +
      (tab === 'take' && withMembers ? ynSel('gsEquipped', F.equipped, ['Equipped: Any', 'Equipped', 'Not equipped']) : '') +
      '</div><div class="gsBar">' +
      '<button type="button" class="gsBtn" id="gsClear">Clear filters</button><button type="button" class="gsBtn" id="gsReload" title="Load the list again">Reload</button>' +
      '<span>Sort <select id="gsSort">' + [['name', 'Name'], ['type', 'Type'], ['lvl', 'Level'], ['rar', 'Quality'], ['cr', 'Craft'], ['forge', 'Hell Forge']].concat(tab === 'take' && withMembers ? [['owner', 'Location']] : [])
        .map((o) => '<option value="' + o[0] + '"' + (sort.k === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select> <button type="button" class="gsBtn" id="gsDir" title="Reverse the order">' + (sort.d > 0 ? '▲' : '▼') + '</button></span>' +
      '<span class="gsView"><button type="button" class="gsBtn' + (view === 'list' ? ' on' : '') + '" data-view="list" title="List">List</button><button type="button" class="gsBtn' + (view === 'tiles' ? ' on' : '') + '" data-view="tiles" title="Big icons with the name under them">Tiles</button></span>' +
        (view === 'tiles' ? '<span>Size <select id="gsSize">' + [50, 75, 100].map((z) => '<option value="' + z + '"' + (size === z ? ' selected' : '') + '>' + z + '%</option>').join('') + '</select></span>' : '') +
      '</div>';
  }
  const th = (k, label) => '<th class="s" data-k="' + k + '">' + label + (sort.k === k ? (sort.d > 0 ? ' ▲' : ' ▼') : '') + '</th>';
  // the slot of the backpack, with the game's own markup and CSS (item-rarity-wrapper: the quality pips on top and the craft triangle,
  // item-level-indicators: the hellforge diamonds at the bottom; see generateLevelIndicators in the game's backpack code)
  const slotHtml = (r) => {
    const craftCol = r.cr >= 0 ? CRAFT_COLORS[r.cr] : r.cr === -2 ? UNCRAFTED_COLOR : '';
    const hf = r.forge > 0 ? '<div class="item-level-indicators"><div class="item-level-row">' + [0, 1, 2, 3, 4].map((i) => '<div class="item-level-circle hellforge' + (i < r.forge ? ' filled' : '') + '"></div>').join('') + '</div></div>' : '';
    return '<a href="#" class="inventory-item-slot inventory-item-size-2x3 tip-dynamic" data-tipped="' + esc(tipOf(r)) + '"><span class="item-rarity-wrapper" data-rarity="' + (r.rar || 0) + '" style="--rarity-color:' + ((RARITIES[r.rar] || [0, '#FFFFFF'])[1]) + ';' + (craftCol ? '--craft-color:' + craftCol + ';' : '') + '">' +
      '<span class="inventory-item inventory-item-size-2x3" style="background-image:url(' + esc(imgOf(r)) + ')"></span>' + hf + '</span></a>';
  };
  // the buttons of a row: the store's items are taken, the backpack's deposited, the other members' items taken straight into the
  // backpack or recalled into the guild store
  const btnsOf = (r) => (r.owner === -1 ? '<button type="button" class="gsBtn gsOne" data-id="' + r.id + '" title="Take to inventory">BP</button>'
    : r.owner === -2 ? '<button type="button" class="gsBtn gsOne" data-id="' + r.id + '">Deposit</button>'
      : '<button type="button" class="gsBtn gsOne" data-id="' + r.id + '" title="Take to inventory">BP</button> <button type="button" class="gsBtn gsRecall" data-id="' + r.id + '" title="Recall to Guild Store">GS</button>');
  function listHtml(list) {
    if (!list.length) return '<div class="gsEmpty">' + (rows.length ? 'No item matches the filters.' : tab === 'take' ? 'The guild store is empty.' : 'Nothing in your backpack can be deposited.') + '</div>';
    const from = page * perPage();
    const part = list.slice(from, from + perPage());
    const showOwner = tab === 'take' && withMembers;
    const canSel = () => true;
    if (view === 'tiles') {
      let g = '<div class="gsGrid' + (size !== 100 ? ' s' + size : '') + '">';
      part.forEach((r) => {
        const cls = LIGHT[r.rar] || '#3b2a14';
        const sub = [r.lvl == null ? '' : 'Lvl ' + r.lvl, r.set || (r.extra && r.extra.name ? 'Composed' + (r.extra.duration ? ' · ' + r.extra.duration + ' min' : '') : '')].filter(Boolean).join(' · ');
        g += '<div class="gsTile' + (sel.has(r.id) ? ' sel' : '') + '" data-id="' + r.id + '">' + (canSel(r) ? '<input type="checkbox" class="gsPick" data-id="' + r.id + '"' + (sel.has(r.id) ? ' checked' : '') + '>' : '') +
          slotHtml(r) +
          '<a class="tip-dynamic gsTn" style="color:' + cls + '" data-tipped="' + esc(tipOf(r)) + '">' + esc(r.name) + '</a>' +
          (sub ? '<small>' + esc(sub) + '</small>' : '') +
          (showOwner ? '<small>' + (r.owner === -1 ? 'Guild store' : playerLink(r.owner) + (r.equipped ? EQ_BADGE : '')) + '</small>' : '') +
          btnsOf(r) + '</div>';
      });
      return g + '</div>';
    }
    let h = '<table><thead><tr><th class="c"><input type="checkbox" id="gsAll" title="Select every item of this page"></th><th></th>' + th('name', 'Name') + th('type', 'Type') + th('lvl', 'Lvl') + (tab === 'take' ? th('cr', 'Craft') : '') + th('forge', 'Hell Forge') + '<th>Tagged</th>' + (showOwner ? th('owner', 'Location') : '') + '<th></th></tr></thead><tbody>';
    part.forEach((r) => {
      const cls = LIGHT[r.rar] || '#3b2a14';
      h += '<tr data-id="' + r.id + '"><td class="c">' + (canSel(r) ? '<input type="checkbox" class="gsPick" data-id="' + r.id + '"' + (sel.has(r.id) ? ' checked' : '') + '>' : '') + '</td>' +
        '<td class="i"><img class="tip-dynamic" data-tipped="' + esc(tipOf(r)) + '" src="' + esc(imgOf(r)) + '" alt="" loading="lazy"></td>' +
        '<td class="n"><a class="tip-dynamic" style="color:' + cls + '" data-tipped="' + esc(tipOf(r)) + '">' + esc(r.name) + '</a>' + (r.set ? '<small>' + esc(r.set) + '</small>' : r.extra && r.extra.name ? '<small>Composed' + (r.extra.duration ? ' &middot; ' + r.extra.duration + ' min' : '') + '</small>' : '') + '</td>' +
        '<td>' + esc(TYPES[r.type] || '') + '</td><td class="num">' + (r.lvl == null ? '' : r.lvl) + '</td>' +
        (tab === 'take' ? '<td class="gsCr"' + (r.craft ? ' title="' + esc(r.craft).replace(/"/g, '&quot;') + '"' : '') + '>' + (r.cr >= 0 ? '<b style="color:' + CRAFT_DARK[r.cr] + '">' + esc(CRAFT_NAMES[r.cr]) + '</b>' : esc(r.craft)) + '</td>' : '') +
        '<td class="gsHfc">' + (r.forge ? '<span class="gsHf"><i></i><b>' + r.forge + '</b></span>' : '') + '</td>' +
        '<td class="gsTg">' + (r.tagged ? LOCK : '') + '</td>' +
        (showOwner ? '<td>' + (r.owner === -1 ? 'Guild store' : playerLink(r.owner) + (r.equipped ? EQ_BADGE : '')) + '</td>' : '') +
        '<td class="gsAct">' + btnsOf(r) + '</td></tr>';
    });
    return h + '</tbody></table>';
  }
  function footHtml(list) {
    const pages = Math.max(1, Math.ceil(list.length / perPage()));
    const n = list.length;
    const shown = rows.length === list.length ? list.length + ' items' : list.length + ' of ' + rows.length + ' items';
    return '<span>' + shown + ' &middot; <span id="gsSel">' + sel.size + '</span> selected ' +
      '<button type="button" class="gsBtn" id="gsSelAll"' + (n ? '' : ' disabled') + '>Select all ' + n + '</button> <button type="button" class="gsBtn" id="gsSelNone">None</button></span>' +
      '<span class="gsPager"><a data-p="-1">&lsaquo; Prev</a> ' + (page + 1) + ' / ' + pages + ' <a data-p="1">Next &rsaquo;</a></span>' +
      '<button type="button" class="gsBtn go" id="gsGo"' + (sel.size ? '' : ' disabled') + '>' + (tab === 'take' ? 'Take' : 'Deposit') + ' selected (' + sel.size + ')</button>' +
      (tab === 'take' && withMembers ? '<button type="button" class="gsBtn" id="gsRecallSel" title="Send the selected items of other members to the guild store"' + (list.some((r) => sel.has(r.id) && r.owner >= 0) ? '' : ' disabled') + '>Recall selected to store</button>' : '');
  }
  function drawList() {
    if (!box) return;
    const list = visible();
    const pages = Math.max(1, Math.ceil(list.length / perPage()));
    if (page >= pages) page = pages - 1;
    const keep = box.querySelector('.gsList');
    const top = keep ? keep.scrollTop : 0;
    box.querySelector('.gsList').innerHTML = listHtml(list);
    box.querySelector('.gsFoot').innerHTML = footHtml(list);
    const tb = box.querySelector('.gsTypes');
    if (tb) tb.innerHTML = typesHtml();
    box.querySelector('.gsList').scrollTop = top;
    const all = box.querySelector('#gsAll');
    if (all) all.checked = !!box.querySelectorAll('.gsPick').length && Array.from(box.querySelectorAll('.gsPick')).every((c) => c.checked);
  }
  function drawBody(loading) {
    rows.forEach(applyCached);
    const body = box.querySelector('.gsBody');
    const keepQ = document.activeElement && document.activeElement.id === 'gsQ';
    body.innerHTML = (loading ? '<div class="gsEmpty">Loading...</div>' : barHtml() + '<div class="gsList"></div><div class="gsFoot"></div>') + '<div class="gsMsg"></div>';
    box.querySelectorAll('.gsTab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    // each select in a span of its own: the search box removes the boxes of the selects next to it
    if (!loading) box.querySelectorAll('.gsBar > select').forEach((el) => { const w = document.createElement('span'); w.className = 'gsSelW'; el.replaceWith(w); w.appendChild(el); });
    if (!loading) { const bs = box.querySelector('#gsBuff'); if (bs) searchSelect(bs, 'Search buff...', 'No buff matches', { resetOnEmpty: true });
      const ps = box.querySelector('#gsPlayer'); if (ps) searchSelect(ps, 'Search player...', 'No player matches', { resetOnEmpty: true });
      // the dropdowns of the backpack's filters: orange paper, bold brown text, a colour mark in front of the crafts
      const craftMark = (v) => (CRAFT_COLORS[parseInt(v, 10)] ? { color: CRAFT_COLORS[parseInt(v, 10)], shape: 'square' } : null);
      [['#gsHf', (v) => (/^[1-5]$/.test(v) ? { html: '<span class="gsHfRow">' + '<i></i>'.repeat(+v) + '</span>', textless: true } : null)], ['#gsCraft', craftMark], ['#gsTagged', null], ['#gsSet', null], ['#gsEq', null], ['#gsEquipped', null], ['#gsDup', null]].forEach(([q, swatch]) => { const el = box.querySelector(q); if (el) searchSelect(el, 'Search...', 'No match', { matchWidth: true, look: true, swatch }); }); drawList(); if (keepQ) box.querySelector('#gsQ').focus(); }
  }

  // ---------- loading ----------
  async function load() {
    const my = ++seq;
    sel.clear();
    page = 0;
    drawBody(true);
    if (tab === 'take') {
      const [s, e] = await Promise.all([getJson({ cmd: 'guild', subcmd: 'fetchinv' }), exp ? Promise.resolve(exp) : getJson({ cmd: 'export', subcmd: 'guild_store', inc_tagged: '1' })]);
      if (my !== seq || !box) return;
      if (!Array.isArray(s)) { drawBody(true); box.querySelector('.gsBody .gsEmpty').textContent = 'Could not load the guild store. Try Reload.'; return; }
      store = s; exp = e && e.items ? e : null;
      if (exp) { guildId = exp.guild_id; myId = exp.current_player_id; }
      if (withMembers && !exp) withMembers = false;
      await loadMembers(my); // always: the names, and the player filter
      if (my !== seq || !box) return;
      rows = storeRows();
    } else {
      const [html, bag, e] = await Promise.all([getText({ cmd: 'guild', subcmd: 'inventory', subcmd2: 'storeitems' }), fetchBag(), exp ? Promise.resolve(exp) : getJson({ cmd: 'export', subcmd: 'guild_store', inc_tagged: '1' })]);
      if (my !== seq || !box) return;
      if (!bag || html == null) { drawBody(true); box.querySelector('.gsBody .gsEmpty').textContent = 'Could not load your backpack. Try Reload.'; return; }
      exp = e && e.items ? e : exp;
      if (exp) { guildId = exp.guild_id; myId = exp.current_player_id; }
      // what can be deposited is what the page of the guild inventory offers (not bound, not a container, ...)
      const ok = new Set();
      const re = /name="storeIndex\[\]"[^>]*value="(\d+)"|value="(\d+)"[^>]*name="storeIndex\[\]"/g;
      let m;
      while ((m = re.exec(html))) ok.add(Number(m[1] || m[2]));
      mine = bag.filter((b) => ok.has(b.a));
      rows = depositRows();
    }
    drawBody(false);
    readTips();
  }
  async function loadMembers(my) {
    if (members || !guildId) return;
    const list = await getJson({ cmd: 'export', subcmd: 'guild_members', guild_id: guildId });
    if (my !== seq) return;
    members = {};
    (Array.isArray(list) ? list : []).forEach((p) => { members[p.id] = { name: p.username, level: p.level, rank: p.rank_name, last: p.last_login }; });
  }

  // ---------- take / deposit ----------
  // an item of another member: mode 0 takes it straight into your backpack, mode 1 recalls it into the guild store
  function recallOne(id, playerId, mode) {
    return new Promise((resolve) => {
      $.ajax({
        url: withFst('/app.php'), data: { browser: 1, v: 9, cmd: 'guild', subcmd: 'inventory', subcmd2: 'recall', id, player_id: playerId, mode }, dataType: 'text',
        success: (t) => {
          let j = null;
          try { j = JSON.parse(t); } catch (e) { /* not json */ }
          console.debug('[Guild Store] recall', mode, id, t && t.slice(0, 300));
          // { s: true, r: [...] } when it worked (the item has a new id, so the list is loaded again afterwards); otherwise { e: { message } }
          resolve(j && j.s ? '' : (j && j.e && j.e.message) || 'unexpected answer');
        },
        error: () => resolve('the request failed'),
      });
    });
  }
  async function takeOne(id) {
    const row = rows.find((x) => x.id === id);
    if (row && row.owner >= 0) return recallOne(id, row.owner, 0);
    const r = await getJson({ cmd: 'guild', subcmd: 'inventory', subcmd2: 'takeitem', guildstore_id: id, ajax: 1 });
    if (!r) return 'the request failed';
    if (r.r == 1) return plain(r.m) || 'the game refused';
    return '';
  }
  function depositOne(id) {
    return new Promise((resolve) => {
      $.ajax({
        url: withFst('/app.php'), data: { browser: 1, v: 9, cmd: 'guild', subcmd: 'inventory', subcmd2: 'dostoreitems', items: [id] }, dataType: 'text',
        success: (t) => {
          let j = null;
          try { j = JSON.parse(t); } catch (e) { /* not json */ }
          resolve(j && j.s ? '' : (j && j.e && j.e.message) || 'unexpected answer');
        },
        error: () => resolve('the request failed'),
      });
    });
  }
  async function act(ids, toStore) {
    if (toStore) ids = ids.filter((id) => { const r = rows.find((x) => x.id === id); return r && r.owner >= 0; });
    if (busy || !ids.length) return;
    busy = true;
    box.querySelectorAll('.gsBtn').forEach((b) => { b.disabled = true; });
    const take = tab === 'take';
    let done = 0, bad = '';
    for (const id of ids) {
      if (!box) break;
      setMsg((toStore ? 'Recalling ' : take ? 'Taking ' : 'Depositing ') + (done + 1) + ' of ' + ids.length + '...');
      const row = rows.find((x) => x.id === id);
      const err = await (toStore ? recallOne(id, row.owner, 1) : take ? takeOne(id) : depositOne(id));
      if (err) { bad = err; break; }
      done++;
      sel.delete(id);
      rows = rows.filter((r) => r.id !== id);
      if (take && store) store = store.filter((s) => s.a !== id);
      if (!take && mine) mine = mine.filter((b) => b.a !== id);
      await sleep(120 + Math.random() * 160);
    }
    busy = false;
    if (!toStore) adjustInventoryCount(take ? -done : done);
    exp = null; // the next load asks for the new state of the guild
    if (!box) return;
    drawList();
    if (toStore && done) { const m = done + ' recalled into the guild store.' + (bad ? ' Stopped: ' + bad : ''); await load(); setMsg(m, bad ? 'bad' : 'ok'); return; }
    setMsg((done ? done + (toStore ? ' recalled' : take ? ' taken' : ' deposited') + '.' : '') + (bad ? (done ? ' ' : '') + 'Stopped: ' + bad : ''), bad ? 'bad' : 'ok');
  }

  // ---------- window ----------
  function open(startTab) {
    if (box) { if (startTab && startTab !== tab) switchTab(startTab); return; }
    box = document.createElement('div');
    box.id = 'fsbGs';
    box.innerHTML =
      '<div class="gsHead"><span>Guild Store</span><span class="gsLinks"><a href="' + esc(withFst(INV_URL)) + '" target="_blank" rel="noopener">Guild Inventory page</a> &middot; <a href="' + esc(withFst(DEPOSIT_URL)) + '" target="_blank" rel="noopener">Deposit page</a></span>' +
      '<button type="button" class="gsX" title="Close (Esc)" aria-label="Close">&times;</button></div>' +
      '<div class="gsTabs"><button type="button" class="gsTab" data-tab="take">Take</button><button type="button" class="gsTab" data-tab="put">Deposit</button></div><div class="gsBody"></div>';
    lockPage();
    document.body.appendChild(box);
    if (startTab) tab = startTab;
    box.querySelector('.gsX').addEventListener('click', () => { if (!busy) close(); });
    document.addEventListener('keydown', onKey);
    const head = box.querySelector('.gsHead');
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.gsX, a')) return;
      const r = box.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const mv = (ev) => place(ev.clientX - dx, ev.clientY - dy);
      const up = () => {
        head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up);
        const b = box.getBoundingClientRect();
        try { localStorage.setItem(POS_KEY, JSON.stringify({ x: b.left, y: b.top })); } catch (err) { /* storage unavailable */ }
      };
      head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
    });
    box.addEventListener('click', onClick);
    box.addEventListener('change', onChange);
    box.addEventListener('input', onInput);
    let pos = null;
    try { pos = JSON.parse(localStorage.getItem(POS_KEY)); } catch (err) { /* ignore */ }
    place(pos ? pos.x : (innerWidth - 780) / 2, pos ? pos.y : 40);
    load();
  }
  function switchTab(t) {
    if (busy) return;
    tab = t;
    remember('gsTab', t);
    rows = [];
    load();
  }
  function onClick(e) {
    const t = e.target;
    if (t.closest('.gsTab')) { switchTab(t.closest('.gsTab').dataset.tab); return; }
    if (t.closest('#gsReload')) { if (!busy) { exp = null; store = null; members = null; load(); } return; }
    if (t.closest('#gsClear')) { Object.assign(F, { q: '', types: new Set(), rars: new Set(), min: '', max: '', set: '', eq: '', dup: '', equipped: '', tagged: '', hf: '', craft: '', buff: '', player: '' }); page = 0; drawBody(false); return; }
    const rb = t.closest('.gsRar');
    if (rb) { const i = Number(rb.dataset.r); if (F.rars.has(i)) F.rars.delete(i); else F.rars.add(i); page = 0; rb.classList.toggle('on'); drawList(); return; }
    const vw = t.closest('.gsView button');
    if (vw) { view = vw.dataset.view; remember('gsView', view); page = 0; drawBody(false); return; }
    if (t.closest('#gsDir')) { sort = { k: sort.k, d: -sort.d }; drawBody(false); return; }
    const ty = t.closest('.gsTyp');
    if (ty) { const v = ty.dataset.t; if (v === '') F.types.clear(); else { const n = +v; if (F.types.has(n)) F.types.delete(n); else F.types.add(n); } page = 0; drawList(); return; }
    const tileImg = t.closest('.gsTile .inventory-item-slot');
    if (tileImg) { e.preventDefault(); const id = Number(tileImg.closest('.gsTile').dataset.id); if (sel.has(id)) sel.delete(id); else if (rows.some((r) => r.id === id)) sel.add(id); drawList(); return; }
    const head = t.closest('th.s');
    if (head) { const k = head.dataset.k; sort = sort.k === k ? { k, d: -sort.d } : { k, d: 1 }; drawList(); return; }
    const pg = t.closest('.gsPager a');
    if (pg) { page = Math.max(0, page + Number(pg.dataset.p)); drawList(); return; }
    const one = t.closest('.gsOne');
    if (one && !busy) { act([Number(one.dataset.id)]); return; }
    if (t.closest('#gsGo')) { act(Array.from(sel)); return; }
    if (t.closest('#gsRecallSel')) { act(Array.from(sel), true); return; }
    const rc = t.closest('.gsRecall');
    if (rc && !busy) { act([Number(rc.dataset.id)], true); return; }
    if (t.closest('#gsSelAll')) { visible().forEach((r) => sel.add(r.id)); drawList(); return; }
    if (t.closest('#gsSelNone')) { sel.clear(); drawList(); }
  }
  function onChange(e) {
    const t = e.target;
    if (t.classList.contains('gsPick')) { const id = Number(t.dataset.id); if (t.checked) sel.add(id); else sel.delete(id); drawList(); return; }
    if (t.id === 'gsAll') { box.querySelectorAll('.gsPick').forEach((c) => { const id = Number(c.dataset.id); if (t.checked) sel.add(id); else sel.delete(id); }); drawList(); return; }
    if (t.id === 'gsSize') { size = parseInt(t.value, 10); remember('gsSize', String(size)); drawList(); return; }
    if (t.id === 'gsSort') { sort = { k: t.value, d: 1 }; page = 0; drawBody(false); return; }
    if (t.id === 'gsPlayer') {
      F.player = t.value;
      if (F.player !== '' && !withMembers) { withMembers = true; remember('gsMembers', '1'); rows = storeRows(); sel.clear(); page = 0; drawBody(false); return; } // their items are only listed with "Members' items"
    }
    else if (t.id === 'gsHf') F.hf = t.value;
    else if (t.id === 'gsCraft') F.craft = t.value;
    else if (t.id === 'gsBuff') { F.buff = t.value; if (F.buff !== '') readTips(); }
    else if (t.id === 'gsSet') F.set = t.value;
    else if (t.id === 'gsEq') F.eq = t.value;
    else if (t.id === 'gsDup') F.dup = t.value;
    else if (t.id === 'gsEquipped') F.equipped = t.value;
    else if (t.id === 'gsTagged') F.tagged = t.value;
    else if (t.id === 'gsMem') {
      withMembers = t.checked; remember('gsMembers', withMembers ? '1' : '0');
      if (!withMembers) { F.equipped = ''; F.player = ''; } // those filters are about the members' items
      if (withMembers && !members) { load(); return; }
      rows = storeRows(); sel.clear(); drawBody(false); return;
    } else return;
    page = 0;
    drawList();
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'gsQ') F.q = t.value;
    else if (t.id === 'gsMin') F.min = t.value;
    else if (t.id === 'gsMax') F.max = t.value;
    else return;
    page = 0;
    drawList();
  }

  // caught before the game's own handler of the menu link, which opens its window
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a.guild_openGuildStore');
    if (!a) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open('take');
  }, true);
  window.__fsbGuildStore = { open };
}
