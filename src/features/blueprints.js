import { withFst } from '../core/game.js';
import { RARITIES, norm } from '../core/items.js';
import { PAPER_COLORS, rarityOf, readItemTips, sleep } from '../core/itemtips.js';
import { PER_PAGE_CHOICES, loadSettings, recall, remember } from '../core/settings.js';
import { toggleHtml, useToggleStyle } from '../core/toggle.js';
import { $, esc } from '../core/util.js';

// ---------------------------------------------------------------- all blueprints in one list
// The Inventing page shows blueprints in folders, ten to a page. This adds a second view of the same page: every blueprint of every
// folder in one list, with search (name, ingredient), filters, sorting, what you have of each ingredient, inventing and moving.
// What a blueprint needs and makes never changes, so it is read once (its page and the item tooltips) and kept (FSB_blueprints).
// On later visits only the folders and your backpack and components are read; the blueprints that then look ready are checked on
// their own page, because the game does not count items that are worn or guild tagged.
const CACHE_KEY = 'blueprints';
const VIEW_KEY = 'blueprintView';
const BANNER = 'https://cdn2.fallensword.com/ui/banners/inventing.png';
const CDN_ITEMS = 'https://cdn2.fallensword.com/items/';
const CDN_FOLDER = 'https://cdn2.fallensword.com/ui/misc/'; // folder.png, and folder_on.png for the selected one
const SORTS = [['name', 'Name'], ['folder', 'Folder'], ['level', 'Level'], ['rarity', 'Rarity'], ['make', 'How many you can make'], ['near', 'Closest to complete']];

const readJson = (key, fallback) => { try { return Object.assign(fallback, JSON.parse(recall(key) || '{}')); } catch (e) { return fallback; } };
const attr = (s) => esc(s).replace(/"/g, '&quot;');

// one request at a time; the game answers 503 when asked too fast, then wait longer and try again
async function request(options) {
  for (let fails = 1; ; fails += 1) {
    const res = await new Promise((resolve) => {
      $.ajax(Object.assign({ timeout: 30000, success: (t) => resolve({ ok: true, t }), error: (x) => resolve({ ok: false, status: x.status }) }, options));
    });
    if (res.ok) return res.t;
    if (fails >= 4 || !(res.status === 503 || res.status === 429 || !res.status)) throw new Error(res.status ? 'error ' + res.status : 'no answer');
    await sleep(2500 * fails);
  }
}
const toDoc = (t) => new DOMParser().parseFromString(t, 'text/html');
const getPage = async (url) => toDoc(await request({ url: withFst(url), dataType: 'text' }));
const getApp = (query) => request({ url: withFst('/app.php?browser=1&v=9&' + query), dataType: 'json' });

// the folders of an inventing page: [[id, name], ...]; "Unassigned" has no name element of its own
const foldersIn = (doc) => [['-1', 'Unassigned']].concat(Array.from(doc.querySelectorAll('#pCC div[id^="folder_name_"]'))
  .map((d) => [d.id.replace('folder_name_', ''), d.textContent.trim()]).filter((f) => f[0] !== '-1' && f[1] !== 'Unassigned'));

// a blueprint's page: the ingredients (with "have / need" under each), what it makes, and the chance of success
export function parseBlueprint(doc) {
  const ing = [];
  let target = null;
  doc.querySelectorAll('#pCC td[background]').forEach((td) => {
    const bg = td.getAttribute('background');
    const tipEl = td.querySelector('[data-tipped]');
    const tip = tipEl ? tipEl.getAttribute('data-tipped') : '';
    const id = (/item_id=(\d+)/.exec(tip) || [])[1];
    if (!id) return;
    if (/\/hellforge\//.test(bg)) { target = { id, tip }; return; }
    const under = td.parentNode.nextElementSibling;
    const m = under && /(\d+)\s*\/\s*(\d+)/.exec(under.textContent);
    if (m) ing.push({ id, tip, comp: /1x1mini/.test(bg), have: +m[1], need: +m[2] });
  });
  const text = doc.querySelector('#pCC') ? doc.querySelector('#pCC').textContent.replace(/\s+/g, ' ') : '';
  if (!target) return null;
  return {
    ing,
    target,
    level: Number((/Requires Level:\s*(\d+)/.exec(text) || [])[1]) || 0,
    chance: ((/Target Invention\s*(.*?chance of success)/i.exec(text) || [])[1] || '').trim(),
  };
}

export function initBlueprints() {
  if (window.top !== window.self || !loadSettings().blueprintList) return;
  const params = new URLSearchParams(location.search);
  if (params.get('cmd') !== 'inventing' || params.get('subcmd')) return;
  const pcc = document.getElementById('pCC');
  if (!pcc || document.getElementById('fsbInv')) return;

  const css = document.createElement('style');
  css.textContent =
    '#fsbInvBar{display:flex;justify-content:center;margin:6px 0;}' +
    '#fsbInvBar button,#fsbInv .invBtn{cursor:pointer;background:#e9d3a0;color:#3b2a14;border:1px solid #20170396;border-radius:3px;padding:2px 10px;font:12px Arial,sans-serif;box-shadow:0 0 2px #00000066;}' +
    '#fsbInvBar button:first-child{border-radius:3px 0 0 3px;}#fsbInvBar button:last-child{border-radius:0 3px 3px 0;margin-left:-1px;}' +
    '#fsbInvBar button.on{background:#b79862;font-weight:bold;}' +
    '#fsbInv{width:100%;max-width:560px;margin:0 auto;font:12px Arial,sans-serif;color:#3b2a14;text-align:left;}' +
    '#fsbInv *{box-sizing:border-box;}' +
    '#fsbInv .invBanner{display:block;max-width:100%;margin:0 auto 8px;}' +
    '#fsbInv .invRow{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-bottom:6px;}' +
    '#fsbInv input[type=search],#fsbInv select{height:23px;background:#f6e8c4;color:#3b2a14;border:1px solid #20170396;border-radius:3px;padding:1px 5px;font:12px Arial,sans-serif;}' +
    '#fsbInv input[type=search]{flex:1;min-width:180px;}' +
    '#fsbInv .invBtn:hover{background:#f6e6bd;}#fsbInv .invBtn:disabled{opacity:.45;cursor:default;}#fsbInv .invBtn.go{background:#c9dc9a;}#fsbInv .invBtn.go:hover:not(:disabled){background:#d6e8a8;}' +
    '#fsbInv .invSw{display:inline-flex;align-items:center;gap:5px;cursor:pointer;}' +
    '#fsbInv .invStatus{margin:2px 0 6px;opacity:.85;}#fsbInv .invStatus.bad{color:#a00000;opacity:1;}' +
    '#fsbInv .invMove{padding:5px 7px;background:#dfc488;border:1px solid #20170355;border-radius:3px;}#fsbInv .invMove[hidden]{display:none;}' +
    '#fsbInv ul{list-style:none;margin:0;padding:0;border-top:2px solid #b79862;}' +
    '#fsbInv li{display:grid;grid-template-columns:34px minmax(0,1fr) auto 70px;align-items:center;gap:3px 8px;padding:5px 4px;border-bottom:1px solid #b7986288;}' +
    '#fsbInv li.sel{grid-template-columns:30px 34px minmax(0,1fr) auto 70px;background:#efd9a4;}#fsbInv li.pick{grid-template-columns:30px 34px minmax(0,1fr) auto 70px;}' +
    '#fsbInv li:hover{background:#f0dcaa;}' +
    '#fsbInv .invPic{display:block;width:32px;height:32px;object-fit:contain;}' +
    '#fsbInv .invName a{font-weight:bold;text-decoration:none;}#fsbInv .invName a:hover{text-decoration:underline;}' +
    '#fsbInv .invName small{display:block;opacity:.75;line-height:1.35;}' +
    '#fsbInv .invIngs{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:2px 5px;max-width:200px;}' +
    '#fsbInv .invIng{width:34px;text-align:center;}#fsbInv .invIng img{display:block;width:24px;height:24px;object-fit:contain;margin:0 auto;}' +
    '#fsbInv .invIng span{display:block;font-size:10px;line-height:12px;white-space:nowrap;}#fsbInv .invIng.miss span{color:#a00000;font-weight:bold;}#fsbInv .invIng.miss img{opacity:.55;}' +
    '#fsbInv .invIng.ok span{color:#2f6a0a;font-weight:bold;}#fsbInv .invIng.hit img{outline:2px solid #3f7a12;border-radius:2px;}' +
    '#fsbInv .invAct{text-align:center;}#fsbInv .invAct small{display:block;font-size:10px;opacity:.8;margin-top:2px;}' +
    '#fsbInv .invAsk,#fsbInv .invMsg{grid-column:1/-1;padding:5px 7px;border:1px solid #20170355;border-radius:3px;background:#f6e8c4;line-height:1.7;}' +
    '#fsbInv .invAsk .invBtn{margin-left:8px;}#fsbInv .invMsg.good{background:#dcebb4;}#fsbInv .invMsg.bad{background:#f1cdb8;}' +
    '#fsbInv .invNone{padding:18px;text-align:center;opacity:.8;}' +
    '#fsbInv .invFolders{display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:2px 4px;margin-bottom:8px;}' +
    '#fsbInv .invFolder{min-width:64px;max-width:80px;padding:3px 2px;cursor:pointer;background:none;border:1px solid transparent;border-radius:4px;color:#3b2a14;font:12px Arial,sans-serif;line-height:1.25;overflow-wrap:anywhere;}' +
    '#fsbInv .invFolder img{display:block;margin:0 auto 2px;}#fsbInv .invFolder small{display:block;font-size:10px;opacity:.7;}' +
    '#fsbInv .invFolder:hover{background:#f0dcaa;}#fsbInv .invFolder.on{background:#dfc488;border-color:#20170355;font-weight:bold;}' +
    '#fsbInv .invPager{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:4px 6px;margin:6px 0;}#fsbInv .invPager[hidden]{display:none;}' +
    '#fsbInv .invPager .invRange{margin-right:auto;opacity:.85;}';
  document.head.appendChild(css);
  useToggleStyle();

  const bar = document.createElement('div');
  bar.id = 'fsbInvBar';
  bar.innerHTML = '<button type="button" data-view="list">All blueprints</button><button type="button" data-view="folders">Folders</button>';
  const box = document.createElement('div');
  box.id = 'fsbInv';
  const game = Array.from(pcc.children);
  pcc.prepend(bar, box);

  const view = readJson(VIEW_KEY, { on: 'list', q: '', folder: '', type: '', ready: false, sort: 'name', down: false, per: 20 });
  if (!PER_PAGE_CHOICES.includes(view.per)) view.per = 20;
  let page = 0;
  let shownIds = []; // the blueprints on this page, and all that match the search and filters
  let matchIds = [];
  const saveView = () => remember(VIEW_KEY, JSON.stringify(view));
  const cache = readJson(CACHE_KEY, { items: {}, recipes: {} });
  const saveCache = () => remember(CACHE_KEY, JSON.stringify(cache));

  let folders = foldersIn(document);
  let list = null; // [{ id, name, folder, pic }]
  let have = null; // { item: Map, comp: Map }
  const checked = new Map(); // recipe id -> { have: [..], chance } read from the blueprint's own page in this visit
  const selected = new Set();
  let moving = false;
  let asking = '';
  const messages = new Map(); // recipe id -> { text, good }
  let busy = false;
  let status = '';
  let statusBad = false;

  const folderName = (id) => (folders.find((f) => f[0] === id) || [id, 'Folder ' + id])[1];
  const itemOf = (id) => cache.items[id] || null;

  // what you have of each ingredient: the blueprint page's own numbers when it was checked, else counted from the backpack
  function haveOf(id, recipe) {
    const c = checked.get(id);
    return recipe.ing.map((g, i) => {
      if (c) return c.have[i] || 0;
      if (!have) return 0;
      return (g.comp ? have.comp : have.item).get(g.id) || 0;
    });
  }
  function row(entry) {
    const r = cache.recipes[entry.id];
    if (!r) return { entry, r: null, make: 0, near: -1, level: 0, rarity: -1, type: '', haves: [] };
    const haves = haveOf(entry.id, r);
    const make = have && r.ing.length ? Math.min(...r.ing.map((g, i) => Math.floor(haves[i] / g.need))) : 0;
    const need = r.ing.reduce((t, g) => t + g.need, 0);
    const near = need ? r.ing.reduce((t, g, i) => t + Math.min(haves[i], g.need), 0) / need : 0;
    const made = itemOf(r.target.id);
    return { entry, r, haves, make, near, made, level: made ? made.l : 0, rarity: made ? made.q : -1, type: made ? made.t : '' };
  }

  function matches(x, words) {
    if (view.folder && x.entry.folder !== view.folder) return false;
    if (view.type && x.type !== view.type) return false;
    if (view.ready && !x.make) return false;
    if (!words.length) return true;
    const names = [x.entry.name, x.made ? x.made.n : ''].concat(x.r ? x.r.ing.map((g) => (itemOf(g.id) || {}).n || '') : []).map(norm);
    return words.every((w) => names.some((n) => n.includes(w)));
  }

  function sorted(rows) {
    const by = {
      name: () => 0,
      folder: (a, b) => folderName(a.entry.folder).localeCompare(folderName(b.entry.folder)),
      level: (a, b) => (a.level || 1e9) - (b.level || 1e9), // those without a level come after the others
      rarity: (a, b) => a.rarity - b.rarity,
      make: (a, b) => b.make - a.make,
      near: (a, b) => b.near - a.near,
    }[view.sort] || (() => 0);
    const out = rows.slice().sort((a, b) => by(a, b) || a.entry.name.localeCompare(b.entry.name));
    return view.down ? out.reverse() : out;
  }

  // ---------- drawing ----------
  const sw = (key, label, on, tip) => '<label class="invSw"' + (tip ? ' title="' + attr(tip) + '"' : '') + '>' + toggleHtml('data-sw="' + key + '"', on) + '<span>' + label + '</span></label>';
  const option = (v, label, now) => '<option value="' + attr(v) + '"' + (v === now ? ' selected' : '') + '>' + esc(label) + '</option>';

  function shell() {
    box.innerHTML = '<img class="invBanner" src="' + BANNER + '" alt="Inventing">' +
      '<div class="invRow"><input type="search" id="fsbInvQ" placeholder="Search a blueprint or an ingredient..." value="' + attr(view.q) + '" autocomplete="off"><button type="button" class="invBtn" data-act="refresh" title="Read your folders, backpack and components again">Refresh</button></div>' +
      '<div class="invFolders"></div><div class="invRow invFilters"></div><div class="invStatus"></div><div class="invRow invMove" hidden></div>' +
      '<div class="invPager" data-pager="top" hidden></div><ul></ul><div class="invPager" data-pager="bottom" hidden></div>';
  }
  const q = (sel) => box.querySelector(sel);

  function drawFilters() {
    const types = Array.from(new Set((list || []).map((e) => row(e).type).filter(Boolean))).sort();
    if (view.folder && !folders.some((f) => f[0] === view.folder)) view.folder = '';
    if (view.type && list && !types.includes(view.type)) types.push(view.type);
    drawFolders();
    q('.invFilters').innerHTML = '<select data-pick="type" title="What it makes">' + option('', 'All types', view.type) + types.map((t) => option(t, t, view.type)).join('') + '</select>' +
      '<select data-pick="sort" title="Sort by">' + SORTS.map(([v, l]) => option(v, 'Sort: ' + l, view.sort)).join('') + '</select>' +
      '<button type="button" class="invBtn" data-act="dir" title="Reverse the order">' + (view.down ? '&#9650;' : '&#9660;') + '</button>' +
      sw('ready', 'Can invent now', view.ready) + sw('moving', 'Move blueprints', moving);
  }

  // the folders, as the game shows them: picking one shows only its blueprints
  function drawFolders() {
    const counts = new Map();
    (list || []).forEach((e) => counts.set(e.folder, (counts.get(e.folder) || 0) + 1));
    q('.invFolders').innerHTML = [['', 'All']].concat(folders).map(([id, name]) => {
      const on = view.folder === id;
      return '<button type="button" class="invFolder' + (on ? ' on' : '') + '" data-act="folder" data-id="' + attr(id) + '" aria-pressed="' + on + '">' +
        '<img src="' + CDN_FOLDER + (on ? 'folder_on' : 'folder') + '.png" alt="">' + esc(name) + (list ? '<small>' + (id ? counts.get(id) || 0 : list.length) + '</small>' : '') + '</button>';
    }).join('');
  }

  function drawStatus() {
    const el = q('.invStatus');
    el.className = 'invStatus' + (statusBad ? ' bad' : '');
    el.textContent = status;
    q('[data-act="refresh"]').disabled = busy;
  }

  function drawMove() {
    const el = q('.invMove');
    el.hidden = !moving;
    if (!moving) return;
    el.innerHTML = '<span>' + selected.size + ' selected</span><button type="button" class="invBtn" data-act="onpage">Select this page</button>' + (matchIds.length > shownIds.length ? '<button type="button" class="invBtn" data-act="all">Select all ' + matchIds.length + '</button>' : '') + '<button type="button" class="invBtn" data-act="none"' + (selected.size ? '' : ' disabled') + '>Clear</button>' +
      '<span>Move to <select data-target>' + folders.map((f) => option(f[0], f[1], '')).join('') + '</select></span><button type="button" class="invBtn go" data-act="move"' + (selected.size && !busy ? '' : ' disabled') + '>Move</button>';
  }

  const viewUrl = (id) => withFst('/index.php?cmd=inventing&subcmd=viewrecipe&recipe_id=' + encodeURIComponent(id));

  function ingredient(g, count, words) {
    const item = itemOf(g.id);
    const hit = item && words.length && words.some((w) => norm(item.n).includes(w));
    return '<span class="invIng ' + (!have ? '' : count >= g.need ? 'ok' : 'miss') + (hit ? ' hit' : '') + '"><img src="' + CDN_ITEMS + g.id + '.gif" alt="' + attr(item ? item.n : '') + '" loading="lazy" class="tip-dynamic" data-tipped="' + attr(g.tip) + '"><span>' + (have ? count : '?') + ' / ' + g.need + '</span></span>';
  }

  function itemRow(x, words) {
    const { entry, r } = x;
    const color = x.rarity >= 0 ? PAPER_COLORS[x.rarity] : '#3b2a14';
    const about = [x.type, x.rarity >= 0 ? RARITIES[x.rarity][0] : '', x.level ? 'level ' + x.level : ''].filter(Boolean).join(' · ');
    const pic = r ? '<img class="invPic tip-dynamic" src="' + CDN_ITEMS + r.target.id + '.gif" alt="" loading="lazy" data-tipped="' + attr(r.target.tip) + '">' : '<span></span>';
    const msg = messages.get(entry.id);
    const c = checked.get(entry.id);
    let ask = '';
    if (asking === entry.id && r) {
      const uses = r.ing.map((g) => g.need + '× ' + esc((itemOf(g.id) || {}).n || 'item ' + g.id)).join(', ');
      ask = '<div class="invAsk">Invent <b>' + esc(entry.name) + '</b>? This uses up ' + uses + '.' + (c && c.chance ? ' ' + esc(c.chance) + '.' : '') +
        '<button type="button" class="invBtn go" data-act="invent" data-id="' + attr(entry.id) + '"' + (busy ? ' disabled' : '') + '>Yes, invent</button><button type="button" class="invBtn" data-act="cancel">Cancel</button></div>';
    }
    return '<li class="' + (moving ? (selected.has(entry.id) ? 'sel' : 'pick') : '') + '">' +
      (moving ? '<label class="invSw">' + toggleHtml('data-sel="' + attr(entry.id) + '"', selected.has(entry.id)) + '</label>' : '') +
      pic + '<span class="invName"><a href="' + attr(viewUrl(entry.id)) + '" style="color:' + color + '">' + esc(entry.name) + '</a><small>' + esc(about) + '</small><small>' + esc(folderName(entry.folder)) + (r && r.level > 1 ? ' · needs level ' + r.level : '') + '</small></span>' +
      '<span class="invIngs">' + (r ? r.ing.map((g, i) => ingredient(g, x.haves[i], words)).join('') : '<small>not read yet</small>') + '</span>' +
      '<span class="invAct"><button type="button" class="invBtn' + (x.make ? ' go' : '') + '" data-act="ask" data-id="' + attr(entry.id) + '"' + (x.make && !busy ? '' : ' disabled') + '>Invent</button>' + (x.make > 1 ? '<small>enough for ' + x.make + '</small>' : '') + '</span>' +
      ask + (msg ? '<div class="invMsg ' + (msg.good ? 'good' : 'bad') + '">' + esc(msg.text) + '</div>' : '') + '</li>';
  }

  function drawPager(pages, total) {
    box.querySelectorAll('.invPager').forEach((el) => {
      const top = el.dataset.pager === 'top';
      // nothing to page through when everything fits on the smallest page; the one under the list only helps when there are pages
      el.hidden = total <= PER_PAGE_CHOICES[0] || (!top && pages < 2);
      if (el.hidden) return;
      const numbers = Array.from({ length: pages }, (x, i) => option(String(i), String(i + 1), String(page))).join('');
      el.innerHTML = '<span class="invRange">' + (page * view.per + 1) + '&ndash;' + Math.min(total, (page + 1) * view.per) + ' of ' + total + '</span>' +
        '<button type="button" class="invBtn" data-act="prev" title="Previous page"' + (page ? '' : ' disabled') + '>&#9664;</button>' +
        '<span>Page <select data-page>' + numbers + '</select> of ' + pages + '</span>' +
        '<button type="button" class="invBtn" data-act="next" title="Next page"' + (page < pages - 1 ? '' : ' disabled') + '>&#9654;</button>' +
        (top ? '<span>Per page <select data-per>' + PER_PAGE_CHOICES.map((n) => option(String(n), String(n), String(view.per))).join('') + '</select></span>' : '');
    });
  }

  function drawList() {
    const ul = q('ul');
    const words = norm(view.q).split(/\s+/).filter(Boolean);
    const rows = list ? sorted(list.map(row).filter((x) => matches(x, words))) : [];
    const pages = Math.max(1, Math.ceil(rows.length / view.per));
    page = Math.min(Math.max(0, page), pages - 1);
    const here = rows.slice(page * view.per, (page + 1) * view.per);
    matchIds = rows.map((x) => x.entry.id);
    shownIds = here.map((x) => x.entry.id);
    ul.innerHTML = !list ? '' : here.map((x) => itemRow(x, words)).join('') || '<div class="invNone">' + (list.length ? 'No blueprint matches.' : 'You have not learned any blueprints.') + '</div>';
    drawPager(pages, rows.length);
    drawMove();
  }

  const draw = () => { drawFilters(); drawStatus(); drawList(); };
  let pending = 0;
  const drawSoon = () => { if (!pending) pending = setTimeout(() => { pending = 0; draw(); }, 600); };
  const say = (text, bad) => { status = text; statusBad = !!bad; drawStatus(); };
  const summary = () => {
    const ready = list.map(row).filter((x) => x.make).length;
    return list.length + ' blueprints in ' + folders.length + ' folders. You can invent ' + ready + ' of them now.';
  };

  // ---------- reading ----------
  async function readFolders() {
    const first = await getPage('/index.php?cmd=inventing');
    folders = foldersIn(first);
    const found = [];
    const seen = new Set();
    for (const [folder, name] of folders) {
      let pages = 1;
      for (let page = 0; page < pages; page += 1) {
        say('Reading folder ' + name + (pages > 1 ? ', page ' + (page + 1) + ' of ' + pages : '') + '...');
        await sleep(250);
        const doc = await getPage('/index.php?cmd=inventing&folder_id=' + folder + '&page=' + page);
        const select = doc.querySelector('#pCC select[name="page"]');
        pages = select ? Math.max(1, select.options.length) : 1;
        doc.querySelectorAll('#pCC a[href*="recipe_id="]').forEach((a) => {
          const id = (/recipe_id=(\d+)/.exec(a.getAttribute('href')) || [])[1];
          if (!id || seen.has(id)) return;
          seen.add(id);
          found.push({ id, name: a.textContent.trim(), folder });
        });
      }
    }
    return found;
  }

  async function readHave() {
    const [inv, comp] = [await getApp('cmd=profile&subcmd=loadinventory'), await getApp('cmd=profile&subcmd=loadcomponents')];
    if (!inv || !inv.r || !inv.r.inventories || !comp || !Array.isArray(comp.r)) throw new Error('your backpack could not be read');
    const tally = (items) => items.reduce((m, i) => m.set(String(i.b), (m.get(String(i.b)) || 0) + 1), new Map());
    have = { item: tally(inv.r.inventories.flatMap((f) => f.items || [])), comp: tally(comp.r) };
  }

  // the blueprint's own page: stores what it needs and makes, and the game's own count of what you have
  async function readBlueprint(id) {
    const data = parseBlueprint(await getPage('/index.php?cmd=inventing&subcmd=viewrecipe&recipe_id=' + id));
    if (!data) return false;
    cache.recipes[id] = { level: data.level, target: data.target, ing: data.ing.map((g) => ({ id: g.id, tip: g.tip, comp: g.comp, need: g.need })) };
    checked.set(id, { have: data.ing.map((g) => g.have), chance: data.chance });
    return true;
  }

  async function readNames() {
    const wanted = new Map();
    list.forEach((e) => {
      const r = cache.recipes[e.id];
      if (r) [r.target].concat(r.ing).forEach((g) => { if (!cache.items[g.id]) wanted.set(g.id, g.tip); });
    });
    if (!wanted.size) return;
    let done = 0;
    const total = wanted.size;
    say('Reading item names: 0 of ' + total + '...');
    await readItemTips(Array.from(wanted, ([key, tip]) => ({ key, tip })), (key, info) => {
      cache.items[key] = { n: info.n, t: info.t, q: rarityOf(info), l: info.l || 0 };
      saveCache();
      done += 1;
      say('Reading item names: ' + done + ' of ' + total + '...');
      drawSoon();
    });
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    asking = '';
    checked.clear();
    draw();
    try {
      list = await readFolders();
      cache.list = list;
      cache.folders = folders;
      saveCache();
      say('Reading your backpack and components...');
      await readHave();
      draw();
      const unread = list.filter((e) => !cache.recipes[e.id]);
      for (let i = 0; i < unread.length; i += 1) {
        say('Reading new blueprints: ' + (i + 1) + ' of ' + unread.length + '...');
        await sleep(250);
        await readBlueprint(unread[i].id);
        saveCache();
        drawSoon();
      }
      const ready = list.filter((e) => !checked.has(e.id) && row(e).make);
      for (let i = 0; i < ready.length; i += 1) {
        say('Checking what you can invent: ' + (i + 1) + ' of ' + ready.length + '...');
        await sleep(250);
        await readBlueprint(ready[i].id);
        drawSoon();
      }
      await readNames();
      busy = false;
      status = summary();
      statusBad = false;
    } catch (e) {
      busy = false;
      status = 'Could not read everything (' + e.message + '). Press Refresh to carry on.';
      statusBad = true;
    }
    draw();
  }

  // ---------- inventing and moving ----------
  async function invent(id) {
    if (busy) return;
    busy = true;
    asking = '';
    messages.delete(id);
    say('Inventing...');
    drawList();
    let message = '';
    try {
      // sent once only: if the answer is lost, the next reading shows what happened
      const html = await new Promise((resolve, reject) => {
        $.ajax({ type: 'POST', url: withFst('/index.php'), data: { cmd: 'inventing', subcmd: 'doinvent', recipe_id: id, fst: (/[?&]fst=([^&]+)/.exec(withFst('/index.php')) || [])[1] }, dataType: 'text', timeout: 30000, success: resolve, error: () => reject(new Error('the game did not answer')) });
      });
      const el = toDoc(html).getElementById('info-msg');
      message = el ? el.innerHTML.replace(/<br[\s\S]*/i, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
      messages.set(id, { text: message || 'The game gave no message: check your backpack.', good: /success/i.test(message) });
    } catch (e) {
      messages.set(id, { text: 'Inventing may or may not have happened (' + e.message + '): check your backpack.', good: false });
    }
    try {
      checked.clear();
      await readHave();
      await readBlueprint(id);
      // others that share an ingredient and still look ready are checked again
      for (const e of list.filter((x) => !checked.has(x.id) && row(x).make)) { await sleep(250); await readBlueprint(e.id); }
      status = summary();
      statusBad = false;
    } catch (e) {
      status = 'Your ingredients could not be read again (' + e.message + '). Press Refresh.';
      statusBad = true;
    }
    busy = false;
    draw();
  }

  async function move(target) {
    if (busy || !selected.size) return;
    const ids = Array.from(selected).filter((id) => list.some((e) => e.id === id && e.folder !== target));
    if (!ids.length) { say('They are in that folder already.', true); return; }
    busy = true;
    say('Moving ' + ids.length + (ids.length === 1 ? ' blueprint...' : ' blueprints...'));
    drawList();
    try {
      const res = await new Promise((resolve, reject) => {
        $.ajax({ url: withFst('/app.php?browser=1&v=9&cmd=inventing&subcmd=domoverecipes&target_folder_id=' + encodeURIComponent(target) + ids.map((i) => '&recipe_selected%5B%5D=' + encodeURIComponent(i)).join('')), dataType: 'json', timeout: 30000, success: resolve, error: () => reject(new Error('the game did not answer')) });
      });
      if (!res || !res.s) throw new Error((res && res.e && res.e.message) || 'the game refused');
      list.forEach((e) => { if (ids.includes(e.id)) e.folder = target; });
      cache.list = list;
      saveCache();
      selected.clear();
      status = 'Moved ' + ids.length + ' to ' + folderName(target) + '.';
      statusBad = false;
    } catch (e) {
      status = 'Not moved: ' + e.message + '.';
      statusBad = true;
    }
    busy = false;
    draw();
  }

  // ---------- the two views ----------
  let started = false;
  function show() {
    const on = view.on !== 'folders';
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.view === 'list') === on));
    box.style.display = on ? '' : 'none';
    game.forEach((el) => { el.style.display = on ? 'none' : ''; });
    if (!on || started) return;
    started = true;
    shell();
    // what was read last time shows at once, while the folders and the backpack are read again
    if (cache.list && cache.folders) { list = cache.list; folders = cache.folders; }
    draw();
    refresh();
  }

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    view.on = b.dataset.view;
    saveView();
    show();
  });
  box.addEventListener('input', (e) => { if (e.target.id === 'fsbInvQ') { view.q = e.target.value; page = 0; saveView(); drawList(); } });
  // to another page; from the bar under the list, back up to the top of it
  const turn = (to, fromBottom) => {
    page = to;
    drawList();
    if (fromBottom) q('[data-pager="top"]').scrollIntoView({ block: 'start' });
  };
  // redraws the list after a change in the move bar, keeping the folder picked there
  const redrawKeepingTarget = () => { const to = q('[data-target]').value; drawList(); q('[data-target]').value = to; };
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'fsbInvQ') e.preventDefault(); });
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.pick) { view[t.dataset.pick] = t.value; page = 0; saveView(); drawList(); }
    else if (t.hasAttribute('data-page')) turn(+t.value, !!t.closest('[data-pager="bottom"]'));
    else if (t.hasAttribute('data-per')) { view.per = +t.value; page = 0; saveView(); drawList(); }
    else if (t.dataset.sw === 'ready') { view.ready = t.checked; page = 0; saveView(); drawList(); }
    else if (t.dataset.sw === 'moving') { moving = t.checked; if (!moving) selected.clear(); drawList(); }
    else if (t.dataset.sel) { if (t.checked) selected.add(t.dataset.sel); else selected.delete(t.dataset.sel); redrawKeepingTarget(); }
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    e.preventDefault();
    const act = b.dataset.act;
    if (act === 'refresh') refresh();
    else if (act === 'dir') { view.down = !view.down; page = 0; saveView(); drawFilters(); drawList(); }
    else if (act === 'folder') { view.folder = b.dataset.id; page = 0; saveView(); drawFolders(); drawList(); }
    else if (act === 'prev' || act === 'next') turn(page + (act === 'next' ? 1 : -1), !!b.closest('[data-pager="bottom"]'));
    else if (act === 'ask') { asking = b.dataset.id; messages.delete(asking); drawList(); }
    else if (act === 'cancel') { asking = ''; drawList(); }
    else if (act === 'invent') invent(b.dataset.id);
    else if (act === 'onpage' || act === 'all' || act === 'none') {
      if (act === 'none') selected.clear();
      else (act === 'all' ? matchIds : shownIds).forEach((id) => selected.add(id));
      redrawKeepingTarget();
    } else if (act === 'move') move(q('[data-target]').value);
  });

  show();
}
