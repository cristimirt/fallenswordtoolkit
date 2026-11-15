import { loadSettings, recall, remember } from '../core/settings.js';
import { esc } from '../core/util.js';
import { FSRoute } from './route.js';

// ---------------------------------------------------------------- path finder (world page)
// A button beside the map buttons opens a draggable panel: type where you want to go (by name, or by level) and it shows the way
// from where you stand now, step by step, following you as you move. The routing is the same code as the Path Finder website
// (generated into the block below by tools/sync-helper.js of that project, edit route.js there, not the copy) and the data is the
// website's route.json, loaded the first time the panel is opened (a different address can be set in localStorage FSB_pathfinderUrl).
const PF_SITE = 'https://cristimirt.github.io/fspathfinder/';

// <<< route.js
export function initPathfinder() {
  if (!/[?&]cmd=world(&|$)/.test(location.search) || !loadSettings().pfEnabled) return;
  const dataUrl = () => recall('pathfinderUrl') || PF_SITE + 'route.json';
  const pf = {
    open: recall('pathfinderOpen') === '1',
    dest: recall('pathfinderDest') || '',
    waysOnly: recall('pathfinderWaysOnly') === '1',
    mode: 'name', // 'name' or 'level'
    router: null, loadError: '', loading: false,
    here: null, hereName: '', tile: null, route: null, planning: false,
  };
  let panel = null;
  let timer = 0;
  let settle = 0;
  let hereKey = null;
  let suggestions = [];
  let active = 0;

  // ---- text of the steps
  const coord = (x, y) => '(' + x + ',' + y + ')';
  const isWalk = (kind) => kind === 'stairs' || kind === 'exit' || kind === 'portal';
  const worldMap = (name) => { const a = pf.router.byName[name]; return a && a.kind === 'master' ? name + ' [' + a.level + ']' : name; };
  const liveWalk = (step, tile) => {
    const e = step.edge;
    if (!isWalk(e.kind) || !tile || e.x == null) return 0;
    return Math.max(Math.abs(tile[0] - e.x), Math.abs(tile[1] - e.y));
  };
  function stepMain(step) {
    const e = step.edge;
    if (e.kind === 'stairs') {
      return { lead: 'Take the stairs' + (e.x == null ? '' : ' at ' + coord(e.x, e.y)) + ' to', main: e.to, sub: e.ax == null ? '' : 'you arrive at ' + coord(e.ax, e.ay) };
    }
    if (e.kind === 'portal') return { lead: 'Take the portal at ' + coord(e.x, e.y) + ' to', main: worldMap(e.to), sub: e.name + ', world map' };
    if (e.kind === 'free') return { main: 'Teleport to ' + e.to, sub: 'from anywhere, costs 25 stamina, you arrive at ' + coord(e.ax, e.ay) };
    if (e.kind === 'exit') return { main: 'Leave to the ' + worldMap(e.to) + ' world map', sub: e.x == null ? '' : 'exit tile ' + coord(e.x, e.y) };
    if (e.kind === 'enter') return { main: 'Enter ' + e.to, sub: 'from the ' + worldMap(step.from) + ' world map' + (e.x == null ? '' : ', you appear at ' + coord(e.x, e.y)) };
    return { main: 'Cross to the ' + worldMap(e.to) + ' world map', sub: 'neighbouring world maps' };
  }
  function stepShort(step) {
    const e = step.edge;
    if (e.kind === 'stairs') return 'Stairs ' + (e.x == null ? '' : coord(e.x, e.y) + ' ') + '→ ' + e.to;
    if (e.kind === 'portal') return 'Portal ' + coord(e.x, e.y) + ' → ' + worldMap(e.to) + ' world map';
    if (e.kind === 'free') return 'Teleport → ' + e.to;
    if (e.kind === 'exit') return 'Leave to ' + worldMap(e.to) + ' world map';
    if (e.kind === 'enter') return 'Enter ' + e.to;
    return 'Cross to ' + worldMap(e.to) + ' world map';
  }

  // ---- where the player is, and the route from there
  function readGame() {
    try {
      const p = window.GameData.player();
      if (!p || !p.location) return null;
      let name = '';
      try { name = window.GameData.realm().name || ''; } catch (e) { /* not known yet */ }
      return { realmId: p.realm_id, masterId: p.master_realm_id, x: p.location.x, y: p.location.y, name };
    } catch (e) { return null; }
  }
  function recompute() {
    pf.route = null;
    const { router, dest, here, tile } = pf;
    if (!router || !dest || !here || !router.byName[dest] || here.name === dest) return;
    pf.route = router.findRoute(here.name, dest, tile, { waysOnly: pf.waysOnly });
  }
  const later = (ms, fn) => { clearTimeout(settle); settle = setTimeout(fn, ms); };
  function tick() {
    const game = readGame();
    if (!game || !pf.router) return;
    const area = pf.router.fromGame(game.realmId, game.masterId) || pf.router.byName[game.name] || null;
    const key = area ? area.name : '?' + game.realmId;
    const tile = [game.x, game.y];
    const moved = !pf.tile || pf.tile[0] !== tile[0] || pf.tile[1] !== tile[1];
    pf.tile = tile;
    if (key !== hereKey) {
      hereKey = key;
      pf.here = area;
      pf.hereName = game.name;
      pf.planning = true;
      renderBody();
      later(0, () => { recompute(); pf.planning = false; renderBody(); }); // the panel is drawn first, then the search runs
    } else if (moved) {
      renderBody(); // the step shown follows you right away
      later(450, () => { recompute(); renderBody(); }); // the way itself is worked out again once you stand still
    }
  }
  const startTicking = () => { if (!timer) { timer = setInterval(tick, 400); tick(); } };
  const stopTicking = () => { clearInterval(timer); clearTimeout(settle); timer = 0; };

  async function loadData() {
    if (pf.router || pf.loading) return;
    pf.loading = true;
    pf.loadError = '';
    renderBody();
    try {
      const res = await fetch(dataUrl());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      pf.router = FSRoute.create(await res.json());
      recompute();
    } catch (e) {
      pf.loadError = 'Could not load the map data (' + e.message + ') from ' + dataUrl();
    }
    pf.loading = false;
    renderBody();
  }

  // ---- the panel
  const ICON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23151a23'/%3E%3Crect x='1.5' y='1.5' width='61' height='61' rx='12.5' fill='none' stroke='%23e0b252' stroke-width='3'/%3E%3Crect x='29' y='10' width='6' height='46' rx='2' fill='%238d5e2b'/%3E%3Cpath d='M12 14h30l7 7-7 7H12z' fill='%23ffd980' stroke='%236b4b00' stroke-width='2.5' stroke-linejoin='round'/%3E%3Cpath d='M52 31H22l-7 7 7 7h30z' fill='%23e0b252' stroke='%236b4b00' stroke-width='2.5' stroke-linejoin='round'/%3E%3C/svg%3E\")";
  const css = document.createElement('style');
  css.textContent =
    ':root{--fsbPfIcon:' + ICON + ';}' +
    '#fsbPf{position:absolute;z-index:9000;width:320px;max-width:calc(100% - 8px);font:13px/1.35 "Open Sans",Helvetica,Arial,sans-serif;color:#361c04;background:#efe0b9;border:2px solid #4f3717;border-radius:5px;box-shadow:0 4px 14px rgba(0,0,0,.55);}' +
    '#fsbPf[hidden]{display:none;}' +
    '#fsbPf .pfHead{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 4px 10px;background:#4f3717;color:#f3e3b8;font-weight:700;cursor:move;touch-action:none;user-select:none;}' +
    '#fsbPf .pfLogo{display:inline-block;width:16px;height:16px;margin-right:6px;vertical-align:-3px;background:center / contain no-repeat var(--fsbPfIcon);}' +
    '#fsbPf .pfX{border:0;background:none;color:#f3e3b8;font-size:20px;line-height:1;cursor:pointer;padding:0 4px;}' +
    '#fsbPf .pfModes{display:flex;gap:4px;padding:6px 8px 0;}' +
    '#fsbPf .pfModes button{flex:1;padding:2px 6px;border:1px solid #4f3717;border-radius:3px;background:#d8c18a;color:#361c04;font:inherit;cursor:pointer;}' +
    '#fsbPf .pfModes button.on{background:#7a5a2c;color:#fbf3dc;}' +
    '#fsbPf .pfOpt{display:flex;align-items:center;gap:6px;padding:2px 10px 0;font-size:11px;color:#5b4020;cursor:pointer;user-select:none;}' +
    '#fsbPf .pfOpt input{position:absolute;opacity:0;pointer-events:none;}' +
    '#fsbPf .pfHelp{text-decoration:underline dotted;text-underline-offset:2px;cursor:help;}' +
    '#fsbPf .pfSwitch{cursor:pointer;position:relative;flex:none;box-sizing:content-box;width:26px;height:14px;border:1px solid #4f3717;border-radius:8px;background:#d8c18a;transition:background .15s;}' +
    '#fsbPf .pfSwitch::after{content:"";position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#4f3717;transition:transform .15s;}' +
    '#fsbPf .pfOpt input:checked + .pfSwitch{background:#7a5a2c;}' +
    '#fsbPf .pfOpt input:checked + .pfSwitch::after{background:#fbf3dc;transform:translateX(12px);}' +
    '#fsbPf .pfOpt input:focus-visible + .pfSwitch{outline:2px solid #6b3d00;outline-offset:1px;}' +
    '#fsbPf .pfSearch{position:relative;display:flex;gap:4px;padding:8px 8px 4px;}' +
    '#fsbPf .pfSearch input{flex:1;min-width:0;padding:4px 6px;border:1px solid #8a6b3a;border-radius:3px;background:#fbf3dc;color:#361c04;font:inherit;}' +
    '#fsbPf .pfSearch > button{padding:0 8px;border:1px solid #4f3717;border-radius:3px;background:#d8c18a;color:#361c04;font:inherit;cursor:pointer;}' +
    '#fsbPf .pfSugg{position:absolute;inset:100% 8px auto;z-index:2;margin:0;padding:0;list-style:none;background:#fbf3dc;border:1px solid #4f3717;border-radius:3px;box-shadow:0 4px 10px rgba(0,0,0,.4);max-height:260px;overflow:auto;}' +
    '#fsbPf .pfSugg li{display:flex;justify-content:space-between;gap:8px;padding:4px 8px;cursor:pointer;}' +
    '#fsbPf .pfSugg li span{color:#7a5a2c;white-space:nowrap;}' +
    '#fsbPf .pfSugg li.on,#fsbPf .pfSugg li:hover{background:#e3cf9c;}' +
    '#fsbPf .pfBody{padding:4px 8px 8px;}' +
    '#fsbPf .pfMsg{padding:8px 2px;color:#5b4020;}' +
    '#fsbPf .pfErr{color:#8a1d12;}' +
    '#fsbPf .pfDest span{color:#7a5a2c;font-size:12px;margin-left:4px;}' +
    '#fsbPf .pfCount{color:#5b4020;font-size:12px;margin:0 0 6px;}' +
    '#fsbPf .pfDone{margin:8px 0 2px;padding:10px;text-align:center;font-size:17px;font-weight:700;background:#cfe3b0;border:1px solid #5a7a2c;border-radius:4px;color:#2f4a10;}' +
    '#fsbPf .pfNext{padding:8px 10px;background:#fbf3dc;border:2px solid #b8721b;border-radius:5px;}' +
    '#fsbPf .pfIn{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#7a5a2c;}' +
    '#fsbPf .pfLead{font-size:12px;color:#4a3216;}' +
    '#fsbPf .pfBig{font-size:20px;font-weight:700;line-height:1.2;margin:2px 0;}' +
    '#fsbPf .pfSub{font-size:13px;color:#4a3216;}' +
    '#fsbPf .pfNote{margin-top:4px;font-size:12px;font-style:italic;color:#8a1d12;}' +
    '#fsbPf .pfAway{margin-top:6px;font-size:13px;font-weight:700;color:#8a4d00;}' +
    '#fsbPf .pfAway.pfHere{color:#2f6a10;}' +
    '#fsbPf .pfRest{margin:8px 0 0;padding-left:22px;max-height:230px;overflow:auto;font-size:11.5px;color:#4a3216;}' +
    '#fsbPf .pfSugg::-webkit-scrollbar{width:9px;height:9px;}' +
    '#fsbPf .pfSugg::-webkit-scrollbar-track{background:#d9b774;border-radius:4px;box-shadow:inset 0 0 2px #20170399;}' +
    '#fsbPf .pfSugg::-webkit-scrollbar-thumb{background:#8a6a38;border:1px solid #20170396;border-radius:4px;}' +
    '#fsbPf .pfSugg::-webkit-scrollbar-thumb:hover{background:#6b5230;}' +
    '#fsbPf .pfRest::-webkit-scrollbar{width:9px;height:9px;}' +
    '#fsbPf .pfRest::-webkit-scrollbar-track{background:#d9b774;border-radius:4px;box-shadow:inset 0 0 2px #20170399;}' +
    '#fsbPf .pfRest::-webkit-scrollbar-thumb{background:#8a6a38;border:1px solid #20170396;border-radius:4px;}' +
    '#fsbPf .pfRest::-webkit-scrollbar-thumb:hover{background:#6b5230;}' +
    '#fsbPf .pfRest li{padding:2px 0;border-top:1px dotted #c9b27c;}' +
    '#fsbPf .pfRest li:first-child{border-top:0;}' +
    '#fsbPf .pfFrom{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#8a6b3a;}' +
    '#fsbPf .pfFoot{padding:4px 8px 6px;border-top:1px solid #c9b27f;text-align:center;font-size:11px;}' +
    '#fsbPf .pfFoot a{color:#6b3d00;}' +
    '#fsbPfBtn{width:17px;height:17px;padding:0;margin:0 0 0 3px;box-sizing:border-box;border:1px solid #4f3717;border-radius:3px;background:center / 16px no-repeat var(--fsbPfIcon),#e9d6a8;cursor:pointer;}' +
    '#fsbPfBtn:hover{filter:brightness(1.12);}#fsbPfBtn.fsbBeside{margin-left:8px;vertical-align:middle;}' +
    '#fsbPf .pfRest,#fsbPf .pfSugg{scrollbar-width:thin;scrollbar-color:#a98a52 #e3cf9c;}';
  document.head.appendChild(css);

  const container = () => (document.getElementById('actionContainer') || {}).offsetParent || document.body;
  let pos = null; // { left, top } relative to the container
  try { pos = JSON.parse(recall('pathfinderPos')); } catch (e) { pos = null; }
  if (!pos || typeof pos.left !== 'number') pos = null;

  function bounds() {
    const c = container();
    const r = c.getBoundingClientRect();
    const x = r.left + window.scrollX - c.scrollLeft;
    const y = r.top + window.scrollY - c.scrollTop;
    const doc = document.documentElement;
    return { minLeft: -x, maxLeft: doc.scrollWidth - x, minTop: -y, maxTop: doc.scrollHeight - y };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  function place() { // the panel may go anywhere on the page, like the Action List
    if (!panel) return;
    const c = container();
    if (panel.parentNode !== c) c.appendChild(panel);
    if (!pos) pos = { left: c.clientWidth - 344, top: 150 };
    const b = bounds();
    pos = { left: clamp(pos.left, b.minLeft, b.maxLeft - (panel.offsetWidth || 320)), top: clamp(pos.top, b.minTop, b.maxTop - 60) };
    panel.style.left = pos.left + 'px';
    panel.style.top = pos.top + 'px';
  }

  function build() {
    panel = document.createElement('div');
    panel.id = 'fsbPf';
    panel.hidden = !pf.open;
    panel.innerHTML =
      '<div class="pfHead"><span><i class="pfLogo"></i>Path Finder</span><button type="button" class="pfX" title="Close">&times;</button></div>' +
      '<div class="pfModes" role="group" aria-label="Search by"><button type="button" data-mode="name">Name</button><button type="button" data-mode="level">Level</button></div>' +
      '<div class="pfSearch"><input type="text" autocomplete="off" spellcheck="false"><button type="button" class="pfClear" title="Clear the destination">Clear</button><ul class="pfSugg" role="listbox" hidden></ul></div>' +
      '<label class="pfOpt"><input type="checkbox" role="switch"><span class="pfSwitch"></span>Only the Cathedral of Ways portal ' +
      '<span class="pfHelp tip-static" data-tipped="All the other portals, except the one in the Cathedral of Ways, are ignored when working out the way.">[?]</span></label>' +
      '<div class="pfBody"></div>' +
      '<div class="pfFoot"><a href="' + PF_SITE + '" target="_blank" rel="noopener">Fallen Sword Path Finder website ↗</a></div>';
    container().appendChild(panel);
    const input = panel.querySelector('.pfSearch input');
    const sugg = panel.querySelector('.pfSugg');
    const ways = panel.querySelector('.pfOpt input');
    ways.checked = pf.waysOnly;
    input.value = pf.dest;
    const setMode = (m) => {
      pf.mode = m;
      panel.querySelectorAll('.pfModes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
      input.placeholder = m === 'level' ? 'Level, e.g. 120 or 100-120' : 'Where to? e.g. Ramdal Caves';
      input.inputMode = m === 'level' ? 'numeric' : 'text';
    };
    setMode('name');
    panel.querySelectorAll('.pfModes button').forEach((b) => b.addEventListener('click', () => {
      if (pf.mode === b.dataset.mode) return;
      setMode(b.dataset.mode);
      input.value = '';
      suggestions = [];
      paintSugg();
    }));

    // "120" is one level, "100-120" (or "100 120") a range
    const byLevel = (text) => {
      const nums = text.match(/\d+/g);
      if (!nums) return [];
      const lo = Math.min(+nums[0], +nums[nums.length - 1]);
      const hi = Math.max(+nums[0], +nums[nums.length - 1]);
      return pf.router.realms.filter((a) => a.level >= lo && a.level <= hi).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    };
    const suggest = () => {
      if (!pf.router || !input.value.trim()) suggestions = [];
      else if (pf.mode === 'level') suggestions = byLevel(input.value);
      else suggestions = pf.router.search(input.value, 8);
      active = 0;
      paintSugg();
    };
    function paintSugg() {
      sugg.hidden = !suggestions.length;
      sugg.innerHTML = suggestions.map((a, i) =>
        '<li role="option" data-i="' + i + '"' + (i === active ? ' class="on"' : '') + '>' + esc(a.name) + '<span>' + (a.kind === 'master' ? 'World map' : 'Lv ' + a.level) + '</span></li>').join('');
    }
    const pick = (name) => {
      input.value = name;
      suggestions = [];
      paintSugg();
      setDest(name);
    };
    sugg.addEventListener('mousedown', (e) => { // mousedown, so it happens before the input loses focus
      const li = e.target.closest('li[data-i]');
      if (!li) return;
      e.preventDefault();
      pick(suggestions[+li.dataset.i].name);
    });
    input.addEventListener('input', suggest);
    input.addEventListener('focus', suggest);
    input.addEventListener('blur', () => setTimeout(() => { suggestions = []; paintSugg(); }, 150));
    // typing here must not walk the character: the game listens to the keyboard on the whole page
    ['keydown', 'keyup', 'keypress'].forEach((t) => input.addEventListener(t, (e) => e.stopPropagation()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!suggestions.length) return;
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length;
        paintSugg();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (suggestions.length) pick(suggestions[active].name);
        else if (pf.mode === 'name' && pf.router && pf.router.byName[input.value.trim()]) pick(input.value.trim());
      } else if (e.key === 'Escape') {
        suggestions = [];
        paintSugg();
      }
    });
    panel.querySelector('.pfClear').addEventListener('click', () => { input.value = ''; suggestions = []; paintSugg(); setDest(''); });
    ways.addEventListener('change', () => {
      pf.waysOnly = ways.checked;
      remember('pathfinderWaysOnly', pf.waysOnly ? '1' : '0');
      recompute();
      renderBody();
    });
    // a click on the [?] must not flip the switch
    panel.querySelector('.pfHelp').addEventListener('click', (e) => e.preventDefault());
    panel.querySelector('.pfX').addEventListener('click', closePanel);
    panel.querySelector('.pfBody').addEventListener('click', (e) => {
      if (e.target.closest('a[href="#retry"]')) { e.preventDefault(); loadData(); }
    });

    // dragging by the header; the place is kept relative to the page content
    let drag = null;
    const head = panel.querySelector('.pfHead');
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      head.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const o = container().getBoundingClientRect();
      pos = { left: e.clientX - drag.dx - o.left + container().scrollLeft, top: e.clientY - drag.dy - o.top + container().scrollTop };
      place();
    });
    const endDrag = () => { if (!drag) return; drag = null; remember('pathfinderPos', JSON.stringify(pos)); };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', place);
    place();
    renderBody();
  }

  function setDest(name) {
    pf.dest = name || '';
    remember('pathfinderDest', pf.dest);
    recompute();
    renderBody();
  }

  function renderBody() {
    if (!panel) return;
    const body = panel.querySelector('.pfBody');
    const to = pf.router && pf.router.byName[pf.dest];
    let h = '';
    if (!pf.dest) {
      h = '<div class="pfMsg">' + (pf.mode === 'level' ? 'Type a level above, then pick one of its realms.' : 'Type an area name above to see the way there.') + '</div>';
    } else if (pf.loadError) {
      h = '<div class="pfMsg pfErr">' + esc(pf.loadError) + '<br><a href="#retry">Try again</a></div>';
    } else if (!pf.router) {
      h = '<div class="pfMsg">Loading the map data…</div>';
    } else if (!to) {
      h = '<div class="pfMsg pfErr">“' + esc(pf.dest) + '” is not in the map data.</div>';
    } else {
      h = '<div class="pfDest">Going to <b>' + esc(to.name) + '</b> <span>Lv ' + to.level + '</span></div>';
      const first = pf.route && pf.route[0];
      if (!pf.here) {
        h += '<div class="pfMsg">Your current area is not in the map data' + (pf.hereName ? ' (' + esc(pf.hereName) + ')' : '') + '.</div>';
      } else if (pf.here.name === to.name) {
        h += '<div class="pfDone">You have arrived.</div>';
      } else if (pf.planning) {
        h += '<div class="pfMsg">Working out the way…</div>';
      } else if (!first) {
        h += '<div class="pfMsg pfErr">No known way from <b>' + esc(pf.here.name) + '</b> in this data.</div>';
      } else {
        const walk = liveWalk(first, pf.tile);
        const moves = Math.max(0, Math.round(pf.route.total - first.walk + walk));
        const m = stepMain(first);
        h += '<div class="pfCount"><b>' + pf.route.length + '</b> step' + (pf.route.length === 1 ? '' : 's') + ' · about <b>' + moves + '</b> moves</div>' +
          '<div class="pfNext"><div class="pfIn">Next, in ' + esc(first.from) + '</div>' +
          (m.lead ? '<div class="pfLead">' + esc(m.lead) + '</div>' : '') +
          '<div class="pfBig">' + esc(m.main) + '</div>' +
          (m.sub ? '<div class="pfSub">' + esc(m.sub) + '</div>' : '') +
          (first.edge.note ? '<div class="pfNote">' + esc(first.edge.note) + '</div>' : '') +
          (isWalk(first.edge.kind)
            ? (walk === 0 ? '<div class="pfAway pfHere">You are on the tile</div>' : '<div class="pfAway">' + walk + ' move' + (walk === 1 ? '' : 's') + ' away</div>')
            : '') +
          '</div>';
        if (pf.route.length > 1) {
          h += '<ol class="pfRest" start="2">' + pf.route.slice(1).map((s) => '<li><span class="pfFrom">' + esc(s.from) + '</span>' + esc(stepShort(s)) + '</li>').join('') + '</ol>';
        }
      }
    }
    body.innerHTML = h;
  }

  async function openPanel() {
    pf.open = true;
    remember('pathfinderOpen', '1');
    if (!panel) build();
    panel.hidden = false;
    place();
    if (!pf.router) await loadData();
    if (pf.open && pf.router) startTicking();
  }
  function closePanel() {
    pf.open = false;
    remember('pathfinderOpen', '0');
    if (panel) panel.hidden = true;
    stopTicking();
  }

  // ---- the button: in the helper's own button row beside the map, or next to the area name; the wiki button stays last
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'fsbPfBtn';
  btn.className = 'tip-static';
  btn.setAttribute('data-tipped', 'Find the way to an area');
  btn.addEventListener('click', () => { if (pf.open) closePanel(); else openPanel(); });
  function placeButton() {
    const box = document.getElementById('fshWorldButtonContainer');
    const title = document.getElementById('worldName');
    const host = box || title;
    if (!host) return;
    btn.classList.toggle('fsbBeside', !box);
    const wiki = document.getElementById('fsbWikiBtn');
    const after = wiki && wiki.parentNode === host ? wiki : null; // before the wiki button when it is there
    if (btn.parentNode !== host || btn.nextElementSibling !== after) host.insertBefore(btn, after);
  }
  let tries = 0;
  const wait = setInterval(() => {
    tries++;
    if (document.getElementById('worldName')) {
      clearInterval(wait);
      placeButton();
      const mo = new MutationObserver(placeButton);
      const wc = document.getElementById('worldContainer');
      if (wc) mo.observe(wc, { childList: true });
      mo.observe(document.getElementById('worldName'), { childList: true });
      const box = document.getElementById('fshWorldButtonContainer');
      if (box) mo.observe(box, { childList: true });
      if (pf.open) openPanel();
    } else if (tries > 40) {
      clearInterval(wait); // not the world page
    }
  }, 300);
}
