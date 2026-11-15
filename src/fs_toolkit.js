// ==UserScript==
// @name         Fallen Sword Toolkit
// @namespace    fs.backpacksearch
// @version      2.0.1
// @description  Backpack search, filters, item locks and automatic break down; a break down button for hunting loot; searchable Buff Market and Auction House filters; a Quick Buff pop-up; draggable sidebar widgets; a wiki button and a Path Finder on the world map
// @author       Aurik16
// @include      https://www.fallensword.com/*
// @include      https://fallensword.com/*
// @exclude      https://forum.fallensword.com/*
// @exclude      https://wiki.fallensword.com/*
// @exclude      https://www.fallensword.com/app.php*
// @exclude      https://www.fallensword.com/fetchdata.php*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // www.fallensword.com and fallensword.com keep separate browser storage (settings, locks, logs): stay on the one without www
  if (location.hostname === 'www.fallensword.com') { location.replace(location.href.replace('//www.', '//')); return; }

  const $ = window.jQuery;
  if (!$) return;

  const DEBOUNCE_MS = 100;

  const getInstance = () => $('#backpackContainer').data('hcs-backpack');

  // ---------------------------------------------------------------- shared helpers
  const esc = (str) => $('<div>').text(str == null ? '' : String(str)).html();

  // The game shows messages by re-configuring the shared #dialog_msg dialog. The settings
  // window is wider, so the original width is remembered and restored for every other use.
  let dialogWidth = null;
  function openDialog(opts, html) {
    const $d = $('#dialog_msg');
    if (dialogWidth === null) dialogWidth = $d.dialog('option', 'width');
    $d.dialog($.extend({ width: dialogWidth }, opts));
    $d.html(html).dialog('open');
  }
  function showInfo(html, title) {
    const $d = $('#dialog_msg');
    if (!$d.length || typeof $d.dialog !== 'function') {
      window.alert($('<div>').html(html).text());
      return;
    }
    openDialog({ title: title || 'Information', buttons: [{ text: 'Ok', click: function () { $(this).dialog('close'); } }] }, html);
  }

  // ---------------------------------------------------------------- settings
  // Stored in localStorage under the FSB_ prefix (Fallen Sword Backpack).
  const FSB = 'FSB_';
  const SETTINGS_KEY = FSB + 'settings';
  // [key, label, group]: group q = quality row, p = property buttons, d = dropdowns.
  const FILTERS = [
    ['rarity', 'Quality', 'q'],
    ['eq', 'Equippable', 'p'],
    ['use', 'Usable', 'p'],
    ['box', 'Container', 'p'],
    ['dup', 'Duplicates', 'p'],
    ['tg', 'Guild Tagged', 'p'],
    ['bound', 'Bound', 'p'],
    ['set', 'Set', 'p'],
    ['hf', 'Hellforge Level', 'd'],
    ['craft', 'Craft Level', 'd'],
  ];
  const PER_PAGE_CHOICES = [10, 20, 30, 40, 50, 100];
  const SIZE_CHOICES = [50, 75, 100]; // item icon size, percent
  const DEFAULT_SETTINGS = { typeStyle: 'new', always: ['tg'], perPage: 20, size: 100, empty: true, modernPager: true, lockUse: true, lockExtract: true, quickBuffPopup: true, quickBuffInfo: true, autoBreak: false, autoBreakDry: false, autoBreakRar: [0, 1], autoBreakMin: null, autoBreakMax: null };
  const lvlOrNull = (v) => { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? null : n; };
  function loadSettings() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { /* ignore */ }
    const keys = FILTERS.map((f) => f[0]);
    return {
      typeStyle: o.typeStyle === 'old' ? 'old' : 'new',
      always: Array.isArray(o.always) ? o.always.filter((k) => keys.indexOf(k) !== -1) : DEFAULT_SETTINGS.always.slice(),
      perPage: PER_PAGE_CHOICES.indexOf(o.perPage) !== -1 ? o.perPage : DEFAULT_SETTINGS.perPage,
      size: SIZE_CHOICES.indexOf(o.size) !== -1 ? o.size : DEFAULT_SETTINGS.size,
      empty: o.empty !== false,
      // was two settings: topPager (the copy above the items) and, new in 1.10, the rounded links
      modernPager: o.modernPager !== undefined ? o.modernPager !== false : o.topPager !== false,
      lockUse: o.lockUse !== false,
      lockExtract: o.lockExtract !== false,
      quickBuffPopup: o.quickBuffPopup !== false,
      quickBuffInfo: o.quickBuffInfo !== false,
      autoBreak: o.autoBreak === true,
      autoBreakDry: o.autoBreakDry === true,
      autoBreakRar: Array.isArray(o.autoBreakRar) ? o.autoBreakRar.filter((r) => r === 0 || r === 1 || r === 2) : DEFAULT_SETTINGS.autoBreakRar.slice(),
      autoBreakMin: lvlOrNull(o.autoBreakMin),
      autoBreakMax: lvlOrNull(o.autoBreakMax),
    };
  }
  function saveSettings(v) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
  }
  let SET = loadSettings();

  // Last state of Match Any, Advanced filters, Sort by and Sort order: written whenever
  // they change, read back when the page loads.
  const remember = (k, v) => { try { localStorage.setItem(FSB + k, v); } catch (e) { /* storage unavailable */ } };
  const recall = (k) => { try { return localStorage.getItem(FSB + k); } catch (e) { return null; } };

  // The stat bar shows "current / max" backpack slots (<dt id="statbar-inventory">34 / 38</dt>).
  // Lower the current number after items are removed, same as the game does for a discard.
  function adjustInventoryCount(removed) {
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
  function withFst(u) {
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
  const requestFrag = (ids) => requestItems('dofragitems', 'fragIndex[]', ids);


  // ---------------------------------------------------------------- search helpers
  const norm = (s) => (s == null ? '' : String(s)).toLowerCase();

  // The game's own search box (#backpack_filterName); we only change how it matches: every
  // word has to appear in the name, in any order.
  function getWords() {
    return norm($('#backpack_filterName').val()).split(/\s+/).filter(Boolean);
  }

  const RARITIES = [
    ['Common', '#FFFFFF'],
    ['Rare', '#00CCCC'],
    ['Unique', '#CC00CC'],
    ['Legendary', '#FFCC00'],
    ['Super Elite', '#FF0000'],
    ['Crystalline', '#9955DD'],
    ['Epic', '#00CC00'],
  ];

  // The game's colour for each craft quality, Perfect -> Very Poor (from the wiki).
  const CRAFT_COLORS = ['#FFFF00', '#FFBB00', '#FF8800', '#FF4400', '#FF0000', '#CC0000', '#990000'];
  const UNCRAFTED_COLOR = '#888888';

  // item.cf = how many steps below Perfect an item's craft is (absent = not craftable).
  // An item that was never crafted also has cf = 6, so "crafted" is told apart by
  // the presence of the craft attribute list (item.ca).
  const CRAFT_NAMES = ['Perfect', 'Excellent', 'Very Good', 'Good', 'Average', 'Poor', 'Very Poor'];

  // The corner triangle the game draws on equipped items (.item-rarity-wrapper::after, colour from --craft-color), here with
  // the same colours as the Craft filter.
  function paintCraftTriangles(bp) {
    const byInv = {};
    (bp.srcData || []).forEach((it) => { byInv[it.a] = it; });
    $('#backpackContainer .backpackItem').each(function () {
      const it = byInv[this.getAttribute('data-inv')];
      const wrap = this.parentNode;
      if (!it || !wrap || !wrap.classList.contains('item-rarity-wrapper')) return;
      if (isCrafted(it) && CRAFT_COLORS[it.cf]) wrap.style.setProperty('--craft-color', CRAFT_COLORS[it.cf]);
      else if (it.cf !== undefined) wrap.style.setProperty('--craft-color', UNCRAFTED_COLOR); // craftable, never crafted
      else wrap.style.removeProperty('--craft-color'); // cannot be crafted: no triangle
    });
  }
  const isCrafted = (it) => it.cf !== undefined && Array.isArray(it.ca) && it.ca.length > 0;

  // Item types picked in the icon row at the top (empty = "All"). One at a time, like the
  // original tabs, unless "Match any" is on. Combines with every other filter.
  const typeSet = new Set();
  // "Match any" toggle: several buttons per group can be on, an item needs to match one of them.
  const orMode = () => $('#bpOrMode').hasClass('bpModeOn');

  // "All folders" acts as a pseudo-folder at the end of the folder icons. A hidden checkbox
  // (#bpSearchAll) keeps its state, so the filter code only has to read that.
  const FOLDER_ON = 'https://cdn2.fallensword.com/ui/misc/folder_on.png';
  const FOLDER_OFF = 'https://cdn2.fallensword.com/ui/misc/folder.png';
  function ensureAllFolders() {
    const $f = $('#backpackFolders');
    if (!$f.length || $('#bpAllFolders').length) return;
    $f.append(
      '<div class="backpackFolder" id="bpAllFolders" title="Show the items of every folder">' +
      '<img class="bpAllFoldersImg" src="' + FOLDER_OFF + '" alt="All folders" style="cursor:pointer;">' +
      '<br>All folders<input type="checkbox" id="bpSearchAll" style="display:none"></div>'
    );
    syncFolders();
  }
  // While "All folders" is on, the real folder icons look unselected.
  function syncFolders() {
    const on = $('#bpSearchAll').prop('checked');
    $('#bpAllFolders img').attr('src', on ? FOLDER_ON : FOLDER_OFF);
    if (on) {
      $('#backpackFolders .backpackFolderImage').attr('src', FOLDER_OFF);
    } else {
      const bp = getInstance($('#backpackContainer')[0]);
      if (bp) $('#backpack-folder-' + bp.folderId).attr('src', FOLDER_ON);
    }
  }

  // "Advanced filters" toggle: the filters the user put in the advanced group are hidden
  // until it is on. Hidden filters that are still active keep working and are counted
  // on the button. With nothing in the advanced group the button is not shown at all.
  function advOpen() {
    return $('#bpFilters').hasClass('bpAdvOn');
  }
  function unitActive($u) {
    if ($u.hasClass('bpDd')) return ddVal($u.attr('data-f')) !== '';
    return $u.hasClass('bp-on') || $u.find('.bp-on').length > 0;
  }
  function updateAdvButton() {
    const $b = $('#bpAdvBtn');
    if (!$b.length) return;
    const $units = $('#bpAdvBox .bpUnit');
    $b.toggle($units.length > 0);
    const n = $units.filter(function () { return unitActive($(this)); }).length;
    const on = advOpen();
    $b.val('Advanced' + (n && !on ? ' (' + n + ')' : '') + (on ? ' ▴' : ' ▾')).toggleClass('bpModeOn', on || n > 0);
  }
  function setAdv(on) {
    $('#bpFilters').toggleClass('bpAdvOn', on);
    remember('advOpen', on ? '1' : '0');
    updateAdvButton();
  }
  // Moves every filter into the always-visible or the advanced area, as set in the settings.
  function applyLayout() {
    const always = new Set(SET.always);
    FILTERS.forEach(([key, , g]) => {
      $('#bpFilters .bpUnit[data-f="' + key + '"]').appendTo(
        $((always.has(key) ? '#bpAlways' : '#bpAdvBox') + ' .bpRow[data-g="' + g + '"]')
      );
    });
    updateAdvButton();
  }
  // Item size (CSS zoom on the item grid) and the number of items per page.
  function applyDisplay(bp) {
    $('body').removeClass('bpSize50 bpSize75').toggleClass('bpTypesNew', SET.typeStyle === 'new').toggleClass('bpNoEmpty', !SET.empty).toggleClass('bpModernPager', SET.modernPager);
    if (SET.size !== 100) $('body').addClass('bpSize' + SET.size);
    if (bp) bp.options.perPage = SET.perPage;
  }
  // Gear icon in the backpack header, opens the settings window.
  function ensureGear() {
    if ($('#bpSettingsBtn').length && $('#bpRefreshBtn').length) return;
    const $h = $('#backpack_current').closest('.innerColumnHeader');
    if (!$h.length) return;
    // Goes into the "[ Folders | Manage | X ]" list, right before the X.
    const $x = $h.find('.float_right a[href*="togglesection"]').last();
    const $gear = $('#bpSettingsBtn').length ? $() : $('<a href="#" id="bpSettingsBtn" title="Toolkit settings"></a>');
    const $refresh = $('<a href="#" id="bpRefreshBtn" title="Refresh bag"></a>');
    if ($x.length) $x.before($refresh, '&nbsp;|&nbsp;', $gear, $gear.length ? '&nbsp;|&nbsp;' : '');
    else $h.children('strong').first().after($refresh, $gear);
  }

  // Dropdown filters (Hellforge, Craft) keep their current value on the element.
  const ddVal = (key) => $('#bpDd_' + key).attr('data-value') || '';

  function setDd(key, value) {
    const $dd = $('#bpDd_' + key);
    const $li = $dd.find('li').filter(function () { return $(this).attr('data-value') === value; }).first();
    if (!$li.length) return;
    $dd.attr('data-value', value);
    $dd.find('.bpDdCur').html($li.html());
    $dd.find('li').removeClass('bp-cur');
    $li.addClass('bp-cur');
  }

  // Is any filter (level, search, buttons, dropdowns, type icons) narrowing the grid?
  function filtersActive() {
    return (
      $('#bpLevelMin').val() !== '' ||
      $('#bpLevelMax').val() !== '' ||
      $('#backpack_filterSet').prop('checked') ||
      getWords().length > 0 ||
      extraActive(getExtra())
    );
  }

  // Current state of the filter buttons and dropdowns.
  function getExtra() {
    const rarities = new Set();
    $('.bpRarity.bp-on').each(function () { rarities.add(parseInt($(this).data('r'), 10)); });
    const props = new Set(); // Equippable, Usable, Container, Duplicates, Guild Tagged, Bound, Set
    $('.bpProp.bp-on').each(function () { props.add($(this).attr('data-p')); });
    return {
      rarities,
      types: typeSet,
      props,
      hf: ddVal('hf'), // '', 'none', '1'..'5'
      craft: ddVal('craft'), // '', 'na', 'un', '0'..'6'
    };
  }

  const extraActive = (x) =>
    x.types.size > 0 || x.rarities.size > 0 || x.props.size > 0 || x.hf !== '' || x.craft !== '';

  // Shows how many items each type icon would show under the current filters (and
  // dims the icons with none). The type filter itself is not applied to the counts.
  function updateTypeCounts(counts, total) {
    $('#backpack_tabs a.backpackTabLink').each(function () {
      const $a = $(this);
      const t = parseInt($a.attr('data-type'), 10);
      const n = t === -1 ? total : counts[t] || 0;
      const $li = $a.closest('li');
      let $badge = $li.children('.bpCount');
      if (!$badge.length) $badge = $('<span class="bpCount"></span>').appendTo($li);
      $badge.text(n > 0 ? n : '');
      $li.toggleClass('bp-empty', n === 0);
    });
  }

  // The simple property buttons. "dup" is handled separately: it needs the other matches.
  const PROP_TESTS = {
    eq: (it) => !!it.eq,
    use: (it) => !!(it.u && !it.c),
    box: (it) => !!it.c,
    tg: (it) => !!it.tg,
    bound: (it) => !!it.bn,
    set: (it) => !!it.s,
  };

  // Items that share the same base item (composed potions also share a design hash).
  const dupKey = (it) => (it.t === 15 && it.x ? 'c' + it.x.h : 'i' + it.b);

  // ---------------------------------------------------------------- patching
  // The sort order: [key, label, the game's number for it]. Direction false = low to high / A to Z.
  const SORT_KEYS = [
    ['order', 'Backpack order', 0],
    ['level', 'Level', 1],
    ['name', 'Name', 3],
    ['rarity', 'Rarity', 4],
    ['dur', 'Durability', 5],
  ];
  let sortKey = 'order';
  let sortDesc = false;
  function syncSortUI() {
    setDd('sort', sortKey);
    $('#bpSortDir')
      .val(sortDesc ? '\u25be' : '\u25b4')
      .attr('title', sortDesc ? 'Descending (click for ascending)' : 'Ascending (click for descending)');
  }
  function init(bp) {
    if (bp.__searchPatched) return;
    bp.__searchPatched = true;
    window.__fsBackpack = bp; // handy for debugging in the console

    injectUI();

    // A page reload after equip/use comes back with backpack_type=<n>: keep it as a filter.
    const startType = parseInt(bp.type, 10);
    if (!isNaN(startType) && startType !== -1) typeSet.add(startType);
    bp.type = -1;

    // The game keeps one div per item type (spinner until first clicked). We
    // render everything into the "All" grid, so the others are not needed.
    $('.backpackTab').not('#backpackTab_-1').remove();

    // 1) Replacement for _applyFilter: same rules as the original (level range from our panel rows, folder) + multi-word name search + our extra filters
    //    + optional "all folders".
    bp._applyFilter = function () {
      updateAdvButton();
      let min = $('#bpLevelMin').val();
      let max = $('#bpLevelMax').val();
      min = min === '' ? -1 : parseInt(min, 10);
      max = max === '' ? -1 : parseInt(max, 10);
      if (isNaN(min)) min = -1;
      if (isNaN(max)) max = -1;
      const setOnly = $('#backpack_filterSet').prop('checked');

      const words = getWords();
      const searching = words.length > 0;
      const x = getExtra();
      // "All folders" only matters while a search or an extra filter is active;
      // otherwise the checkbox would just dump every item into the grid.
      const allFolders = $('#bpSearchAll').prop('checked');
      const useFolders = this.options.foldersEnabled && !allFolders;

      const matched = [];
      for (const it of this.srcData || []) {
        if (min !== -1 && it.l < min) continue;
        if (max !== -1 && it.l > max) continue;
        if (setOnly && !it.s) continue;

        if (x.rarities.size && !x.rarities.has(it.r === undefined ? 0 : it.r)) continue;
        if (x.hf === 'none' && it.hf > 0) continue;
        if (x.hf !== '' && x.hf !== 'none' && (it.hf || 0) !== parseInt(x.hf, 10)) continue;
        if (x.craft === 'na' && it.cf !== undefined) continue;
        if (x.craft === 'un' && !(it.cf !== undefined && !isCrafted(it))) continue;
        if (x.craft !== '' && x.craft !== 'na' && x.craft !== 'un' &&
            !(isCrafted(it) && it.cf === parseInt(x.craft, 10))) continue;

        if (useFolders) {
          if (this.folderId == -1 && it.f > 0) continue;
          if (this.folderId > 0 && it.f != this.folderId) continue;
        }

        if (searching) {
          const name = norm(it.n);
          if (!words.every((w) => name.includes(w))) continue;
        }

        matched.push(it);
      }

      // Property buttons: an item is kept if it matches ANY selected button. (With
      // "Match any" off only one button can be selected, so this is just that one.)
      // Duplicates = items you have 2+ of among everything that passed the other filters.
      let result = matched;
      if (x.props.size) {
        let counts = null;
        if (x.props.has('dup')) {
          counts = new Map();
          for (const it of matched) counts.set(dupKey(it), (counts.get(dupKey(it)) || 0) + 1);
        }
        result = matched.filter((it) => {
          for (const k of x.props) {
            if (k === 'dup' ? counts.get(dupKey(it)) > 1 : PROP_TESTS[k](it)) return true;
          }
          return false;
        });
      }

      // Per-type counts for the icon row: every filter applied except the type itself.
      const counts = {};
      for (const it of result) counts[it.t] = (counts[it.t] || 0) + 1;
      updateTypeCounts(counts, result.length);
      if (x.types.size) result = result.filter((it) => x.types.has(it.t));

      // Everything is rendered into the single "All" grid (type -1); the type
      // icons are just another filter, so no per-type tab data is needed. The order is the
      // game's own (its Sort select sorts bp.srcData).
      const tabData = [];
      if (result.length) tabData[-1] = result;

      this.tabData = tabData;
      this.type = -1;
      this._showPage(-1, this.page);
    };

    // The selection bar (#backpack-multi-options) is the game's: a searchable folder select, "Move" instead of "Go", and the
    // buttons on two rows (a line break after Move). It is only touched, never rebuilt, so this can run again and again.
    function ensureMultiBar() {
      const $bar = $('#backpack-multi-options');
      if (!$bar.length) return;
      const sel = document.getElementById('target-folder');
      if (sel) searchSelect(sel, 'Search folder...', 'No folder matches');
      $('#backpack-move-selected-button').val('Move');
      if (!$bar.children('.bpBr').length) $('<span class="bpBr"></span>').insertAfter('#backpack-move-selected-button');
    }
    ensureMultiBar();
    // the game builds the bar the first time something is selected (and again after the bag reloads)
    const origMulti = bp._updateMultiOptions.bind(bp);
    bp._updateMultiOptions = function () {
      const r = origMulti.apply(this, arguments);
      ensureMultiBar();
      return r;
    };

    // 2) Wrap _showPage: after the game renders the grid, bring our extras up to date
    //    (type icons, folder icon, header icons, the copy of the page links).
    const origShowPage = bp._showPage.bind(bp);
    bp._showPage = function (type, page) {
      type = -1; // only the "All" grid is ever rendered
      origShowPage(type, page);
      paintCraftTriangles(bp);
      if (bp.bpPaintLocks) bp.bpPaintLocks();
      if (bp.bpPruneLocks) bp.bpPruneLocks();
      ensureMultiBar();
      syncTypeIcons();
      ensureAllFolders();
      ensureGear();
      syncFolders();
      syncTopPager();

      const $tab = $('#backpackTab_' + type);
      if (!$tab.find('.backpackItemList').length) {
        $tab.html(filtersActive() ? '[ No items match your filters ]' : '[ No items in this folder ]');
      }
    };

    // Sort: our own select + direction button (the game's are hidden). Every order has its own comparator here, so each one
    // runs both ways. The game's _sortData is called when the bag loads, so it is replaced; bp.ordering still holds the game's
    // number for the key. Items without durability always go last.
    const nameCmp = (x, y) => {
      const p = (x.n || '').toLowerCase(), q = (y.n || '').toLowerCase();
      return p < q ? -1 : p > q ? 1 : 0;
    };
    const SORT_CMP = {
      order: (x, y) => x.o - y.o,
      level: (x, y) => x.l - y.l || nameCmp(x, y),
      name: (x, y) => nameCmp(x, y) || x.l - y.l,
      rarity: (x, y) => (x.r || 0) - (y.r || 0) || nameCmp(x, y),
    };
    bp._sortData = function () {
      const dir = sortDesc ? -1 : 1;
      this.ordering = SORT_KEYS.filter((k) => k[0] === sortKey)[0][2];
      if (sortKey === 'dur') {
        this.srcData.sort((x, y) => {
          const xn = x.cd === undefined || x.cd === null, yn = y.cd === undefined || y.cd === null;
          if (xn || yn) return xn && yn ? x.o - y.o : xn ? 1 : -1;
          return dir * (x.cd - y.cd) || x.o - y.o;
        });
        return;
      }
      const cmp = SORT_CMP[sortKey];
      this.srcData.sort((x, y) => dir * cmp(x, y) || x.o - y.o);
    };
    // the game does not remember the order between visits; do it here
    let savedKey = recall('sortKey');
    if (!savedKey) { // before 1.14: the game's number
      const old = SORT_KEYS.filter((k) => String(k[2]) === recall('sortOrder'))[0];
      if (old) { savedKey = old[0]; if (recall('sortOrder') === '2') { sortDesc = true; } }
    }
    if (SORT_KEYS.some((k) => k[0] === savedKey)) {
      sortKey = savedKey;
      if (recall('sortDesc') !== null) sortDesc = recall('sortDesc') === '1';
    }
    syncSortUI();
    if (bp.srcData && bp.srcData.length) bp._sortData();
    const resort = () => {
      remember('sortKey', sortKey);
      remember('sortDesc', sortDesc ? '1' : '0');
      syncSortUI();
      bp.page = 0;
      bp._sortData();
      bp._applyFilter();
    };
    $(document).on('click', '#bpSortDir', (e) => {
      e.preventDefault();
      sortDesc = !sortDesc;
      resort();
    });

    // The game changes pages by itself (its own page links hide/show the page blocks, without calling _showPage).
    // Watch the grid so the copy of the page links always follows the page that is showing.
    let obsT = 0;
    const gridEl = document.getElementById('backpackTab_-1') || document.getElementById('backpackContainer');
    if (gridEl && window.MutationObserver) {
      new MutationObserver(() => {
        clearTimeout(obsT);
        obsT = setTimeout(syncTopPager, 30);
      }).observe(gridEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    // The game redraws the folder list and the header after reloading the bag (Refresh bag, Break Down, Destroy): put our
    // "All folders" icon and the header icons back whenever they are missing.
    let restoreT = 0;
    if (window.MutationObserver) {
      new MutationObserver(() => {
        if ($('#bpAllFolders').length && $('#bpSettingsBtn').length && $('#bpRefreshBtn').length) return;
        clearTimeout(restoreT);
        restoreT = setTimeout(() => { ensureAllFolders(); ensureGear(); }, 40);
      }).observe(document.body, { childList: true, subtree: true });
    }

    // The game marks the icon that is "selected"; with toggles several can be on.
    function syncTypeIcons() {
      $('.backpackTabLink').each(function () {
        const t = parseInt($(this).attr('data-type'), 10);
        const sel = t === -1 ? typeSet.size === 0 : typeSet.has(t);
        $(this).toggleClass('tab-selected', sel);
        $(this).closest('li').toggleClass('bp-on', sel);
      });
    }

    // 3) Events
    let timer = null;
    const refresh = (immediate) => {
      clearTimeout(timer);
      const run = () => {
        bp.page = 0; // always start from the first page of the results
        bp._applyFilter();
      };
      if (immediate === true) run();
      else timer = setTimeout(run, DEBOUNCE_MS);
    };

    // Item type icons: capture phase, so the game's own tab handler never runs.
    document.addEventListener(
      'click',
      (e) => {
        const li = e.target && typeof e.target.closest === 'function' ? e.target.closest('#backpack_tabs li.backpackTabHeader') : null;
        const a = li ? li.querySelector('a.backpackTabLink') : null;
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        const t = parseInt(a.getAttribute('data-type'), 10);
        if (isNaN(t) || t === -1) typeSet.clear(); // "All"
        else if (orMode()) { if (typeSet.has(t)) typeSet.delete(t); else typeSet.add(t); }
        else { typeSet.clear(); typeSet.add(t); } // exclusive, like the original tabs
        refresh(true);
      },
      true
    );

    // "All folders" (the game's own search box filters as you type, through our _applyFilter)
    $(document).on('click', '#bpAllFolders', () => {
      $('#bpSearchAll').prop('checked', !$('#bpSearchAll').prop('checked'));
      syncFolders();
      refresh(true);
    });
    // Picking a real folder switches "All folders" off (capture phase: runs before the
    // game's own handler, which then marks the folder as selected).
    document.addEventListener(
      'click',
      (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('backpackFolderImage')) {
          $('#bpSearchAll').prop('checked', false);
          $('#bpAllFolders img').attr('src', FOLDER_OFF);
        }
      },
      true
    );
    $(document).on('click', '#bpAdvBtn', (e) => {
      e.preventDefault();
      $('.bpDd').removeClass('bp-open');
      setAdv(!advOpen());
    });
    if (recall('advOpen') === '1') setAdv(true);
    if (recall('matchAny') === '1') $('#bpOrMode').addClass('bpModeOn');
    applyDisplay(bp);
    updateAdvButton();

    // The level range is ours and applies live (the game's own range, Set? and Apply are hidden).
    $(document).on('input keyup change', '#bpLevelMin, #bpLevelMax, #backpack_filterSet', () => refresh());

    // Filter buttons. By default each group (Quality / the property buttons) is exclusive,
    // like the type icons: picking one drops the others. With "Match any" ticked the
    // buttons of a group can be combined and an item is shown if it matches any of them.
    function toggleBtn($b) {
      const turnOn = !$b.hasClass('bp-on');
      if (turnOn && !orMode()) {
        ($b.hasClass('bpRarity') ? $('.bpRarity') : $('.bpProp')).removeClass('bp-on');
      }
      $b.toggleClass('bp-on', turnOn);
      refresh(true);
    }
    $(document).on('click', '.bpToggle', function (e) {
      e.preventDefault();
      toggleBtn($(this));
    });
    $(document).on('keydown', '.bpToggle', function (e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggleBtn($(this));
      }
    });
    // "Match any" button. Switching it off while several are selected keeps only the first of each group.
    $(document).on('click', '#bpOrMode', (e) => {
      e.preventDefault();
      $('#bpOrMode').toggleClass('bpModeOn');
      remember('matchAny', orMode() ? '1' : '0');
      if (!orMode()) {
        ['.bpRarity', '.bpProp'].forEach((sel) => $(sel + '.bp-on').slice(1).removeClass('bp-on'));
        const first = [...typeSet][0];
        typeSet.clear();
        if (first !== undefined) typeSet.add(first);
      }
      refresh(true);
    });

    // Dropdowns (Hellforge, Craft)
    $(document).on('click', '.bpDdBtn', function (e) {
      e.preventDefault();
      const $dd = $(this).closest('.bpDd');
      const open = !$dd.hasClass('bp-open');
      $('.bpDd').removeClass('bp-open');
      $dd.toggleClass('bp-open', open);
    });
    $(document).on('keydown', '.bpDdBtn', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        $(this).trigger('click');
      } else if (e.key === 'Escape') {
        $('.bpDd').removeClass('bp-open');
      }
    });
    $(document).on('click', '.bpDdList li', function () {
      const $dd = $(this).closest('.bpDd');
      const ddKey = $dd.attr('id').replace('bpDd_', '');
      setDd(ddKey, $(this).attr('data-value'));
      $dd.removeClass('bp-open');
      if (ddKey === 'sort') { // not a filter: it re-sorts the bag
        sortKey = $(this).attr('data-value');
        sortDesc = sortKey === 'rarity'; // rarity starts with the best items
        resort();
        return;
      }
      refresh(true);
    });
    document.addEventListener(
      'click',
      (e) => {
        if (!(e.target && typeof e.target.closest === 'function' && e.target.closest('.bpDd'))) {
          $('.bpDd').removeClass('bp-open');
        }
      },
      true
    );

    // One Clear button resets every filter: type, buttons, dropdowns, and the game's search, level and set.
    // "All folders", "Match any" and the sort order are options, not filters, so they stay as they are.
    function clearAll() {
      typeSet.clear();
      $('#bpFilters .bpToggle').removeClass('bp-on');
      setDd('hf', '');
      setDd('craft', '');
      $('.bpDd').removeClass('bp-open');
      $('#backpack_filterName').val('');
      $('#bpLevelMin, #bpLevelMax').val('');
      $('#backpack_filterSet').prop('checked', false);
      refresh(true);
    }
    $(document).on('click', '#bpClearAll', (e) => {
      e.preventDefault();
      clearAll();
    });

    // The game leaves out "<" on the first page and ">" on the last one, so the links shift around as you page. Put a disabled
    // stand-in there instead. It is not an hcsPaginate_pageLink, so the game's click handler ignores it.
    function keepStepLinks(box) {
      const links = [...box.children];
      const nums = links.filter((a) => /^\d+$/.test(a.textContent.trim()));
      if (!nums.length) return;
      const has = (t) => links.some((a) => a.textContent.trim() === t);
      const off = (t) => {
        const a = document.createElement('a');
        a.className = 'bpPagerOff';
        a.textContent = t;
        return a;
      };
      if (!has('<')) box.insertBefore(off('<'), nums[0]);
      if (!has('>')) nums[nums.length - 1].after(off('>'));
    }

    // A copy of the page links above the grid. The copy has no handlers of its own: a click is passed on to the
    // matching link of the game's own pagination (same position), so paging behaves exactly the same.
    function syncTopPager() {
      let $t = $('#bpTopPager');
      if (!SET.modernPager) {
        $t.remove();
        $('#backpackContainer .bpPagerOff').remove();
        return;
      }
      if (!$t.length) $t = $('<div id="bpTopPager" class="bpRow"></div>').insertAfter('#backpack_filterPanel');
      const $src = $('#backpackPages_-1 > .hcsPaginate_pageLinks').first();
      if (!$src.length || !$src.children().length) { $t.empty(); return; }
      keepStepLinks($src[0]);
      const $c = $src.clone();
      $c.find('[id]').removeAttr('id');
      $c.removeClass('hcsPaginate_hidden');
      $t.empty().append($c);
    }
    $(document).on('click', '#bpTopPager a', function (e) {
      e.preventDefault();
      const idx = $('#bpTopPager a').index(this);
      const real = $('#backpackPages_-1 > .hcsPaginate_pageLinks').first().find('a').get(idx);
      if (real) real.click();
    });

    // Shift+click: select every item between the last one picked and the one clicked (or unselect them all when the clicked item
    // was selected already). The game only knows Ctrl+click and the
    // checkboxes, which toggle `backpack-selected` on the item and keep bp.selectedCount; this does the same for a whole range.
    // It runs in the capture phase so the game's own click handler (plain click = equip / use) never sees the shift-click.
    let selAnchor = null; // data-inv of the last item picked
    const itemOf = (el) => (el.classList.contains('backpackCheckbox') ? el.parentNode.querySelector('.backpackItem') : el);
    document.addEventListener('mousedown', (e) => {
      // no text selection while shift-clicking
      if (e.shiftKey && e.target.closest && e.target.closest('#backpackContainer .backpackItem, #backpackContainer .backpackCheckbox')) e.preventDefault();
    }, true);
    document.addEventListener('click', (e) => {
      const hit = e.target.closest && e.target.closest('#backpackContainer .backpackItem, #backpackContainer .backpackCheckbox');
      const item = hit && itemOf(hit);
      if (!item) return;
      if (!e.shiftKey) {
        if (e.ctrlKey || e.metaKey || hit.classList.contains('backpackCheckbox')) selAnchor = item.getAttribute('data-inv');
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const all = [...document.querySelectorAll('#backpackContainer .backpackItem')];
      const to = all.indexOf(item);
      let from = all.findIndex((x) => x.getAttribute('data-inv') === selAnchor);
      if (from < 0) { // no anchor: continue from the last selected item
        for (let i = all.length - 1; i >= 0 && from < 0; i--) if (all[i].classList.contains('backpack-selected')) from = i;
      }
      if (from < 0) from = to;
      const unselect = item.classList.contains('backpack-selected');
      let changed = 0;
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
        if (all[i].classList.contains('backpack-selected') === unselect) { all[i].classList.toggle('backpack-selected', !unselect); changed++; }
      }
      bp.selectedCount += unselect ? -changed : changed;
      bp._updateMultiOptions();
      selAnchor = item.getAttribute('data-inv');
    }, true);

    // ------------------------------------------------------------ locked items
    // A locked item cannot be destroyed or broken down, from the buttons under the bag or from the right-click menu (the game's
    // "All" entries too: they act on every item of that type). The locks are inventory ids kept in localStorage, so they stay
    // for good; a small padlock is drawn on the item. The menu is the game's jQuery contextMenu, so "Lock" / "Unlock" is
    // added to the list when it opens, and the destroy / break down entries are caught before the game's confirm box.
    let lockedIds = new Set();
    try { lockedIds = new Set(JSON.parse(recall('locked') || '[]').map(String)); } catch (e) { /* no saved locks */ }
    const saveLocks = () => remember('locked', JSON.stringify(Array.from(lockedIds)));
    const isLocked = (inv) => lockedIds.has(String(inv));
    function paintLocks() {
      $('#backpackContainer .backpackItem').each(function () {
        this.classList.toggle('bpLocked', isLocked(this.getAttribute('data-inv')));
      });
    }
    bp.bpPaintLocks = paintLocks;
    // An item can leave the bag without us seeing it (crafting, trading, auction), which would leave its lock behind for good.
    // bp.srcData holds the whole bag, equipped items included (eq: true), so a lock whose id is not in it any more is dropped.
    // It runs when the bag has loaded, at most once an hour; an empty srcData (not loaded yet) never removes anything.
    const PRUNE_EVERY = 60 * 60 * 1000;
    function pruneLocks() {
      if (!lockedIds.size || !bp.srcData || !bp.srcData.length) return;
      const last = parseInt(recall('lockPruned') || '0', 10);
      if (Date.now() - last < PRUNE_EVERY) return;
      remember('lockPruned', String(Date.now()));
      const owned = new Set(bp.srcData.map((x) => String(x.a)));
      const gone = Array.from(lockedIds).filter((id) => !owned.has(id));
      if (!gone.length) return;
      gone.forEach((id) => lockedIds.delete(id));
      saveLocks();
      paintLocks();
    }
    bp.bpPruneLocks = pruneLocks;
    function setLocks(ids, on) {
      ids.forEach((id) => { if (on) lockedIds.add(String(id)); else lockedIds.delete(String(id)); });
      saveLocks();
      paintLocks();
    }
    const lockedNote = (n, verb) => {
      fsAlert((n === 1 ? 'This item is locked' : n + ' of these items are locked') + ', so it cannot be ' + (verb || 'destroyed or broken down') + '.' + '\nUnlock it first (right-click it and choose Unlock).', null, 'Locked');
    };
    let lastWarn = 0;
    function warnLocked(n, verb) {
      if (Date.now() - lastWarn < 600) return; // one message even when the click is seen twice
      lastWarn = Date.now();
      lockedNote(n, verb);
    }
    // item ids affected by an action on one item: just it, or (the "All" entries) every item of the same type
    function idsFor(inv, wholeType) {
      if (!wholeType) return [String(inv)];
      const me = (bp.srcData || []).filter((x) => String(x.a) === String(inv))[0];
      if (!me) return [String(inv)];
      return bp.srcData.filter((x) => x.b === me.b).map((x) => String(x.a));
    }
    const lockedCount = (ids) => ids.filter(isLocked).length;

    // the item the menu was opened on
    let ctxInv = null;
    document.addEventListener('contextmenu', (e) => {
      const it = e.target.closest && e.target.closest('#backpackContainer .backpackItem');
      ctxInv = it ? it.getAttribute('data-inv') : null;
    }, true);

    // "Lock" / "Unlock" in the game's menu
    if (window.MutationObserver) {
      new MutationObserver((muts) => {
        muts.forEach((m) => m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1 || !ctxInv) return;
          const root = n.matches && n.matches('ul.context-menu-root') ? n : n.querySelector && n.querySelector('ul.context-menu-root');
          if (!root || root.querySelector('.bpLockItem')) return;
          const sel = ctxMenuTargets();
          const on = !isLocked(ctxInv);
          const li = document.createElement('li');
          li.className = 'context-menu-item bpLockItem';
          li.innerHTML = '<span>' + (on ? 'Lock' : 'Unlock') + (sel.length > 1 ? ' (' + sel.length + ' items)' : '') + '</span>';
          const before = Array.from(root.children).filter((c) => /^Destroy/.test(c.textContent.trim()))[0];
          root.insertBefore(li, before || null);
          // the plugin walks every li of the menu when it closes and reads its data (blurItem: "autoHide" of undefined), so the new
          // entry gets the same data as its neighbour
          const mate = before || root.firstElementChild;
          if (mate) $(li).data({ contextMenu: $(mate).data('contextMenu'), contextMenuRoot: $(mate).data('contextMenuRoot'), contextMenuKey: 'bpLock' });
          li.addEventListener('mouseenter', () => { Array.from(root.children).forEach((c) => c.classList.remove('context-menu-hover')); li.classList.add('context-menu-hover'); });
          li.addEventListener('mouseleave', () => li.classList.remove('context-menu-hover'));
          let done = false;
          const act = (e) => {
            if (e.button !== 0) return; // the release of the right button that opened the menu is not a pick
            e.preventDefault();
            e.stopPropagation();
            if (done) return;
            done = true;
            try { setLocks(sel, on); } finally { hideMenu(); }
          };
          li.addEventListener('mouseup', act);
          li.addEventListener('click', act);
        }));
      }).observe(document.body, { childList: true, subtree: true });
    }
    function hideMenu() {
      // the contextMenu plugin closes a menu on this event; its own 'hide' call on the trigger is the fallback
      $('ul.context-menu-root').trigger('contextmenu:hide');
      const it = document.querySelector('#backpackContainer .backpackItem[data-inv="' + ctxInv + '"]');
      if (it) { try { $(it).contextMenu('hide'); } catch (err) { /* already closed */ } }
    }
    // the item, or all selected items when it is one of them
    function ctxMenuTargets() {
      const it = document.querySelector('#backpackContainer .backpackItem[data-inv="' + ctxInv + '"]');
      if (it && it.classList.contains('backpack-selected') && bp.selectedCount > 1) {
        return $('#backpackContainer .backpack-selected').map(function () { return this.getAttribute('data-inv'); }).get();
      }
      return [String(ctxInv)];
    }

    // What each entry of the game's menu does and whether a lock stops it (use / extract only when their setting is on).
    // "Extract Item" is the game's own _useItem on a component, "All" entries act on every item of the type.
    function menuRule(label) {
      const m = /^(Destroy|Break Down)( All)?$/.exec(label);
      if (m) return { whole: !!m[2], verb: null };
      if (SET.lockUse && /^Use( Item)?$/.test(label)) return { whole: false, verb: 'used' };
      if (SET.lockUse && /^Open All/.test(label)) return { whole: true, verb: 'opened' };
      if (SET.lockExtract && label === 'Extract Item') return { whole: false, verb: 'extracted' };
      if (SET.lockExtract && /^Extract All/.test(label)) return { whole: true, verb: 'extracted' };
      return null;
    }
    // destroy / break down / use / extract in the menu: stop it before the game's "are you sure"
    ['mouseup', 'click'].forEach((type) => {
      document.addEventListener(type, (e) => {
        const li = e.target.closest && e.target.closest('ul.context-menu-list > li.context-menu-item');
        if (e.button !== 0 || !li || !ctxInv || li.classList.contains('bpLockItem')) return;
        const label = li.textContent.trim();
        const rule = menuRule(label);
        if (!rule) return;
        const n = lockedCount(idsFor(ctxInv, rule.whole));
        if (!n) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        hideMenu();
        warnLocked(n, rule.verb);
      }, true);
    });
    // the buttons under the bag (act on the selected items)
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('#backpack-destroy-selected-button, #backpack-frag-selected-button');
      if (!b) return;
      const n = lockedCount(bp._getSelectedInvIds().map(String));
      if (!n) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      warnLocked(n);
    }, true);
    // last guard: whatever else calls the game's own methods
    [['_destroyItem', false], ['_fragItem', false], ['_destroyItemType', true], ['_fragItemType', true]].forEach(([name, whole]) => {
      const orig = bp[name].bind(bp);
      bp[name] = function (inv) {
        const n = lockedCount(idsFor(inv, whole));
        if (n) { warnLocked(n); return undefined; }
        return orig.apply(this, arguments);
      };
    });
    // using an item (click on a potion, the "Use" link, the menu): only when the setting is on
    // components (type 12) are "extracted" by the same method, so their own setting decides
    // what a use of this item is called when a lock forbids it (null = allowed)
    function useVerb(inv) {
      if (!isLocked(inv)) return null;
      const it = (bp.srcData || []).filter((x) => String(x.a) === String(inv))[0];
      const extract = !!it && it.t === 12;
      if (extract) return SET.lockExtract ? 'extracted' : null;
      return SET.lockUse ? 'used' : null;
    }
    const origUse = bp._useItem.bind(bp);
    bp._useItem = function (inv) {
      const verb = useVerb(inv);
      if (verb) { warnLocked(1, verb); return undefined; }
      return origUse.apply(this, arguments);
    };
    // a plain click on a usable item makes the game ask "Are you sure you want to use this item?": stop it before the question
    // (Ctrl / Shift / Meta clicks and the checkboxes select, they are left alone)
    document.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      const item = e.target.closest && e.target.closest('#backpackContainer .backpackItem');
      if (!item || !item.classList.contains('backpackContextMenuUsable')) return; // gear is equipped by that click, not used
      const verb = useVerb(item.getAttribute('data-inv'));
      if (!verb) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      warnLocked(1, verb);
    }, true);
    // Fallen Sword Helper's "Use" button under an item calls its own ajax, not the game's method: catch the click first
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('#backpackContainer button.fastUse');
      if (!b) return;
      const first = b.parentNode && b.parentNode.parentNode && b.parentNode.parentNode.children[0];
      const verb = first && first.dataset ? useVerb(first.dataset.inv) : null;
      if (!verb) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      warnLocked(1, verb);
    }, true);
    [['_extractItemByType', 'lockExtract', 'extracted'], ['_openAllByType', 'lockUse', 'opened']].forEach(([name, flag, verb]) => {
      if (typeof bp[name] !== 'function') return;
      const orig = bp[name].bind(bp);
      bp[name] = function (inv) {
        const n = lockedCount(idsFor(inv, true));
        if (SET[flag] && n) { warnLocked(n, verb); return undefined; }
        return orig.apply(this, arguments);
      };
    });
    ['_destroySelected', '_fragSelected'].forEach((name) => {
      const orig = bp[name].bind(bp);
      bp[name] = function () {
        const n = lockedCount(bp._getSelectedInvIds().map(String));
        if (n) { warnLocked(n); return undefined; }
        return orig.apply(this, arguments);
      };
    });
    paintLocks();

    // ------------------------------------------------------------ settings window
    let draftAlways = new Set();
    const chipsHtml = (inZone) =>
      FILTERS.filter((f) => draftAlways.has(f[0]) === inZone)
        .map((f) => '<span class="bpChip" draggable="true" data-f="' + f[0] + '" title="Drag to the other area (or click to move it)">' + f[1] + '</span>')
        .join('');
    function renderZones() {
      $('#bpZoneAlways').html(chipsHtml(true));
      $('#bpZoneAdv').html(chipsHtml(false));
    }
    const choiceHtml = (group, values, cur, unit) =>
      '<div>' + values.map((n) => '<span class="bpChoice' + (n === cur ? ' bp-on' : '') + '" data-g="' + group + '" data-v="' + n + '" role="button" tabindex="0">' + n + unit + '</span>').join('') + '</div>';
    const choiceVal = (group, fallback) => {
      const n = parseInt($('.bpChoice[data-g="' + group + '"].bp-on').attr('data-v'), 10);
      return isNaN(n) ? fallback : n;
    };
    // [?] with a dotted question mark; the text is shown by the #bpTipBox handlers below
    const tip = (text) => '<span class="bpTip" data-tip="' + text + '">[<span class="bpQ">?</span>]</span>';
    const settingsHtml = (v) =>
      '<div id="bpSettingsWin">' +
      '<div class="bpSetH">Item type filter ' + tip('New shows how many items each type has and dims the types you have none of. Original keeps the game&#39;s own icons.') + '</div>' +
      '<label class="bpCbLabel"><input type="radio" class="bpCb" name="bpSetType" value="new"' + (v.typeStyle === 'new' ? ' checked' : '') + '>New: item counts, empty types dimmed</label><br>' +
      '<label class="bpCbLabel"><input type="radio" class="bpCb" name="bpSetType" value="old"' + (v.typeStyle === 'old' ? ' checked' : '') + '>Original: the game\'s own icons</label>' +
      '<div class="bpSetH">Filters ' + tip('Drag a filter to the other area, or click it. Always visible filters are shown at all times; the others appear when you press &quot;Advanced filters&quot; (the button is hidden when nothing is advanced). The game&#39;s own search box and Filters panel (level, set, sort) are always there.') + '</div>' +
      '<div class="bpZoneT">Always visible</div><div class="bpZone" id="bpZoneAlways" data-zone="a" data-empty="Drop filters here"></div>' +
      '<div class="bpZoneT">Advanced filters</div><div class="bpZone" id="bpZoneAdv" data-zone="v" data-empty="Drop filters here"></div>' +
      '<div class="bpSetH">Display</div>' +
      '<div class="bpZoneT">Items per page</div>' + choiceHtml('perPage', PER_PAGE_CHOICES, v.perPage, '') +
      '<div class="bpZoneT">Item size ' + tip('Scales the item icons in the backpack. Smaller icons fit more on the screen.') + '</div>' + choiceHtml('size', SIZE_CHOICES, v.size, '%') +
      '<div class="bpSwRow"><label class="bpSwitch"><input type="checkbox" id="bpSetEmpty"' + (v.empty ? ' checked' : '') + '><span class="bpSlider"></span>Show empty slots</label> ' + tip('Fills the last page with empty slots, up to the number of items per page.') + '</div>' +
      '<div class="bpSwRow"><label class="bpSwitch"><input type="checkbox" id="bpSetModernPager"' + (v.modernPager ? ' checked' : '') + '><span class="bpSlider"></span>Modern pagination</label> ' + tip('Rounded page buttons. The &quot;&lt;&quot; and &quot;&gt;&quot; buttons stay in place and are greyed out when there is no previous or next page, instead of disappearing. Also adds a copy of the page buttons above the items.') + '</div>' +
      '<div class="bpSetH">Locked items</div>' +
      '<div class="bpSwRow"><label class="bpSwitch"><input type="checkbox" id="bpSetLockUse"' + (v.lockUse ? ' checked' : '') + '><span class="bpSlider"></span>Locked items cannot be used</label> ' + tip('A locked item is always protected from Destroy and Break Down. With this on it also cannot be used (potions and other usable items), so you have to unlock it first. Equipping is never blocked.') + '</div>' +
      '<div class="bpSwRow"><label class="bpSwitch"><input type="checkbox" id="bpSetLockExtract"' + (v.lockExtract ? ' checked' : '') + '><span class="bpSlider"></span>Block extracting</label> ' + tip('With this on, a locked item cannot be extracted (components), and Extract All is refused when any item of that type is locked.') + '</div>' +
      '<div class="bpSetH">Automatic break down</div>' +
      '<div class="bpSwRow"><label class="bpSwitch"><input type="checkbox" id="bpSetAutoBreak"' + (v.autoBreak ? ' checked' : '') + '><span class="bpSlider"></span>Break down items automatically</label> ' + tip('On every game page, every 5 seconds, every piece of equipment (helmet, armor, gloves, boots, weapon, shield, ring, amulet, rune) that matches the rarities and levels below is broken down. Locked, bound and guild tagged items and containers are never touched. Breaking down cannot be undone.') + '</div>' +
      '<div class="bpSwRow"><label class="bpSwitch"><input type="checkbox" id="bpSetAutoBreakDry"' + (v.autoBreakDry ? ' checked' : '') + '><span class="bpSlider"></span>Dry run</label> ' + tip('Nothing is broken down: the items that would be are listed in the browser console (F12) instead.') + '</div>' +
      [[0, 'Common'], [1, 'Rare'], [2, 'Unique']].map((r) => '<div class="bpSwRow"><label class="bpSwitch"><input type="checkbox" class="bpAbRar" data-r="' + r[0] + '"' + (v.autoBreakRar.indexOf(r[0]) !== -1 ? ' checked' : '') + '><span class="bpSlider"></span>' + r[1] + ' items</label></div>').join('') +
      '<div class="bpZoneT">Level range ' + tip('Only items from this minimum to this maximum level are broken down. Leave a box empty for no limit.') + '</div>' +
      '<div class="bpSwRow">Min <input type="number" min="0" id="bpSetAbMin" class="bpAbLvl" value="' + (v.autoBreakMin === null ? '' : v.autoBreakMin) + '"> Max <input type="number" min="0" id="bpSetAbMax" class="bpAbLvl" value="' + (v.autoBreakMax === null ? '' : v.autoBreakMax) + '"></div>' +
      '<div class="bpSwRow"><a href="#" id="bpAbLogBtn">View the log of broken down items</a></div>' +
      '<div class="bpSetH">Pop-ups</div>' +
      '<div class="bpSwRow"><label class="bpSwitch"><input type="checkbox" id="bpSetQuickBuff"' + (v.quickBuffPopup ? ' checked' : '') + '><span class="bpSlider"></span>Open Quick Buff in a pop-up</label> ' + tip('Instead of a separate browser window, Quick Buff opens in a window on the page that you can drag around.') + '</div>' +
      '<div class="bpSwRow"><label class="bpSwitch"><input type="checkbox" id="bpSetQuickBuffInfo"' + (v.quickBuffInfo ? ' checked' : '') + '><span class="bpSlider"></span>Buff information in the pop-up</label> ' + tip('In the Quick Buff pop-up: your Sustain and Fury Caster enhancements, whether Guild Buffer, Buff Master, Extend and Reinforce are on, the buffs a target already has (with their level) next to each buff, and the last activity and stamina of the target.') + '</div>' +
      '</div>';

    let gameDraggable = false;
    function settingsClosed() {
      try { $('#dialog_msg').dialog('option', 'draggable', gameDraggable); } catch (e) { /* ignore */ }
      $('#dialog_msg').closest('.ui-dialog').css({ top: '', left: '' });
      $(document).off('mousedown.bpSet');
      $('html').removeClass('bpNoScroll');
      $('body').css('padding-right', '');
      $('#dialog_msg').closest('.ui-dialog').removeClass('bpSettingsDlg').find('.bpSetX').remove();
      $('#bpTipBox').hide();
    }
    // tooltip for the [?] marks; one box in the page, so the settings window cannot clip it
    $(document).on('mouseenter', '.bpTip', function () {
      let $b = $('#bpTipBox');
      if (!$b.length) $b = $('<div id="bpTipBox"></div>').appendTo('body');
      const r = this.getBoundingClientRect();
      $b.text(this.getAttribute('data-tip')).show();
      const w = $b.outerWidth();
      $b.css({ left: Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)), top: r.bottom + 6 });
    });
    $(document).on('mouseleave', '.bpTip', () => $('#bpTipBox').hide());
    function openSettings() {
      draftAlways = new Set(SET.always);
      const buttons = [
        {
          text: 'Save',
          click: function () {
            const next = {
              autoBreak: $('#bpSetAutoBreak').prop('checked'),
              autoBreakDry: $('#bpSetAutoBreakDry').prop('checked'),
              autoBreakRar: $('.bpAbRar:checked').map(function () { return parseInt($(this).attr('data-r'), 10); }).get(),
              autoBreakMin: lvlOrNull($('#bpSetAbMin').val()),
              autoBreakMax: lvlOrNull($('#bpSetAbMax').val()),
            };
            if (next.autoBreak && !next.autoBreakDry && next.autoBreakRar.length) {
              const n = autoBreakMatches(bp.srcData, next, isLocked).length;
              if (n && !window.confirm('Automatic break down is on: ' + n + ' item' + (n === 1 ? '' : 's') + ' in your backpack match and will be broken down as soon as you save. This cannot be undone. Continue?')) return;
            }
            SET = {
              ...next,
              typeStyle: $('input[name=bpSetType]:checked').val() === 'old' ? 'old' : 'new',
              always: FILTERS.map((f) => f[0]).filter((k) => draftAlways.has(k)),
              perPage: choiceVal('perPage', DEFAULT_SETTINGS.perPage),
              size: choiceVal('size', DEFAULT_SETTINGS.size),
              empty: $('#bpSetEmpty').prop('checked'),
              modernPager: $('#bpSetModernPager').prop('checked'),
              lockUse: $('#bpSetLockUse').prop('checked'),
              lockExtract: $('#bpSetLockExtract').prop('checked'),
              quickBuffPopup: $('#bpSetQuickBuff').prop('checked'),
              quickBuffInfo: $('#bpSetQuickBuffInfo').prop('checked'),
            };
            saveSettings(SET);
            $(this).dialog('close');
            applySettings();
          },
        },
        {
          text: 'Defaults',
          click: function () {
            draftAlways = new Set(DEFAULT_SETTINGS.always);
            $('#bpSetBody').html(settingsHtml(DEFAULT_SETTINGS));
            renderZones();
          },
        },
        { text: 'Cancel', click: function () { $(this).dialog('close'); } },
      ];
      try { gameDraggable = $('#dialog_msg').dialog('option', 'draggable'); } catch (e) { /* keep the last value */ }
      openDialog({ title: 'Toolkit settings', buttons, width: 440, draggable: true, close: settingsClosed },'<div id="bpSetBody">' + settingsHtml(SET) + '</div>');
      renderZones();
      // the page behind stays where it is while the window is open
      const gap = window.innerWidth - document.documentElement.clientWidth;
      $('html').addClass('bpNoScroll');
      if (gap > 0) $('body').css('padding-right', gap + 'px');
      // a close button in the top right corner: closes without saving
      const $win = $('#dialog_msg').closest('.ui-dialog').addClass('bpSettingsDlg');
      $win.find('.bpSetX').remove();
      $('<button type="button" class="bpSetX" title="Close without saving" aria-label="Close without saving">&times;</button>')
        .appendTo($win.find('.ui-dialog-titlebar'))
        .on('click', () => $('#dialog_msg').dialog('close'));
      // a click anywhere outside the window closes it, also without saving
      $(document).off('mousedown.bpSet').on('mousedown.bpSet', (e) => {
        if (!$(e.target).closest('.ui-dialog').length) $('#dialog_msg').dialog('close');
      });
    }
    function applySettings() {
      applyDisplay(bp);
      applyLayout();
      bp.page = 0;
      bp._applyFilter(); // redraws the grid and the type icons
    }
    function moveChip(key, toAlways) {
      if (toAlways) draftAlways.add(key); else draftAlways.delete(key);
      renderZones();
    }
    $(document).on('click', '#bpSettingsBtn', (e) => {
      e.preventDefault();
      openSettings();
    });
    // Refresh bag: asks the game for the backpack again (the same call it makes after an equip or a break down).
    $(document).on('click', '#bpRefreshBtn', (e) => {
      e.preventDefault();
      const $b = $('#bpRefreshBtn');
      if ($b.hasClass('bp-spin')) return;
      $b.addClass('bp-spin');
      bp._loadData();
      setTimeout(() => $b.removeClass('bp-spin'), 1200);
    });
    // Drag and drop between the two areas; a click moves the chip too (touch screens).
    let dragKey = null;
    $(document).on('dragstart', '.bpChip', function (e) {
      dragKey = $(this).attr('data-f');
      e.originalEvent.dataTransfer.setData('text/plain', dragKey);
      e.originalEvent.dataTransfer.effectAllowed = 'move';
      $(this).addClass('bpDragging');
    });
    $(document).on('dragend', '.bpChip', function () {
      $(this).removeClass('bpDragging');
      $('.bpZone').removeClass('bpOver');
    });
    $(document).on('dragover', '.bpZone', function (e) {
      e.preventDefault();
      e.originalEvent.dataTransfer.dropEffect = 'move';
      $(this).addClass('bpOver');
    });
    $(document).on('dragleave', '.bpZone', function (e) {
      if (!this.contains(e.originalEvent.relatedTarget)) $(this).removeClass('bpOver');
    });
    $(document).on('drop', '.bpZone', function (e) {
      e.preventDefault();
      $(this).removeClass('bpOver');
      if (dragKey) moveChip(dragKey, $(this).attr('data-zone') === 'a');
      dragKey = null;
    });
    $(document).on('click keydown', '.bpChoice', function (e) {
      if (e.type === 'keydown') {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
      }
      $('.bpChoice[data-g="' + $(this).attr('data-g') + '"]').removeClass('bp-on');
      $(this).addClass('bp-on');
    });
    $(document).on('click', '.bpChip', function () {
      const key = $(this).attr('data-f');
      moveChip(key, !draftAlways.has(key));
    });

    // If the data was already loaded before we patched, redraw once so our filters apply to what is on screen.
    if (bp.srcData && bp.srcData.length) bp._applyFilter();
  }

  function injectUI() {
    if ($('#bpFilters').length) return;

    if (!$('#bpStyle').length) {
      $('head').append(
        '<style id="bpStyle">' +
          // item type icons: the game's own sprites, each in a button frame with a gap
          'body.bpTypesNew #backpack_tabs ul{width:auto !important;max-width:100%;margin:0 auto !important;padding:0;' +
          'display:flex;flex-wrap:wrap;justify-content:center;gap:4px;list-style:none;}' +
          'body.bpTypesNew #backpack_tabs li.backpackTabHeader{position:relative;box-sizing:border-box;margin:0 !important;padding:2px;' +
          'display:block;cursor:pointer;background:#e6d6ab;border:2px solid #8a6a3a;border-radius:4px;' +
          'box-shadow:inset 0 1px 0 rgba(255,255,255,.5);}' +
          // 18x18 crops the shadow that is baked into the right/bottom of the game's icon sprites
          'body.bpTypesNew #backpack_tabs li.backpackTabHeader a.backpackTabLink{display:block;width:18px !important;' +
          'height:18px !important;}' +
          'body.bpTypesNew #backpack_tabs li.backpackTabHeader:hover{background:#f0e3bf;}' +
          'body.bpTypesNew #backpack_tabs li.backpackTabHeader.bp-on{background:#c8dc86;border-color:#4f6f12;' +
          'box-shadow:inset 0 2px 4px rgba(0,0,0,.35);}' +
          'body.bpTypesNew #backpack_tabs li.backpackTabHeader.bp-empty:not(.bp-on){opacity:.4;}' +
          '.bpCount{display:none;}body.bpTypesNew .bpCount{display:block;position:absolute;right:-4px;bottom:-5px;min-width:13px;height:13px;padding:0 3px;' +
          'box-sizing:border-box;border-radius:7px;background:#2b2620;border:1px solid #8a6a3a;color:#fff;' +
          'font:bold 9px/11px Arial,sans-serif;text-align:center;pointer-events:none;}' +
          'body.bpTypesNew .bpCount:empty{display:none;}' +
          '#bpFilters{margin-top:6px;}' +
          // the game's own sort / level / set rows and its Clear / Apply buttons are replaced by ours
          '#backpack_filterPanel > .backpackFilterRow{display:none !important;}' +
          '.bpSortRow,.bpLvlRow{display:flex;align-items:center;gap:6px;margin:0 0 6px;}.bpLvlRow{flex-wrap:wrap;}' +
          '.bpLvlRow label{min-width:34px;}' +
          '.bpSortRow .bpDd{flex:1;min-width:0;margin:0;}.bpSortRow .bpDdBtn{width:100%;min-width:0;}' +
          '#bpSortDir{padding:0 8px;min-width:30px;font-size:20px;line-height:1;}' +
          '.bpLvlRow input[type=text]{width:40px;}' +
          // a bit of room inside the game's search box
          '#backpack_filterName{box-sizing:border-box;min-height:22px;padding:0px 5px !important;}' +
          // checkboxes drawn like the toggle buttons (tan box, green with a tick when on)
          '.bpCbLabel{display:inline-flex;align-items:center;cursor:pointer;white-space:nowrap;}' +
          '.bpCb{-webkit-appearance:none;appearance:none;box-sizing:border-box;position:relative;flex:none;' +
          'width:16px;height:16px;margin:0 5px 0 0;cursor:pointer;background:#e6d6ab;border:2px solid #8a6a3a;' +
          'border-radius:3px;box-shadow:inset 0 1px 0 rgba(255,255,255,.5);}' +
          '.bpCb:hover{background:#f0e3bf;}' +
          '.bpCb:checked{background:#c8dc86;border-color:#4f6f12;box-shadow:inset 0 2px 3px rgba(0,0,0,.35);}' +
          '.bpCb:checked::after{content:"";position:absolute;left:3px;top:0;width:4px;height:8px;' +
          'border:solid #2f4a08;border-width:0 2px 2px 0;transform:rotate(45deg);}' +
          '.bpCb:focus-visible{outline:1px dotted #3a2a12;outline-offset:2px;}' +
          '#bpFilters:not(.bpAdvOn) #bpAdvBox{display:none;}' +
          '#bpFilters .bpModeOn{background:#c8dc86;border-color:#4f6f12;}' +
          'body.bpNoEmpty .backpackSlot:has(> .backpackEmptySlot){display:none !important;}.bpRow{clear:both;padding:0 0 4px 0;}.bpRow:empty{display:none;}#bpTopPager{text-align:center;}' +
          // page links as rounded buttons (game links keep their own look elsewhere)
          'body.bpModernPager #backpackContainer div.hcsPaginate_pageLinks{display:flex;flex-wrap:wrap;justify-content:center;gap:3px;padding-top:4px;}' +
          'body.bpModernPager #backpackContainer .hcsPaginate_pageLinks a{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;' +
          'min-width:22px;height:20px;margin:0;padding:0 5px;border:1px solid #20170396;border-radius:2px;font-size:11px;line-height:1;' +
          'background:#cd9e4b repeat-x;box-shadow:0 0 3px 0 #000;color:#201703;font-weight:700;' +
          'text-shadow:none;text-decoration:none;user-select:none;transition:background .12s,box-shadow .12s;}' +
          'body.bpModernPager #backpackContainer .hcsPaginate_pageLinks a:hover{filter:brightness(1.12);}' +
          'body.bpModernPager #backpackContainer .hcsPaginate_pageLinks a:active,body.bpModernPager #backpackContainer .hcsPaginate_pageLinks a.hcsPaginate_selected{' +
          'background:#9c6f26;border-color:#20170396;color:#fff6dc;box-shadow:0 0 3px 0 #000,inset 0 1px 3px rgba(0,0,0,.5);}' +
          'body.bpModernPager #backpackContainer .hcsPaginate_pageLinks a.bpPagerOff,body.bpModernPager #backpackContainer .hcsPaginate_pageLinks a.bpPagerOff:hover{' +
          'opacity:.4;cursor:default;pointer-events:none;filter:none;box-shadow:none;}' +
          '#bpSettingsBtn{font-size:14px;line-height:1;text-decoration:none;cursor:pointer;color:#fff;' +
          'text-shadow:-1px 0 0 #000,0 1px 0 #000,1px 0 0 #000,0 -1px 0 #000;}' +
          '#bpSettingsBtn::before{content:"\\2699";}' +
          '#bpRefreshBtn{font-size:14px;line-height:1;text-decoration:none;cursor:pointer;color:#fff;display:inline-block;' +
          'text-shadow:-1px 0 0 #000,0 1px 0 #000,1px 0 0 #000,0 -1px 0 #000;}' +
          '#bpRefreshBtn::before{content:"\\21BB";}#bpRefreshBtn.bp-spin{animation:bpSpin .8s linear infinite;pointer-events:none;}' +
          '@keyframes bpSpin{to{transform:rotate(360deg);}}' +
          // settings window
          '.bpSettingsDlg .ui-dialog-titlebar{cursor:move;}' +
          '#bpSetBody{max-height:calc(100vh - 220px);overflow-y:auto;padding-right:6px;}' +
          '#bpSetBody::-webkit-scrollbar{width:12px}#bpSetBody::-webkit-scrollbar-track{background:#0f0d09;border-left:1px solid #2b2417}' +
          '#bpSetBody::-webkit-scrollbar-thumb{background:#6b5a33;border-radius:6px;border:3px solid #0f0d09}#bpSetBody::-webkit-scrollbar-thumb:hover{background:#8d7646}' +
          '#bpSettingsWin{text-align:left;}#bpSettingsWin .bpCbLabel{margin:2px 0;}' +
          '.bpCb[type=radio]{border-radius:50%;}' +
          '.bpCb[type=radio]:checked::after{left:3px;top:3px;width:6px;height:6px;border:0;border-radius:50%;background:#2f4a08;transform:none;}' +
          '.bpSetH{margin:10px 0 4px;font-weight:bold;border-bottom:1px solid rgba(138,106,58,.6);}' +
          '.bpSwRow{display:flex;align-items:center;gap:6px;margin:3px 0;}' +
          '.bpSwitch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;}' +
          '.bpSwitch input{position:absolute;opacity:0;width:0;height:0;}' +
          '.bpSlider{cursor:pointer;position:relative;flex:none;width:34px;height:18px;box-sizing:border-box;border:1px solid #6a5333;border-radius:9px;' +
          'background:#3b2f20;transition:background .15s,border-color .15s;}' +
          '.bpSlider::before{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#bfae8c;' +
          'transition:transform .15s,background .15s;}' +
          '.bpSwitch input:checked + .bpSlider{background:#b9832a;border-color:#e0b252;}' +
          '.bpSwitch input:checked + .bpSlider::before{transform:translateX(16px);background:#fff6dc;}' +
          '.bpSwitch input:focus-visible + .bpSlider{outline:1px dotted #e0b252;outline-offset:2px;}' +
          '.bpTip{margin-left:2px;font-weight:normal;cursor:help;}.bpTip .bpQ{border-bottom:1px dotted currentColor;}' +
          '#bpTipBox{display:none;position:fixed;z-index:100000;max-width:260px;padding:6px 9px;border:1px solid #8a6a3a;border-radius:6px;' +
          'background:#2b2217;color:#f1e3c0;font:12px/1.4 Arial,sans-serif;box-shadow:0 3px 10px rgba(0,0,0,.5);pointer-events:none;}' +
          'html.bpNoScroll,html.bpNoScroll body{overflow:hidden !important;}' +
          '.bpSettingsDlg .ui-dialog-titlebar-close{display:none !important;}' +
          '.bpSettingsDlg .ui-dialog-titlebar{position:relative;}' +
          '.bpSetX{position:absolute;top:2px;right:6px;width:28px;height:28px;padding:0;border:1px solid transparent;border-radius:6px;' +
          'background:transparent;color:#f3e3b8;font-size:26px;font-weight:bold;line-height:1;cursor:pointer;opacity:1;}' +
          '.bpSetX:hover{background:rgba(224,178,82,.25);border-color:#e0b252;color:#fff;}' +
          '.bpZoneT{margin:6px 0 2px;font-size:11px;font-weight:bold;}' +
          '.bpAbLvl{width:70px;margin:0 8px 0 4px;}' +
          '#bpAbLogWin{position:fixed;z-index:100000;right:20px;top:80px;width:380px;background:#1a160e;border:1px solid #6b5a33;border-radius:4px;color:#e0c493;font-size:12px;box-shadow:0 4px 18px rgba(0,0,0,.6)}' +
          '#bpAbLogWin .bpAbBar{display:flex;justify-content:space-between;padding:6px 10px;background:#2b2417;font-weight:bold}#bpAbLogWin a{color:#f0c75e;margin-left:8px;text-decoration:none}' +
          '#bpAbLogWin .bpAbBody{max-height:320px;overflow-y:auto;padding:4px 10px}#bpAbLogWin .bpAbRow{padding:3px 0;border-bottom:1px solid #2b2417}.bpAbT,.bpAbL{color:#9a8c6a}.bpAbF{color:#e0c493}' +
          '#bpAbLogWin .bpAbBody::-webkit-scrollbar{width:12px}#bpAbLogWin .bpAbBody::-webkit-scrollbar-track{background:#0f0d09;border-left:1px solid #2b2417}' +
          '#bpAbLogWin .bpAbBody::-webkit-scrollbar-thumb{background:#6b5a33;border-radius:6px;border:3px solid #0f0d09}#bpAbLogWin .bpAbBody::-webkit-scrollbar-thumb:hover{background:#8d7646}' +
          '.bpZone{min-height:34px;box-sizing:border-box;padding:4px 4px 0;border:2px dashed #8a6a3a;border-radius:4px;background:rgba(0,0,0,.06);}' +
          '.bpZone:empty::before{content:attr(data-empty);display:block;padding:4px 2px;font-size:11px;opacity:.6;}' +
          '.bpZone.bpOver{background:rgba(200,220,134,.35);border-color:#4f6f12;}' +
          '.bpChip{display:inline-block;margin:0 4px 4px 0;padding:3px 8px;cursor:grab;user-select:none;-webkit-user-select:none;' +
          'font:bold 11px Arial,sans-serif;color:#3a2a12;background:#e6d6ab;border:2px solid #8a6a3a;border-radius:4px;}' +
          '.bpChoice{display:inline-block;min-width:34px;box-sizing:border-box;margin:0 4px 4px 0;padding:3px 8px;text-align:center;cursor:pointer;' +
          'user-select:none;-webkit-user-select:none;font:bold 11px Arial,sans-serif;color:#3a2a12;background:#e6d6ab;border:2px solid #8a6a3a;border-radius:4px;}' +
          '.bpChoice:hover{background:#f0e3bf;}.bpChoice.bp-on{background:#c8dc86;border-color:#4f6f12;box-shadow:inset 0 2px 4px rgba(0,0,0,.35);}' +
          // the game's grid is 5 columns of 64px; zoomed out it gets more columns so it still fills the width
          'body.bpSize50 .backpackTabContent{zoom:.5;grid-template-columns:repeat(10,64px);}' +
          'body.bpSize75 .backpackTabContent{zoom:.75;grid-template-columns:repeat(6,64px);}' +
          '.bpChip:hover{background:#f0e3bf;}.bpChip.bpDragging{opacity:.4;}' +
          '.bpToggle{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;' +
          // same look as the game's .custombutton (the paper texture is copied from #bpClearAll at run time, see paintToggleSkin)
          'min-width:26px;height:20px;padding:1px 6px;margin:0 5px 6px 0;vertical-align:middle;cursor:pointer;' +
          'user-select:none;-webkit-user-select:none;font:12px Helvetica,Arial;color:#201703;' +
          'background:#cd9e4b repeat-x;border:1px solid #20170396;border-radius:2px;' +
          'box-shadow:0 0 3px 0 #000;}' +
          '.bpToggle:hover{filter:brightness(1.12);}' +
          // locked items: a small padlock in the corner
          '.backpackItem.bpLocked::after{content:"\\1F512";position:absolute;left:1px;top:1px;font-size:11px;line-height:1;pointer-events:none;' +
          'filter:drop-shadow(0 0 1px #000);}' +
          // the other buttons get the toggles' dark border instead of the game's pale one (green 'on' and red Destroy keep theirs)
          '#backpack_filterToggle,#bpClearAll,#bpSortDir,#bpOrMode,#bpAdvBtn,#backpack-multi-options .custombutton{border:1px solid #20170396;}' +
          // dropdowns and inputs: same dark border and glow
          '.bpDd .bpDdBtn,.bpDd .bpDdList,.bpBuffList,#backpack-multi-options .bpBuffBox input{border:1px solid #20170396;box-shadow:0 0 3px 0 #000;}' +
          '#backpack_filterName,#bpLevelMin,#bpLevelMax{border:1px solid #20170396 !important;box-shadow:0 0 3px 0 #000 !important;}' +
          '#backpack_filterToggle:hover,#bpClearAll:hover,#bpSortDir:hover,#bpOrMode:hover,#bpAdvBtn:hover,#backpack-multi-options .custombutton:hover{filter:brightness(1.12);}' +
          '.bpToggle.bp-on{background:#c8dc86;border-color:#4f6f12;}' +
          '.bpToggle:focus{outline:1px dotted #201703;}' +
          '.bpDia{display:block;width:11px;height:11px;box-sizing:border-box;border:1px solid #1a1208;' +
          'transform:rotate(45deg);}' +
          '.bpRarity{min-width:22px;width:22px;height:20px;padding:0;margin-bottom:6px;}' +
          '.bpRarity .bpDia{width:9px;height:9px;}' +
          // parchment dropdowns: orange paper, dark brown text (the colours of the sidebar)
          '.bpDd{position:relative;display:inline-block;margin:0 6px 4px 0;vertical-align:middle;}' +
          '.bpDdBtn{box-sizing:border-box;min-width:132px;height:24px;padding:0 6px;display:flex;align-items:center;' +
          'justify-content:space-between;gap:6px;cursor:pointer;user-select:none;-webkit-user-select:none;' +
          'background:#e8c88e;border:1px solid #6b5230;border-radius:4px;color:#3b2a14;font:bold 11px Arial,sans-serif;}' +
          '.bpDdBtn:hover,.bpDd.bp-open .bpDdBtn{background:#f0d6a2;border-color:#3b2a14;}' +
          '.bpDdBtn:focus{outline:1px dotted #3b2a14;}' +
          '.bpDdArrow{font-size:9px;opacity:.8;}' +
          '.bpDdList{display:none;position:absolute;left:0;top:100%;margin:2px 0 0;padding:2px;min-width:100%;' +
          'box-sizing:border-box;list-style:none;background:#e8c88e;border:1px solid #6b5230;border-radius:4px;' +
          'z-index:60;box-shadow:0 3px 8px rgba(0,0,0,.4);}' +
          '.bpDd.bp-open .bpDdList{display:block;}' +
          '.bpDdList li{display:flex;align-items:center;height:22px;margin:0;padding:0 6px;cursor:pointer;' +
          'white-space:nowrap;gap:6px;color:#3b2a14;font:bold 11px Arial,sans-serif;}' +
          '.bpDdList li:hover{background:#f3dfb2;}' +
          '.bpDdList li.bp-cur{background:#d9b774;}' +
          '.bpDim{opacity:.75;}' +
          '.bpSw{display:inline-block;flex:none;width:11px;height:11px;box-sizing:border-box;border:1px solid #3b2a14;border-radius:2px;}' +
          '.bpHfRow{display:inline-flex;align-items:center;}' +
          // the bar that shows when items are selected: row 1 count / folder / Move, row 2 Break Down / Destroy / Clear
          '#backpack-multi-options .bpBr{display:block;height:4px;}' +
          '#backpack-multi-options .custombutton{margin:0 2px;}' +
          '#backpack-multi-options .bpBuffBox{margin-right:6px;}' +
          '#backpack-destroy-selected-button{background:linear-gradient(#d98f78,#b0523c) !important;border-color:#7a2a1c !important;' +
          'color:#fff3ea !important;text-shadow:0 1px 0 rgba(60,10,0,.5);}' +
          '#backpack-destroy-selected-button:hover{background:linear-gradient(#e6a08a,#c0604a) !important;}' +
          // the game draws its hellforge diamonds with CSS too (.item-forge-diamond); same look, own class
          '.bpHfDia{display:inline-block;width:9px;height:9px;margin:0 3px;flex:none;transform:rotate(45deg);' +
          'background:conic-gradient(from -45deg,#ff8e36 0deg,#ff8e36 90deg,#cc5212 90deg,#cc5212 180deg,#e8681e 180deg,#e8681e 270deg,#ffa75c 270deg,#ffa75c 360deg);' +
          'box-shadow:0 0 0 1px #000,inset 1px 1px 0 rgba(255,240,210,.3);}' +
          // the game gives the grid a fixed height for 20 items; with another items-per-page it has to grow,
          // or the grid runs over the Components section below it. Game 4.4.4 also sets min-height:434px on #backpack,
          // which left a big empty space under a bag with few items, so the minimum goes too
          '#backpack,#backpackContainer .backpackTab,#backpackContainer ul.backpackItemList{height:auto !important;min-height:0 !important;}' +
        '</style>'
      );
    }

    // Quality: one diamond button per rarity
    const rarBtns = RARITIES.map(
      ([name, color], i) =>
        '<span class="bpToggle bpRarity" role="button" tabindex="0" data-r="' + i + '" title="' + name + '">' +
        '<i class="bpDia" style="background:' + color + ';"></i></span>'
    ).join('');
    const rar = '<span class="bpUnit" data-f="rarity"><span style="margin-right: 4px; vertical-align: middle;">Quality:</span>' + rarBtns + '</span>';
    const btn = (id, key, text, tip) =>
      '<span class="bpToggle bpProp bpUnit" id="' + id + '" data-f="' + key + '" data-p="' + key + '" role="button" tabindex="0" title="' + tip + '">' + text + '</span>';

    // Dropdowns: options are [value, html, tooltip]; the first one means "any".
    const hfIcons = (n) => '<span class="bpHfRow">' + '<i class="bpHfDia"></i>'.repeat(n) + '</span>';
    const HF_OPTIONS = [
      ['', '<span class="bpDim">Hellforge: any</span>', 'Any hellforge level'],
      ['none', 'Not hellforged', 'Not hellforged'],
      ['1', hfIcons(1), 'Hellforge 1/5'],
      ['2', hfIcons(2), 'Hellforge 2/5'],
      ['3', hfIcons(3), 'Hellforge 3/5'],
      ['4', hfIcons(4), 'Hellforge 4/5'],
      ['5', hfIcons(5), 'Fully hellforged'],
    ];
    const CRAFT_OPTIONS = [
      ['', '<span class="bpDim">Craft: any</span>', 'Any craft'],
      ['na', '<span class="bpDim">Not craftable</span>', 'Items that cannot be crafted'],
      ['un', '<i class="bpSw" style="background:' + UNCRAFTED_COLOR + '"></i>Uncrafted', 'Craftable items that were never crafted'],
    ].concat(CRAFT_NAMES.map((n, i) => [String(i), '<i class="bpSw" style="background:' + CRAFT_COLORS[i] + '"></i>' + n, n]));
    const dd = (key, options, unit) =>
      '<div class="bpDd' + (unit ? ' bpUnit' : '') + '" id="bpDd_' + key + '"' + (unit ? ' data-f="' + key + '"' : '') + ' data-value="' + options[0][0] + '">' +
      '<div class="bpDdBtn" tabindex="0" role="button"><span class="bpDdCur">' + options[0][1] + '</span>' +
      '<span class="bpDdArrow">&#9662;</span></div>' +
      '<ul class="bpDdList">' +
      options.map((o, i) => '<li data-value="' + o[0] + '" title="' + o[2] + '"' + (i === 0 ? ' class="bp-cur"' : '') + '>' + o[1] + '</li>').join('') +
      '</ul></div>';

    const ROWS = '<div class="bpRow" data-g="q"></div><div class="bpRow" data-g="p"></div><div class="bpRow" data-g="d"></div>';
    const $ui = $(
      '<div id="bpFilters">' +
        '<div class="bpSortRow">' + dd('sort', SORT_KEYS.map((k, i) => [k[0], i === 0 ? '<span class="bpDim">Sort by: Default</span>' : k[1], i === 0 ? 'Backpack order' : 'Sort by ' + k[1].toLowerCase()]), false) +
        '<input id="bpSortDir" class="custombutton" type="button" value="▴" title="Ascending (click for descending)">' +
        '<input id="bpClearAll" class="custombutton" type="button" value="Clear" title="Clear every filter" style="padding: 3px 6px; margin: 0;"></div>' +
        '<div class="bpLvlRow"><label for="bpLevelMin">Level</label>' +
        '<input id="bpLevelMin" class="custominput" type="text" inputmode="numeric" autocomplete="off" aria-label="Minimum level">' +
        '<span>–</span>' +
        '<input id="bpLevelMax" class="custominput" type="text" inputmode="numeric" autocomplete="off" aria-label="Maximum level">' +
        '<input id="bpOrMode" class="custombutton" type="button" value="Match Any" ' +
        'title="Allow several buttons per group (item type, quality, properties) and show items that match any of them" ' +
        'style="padding: 1px 6px; margin: 0 0 0 auto;">' +
        '<input id="bpAdvBtn" class="custombutton" type="button" value="Advanced ▾" ' +
        'title="Show or hide the advanced filters" style="padding: 1px 6px; margin: 0;"></div>' +
        '<div id="bpAlways">' + ROWS + '</div>' +
        '<div id="bpAdvBox">' + ROWS + '</div>' +
        '<div id="bpPool" style="display: none;">' + rar +
        btn('bpEq', 'eq', 'Equippable', 'Items that can be equipped') +
        btn('bpUse', 'use', 'Usable', 'Usable items (not containers)') +
        btn('bpBox', 'box', 'Container', 'Containers and gift boxes') +
        btn('bpDup', 'dup', 'Duplicates', 'Only items you have two or more of') +
        btn('bpTg', 'tg', 'Guild Tagged', 'Items tagged in the guild store') +
        btn('bpBound', 'bound', 'Bound', 'Bound items only') +
        btn('bpSet', 'set', 'Set', 'Items that belong to a set') +
        dd('hf', HF_OPTIONS, true) + dd('craft', CRAFT_OPTIONS, true) + '</div>' +
      '</div>'
    );
    ensureAllFolders();
    ensureGear();
    // Our rows (sort, level range and the filters) live inside the game's Filters panel, so the Filters button opens and closes
    // them; the game's own rows in there are hidden. The search box stays the game's.
    $('#backpack_filterPanel').append($ui);
    // the toggles borrow the game's button texture, which only exists as a background-image of its own buttons
    const skin = window.getComputedStyle(document.getElementById('bpClearAll')).backgroundImage;
    if (skin && skin !== 'none') $('head').append('<style id="bpSkin">.bpToggle:not(.bp-on),body.bpModernPager #backpackContainer .hcsPaginate_pageLinks a:not(.hcsPaginate_selected){background-image:' + skin + ';}</style>');
    syncSortUI();
    applyLayout();
  }

  // ---------------------------------------------------------------- hunting: break down loot
  // The action list shows a discard X next to loot dropped by a creature. We add a
  // second link next to it that breaks the item down instead of destroying it.
  function initActionList() {
    // Small hammer, drawn as an inline SVG so no image has to be loaded.
    const ICON_SVG =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
      '<line x1="2.6" y1="13.4" x2="9.4" y2="6.6" stroke="#8a5a24" stroke-width="2.6" stroke-linecap="round"/>' +
      '<line x1="2.6" y1="13.4" x2="9.4" y2="6.6" stroke="#d9a35c" stroke-width="1.4" stroke-linecap="round"/>' +
      '<rect x="6" y="2.2" width="9.6" height="5.2" rx="1" transform="rotate(45 10.8 4.8)" ' +
      'fill="#d7dde5" stroke="#4d5662" stroke-width="1"/>' +
      '<line x1="8.4" y1="3.6" x2="12.6" y2="7.8" stroke="#ffffff" stroke-width="0.9" opacity=".8"/>' +
      '</svg>';
    const ICON_URL = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(ICON_SVG) + '")';
    // Green "play" triangle for Use.
    const USE_SVG =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
      '<path d="M4 2.2 L13.4 8 L4 13.8 Z" fill="#6fcf4a" stroke="#2f6b1c" stroke-width="1.2" stroke-linejoin="round"/>' +
      '</svg>';
    const USE_URL = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(USE_SVG) + '")';

    if (!$('#bpFragStyle').length) {
      $('head').append(
        '<style id="bpFragStyle">' +
          // mirrors ".actionList .discard" (11x11, float: left, margin: 4px -11px 0 2px),
          // pushed 13px further right so it sits just after the discard X
          'a.bpFrag{width:11px;height:11px;float:left;display:block;margin:4px -11px 0 15px;' +
          'background:' + ICON_URL + ' center/11px 11px no-repeat;cursor:pointer;}' +
          'a.bpFrag:hover{filter:brightness(1.4);}' +
          'a.bpFrag[data-busy]{opacity:.4;cursor:default;}' +
          'a.bpUse{width:11px;height:11px;float:left;display:block;margin:4px -11px 0 15px;' +
          'background:' + USE_URL + ' center/11px 11px no-repeat;cursor:pointer;}' +
          'a.bpUse:hover{filter:brightness(1.4);}' +
          'a.bpUse[data-busy]{opacity:.4;cursor:default;}' +
          '.bpFragDone{color:#9fdc6b;}' +
        '</style>'
      );
    }

    function decorate() {
      $('#actionList a.discard').each(function () {
        const $d = $(this);
        const id = $d.attr('data-invid');
        if (!id) return;
        const $mine = $d.next('.bpFrag');
        if ($mine.length) {
          // list reused with a new item
          if ($mine.attr('data-invid') !== id) $mine.attr('data-invid', id).next('.bpUse').attr('data-invid', id);
          return;
        }
        $d.after(
          '<a href="#" class="bpFrag tip-static" data-tipped="Break down?" data-invid="' + esc(id) + '"></a>' +
          '<a href="#" class="bpUse tip-static" data-tipped="Use?" data-invid="' + esc(id) + '"></a>'
        );
      });
    }

    // Using an item is a normal page load in the game (index.php?cmd=profile&subcmd=useitem&inventory_id=<id>).
    // Fetch it in the background and show what the game says in a pop-up instead of leaving the hunt.
    function readUseResult(html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
      const root = doc.querySelector('#pCC') || doc.body;
      // the game puts its answer in <center id="info-msg"> inside an INFORMATION box
      const box = doc.getElementById('info-msg') || root.querySelector('.notice, .message, .info, .error');
      const text = ((box || root).innerText || (box || root).textContent || '').replace(/\n{3,}/g, '\n\n').trim();
      return text.slice(0, 600);
    }
    function requestUse(id) {
      return fetch(withFst('/index.php?cmd=profile&subcmd=useitem&inventory_id=' + encodeURIComponent(id)), { credentials: 'same-origin' })
        .then((r) => r.text())
        .then(readUseResult);
    }

    // Capture phase, so the game's own handlers on the list never see this click.
    document.addEventListener(
      'click',
      (e) => {
        const u = e.target && typeof e.target.closest === 'function' ? e.target.closest('a.bpUse') : null;
        if (u) {
          e.preventDefault();
          e.stopPropagation();
          if (u.hasAttribute('data-busy')) return;
          u.setAttribute('data-busy', '1');
          try { removeTooltips(); } catch (err) { /* game helper may be missing */ }
          const $drop = $(u).closest('.drop');
          requestUse(u.getAttribute('data-invid')).then(
            (text) => {
              $drop.html('<span class="bpFragDone">Used.</span>');
              showInfo(esc(text || 'Item used.').replace(/\n/g, '<br>'), 'Item used');
            },
            () => {
              u.removeAttribute('data-busy');
              showInfo('The item could not be used. Please try again.');
            }
          );
          return;
        }
        const a = e.target && typeof e.target.closest === 'function' ? e.target.closest('a.bpFrag') : null;
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        if (a.hasAttribute('data-busy')) return;
        a.setAttribute('data-busy', '1');
        try { removeTooltips(); } catch (err) { /* game helper may be missing */ }
        const $drop = $(a).closest('.drop');
        requestFrag([a.getAttribute('data-invid')]).then((res) => {
          if (res && res.r == 1) {
            a.removeAttribute('data-busy');
            showInfo((res && res.m) || 'This item could not be broken down.');
            return;
          }
          adjustInventoryCount(1);
          const msg = res && res.m ? $('<div>').html(res.m).text() : 'Broken down.';
          $drop.html('<span class="bpFragDone">' + esc(msg) + '</span>');
        });
      },
      true
    );

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; decorate(); });
    };

    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      const box = document.getElementById('actionContainer');
      if (box) {
        clearInterval(wait);
        decorate();
        // the game rebuilds the list after every action, so keep decorating
        new MutationObserver(schedule).observe(box, { childList: true, subtree: true });
      } else if (tries > 60) {
        clearInterval(wait);
      }
    }, 500);
  }
  initActionList();

  // ---------------------------------------------------------------- searchable select
  // The real select stays in the page, hidden, so forms and the game's own code work as before; a search box with a
  // filtered list in front of it sets its value (used by the buff market and the backpack's "move to folder").
  function ensureSearchStyle() {
    if (!$('#bpBuffStyle').length) {
      $('head').append(
        '<style id="bpBuffStyle">' +
          'select.bpBuffNative{display:none !important;}' +
          'select.bpBuffNative.bpKeep{display:inline-block !important;position:absolute !important;width:1px !important;height:1px !important;opacity:0 !important;pointer-events:none !important;}' +
          '.bpBuffBox{position:relative;display:inline-block;vertical-align:middle;}' +
          '.bpBuffBox input{width:136px;box-sizing:border-box;}' +
          '.bpBuffList{display:none;position:absolute;left:0;top:100%;z-index:1000;min-width:100%;max-height:220px;overflow-y:auto;' +
          'margin:0;padding:0;list-style:none;white-space:nowrap;text-align:left;font:12px Helvetica,Arial;' +
          'background:#e8c88e;border:1px solid #6b5230;border-radius:4px;box-shadow:0 3px 8px rgba(0,0,0,.4);}' +
          '.bpBuffList li{padding:2px 6px;cursor:pointer;color:#3b2a14;}' +
          '.bpBuffList li.bpBuffActive{background:#d9b774;}' +
          '#backpack-multi-options .bpBuffBox input{width:120px;height:18px;box-sizing:border-box;padding:0 6px;border:1px solid #6b5230;border-radius:4px;' +
          'background:#e8c88e;color:#3b2a14;font:bold 11px Arial,sans-serif;}' +
          '#backpack-multi-options .bpBuffBox input::placeholder{color:#7a6a50;}' +
          '#backpack-multi-options .bpBuffList{font:bold 11px Arial,sans-serif;}' +
          '.bpBuffList li.bpBuffCur{font-weight:bold;}' +
          '.bpBuffList li.bpBuffNone{cursor:default;color:#7a6a50;}' +
          // the Auction House filters: the look of the backpack's dropdowns (orange paper, bold dark brown text, dark border with a glow)
          // and a colour swatch in front of the options that have a colour (a square for craft, a diamond for rarity)
          '.bpBuffBox.bpAh{display:block;}' +
          '.bpBuffBox.bpAh input{height:22px;padding:0 6px;border:1px solid #20170396;border-radius:4px;background:#e8c88e;color:#3b2a14;' +
          'font:bold 11px Arial,sans-serif;box-shadow:0 0 3px 0 #000;}' +
          '.bpBuffBox.bpAh input:hover,.bpBuffBox.bpAh input:focus{background:#f0d6a2;border-color:#3b2a14;outline:none;}' +
          '.bpBuffBox.bpAh input::placeholder{color:#7a6a50;}' +
          '.bpBuffBox.bpAh.bpHasSw input{padding-left:24px;}' +
          '.bpBuffBox.bpAh .bpBuffList{margin-top:2px;padding:2px;border:1px solid #20170396;box-shadow:0 3px 8px rgba(0,0,0,.4);font:bold 11px Arial,sans-serif;}' +
          '.bpBuffBox.bpAh .bpBuffList li{display:flex;align-items:center;gap:6px;height:22px;padding:0 6px;color:#3b2a14;}' +
          '.bpBuffBox.bpAh .bpBuffList li:hover{background:#f3dfb2;}' +
          '.bpBuffBox.bpAh .bpBuffList li.bpBuffActive{background:#d9b774;}' +
          '.bpBuffBox.bpAh .bpBuffList li.bpBuffNone{color:#7a6a50;}' +
          '.bpAhSw{display:inline-block;flex:none;width:11px;height:11px;box-sizing:border-box;border:1px solid #3b2a14;border-radius:2px;}' +
          '.bpAhDia{display:inline-block;flex:none;width:9px;height:9px;margin:1px;box-sizing:border-box;border:1px solid #1a1208;transform:rotate(45deg);}' +
          '.bpAhNone{visibility:hidden;}' +
          // a small down arrow at the right end of the closed box, and a scrollbar in the paper colours
          '.bpBuffBox.bpAh{position:relative;}' +
          '.bpBuffBox.bpAh input{padding-right:20px;text-overflow:ellipsis;}' +
          '.bpBuffBox.bpAh::after{content:"";position:absolute;right:7px;top:9px;border:4px solid transparent;border-top:5px solid #3b2a14;border-bottom:0;pointer-events:none;}' +
          '.bpBuffBox.bpAh .bpBuffList::-webkit-scrollbar{width:9px;}' +
          '.bpBuffBox.bpAh .bpBuffList::-webkit-scrollbar-track{background:#d9b774;border-radius:4px;box-shadow:inset 0 0 2px #20170399;}' +
          '.bpBuffBox.bpAh .bpBuffList::-webkit-scrollbar-thumb{background:#8a6a38;border:1px solid #20170396;border-radius:4px;}' +
          '.bpBuffBox.bpAh .bpBuffList::-webkit-scrollbar-thumb:hover{background:#6b5230;}' +
          '.bpBuffBox .bpBoxSw{position:absolute;left:7px;top:50%;margin-top:-6px;pointer-events:none;}' +
        '</style>'
      );
    }

    }

  // opts.look: the backpack dropdowns' look (the Auction House); opts.matchWidth: the box is as wide as the select was;
  // opts.swatch(value, text) -> { color, shape: 'square' | 'diamond' } or null: a colour mark in front of the option
  function searchSelect(select, placeholder, noMatch, opts) {
    ensureSearchStyle();
    if (select.bpSearchDone) return;
    select.bpSearchDone = true;
    opts = opts || {};
    const width = opts.matchWidth ? select.offsetWidth : 0;
    // a cloned row can carry a copy of an earlier box (without handlers): start clean
    $(select).siblings('.bpBuffBox').remove();

    // read live: the game rebuilds the folder list now and then
    const readOpts = () => Array.from(select.options).map((o) => ({ value: o.value, text: o.text, lower: norm(o.text), sw: opts.swatch ? opts.swatch(o.value, o.text) : null }));
    const $box = $(
      '<span class="bpBuffBox"><input type="text" class="custominput" autocomplete="off" spellcheck="false" placeholder="' + esc(placeholder) + '">' +
      '<ul class="bpBuffList"></ul></span>'
    ).insertAfter(select);
    const $in = $box.find('input');
    const $list = $box.find('ul');
    if (width) $in.css('width', width + 'px');
    if (opts.look) $box.addClass('bpAh');
    select.classList.add('bpBuffNative');
    // The Auction House reads only the filters that are :visible (it skips what has no size), so there the real select stays
    // in the layout, 1px big and invisible, instead of display:none.
    if (opts.look) { select.classList.add('bpKeep'); select.tabIndex = -1; }

    let shown = [];
    let active = 0;
    let open = false;
    const curText = () => (select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '');
    const swHtml = (sw, extra) => (sw
      ? '<i class="' + (sw.shape === 'diamond' ? 'bpAhDia' : 'bpAhSw') + (extra ? ' ' + extra : '') + '" style="background:' + sw.color + '"></i>'
      : '<i class="bpAhSw bpAhNone"></i>'); // no mark: the same room, so that the names line up
    const paintBox = () => { // the box shows the mark of the chosen option
      if (!opts.swatch) return;
      const sw = opts.swatch(select.value, curText());
      $box.children('.bpBoxSw').remove();
      $box.toggleClass('bpHasSw', !!sw);
      if (sw) $box.prepend(swHtml(sw, 'bpBoxSw'));
    };

    function paint() {
      $list.html(
        shown.length
          ? shown.map((o, i) =>
              '<li data-i="' + i + '" class="' + (i === active ? 'bpBuffActive ' : '') + (o.value === select.value ? 'bpBuffCur' : '') + '"' + '>' + (opts.swatch ? swHtml(o.sw) : '') + esc(o.text) + '</li>'
            ).join('')
          : '<li class="bpBuffNone">' + esc(noMatch) + '</li>'
      );
      const li = $list.children('.bpBuffActive')[0];
      if (li) li.scrollIntoView({ block: 'nearest' });
    }
    function show(query) {
      const words = norm(query).split(/\s+/).filter(Boolean);
      shown = readOpts().filter((o) => words.every((w) => o.lower.includes(w)));
      const cur = shown.findIndex((o) => o.value === select.value);
      active = cur >= 0 ? cur : 0;
      open = true;
      $list.show();
      paint();
    }
    function hide() {
      open = false;
      $list.hide();
      $in.val(curText());
      paintBox();
    }
    function pick(i) {
      const o = shown[i];
      if (!o) return;
      if (select.value !== o.value) {
        select.value = o.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      hide();
      $in.trigger('blur');
    }
    function move(step) {
      if (!shown.length) return;
      active = (active + step + shown.length) % shown.length;
      paint();
    }

    $in.val(curText());
    paintBox();
    // the page sets the selects without a change event (Clear Filters, a saved filter): the box follows
    if (opts.look) {
      let last = select.selectedIndex;
      const timer = setInterval(() => {
        if (!select.isConnected) { clearInterval(timer); return; }
        if (open || select.selectedIndex === last) return;
        last = select.selectedIndex;
        $in.val(curText());
        paintBox();
      }, 250);
      $(select).on('change', () => { last = select.selectedIndex; });
    }
    // a click on the box of an open list closes it (a toggle); the mousedown comes before the focus, so it sees the state before it
    let wasOpen = false;
    $in.on('mousedown', () => { wasOpen = open; });
    $in.on('focus click', function (e) {
      if (e.type === 'click' && wasOpen) { wasOpen = false; hide(); return; }
      if (open) return;
      this.select();
      show(''); // the whole list first, so it can still be browsed like the original select
    });
    $in.on('input', function () { show($in.val()); });
    $in.on('blur', hide);
    $in.on('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) show('');
        else move(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' && open) {
        e.preventDefault(); // do not submit the search while picking
        pick(active);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        hide();
      }
    });
    $list.on('mousedown', 'li[data-i]', function (e) {
      e.preventDefault(); // keep the focus in the box until the pick is made
      pick(parseInt($(this).attr('data-i'), 10));
    });
    $list.on('mousemove', 'li[data-i]', function () {
      const i = parseInt($(this).attr('data-i'), 10);
      if (i === active) return;
      $list.children('.bpBuffActive').removeClass('bpBuffActive');
      $(this).addClass('bpBuffActive');
      active = i;
    });
    // something else changed the select (the game, or a restored form): follow it
    $(select).on('change', () => { if (!open) { $in.val(curText()); paintBox(); } });
  }

  // ---------------------------------------------------------------- buff market: searchable buff select
  // The Buff Market search form has a 140-option select per buff row (buff_type_0, _1, ...; "Add Buff"
  // clones the row). The real select stays in the page, hidden, so the form and the game's own code
  // work as before; a search box with a filtered list in front of it sets its value.
  function initBuffMarket() {
    const SEL = 'select[name^="buff_type_"]';
    const $first = $(SEL).first();
    if (!$first.length) return;
    ensureSearchStyle();

    const run = () => $(SEL).each(function () { searchSelect(this, 'Search buff...', 'No buff matches'); });
    run();
    // "Add Buff" clones the row; watch the form's table so every new select gets its own box
    const host = $first.closest('table')[0] || document.body;
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; run(); });
    }).observe(host, { childList: true, subtree: true });
  }
  initBuffMarket();

  // ---------------------------------------------------------------- auction house: searchable, colour-coded filters
  // Every filter select of the Auction House gets a search box (the real selects stay, hidden, so the page's own search works as
  // before), in the look of the backpack's dropdowns. Item rarity gets the colour diamonds of the backpack's quality buttons, Minimum
  // Craft the colour squares of its craft filter.
  function initAuctionHouse() {
    if (!/[?&]cmd=auctionhouse(&|$)/.test(location.search)) return;
    const $rarity = $('select[name="rarity_filter"]');
    if (!$rarity.length) return;
    // the same colours as the backpack's quality diamonds and craft marks
    const swatches = {
      rarity_filter: (v) => (RARITIES[parseInt(v, 10)] ? { color: RARITIES[parseInt(v, 10)][1], shape: 'diamond' } : null),
      min_craft: (v) => (CRAFT_COLORS[parseInt(v, 10)] ? { color: CRAFT_COLORS[parseInt(v, 10)], shape: 'square' } : null),
    };
    // the smallest element that holds all the filters (the item type select is not in the same table as the others)
    const host = $rarity.parents().has('select[name="item_type"]').first()[0] || $rarity.closest('table')[0] || document.body;
    const run = () => $(host).find('select[name]').each(function () {
      if ($(this).closest('#bpAjPop').length) return; // not the one of another script
      searchSelect(this, 'Search...', 'No match', { matchWidth: true, look: true, swatch: swatches[this.name] });
    });
    run();
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; run(); });
    }).observe(host, { childList: true, subtree: true });
  }
  initAuctionHouse();

  // ---------------------------------------------------------------- backpack pop-up
  // The backpack icon in the info bar at the top leads to the game's small "manage" page. Here it opens the real backpack, the one
  // from the profile page, in a pop-up: the profile page is loaded in a frame and everything but the backpack is hidden, so it
  // is the same backpack with all of our tools (and the helper's buttons) instead of a copy that could drift.
  function initBackpackPopup() {
    if (window.top !== window.self) return; // this is the frame of the pop-up itself
    const FRAME_CSS =
      '.bpPopHide{display:none !important;}' +
      'html,body{margin:0 !important;padding:0 !important;min-width:0 !important;width:auto !important;height:auto !important;' +
      'background:#d6b277 !important;overflow-x:hidden;}' +
      '.bpPopKeep{margin:0 !important;padding:0 !important;float:none !important;width:auto !important;min-width:0 !important;' +
      'max-width:none !important;background:none !important;border:0 !important;position:static !important;}' +
      '.bpPopKeep > .innerColumnHeader{width:auto !important;}' +
      // the gap goes on the page's container (not on the right column, whose padding lets the parchment image show through)
      'html body #profileContainer{padding:6px 6px !important;background-color:#d6b277 !important;}' +
      // the folder strip and the type icons sit on a dark patch in the page's own layout
      '#backpackFolders,#backpack_tabs,#backpack_tabs ul{background:#d6b277 !important;}' +
      '.bpPopHdr{display:none !important;}' +
      'html::-webkit-scrollbar{width:12px;height:12px;}' +
      'html::-webkit-scrollbar-track{background:#c9a869;box-shadow:inset 1px 0 3px #20170366;}' +
      'html::-webkit-scrollbar-thumb{background:#e9d3a0;border:1px solid #20170396;border-radius:3px;box-shadow:0 0 3px 0 #000;}' +
      'html::-webkit-scrollbar-thumb:hover{background:#f3e2b8;}' +
      'html::-webkit-scrollbar-corner{background:#c9a869;}' +

      // a tooltip is squeezed into the narrow frame and can end up under the pointer: it would take the hover, close, open again, and so on
      '.qtip{pointer-events:none !important;}' +
      // as many 64px columns as fit (the game's grid is a fixed 5)
      '#backpackContainer .backpackTabContent{grid-template-columns:repeat(auto-fill,64px) !important;}';
    const STALE_MS = 30 * 1000; // a frame that has been closed for longer is reloaded when it is opened again
    let loadedAt = 0; // when the frame last loaded, or was last closed
    let docOf = () => document; // the document the backpack lives in: this page (on the profile page) or the frame's
    let restore = null; // on the profile page: puts the page's own backpack back where it was

    // dialogs and tooltips (jQuery UI, qTip, the helper) wait hidden in the page and are shown by the game when needed: they must not be
    // tagged, or their own show() loses against the !important
    function keepAlive(doc, el) {
      const view = doc.defaultView;
      if (/ui-dialog|ui-widget|qtip|tipped|dialog|tooltip|helper-menu/i.test(el.id + ' ' + el.className)) return true;
      return view.getComputedStyle(el).display === 'none';
    }
    // the backpack header, the folder strip and the bag, in page order
    // found by what they contain, not by position: the helper may add elements around them
    function backpackParts(doc) {
      const bag = doc.getElementById('backpackContainer');
      const sibling = (el) => { // the child of the bag's parent that holds el
        let n = el;
        while (n && n.parentElement !== bag.parentElement) n = n.parentElement;
        return n;
      };
      const parts = [bag];
      const folders = sibling(doc.getElementById('backpackFolders'));
      const header = sibling(doc.getElementById('backpack_current'));
      if (folders && folders !== bag) parts.unshift(folders);
      if (header && header !== bag && header !== folders) parts.unshift(header);
      return parts;
    }
    // in the frame: keep the backpack and hide everything else on the way up to the page
    function prepareFrame(doc) {
      const bag = doc.getElementById('backpackContainer');
      if (!bag || doc.getElementById('bpPopCss')) return !!bag;
      const style = doc.createElement('style');
      style.id = 'bpPopCss';
      style.textContent = FRAME_CSS;
      doc.head.appendChild(style);
      // Esc closes the pop-up also when the focus is in the frame (unless a game dialog is open: that one closes first)
      doc.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || doc.querySelector('.ui-dialog:not([style*="display: none"])')) return;
        hide();
      });
      const keep = new Set(backpackParts(doc));
      keep.forEach((el) => { if (el.classList.contains('innerColumnHeader')) el.classList.add('bpPopHdr'); });
      let node = bag;
      while (node.parentElement && node !== doc.body) {
        const parent = node.parentElement;
        Array.from(parent.children).forEach((sib) => {
          if (sib !== node && !keep.has(sib) && !/^(SCRIPT|STYLE|LINK)$/.test(sib.tagName) && !keepAlive(doc, sib)) sib.classList.add('bpPopHide');
        });
        parent.classList.add('bpPopKeep');
        keep.clear(); // only the first level keeps neighbours
        node = parent;
      }
      return true;
    }

    function ensureStyle() {
      if ($('#bpPopStyle').length) return;
      $('head').append(
        '<style id="bpPopStyle">' +
          '#bpPopup{position:fixed;inset:0;z-index:99990;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);}' +
          '#bpPopup.bpPopOpen{display:flex;}' +
          '#bpPopup .bpPopBox{width:760px;max-width:96vw;height:88vh;display:flex;flex-direction:column;background:#d6b277;' +
          'border:1px solid #20170396;border-radius:4px;box-shadow:0 0 12px #000;overflow:hidden;}' +
          '#bpPopup .bpPopBar{cursor:move;touch-action:none;user-select:none;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:#3b2a14;' +
          'color:#f2ecdf;font:bold 13px Arial,sans-serif;}' +
          '#bpPopup .bpPopTools{display:flex;align-items:center;gap:10px;}' +
          '#bpPopup .bpPopTools{cursor:default;}' +
          '#bpPopup .bpPopTools a{cursor:pointer;font-weight:normal;color:#f2ecdf;text-decoration:underline;}' +
          '#bpPopup .bpPopTools [data-act]:hover{color:#fff;}' +
          '#bpPopup .bpPopTools span[data-act]{cursor:pointer;font-size:16px;}' +
          '#bpPopup .bpPopX{cursor:pointer;font-size:18px;line-height:1;padding:0 4px;}' +
          '#bpPopup .bpPopX:hover{color:#fff;}' +
          '#bpPopup .bpPopBody{position:relative;flex:1;min-height:0;}' +
          '#bpPopup .bpPopLoad{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#3b2a14;font:12px Arial;}' +
          '#bpPopup iframe{position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;transition:opacity .15s;}' +
          '#bpPopup iframe.bpPopReady{opacity:1;}' +
          // on the profile page the page's own backpack is moved in here
          '#bpPopup .bpPopInline{position:absolute;inset:0;overflow:auto;padding:6px 8px;box-sizing:border-box;background:#d6b277;}' +
          '#bpPopup .bpPopInline .innerColumnHeader{display:none;}' +
          '#bpPopup .bpPopInline::-webkit-scrollbar{width:12px;height:12px;}' +
          '#bpPopup .bpPopInline::-webkit-scrollbar-track{background:#c9a869;box-shadow:inset 1px 0 3px #20170366;}' +
          '#bpPopup .bpPopInline::-webkit-scrollbar-thumb{background:#e9d3a0;border:1px solid #20170396;border-radius:3px;box-shadow:0 0 3px 0 #000;}' +
          '#bpPopup .bpPopInline::-webkit-scrollbar-thumb:hover{background:#f3e2b8;}' +
          '#bpPopup .bpPopInline::-webkit-scrollbar-corner{background:#c9a869;}' +

          '#bpPopup .bpPopInline > *{background:#d6b277 !important;}' +
          '#bpPopup .bpPopInline #backpackFolders,#bpPopup .bpPopInline #backpack_tabs,#bpPopup .bpPopInline #backpack_tabs ul{background:#d6b277 !important;}' +
          '#bpPopup .bpPopInline .backpackTabContent{grid-template-columns:repeat(auto-fill,64px) !important;}' +
          // the game's dialogs (settings, confirm boxes) and tooltips have to show above the pop-up
          'html[data-bp-ov] .ui-dialog{z-index:100000 !important;}html[data-bp-ov] .ui-widget-overlay{z-index:99995 !important;}' +
          'html[data-bp-ov] .qtip{z-index:100001 !important;}' +
        '</style>'
      );
    }
    // the shell: title bar with the buttons of the page's own backpack header, and the area for the backpack
    function buildShell(body) {
      ensureStyle();
      const $pop = $(
        '<div id="bpPopup"><div class="bpPopBox"><div class="bpPopBar"><span class="bpPopTitle">Backpack</span>' +
        '<span class="bpPopTools"><a data-act="folders">Folders</a><a data-act="manage">Manage</a>' +
        '<span data-act="refresh" title="Refresh bag">↻</span><span data-act="gear" title="Toolkit settings">⚙</span>' +
        '<span class="bpPopX" role="button" title="Close">×</span></span></div>' +
        '<div class="bpPopBody">' + body + '</div></div></div>'
      ).appendTo('body');
      $pop.on('mousedown', (e) => { if (e.target === $pop[0]) hide(); });
      $pop.find('.bpPopX').on('click', hide);
      // the title bar is the handle: the box follows the pointer (the offset from the centre is kept for the next time)
      const box = $pop.find('.bpPopBox')[0];
      const place = (x, y) => { // keep a good part of the title bar on screen
        const r = box.getBoundingClientRect();
        const cx = Math.min(Math.max(x, -(window.innerWidth - r.width) / 2 - r.width + 80), (window.innerWidth + r.width) / 2 - 80);
        const cy = Math.min(Math.max(y, -(window.innerHeight - r.height) / 2), (window.innerHeight + r.height) / 2 - 30);
        box.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
        return [cx, cy];
      };
      try { const p = JSON.parse(recall('popPos')); if (p) place(p[0], p[1]); } catch (e) { /* centred */ }
      let grab = null;
      const bar = $pop.find('.bpPopBar')[0];
      bar.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.bpPopTools')) return;
        const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(box.style.transform) || [0, 0, 0];
        grab = { x: e.clientX, y: e.clientY, ox: +m[1], oy: +m[2] };
        bar.setPointerCapture(e.pointerId);
        $pop.find('iframe').css('pointer-events', 'none');
      });
      bar.addEventListener('pointermove', (e) => { if (grab) place(grab.ox + e.clientX - grab.x, grab.oy + e.clientY - grab.y); });
      const drop = () => {
        if (!grab) return;
        grab = null;
        $pop.find('iframe').css('pointer-events', '');
        const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(box.style.transform);
        if (m) remember('popPos', JSON.stringify([+m[1], +m[2]]));
      };
      bar.addEventListener('pointerup', drop);
      bar.addEventListener('pointercancel', drop);
      // the title bar stands in for the page's own backpack header, whose buttons are clicked through
      $pop.find('.bpPopTools').on('click', '[data-act]', function () {
        const doc = docOf();
        const act = this.getAttribute('data-act');
        const link = (label) => Array.from(doc.querySelectorAll('.innerColumnHeader a')).filter((a) => a.textContent.trim() === label)[0];
        if (act === 'refresh') { const b = doc.getElementById('bpRefreshBtn'); if (b) b.click(); }
        else if (act === 'gear') { const b = doc.getElementById('bpSettingsBtn'); if (b) b.click(); }
        else { const a = link(act === 'folders' ? 'Folders' : 'Manage'); if (a) window.location.href = a.href; }
      });
      const sync = setInterval(() => { // "Backpack (39/45)"
        if (!$pop.parent().length) { clearInterval(sync); return; }
        try {
          const doc = docOf();
          const cur = doc.getElementById('backpack_current');
          const max = doc.getElementById('guildStore_max');
          if (cur && max) $pop.find('.bpPopTitle').text('Backpack (' + cur.textContent.trim() + '/' + max.textContent.trim() + ')');
        } catch (err) { /* the frame is loading */ }
      }, 700);
      return $pop;
    }
    function lockPage() {
      document.documentElement.setAttribute('data-bp-ov', document.documentElement.style.overflow || '');
      document.documentElement.style.overflow = 'hidden';
      $(document).on('keydown.bpPop', (e) => { if (e.key === 'Escape') hide(); });
    }

    // on the profile page the backpack is already there: it is moved into the pop-up and put back when that closes
    function showInline() {
      const parts = backpackParts(document);
      const holders = parts.map((el) => {
        const mark = document.createComment('bpPop');
        el.parentNode.insertBefore(mark, el);
        return mark;
      });
      const $pop = buildShell('<div class="bpPopInline"></div>');
      const inline = $pop.find('.bpPopInline')[0];
      parts.forEach((el) => inline.appendChild(el));
      restore = () => {
        parts.forEach((el, i) => {
          holders[i].parentNode.insertBefore(el, holders[i]);
          holders[i].remove();
        });
        $pop.remove();
        restore = null;
      };
      docOf = () => document;
      lockPage();
      $pop.addClass('bpPopOpen');
    }

    // on any other page the profile page is loaded in a frame, built once and then only hidden
    function load() {
      const $pop = $('#bpPopup');
      const frame = $pop.find('iframe')[0];
      frame.classList.remove('bpPopReady');
      if (!$pop.find('.bpPopLoad').length) $pop.find('.bpPopBody').prepend('<div class="bpPopLoad">Loading backpack...</div>');
      loadedAt = Date.now();
      frame.src = withFst('/index.php?cmd=profile');
    }
    function build() {
      if ($('#bpPopup').length) return;
      const $pop = buildShell('<iframe name="bpBackpackPopup"></iframe>');
      const frame = $pop.find('iframe')[0];
      docOf = () => frame.contentDocument;
      frame.addEventListener('load', () => {
        let tries = 0;
        // the page, the helper and our own script need a moment to build the backpack inside the frame
        const wait = setInterval(() => {
          tries++;
          let ok = false;
          try {
            const w = frame.contentWindow;
            const bag = w.jQuery && w.jQuery('#backpackContainer').data('hcs-backpack');
            if (bag && prepareFrame(frame.contentDocument) && bag.srcData && bag.srcData.length) {
              if (!frame.contentDocument.querySelector('.backpackItem')) bag._showPage(-1, bag.page || 0);
              ok = true;
            }
          } catch (err) { /* the frame is still loading */ }
          if (ok || tries > 80) {
            clearInterval(wait);
            frame.classList.add('bpPopReady');
            $pop.find('.bpPopLoad').remove();
          }
        }, 150);
      });
      load();
    }
    function show() {
      if (document.getElementById('backpackContainer')) { // this is the profile page
        if (!restore) showInline();
        return;
      }
      build();
      const $pop = $('#bpPopup');
      if ($pop.hasClass('bpPopOpen')) return;
      if (Date.now() - loadedAt > STALE_MS) load(); // the bag may have changed since
      lockPage();
      $pop.addClass('bpPopOpen');
    }
    function hide() {
      if (restore) restore();
      else $('#bpPopup').removeClass('bpPopOpen');
      loadedAt = Date.now(); // the frame is as fresh as the moment it was last looked at
      document.documentElement.style.overflow = document.documentElement.getAttribute('data-bp-ov') || '';
      document.documentElement.removeAttribute('data-bp-ov');
      $(document).off('keydown.bpPop');
    }

    document.addEventListener('click', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // let new-tab clicks through
      const hit = e.target.closest && e.target.closest('#statbar-inventory');
      if (!hit) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      show();
    }, true);
    // start loading while the pointer is on the icon, so the pop-up is ready (or nearly) by the time it is clicked
    document.addEventListener('mouseover', (e) => {
      if (!document.getElementById('backpackContainer') && e.target.closest && e.target.closest('#statbar-inventory')) build();
    }, true);
  }
  initBackpackPopup();

  // ---------------------------------------------------------------- sidebars: draggable widgets
  // The widgets of the right sidebar (FS Box, News, Guild, ...) can be dragged by their title to
  // another place in that sidebar or into the left one (under the menu). The menu itself stays put.
  // The layout is saved by widget title; boxes that are not in it stay where the game put them.
  function initSidebarWidgets() {
    const L = document.getElementById('pCL');
    const R = document.getElementById('pCR');
    const C = document.getElementById('pCC');
    if (!L || !R || !C) return;

    const keyOf = (box) => {
      const h = box.querySelector(':scope > h3');
      return h ? h.textContent.trim() : '';
    };
    const boxesIn = (col) => Array.from(col.children).filter((el) => el.classList.contains('minibox') && keyOf(el));
    const loadLayout = () => {
      try {
        const o = JSON.parse(recall('sidebar'));
        if (o && Array.isArray(o.left) && Array.isArray(o.right)) return o;
      } catch (e) { /* no saved layout */ }
      return null;
    };
    function saveLayout() {
      const prev = loadLayout() || { left: [], right: [] };
      const left = boxesIn(L).map(keyOf);
      const right = boxesIn(R).map(keyOf);
      const here = new Set(left.concat(right));
      // widgets that are not on this page keep their side
      prev.left.forEach((k) => { if (!here.has(k)) left.push(k); });
      prev.right.forEach((k) => { if (!here.has(k)) right.push(k); });
      remember('sidebar', JSON.stringify({ left, right }));
    }

    // Some of the game's rules are written for "#pCR ..." only (links, guild icons, ...): copy them
    // for widgets that sit in the left sidebar. Rules that style the column itself are skipped.
    function mirrorColumnStyles() {
      const out = [];
      for (const sheet of document.styleSheets) {
        if (sheet.ownerNode && sheet.ownerNode.id === 'bpMirrorStyle') continue;
        let rules;
        try { rules = Array.from(sheet.cssRules); } catch (e) { continue; } // other origin
        for (const r of rules) {
          if (r.type !== 1 || !r.selectorText || r.selectorText.indexOf('#pCR') === -1) continue;
          const parts = r.selectorText.split(',').map((s) => s.trim()).filter((s) => /^#pCR\s+\S/.test(s));
          if (!parts.length) continue;
          // for the left column, and for the copy of a widget that follows the cursor while dragging
          const sel = parts.map((s) => s.replace('#pCR', '#pCL .minibox')).concat(parts.map((s) => s.replace('#pCR', '#bpSideGhost .minibox')));
          out.push(sel.join(',') + '{' + r.style.cssText + '}');
        }
      }
      // our own style element: rules inserted into the game's sheets are lost when the helper rewrites them
      let el = document.getElementById('bpMirrorStyle');
      if (!el) { el = document.createElement('style'); el.id = 'bpMirrorStyle'; document.head.appendChild(el); }
      const css = out.join(' ');
      if (el.textContent !== css) el.textContent = css;
    }

    // Puts the boxes where the saved layout says; does nothing when they are already there.
    function applyLayout() {
      const lay = loadLayout();
      if (!lay) return;
      const inL = boxesIn(L);
      const inR = boxesIn(R);
      const byKey = new Map();
      inL.concat(inR).forEach((b) => { if (!byKey.has(keyOf(b))) byKey.set(keyOf(b), b); });
      const saved = new Set(lay.left.concat(lay.right));
      const pick = (keys, unsaved) =>
        keys.filter((k) => byKey.has(k)).map((k) => byKey.get(k))
          .concat(unsaved.filter((b) => !saved.has(keyOf(b))));
      const wantL = pick(lay.left, inL);
      const wantR = pick(lay.right, inR);
      const same = (a, b) => a.length === b.length && a.every((el, i) => el === b[i]);
      if (!same(wantL, inL)) wantL.forEach((b) => L.appendChild(b));
      if (!same(wantR, inR)) wantR.forEach((b) => R.appendChild(b));
    }

    if (!$('#bpSideStyle').length) {
      $('head').append(
        '<style id="bpSideStyle">' +
          '.minibox > h3{cursor:grab;touch-action:none;}' +
          'body.bpSideDrag, body.bpSideDrag *{cursor:grabbing !important;user-select:none !important;}' +
          '.minibox.bpSideDragging{opacity:.35;}' +
          // a see-through copy of the widget; very tall ones are cut off and fade out
          // (the dark panel behind a widget belongs to the column, so the copy brings its own)
          '#bpSideGhost{position:fixed;z-index:10000;pointer-events:none;opacity:.85;max-height:240px;overflow:hidden;' +
          'background:#241a10;box-shadow:0 4px 12px rgba(0,0,0,.6);}' +
          '#bpSideGhost.bpSideCut{-webkit-mask-image:linear-gradient(#000 70%,transparent);mask-image:linear-gradient(#000 70%,transparent);}' +
          '#bpSideGhost .minibox{margin:0;opacity:1;}' +
          '#bpSideLine{position:fixed;z-index:10000;height:3px;background:#d9b774;box-shadow:0 0 4px #d9b774;pointer-events:none;}' +
        '</style>'
      );
    }
    mirrorColumnStyles();
    applyLayout();
    // the helper adds its stylesheets after this script has run: mirror again when styles are added
    let mirrorQueued = false;
    new MutationObserver((muts) => {
      if (mirrorQueued || !muts.some((m) => Array.from(m.addedNodes).some((n) => n.tagName === 'STYLE' && n.id !== 'bpMirrorStyle' && n.id !== 'bpPopStyle'))) return;
      mirrorQueued = true;
      setTimeout(() => { mirrorQueued = false; mirrorColumnStyles(); }, 300);
    }).observe(document.head, { childList: true });

    // The game may rebuild a column after loading; keep the saved layout.
    let queued = false;
    const watcher = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; applyLayout(); });
    });
    [L, R].forEach((col) => watcher.observe(col, { childList: true }));

    // ---- dragging (pointer events: a click on the title, or a link inside it, still works)
    let drag = null;
    const THRESHOLD = 5;

    // Which column and which spot (before which box) the pointer is over.
    function targetAt(x, y) {
      const cr = C.getBoundingClientRect();
      const col = x < cr.left + cr.width / 2 ? L : R;
      const boxes = boxesIn(col).filter((b) => b !== drag.box);
      let before = null;
      for (const b of boxes) {
        const r = b.getBoundingClientRect();
        if (y < r.top + r.height / 2) { before = b; break; }
      }
      return { col, before, boxes };
    }
    function update() {
      const t = targetAt(drag.x, drag.y);
      drag.target = t;
      const cr = t.col.getBoundingClientRect();
      let top;
      if (t.before) top = t.before.getBoundingClientRect().top - 5;
      else if (t.boxes.length) top = t.boxes[t.boxes.length - 1].getBoundingClientRect().bottom + 5;
      else {
        const shown = Array.from(t.col.children).filter((el) => el !== drag.box && el.offsetHeight);
        top = shown.length ? shown[shown.length - 1].getBoundingClientRect().bottom + 5 : cr.top;
      }
      drag.line.style.cssText = 'left:' + cr.left + 'px;width:' + cr.width + 'px;top:' + (top - 1) + 'px;';
      // the widget is held at the spot where it was grabbed
      drag.ghost.style.left = (drag.x - drag.offX) + 'px';
      drag.ghost.style.top = (drag.y - drag.offY) + 'px';
    }
    function scrollLoop() {
      if (!drag || !drag.active) return;
      const edge = 60;
      if (drag.y < edge) window.scrollBy(0, -Math.ceil((edge - drag.y) / 4));
      else if (drag.y > window.innerHeight - edge) window.scrollBy(0, Math.ceil((drag.y - (window.innerHeight - edge)) / 4));
      update();
      requestAnimationFrame(scrollLoop);
    }
    function end(drop) {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.active) {
        d.ghost.remove();
        d.line.remove();
        d.box.classList.remove('bpSideDragging');
        document.body.classList.remove('bpSideDrag');
        if (drop && d.target) {
          if (d.target.before) d.target.col.insertBefore(d.box, d.target.before);
          else d.target.col.appendChild(d.box);
          saveLayout();
        }
        // the click that ends the drag must not follow a link in the title
        const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
        document.addEventListener('click', swallow, true);
        setTimeout(() => document.removeEventListener('click', swallow, true), 50);
      }
    }

    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.target || typeof e.target.closest !== 'function') return;
      const h = e.target.closest('h3');
      const box = h && h.parentElement;
      if (!box || !box.classList.contains('minibox') || box.firstElementChild !== h) return;
      if (box.parentElement !== L && box.parentElement !== R) return;
      drag = { box, h, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, active: false, target: null };
    });
    document.addEventListener('pointermove', (e) => {
      if (!drag) return;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (!drag.active) {
        if (Math.abs(drag.x - drag.sx) < THRESHOLD && Math.abs(drag.y - drag.sy) < THRESHOLD) return;
        drag.active = true;
        // a copy of the widget: no ids (they must stay unique), no scripts, and it never takes clicks
        const rect = drag.box.getBoundingClientRect();
        const copy = drag.box.cloneNode(true);
        copy.removeAttribute('id');
        copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        copy.querySelectorAll('script').forEach((el) => el.remove());
        copy.classList.remove('bpSideDragging');
        drag.ghost = $('<div id="bpSideGhost"></div>').css('width', rect.width + 'px').append(copy).appendTo('body')[0];
        drag.ghost.classList.toggle('bpSideCut', rect.height > 240);
        drag.offX = drag.sx - rect.left;
        drag.offY = Math.min(drag.sy - rect.top, 240);
        drag.line = $('<div id="bpSideLine"></div>').appendTo('body')[0];
        drag.box.classList.add('bpSideDragging');
        document.body.classList.add('bpSideDrag');
        window.getSelection && window.getSelection().removeAllRanges();
        requestAnimationFrame(scrollLoop);
      }
      e.preventDefault();
      update();
    });
    document.addEventListener('pointerup', () => end(true));
    document.addEventListener('pointercancel', () => end(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') end(false); });
  }
  initSidebarWidgets();

  // Our own elements show the game's tooltip (tip-static + data-tipped), never the browser's plain title one: every title="" that
  // appears on them, now or later, is turned into the game's tooltip. (Skipped on pages where the game has no tooltip library.)
  function useGameTips() {
    const OURS = '[id^="bp"],[class^="bp"],[class*=" bp"],[id^="fsb"],[class^="fsb"],[class*=" fsb"],[id^="pf"],[class^="pf"],[class*=" pf"]';
    const ready = () => !!(window.Tipped || (window.jQuery && window.jQuery.fn && window.jQuery.fn.qtip));
    const fix = (el) => {
      if (el.nodeType !== 1 || !el.hasAttribute('title') || !(el.matches(OURS) || el.closest(OURS))) return;
      const t = el.getAttribute('title');
      el.removeAttribute('title');
      if (!t) return;
      el.setAttribute('data-tipped', t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])));
      el.classList.add('tip-static');
    };
    // A tooltip whose element was removed from the page (a closed window, a list that was drawn again) would stay on the screen: take it away.
  const dropTips = (root) => {
    if (root.nodeType !== 1) return;
    const els = [root].concat(Array.from(root.querySelectorAll('[aria-describedby^="qtip-"]')));
    els.forEach((el) => {
      const id = el.getAttribute('aria-describedby');
      if (id && id.indexOf('qtip-') === 0) { const t = document.getElementById(id); if (t) t.remove(); }
    });
  };
  const scan = (root) => { if (root.nodeType === 1) { fix(root); root.querySelectorAll('[title]').forEach(fix); } };
    new MutationObserver((list) => {
      if (!ready()) return;
      const tipsOpen = !!document.querySelector('.qtip');
    for (const m of list) {
      if (m.type === 'attributes') { fix(m.target); continue; }
      m.addedNodes.forEach(scan);
      if (tipsOpen) m.removedNodes.forEach(dropTips);
    }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
    if (ready()) scan(document.body);
  }
  useGameTips();

  // ---------------------------------------------------------------- wiki button (world page)
  // A "W" button at the end of the helper's own buttons beside the map (#fshWorldButtonContainer, which FallenSwordHelper adds a
  // moment after the page loads), or next to the area name when there are none. It opens the wiki page of the map you are on now.
  function initWikiButton() {
    const WIKI = 'https://wiki.fallensword.com/index.php/';
    const mapName = () => {
      try { return (window.GameData.realm().name || '').trim(); } catch (e) { return ''; }
    };
    const wikiUrl = (name) => WIKI + encodeURIComponent(name.replace(/ /g, '_')).replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2C/g, ',').replace(/%27/g, "'");
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'fsbWikiBtn';
    btn.textContent = 'W';
    btn.className = 'tip-static';
    btn.setAttribute('data-tipped', 'Open the wiki page of this map');
    btn.addEventListener('click', () => {
      const name = mapName() || (document.getElementById('worldName') || {}).textContent;
      if (name && name.trim()) window.open(wikiUrl(name.trim()), '_blank', 'noopener');
    });
    const css = document.createElement('style');
    css.textContent =
      '#fsbWikiBtn{width:17px;height:17px;padding:0;margin:0 0 0 3px;box-sizing:border-box;border:1px solid #4f3717;border-radius:3px;background:#e9d6a8;color:#4f3717;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font:700 11px/1 Georgia,serif}' +
      '#fsbWikiBtn:hover{background:#f6e7bf}#fsbWikiBtn.fsbBeside{margin-left:8px;vertical-align:middle}';
    document.head.appendChild(css);
    // other scripts rebuild these elements, so the button is put back (and kept last) whenever it goes missing
    function placeButton() {
      const box = document.getElementById('fshWorldButtonContainer');
      const title = document.getElementById('worldName');
      if (box) {
        btn.classList.remove('fsbBeside');
        if (btn.parentNode !== box || box.lastElementChild !== btn) box.appendChild(btn);
      } else if (title) {
        btn.classList.add('fsbBeside');
        if (btn.parentNode !== title) title.appendChild(btn);
      }
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
      } else if (tries > 40) {
        clearInterval(wait); // not the world page
      }
    }, 300);
  }
  initWikiButton();

  // ---------------------------------------------------------------- path finder (world page)
  // A button beside the map buttons opens a draggable panel: type where you want to go (by name, or by level) and it shows the way
  // from where you stand now, step by step, following you as you move. The routing is the same code as the Path Finder website
  // (generated into the block below by tools/sync-helper.js of that project, edit route.js there, not the copy) and the data is the
  // website's route.json, loaded the first time the panel is opened (a different address can be set in localStorage FSB_pathfinderUrl).
  const PF_SITE = 'https://cristimirt.github.io/fspathfinder/';
  // >>> route.js (generated from the Fallen Sword Path Finder repo, site/route.js by tools/sync-helper.js: edit that file, not this copy)
  const FSRoute = (() => {
    const module = { exports: {} };
    // Routing over the Path Finder data. No DOM here: the website and the helper userscript both use this file.
    //   const R = FSRoute.create(data);   // data = window.FSAR (data.js) or the parsed route.json
    //   R.findRoute('Mountain Path', 'Ramdal', [3, 8])  ->  steps (or null), steps.total = estimated moves
    (function (root, factory) {
      if (typeof module === 'object' && module.exports) module.exports = factory();
      else root.FSRoute = factory();
    }(typeof self !== 'undefined' ? self : this, function () {
      'use strict';

      class MinHeap {
        constructor() { this.a = []; }
        push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
        pop() {
          const a = this.a; const top = a[0]; const last = a.pop();
          if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
          return top;
        }
        get size() { return this.a.length; }
      }

      const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
      const FREE_TO = 'Mountain Path';
      const FREE_AT = [9, 11]; // the teleport always puts you on this tile
      // World maps that really connect to each other (you can walk from one to the other). Being next to each other on the world map
      // does not mean that: the guide and the wiki do not say which neighbours connect, so this list is filled in by hand.
      // Each entry is a pair of master realm names, e.g. ['First Map', 'Second Map'].
      const WORLD_LINKS = [];
      const WAYS = 'Cathedral of Ways'; // the one portal that is kept when the other portals are switched off
      const TELEPORT_COST = 25; // it costs 25 stamina, about 25 moves

      function create(D) {
        const byName = {};
        const realmByGuide = {};
        const masterByGuide = {};
        D.areas.forEach((a) => {
          byName[a.name] = a;
          if (a.guideId != null) (a.kind === 'master' ? masterByGuide : realmByGuide)[a.guideId] = a;
        });
        const masters = D.worlds.map((n) => byName[n]);
        const realms = D.areas.filter((a) => a.kind === 'realm');

        // graph: every area has a list of edges { to, kind, x, y, ax, ay, note }
        //   stairs (tile x,y -> arrive ax,ay), exit (realm -> its world map), enter (world map -> realm), world (next to each other)
        const adj = {};
        D.areas.forEach((a) => { adj[a.name] = []; });
        const addEdge = (a, b, kind, info) => adj[a].push(Object.assign({ to: b, kind }, info));
        const drawn = new Map(); // one entry per pair of connected areas, used by the website to draw lines
        const addDrawn = (a, b, kind) => { const k = [a, b].sort().join('\u0000'); if (!drawn.has(k)) drawn.set(k, { a, b, kind }); };
        realms.forEach((a) => {
          a.stairs.forEach((s) => {
            addEdge(a.name, s.to, 'stairs', { x: s.x, y: s.y, ax: s.arrive && s.arrive.x, ay: s.arrive && s.arrive.y, note: s.note || '' });
            addDrawn(a.name, s.to, 'stairs');
          });
          a.worldExits.forEach((e) => {
            addEdge(a.name, e.world, 'exit', { x: e.x, y: e.y });
            addEdge(e.world, a.name, 'enter', { x: e.x, y: e.y });
            addDrawn(a.name, e.world, 'exit');
          });
        });
        masters.forEach((m) => {
          (m.entries || []).forEach((n) => {
            if (!adj[m.name].some((e) => e.to === n)) {
              addEdge(m.name, n, 'enter', {});
              addEdge(n, m.name, 'exit', {});
              addDrawn(m.name, n, 'exit');
            }
          });
          });
        WORLD_LINKS.forEach(([a, b]) => {
          if (!byName[a] || !byName[b]) throw new Error('WORLD_LINKS: unknown world map ' + (byName[a] ? b : a));
          addEdge(a, b, 'world', {}); addEdge(b, a, 'world', {});
        });

        // Cost is in moves: walking inside a realm is the straight-line distance between the tile you arrive on and the tile of
        // the next stairs / portal (diagonals allowed, obstacles ignored). A portal reaches any master realm's world map, and you can
        // teleport to Mountain Path for 25 stamina, so the cheapest way may start by walking to a nearby portal instead.
        const cheb = (t, x, y) => (t && x != null ? Math.max(Math.abs(t[0] - x), Math.abs(t[1] - y)) : 0);
        function moveOptions(name, tile, waysOnly) {
          const out = [];
          adj[name].forEach((e) => {
            const walk = cheb(tile, e.x, e.y);
            if (e.kind === 'stairs') out.push({ e, walk, cost: walk + 1, at: e.ax != null ? [e.ax, e.ay] : null });
            else if (e.kind === 'exit') out.push({ e, walk, cost: walk + 1, at: null });
            else if (e.kind === 'enter') out.push({ e, walk: 0, cost: 4, at: e.x != null ? [e.x, e.y] : null });
            else out.push({ e, walk: 0, cost: 20, at: null });
          });
          // a portal takes you to the world map of any master realm; every portal of a realm leads to the same places, so only the nearest one counts
          let near = null;
          (waysOnly && name !== WAYS ? [] : byName[name].portals || []).forEach((p) => {
            const walk = cheb(tile, p.x, p.y);
            if (!near || walk < near.walk) near = { p, walk };
          });
          if (near) {
            masters.forEach((m) => {
              if (m.name === name) return;
              out.push({ e: { to: m.name, kind: 'portal', x: near.p.x, y: near.p.y, name: near.p.name }, walk: near.walk, cost: near.walk + 2, at: null });
            });
          }
          if (byName[FREE_TO]) out.push({ e: { to: FREE_TO, kind: 'free', ax: FREE_AT[0], ay: FREE_AT[1] }, walk: 0, cost: TELEPORT_COST, at: FREE_AT });
          return out;
        }

        // Cheapest way from one area to another. `tile` is [x, y] of where you stand now (optional, makes the first walk exact).
        // `opts.waysOnly`: no portals except the one in the Cathedral of Ways.
        // Event-only areas are never used as a way through, only as the start or the destination.
        function findRoute(from, to, tile, opts) {
          const waysOnly = !!(opts && opts.waysOnly);
          const key = (n, t) => n + '@' + (t ? t[0] + ',' + t[1] : '');
          const info = {};
          const dist = {};
          const prev = {};
          const heap = new MinHeap();
          const k0 = key(from, tile || null);
          info[k0] = { name: from, tile: tile || null };
          dist[k0] = 0;
          heap.push(0, k0);
          let goal = null;
          while (heap.size) {
            const [d, k] = heap.pop();
            if (d > dist[k]) continue;
            const st = info[k];
            if (st.name === to) { goal = k; break; }
            moveOptions(st.name, st.tile, waysOnly).forEach((o) => {
              if (o.e.to !== to && byName[o.e.to].event) return;
              const nk = key(o.e.to, o.at);
              const nd = d + o.cost;
              if (dist[nk] === undefined || nd < dist[nk]) {
                dist[nk] = nd; info[nk] = { name: o.e.to, tile: o.at };
                prev[nk] = { from: k, step: { from: st.name, edge: o.e, walk: o.walk, cost: o.cost } };
                heap.push(nd, nk);
              }
            });
          }
          if (!goal) return null;
          const steps = [];
          for (let k = goal; k !== k0; k = prev[k].from) steps.unshift(prev[k].step);
          steps.total = dist[goal];
          return steps;
        }

        // Name search: starts-with first, then contains, then every typed word somewhere in the name. Shorter names first.
        const index = D.areas.map((a) => ({ a, n: norm(a.name), w: a.name.toLowerCase() }));
        function search(q, limit) {
          const nq = norm(q);
          if (!nq) return [];
          const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
          const hits = [];
          index.forEach((e) => {
            let rank = -1;
            if (e.n.startsWith(nq)) rank = 0;
            else if (e.n.indexOf(nq) !== -1) rank = 1;
            else if (words.length > 1 && words.every((w) => e.w.indexOf(w) !== -1)) rank = 2;
            if (rank >= 0) hits.push([rank, e.a]);
          });
          hits.sort((x, y) => x[0] - y[0] || x[1].name.length - y[1].name.length || x[1].level - y[1].level);
          return hits.slice(0, limit || 8).map((h) => h[1]);
        }

        // Where the game says the player is. `realmId` / `masterRealmId` are the game's realm_id and master_realm_id, which are the guide's ids.
        function fromGame(realmId, masterRealmId) {
          if (realmId != null && realmId > 0 && realmByGuide[realmId]) return realmByGuide[realmId];
          if (masterRealmId != null && masterRealmId >= 0 && masterByGuide[masterRealmId]) return masterByGuide[masterRealmId];
          return null;
        }

        return { byName, masters, realms, adj, drawn, findRoute, search, fromGame };
      }

      return { create, MinHeap, norm };
    }));
    return module.exports;
  })();
  // <<< route.js
  function initPathfinder() {
    if (!/[?&]cmd=world(&|$)/.test(location.search)) return;
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
  initPathfinder();

  // ---------------------------------------------------------------- quick buff pop-up (every page)
  // The game opens Quick Buff in a separate browser window through openWindow(url, name, width, height, features), from links like
  // javascript:openWindow('index.php?fst=..&cmd=quickbuff&t=..', 'fsQuickBuff', 618, 500, ',scrollbars'). Those calls are caught here and
  // the same page is shown in a draggable window on the page instead (an iframe). Every other openWindow call is left alone.
  function initQuickBuffPopup() {
    const POS_KEY = FSB + 'qbPos';
    let box = null;
    const css = document.createElement('style');
    css.textContent =
      '#fsbQb{position:fixed;z-index:100000;display:flex;flex-direction:column;background:#d6b277;border:1px solid #20170396;border-radius:4px;box-shadow:0 0 8px 0 #000;max-width:calc(100vw - 8px);}' +
      '#fsbQb .qbHead{cursor:move;user-select:none;touch-action:none;display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#b79862;color:#3b2a14;font:bold 12px Arial,sans-serif;border-radius:3px 3px 0 0;}' +
      '#fsbQb .qbX{cursor:pointer;background:none;border:0;color:#3b2a14;font-size:18px;line-height:14px;padding:0 2px;}#fsbQb .qbX:hover{color:#8a1f0f;}' +
      '#fsbQb iframe{display:block;border:0;background:#d6b277;max-width:100%;}';
    document.head.appendChild(css);

    const place = (x, y) => {
      const r = box.getBoundingClientRect();
      x = Math.min(Math.max(0, x), Math.max(0, innerWidth - r.width));
      y = Math.min(Math.max(0, y), Math.max(0, innerHeight - r.height));
      box.style.left = x + 'px';
      box.style.top = y + 'px';
    };
    function close() {
      if (box) { box.remove(); box = null; }
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    function open(url, w, h) {
      if (!/[?&]fst=/.test(url)) url = withFst(url);
      const width = Math.min(w || 618, innerWidth - 16), height = Math.min(h || 500, innerHeight - 60);
      if (!box) {
        box = document.createElement('div');
        box.id = 'fsbQb';
        box.innerHTML = '<div class="qbHead"><span>Quick Buff</span><button type="button" class="qbX" title="Close (Esc)" aria-label="Close">&times;</button></div><iframe></iframe>';
        document.body.appendChild(box);
        box.querySelector('.qbX').addEventListener('click', close);
        document.addEventListener('keydown', onKey);
        const head = box.querySelector('.qbHead');
        head.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || e.target.closest('.qbX')) return;
          const r = box.getBoundingClientRect();
          const dx = e.clientX - r.left, dy = e.clientY - r.top;
          head.setPointerCapture(e.pointerId);
          const mv = (ev) => place(ev.clientX - dx, ev.clientY - dy);
          const up = () => {
            head.removeEventListener('pointermove', mv);
            head.removeEventListener('pointerup', up);
            head.removeEventListener('pointercancel', up);
            const b = box.getBoundingClientRect();
            try { localStorage.setItem(POS_KEY, JSON.stringify({ x: b.left, y: b.top })); } catch (err) { /* storage unavailable */ }
          };
          head.addEventListener('pointermove', mv);
          head.addEventListener('pointerup', up);
          head.addEventListener('pointercancel', up);
        });
      }
      const f = box.querySelector('iframe');
      f.style.width = width + 'px';
      f.style.height = height + 'px';
      if (!f.fsbHooked) { f.fsbHooked = true; f.addEventListener('load', () => { enhanceQuickBuff(f); autoFit(f); }); }
      f.src = url;
      let pos = null;
      try { pos = JSON.parse(localStorage.getItem(POS_KEY)); } catch (err) { /* ignore */ }
      if (pos) place(pos.x, pos.y);
      else place((innerWidth - width) / 2, Math.max(8, (innerHeight - height) / 2 - 20));
    }


    // ---- buff information inside the pop-up
    // The Fallen Sword Helper adds this to the Quick Buff page, but it does not run inside a frame, so it is done here.
    // Based on the Quick Buff module of the Fallen Sword Helper (MIT licence, Copyright (c) 2017 Fallen Sword Helper).
    const QB_CSS =
      '.fsbRed{color:#ff4d4d}.fsbGreen{color:#4cc04c}.fsbLime{color:#5dff5d}.fsbOff{color:#8f8f8f}.fsbAvail{color:#ffa94d}' +
      '#fsbQbInfo table{margin:0 auto}#fsbQbInfo th{color:orange;padding:0 4px;text-align:center;font-weight:bold}' +
      '#fsbQbInfo td{padding:0 4px;text-align:center}#fsbQbInfo .fsbOn{color:#fff;font-size:x-small}' +
      '.player h1{float:left}.player p{clear:both}.fsbLast{color:#ccc;font-size:x-small}' +
      '.fsbAct{color:#ff3b3b;cursor:pointer}.fsbAct:hover{text-decoration:underline}' +
      '#quickbuff #buff-outer .fsbDim span{color:#999}' +
      '#fsbSort{clear:both;color:#e0c493;font-size:12px;padding:5px 0}' +
      '#fsbSort label{display:inline-flex;align-items:center;gap:4px;cursor:pointer}#fsbSort input{margin:0;cursor:pointer}';
    const profileOf = (name) => fetch(withFst('/index.php?cmd=export&subcmd=profile&player_username=' + encodeURIComponent(name)), { credentials: 'same-origin' })
      .then((r) => r.json()).catch(() => null);
    const clock = (secs) => {
      secs = Math.max(0, Math.round(secs));
      const m = Math.floor(secs / 60), sc = secs % 60;
      return (m ? m + 'm' : '') + (m && sc ? ' ' : '') + (sc ? sc + 's' : m ? '' : '0s');
    };
    const ago = (secs) => {
      secs = Math.abs(Math.round(secs));
      const d = Math.floor(secs / 86400), h = Math.floor(secs / 3600) % 24, m = Math.floor(secs / 60) % 60, sc = secs % 60;
      return (d ? d + ' days, ' : '') + (h ? h + ' hours, ' : '') + (m ? m + ' mins, ' : '') + sc + ' secs';
    };

    // The pop-up is as tall as the page inside it (up to the height of the window), and follows it when it grows or shrinks:
    // a target is added, the buff information arrives, a result is shown.
    function autoFit(f) {
      let d;
      try { d = f.contentDocument; } catch (e) { return; }
      if (!d || !d.body) return;
      // when the page is taller than the window it scrolls inside the pop-up: with a scrollbar that matches the dark page
      const sb = d.createElement('style');
      sb.textContent =
        'html::-webkit-scrollbar{width:12px;height:12px}' +
        'html::-webkit-scrollbar-track{background:#0f0d09;border-left:1px solid #2b2417}' +
        'html::-webkit-scrollbar-thumb{background:#6b5a33;border-radius:6px;border:3px solid #0f0d09}' +
        'html::-webkit-scrollbar-thumb:hover{background:#8d7646}' +
        'html::-webkit-scrollbar-corner{background:#0f0d09}';
      d.head.appendChild(sb);
      let queued = false;
      const run = () => {
        queued = false;
        const max = Math.max(200, innerHeight - 60);
        f.style.height = '0px'; // measured with no room to spare, set again straight away (nothing is painted in between)
        const h = Math.max(d.documentElement.scrollHeight, d.body.scrollHeight);
        f.style.height = Math.min(Math.max(h, 120), max) + 'px';
        if (box) { const r = box.getBoundingClientRect(); place(r.left, r.top); }
      };
      const queue = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
      const inTip = (n) => n.nodeType === 1 && n.closest && n.closest('.qtip');
      new MutationObserver((list) => {
        // the game's tooltips come and go in the page: they do not change its size
        if (list.some((m) => !inTip(m.target) && (m.type !== 'childList' || Array.from(m.addedNodes).concat(Array.from(m.removedNodes)).some((n) => !inTip(n))))) queue();
      }).observe(d.body, { childList: true, subtree: true, attributes: true, characterData: true });
      queue();
      setTimeout(queue, 600);
      setTimeout(queue, 2000);
    }

    function enhanceQuickBuff(frame) {
      let doc, win;
      try { doc = frame.contentDocument; win = frame.contentWindow; } catch (e) { return; }
      if (!doc || !loadSettings().quickBuffInfo) return;
      const root = doc.getElementById('quickbuff');
      if (!root || doc.getElementById('fsbQbInfo')) return;
      const style = doc.createElement('style');
      style.textContent = QB_CSS;
      doc.head.appendChild(style);
      const me = (typeof win.self === 'string' && win.self) || (document.getElementById('statbar-character') || {}).textContent;
      const first = root.children[0];
      if (first && me) {
        const head = doc.createElement('div');
        head.id = 'fsbQbInfo';
        head.innerHTML = '<table><thead><tr><th>Sustain</th><th>Fury Caster</th><th>Guild Buffer</th><th>Buff Master</th><th>Extend</th><th>Reinforce</th></tr></thead>' +
          '<tbody><tr><td data-k="Sustain">&nbsp;</td><td data-k="Fury Caster">&nbsp;</td><td data-k="Guild Buffer">&nbsp;</td><td data-k="Buff Master">&nbsp;</td><td data-k="Extend">&nbsp;</td><td data-k="Reinforce">&nbsp;</td></tr></tbody></table>';
        first.insertAdjacentElement('afterend', head);
        const activatable = (k) => {
          const box = doc.querySelector('#buff-outer input[data-name="' + k + '"]');
          return box ? '<span class="fsbAct" data-id="' + box.value + '" data-k="' + k + '">Activate</span>' : '<span class="fsbOff">Off</span>';
        };
        // Activate: the same request as the page's own form, for yourself and that one skill
        head.addEventListener('click', async (e) => {
          const a = e.target.closest('.fsbAct');
          if (!a || a.dataset.busy) return;
          a.dataset.busy = '1';
          const holder = a.parentNode, k = a.dataset.k;
          a.textContent = '...';
          let reason = '';
          try {
            const body = new URLSearchParams();
            body.set('fst', (withFst('/index.php').match(/[?&]fst=([^&#]+)/) || [])[1] || '');
            body.set('cmd', 'quickbuff');
            body.set('subcmd', 'activate');
            body.set('targetPlayers', me.trim());
            body.append('skills[]', a.dataset.id);
            const res = await fetch(withFst('/index.php'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
            const txt = await res.text();
            if (/was activated on/.test(txt)) { holder.innerHTML = '<span class="fsbLime">On</span>'; return; }
            const rep = new DOMParser().parseFromString(txt, 'text/html').querySelector('#quickbuff-report');
            reason = rep ? rep.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : 'no answer';
          } catch (err) { reason = 'request failed'; }
          holder.innerHTML = '<span class="fsbRed">Failed</span><br><span class="fsbOn">' + reason.replace(/[&<>]/g, '') + '</span>';
          setTimeout(() => { holder.innerHTML = activatable(k); }, 5000);
        });
        profileOf(me.trim()).then((d) => {
          if (!d) return;
          const cell = (k) => head.querySelector('td[data-k="' + k + '"]');
          ['Sustain', 'Fury Caster'].forEach((k) => {
            const e = (d._enhancements || []).find((x) => x.name === k);
            const v = e ? e.value : 0;
            cell(k).innerHTML = '<span class="' + (v < 100 ? 'fsbRed' : 'fsbLime') + '">' + v + '%</span>';
          });
          const dur = {};
          (d._skills || []).forEach((x) => { dur[x.name] = x.duration; });
          ['Guild Buffer', 'Buff Master', 'Extend', 'Reinforce'].forEach((k) => {
            const secs = dur[k] || 0;
            cell(k).innerHTML = secs
              ? '<span class="fsbLime">On</span>&nbsp;<span class="fsbOn">(' + clock(secs) + ')</span>'
              : activatable(k);
          });
        });
      }
      // stamina cost in each buff's tooltip, and low level buffs (under 125, the ones that are mostly prerequisites) dimmed
      const NOT_DIMMED = [50, 54, 55, 56, 60, 61, 98, 101, 179, 181];
      doc.querySelectorAll('#buff-outer label[for^="skill-"]').forEach((label) => {
        const nameSpan = label.children[0], box = label.previousElementSibling;
        if (!nameSpan || !box) return;
        const tip = nameSpan.dataset.tipped;
        if (tip && box.dataset.cost) nameSpan.dataset.tipped = tip.replace('</center>', '<br>Stamina Cost: ' + box.dataset.cost + '$&');
        const lvlEl = nameSpan.children[0];
        const lvl = lvlEl ? Number((lvlEl.textContent || '').replace(/[[\]]/g, '')) : NaN;
        if (NOT_DIMMED.indexOf(Number(label.htmlFor.slice(6))) === -1 && lvl < 125) label.classList.add('fsbDim');
      });
      // sort the buffs alphabetically (a checkbox under Check All, like the Fallen Sword Helper's; remembered)
      const checkAll = doc.getElementById('check-all');
      if (checkAll) {
        const order = {};
        [1, 2, 3].forEach((i) => { order[i] = Array.from(doc.querySelectorAll('#block' + i + ' > p')); });
        const sortBuffs = (on) => [1, 2, 3].forEach((i) => {
          const block = doc.getElementById('block' + i);
          if (!block) return;
          const list = on ? order[i].slice().sort((x, y) => (x.children[0].dataset.name > y.children[0].dataset.name ? 1 : -1)) : order[i];
          list.forEach((pp) => block.appendChild(pp));
        });
        const row = doc.createElement('div');
        row.id = 'fsbSort';
        row.innerHTML = '<label><input type="checkbox">Sort buffs alphabetically</label>';
        // outside #buff-outer: the page's Check All ticks every checkbox inside it
        const outer = doc.getElementById('buff-outer');
        (outer || checkAll).insertAdjacentElement('afterend', row);
        const sw = row.querySelector('input');
        let on = false;
        try { on = localStorage.getItem(FSB + 'qbSort') === '1'; } catch (err) { /* ignore */ }
        sw.checked = on;
        if (on) sortBuffs(true);
        sw.addEventListener('change', () => {
          try { localStorage.setItem(FSB + 'qbSort', sw.checked ? '1' : '0'); } catch (err) { /* ignore */ }
          sortBuffs(sw.checked);
        });
      }
      // what a target already has, next to each buff; and when the target was last active, with the stamina
      const showTarget = (h1) => {
        const name = (h1.textContent || '').trim();
        const holder = h1.parentNode && h1.parentNode.lastElementChild;
        if (!name || !holder) return;
        const have = (holder.textContent || '').split(',').map((t) => t.trim().split(/ \[|]/));
        profileOf(name).then((d) => {
          doc.querySelectorAll('#buff-outer input[name]').forEach((el) => {
            const label = el.nextElementSibling;
            if (!label) return;
            let span = label.nextElementSibling && label.nextElementSibling.classList.contains('fsbPlayer') ? label.nextElementSibling : null;
            const hit = have.find((a) => a[0] === el.getAttribute('data-name'));
            const lvl = hit ? Number(hit[1]) : 0;
            if (!lvl) { if (span) span.innerHTML = ''; return; }
            const mine = Number(((label.querySelector('span span') || {}).textContent || '').replace(/[[\]]/g, ''));
            if (!span) { span = doc.createElement('span'); span.className = 'fsbPlayer'; label.insertAdjacentElement('afterend', span); }
            span.innerHTML = ' <span class="' + (mine > lvl ? 'fsbRed' : 'fsbGreen') + '">[' + lvl + ']</span>';
          });
          if (d && d.username) {
            const box = doc.querySelector('div.player[data-username="' + d.username + '"]');
            if (!box) return;
            let act = box.querySelector('span.fsbLast');
            if (!act) { act = doc.createElement('span'); act.className = 'fsbLast'; const h = box.getElementsByTagName('h1')[0]; if (h) h.insertAdjacentElement('afterend', act); }
            act.innerHTML = 'Last Activity: ' + ago(Date.now() / 1000 - d.last_login) + '<br>Stamina: ' + d.current_stamina + ' / ' + d.stamina + ' ( ' + Math.floor((d.current_stamina / d.stamina) * 100) + '% )';
          }
        });
      };
      const players = doc.getElementById('players');
      if (players) players.addEventListener('click', (e) => { if (e.target.tagName === 'H1') showTarget(e.target); });
      const targets = doc.getElementById('targetPlayers');
      if (targets && targets.value) { // the first target is shown without a click
        let tries = 0;
        const t = setInterval(() => {
          const h1 = players && players.getElementsByTagName('h1')[0];
          if (h1) { clearInterval(t); showTarget(h1); } else if (++tries > 30) clearInterval(t);
        }, 100);
      }
    }

    const isQuickBuff = (url) => /[?&]cmd=quickbuff(&|#|$)/.test(String(url || ''));
    // wraps one function that takes openWindow's arguments; true once it is wrapped
    function wrap(owner, name) {
      const orig = owner && owner[name];
      if (typeof orig !== 'function') return false;
      if (orig.fsbWrapped) return true;
      const wrapped = function (url, target, w, h) {
        if (isQuickBuff(url) && loadSettings().quickBuffPopup) { open(String(url), w, h); return undefined; }
        return orig.apply(this, arguments);
      };
      wrapped.fsbWrapped = true;
      owner[name] = wrapped;
      return true;
    }
    // The helper replaces window.openWindow when its "resize quick buff" option is on, so it is wrapped again whenever that happens...
    setInterval(() => {
      wrap(window.HCS && window.HCS.utils, 'openWindow'); // what the global openWindow() calls
      wrap(window, 'openWindow');
    }, 1000);
    // ...and the links themselves are caught before any of that: javascript:openWindow('<quick buff address>', name, width, height, ...)
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="javascript:openWindow"]');
      if (!a || !loadSettings().quickBuffPopup) return;
      const m = a.getAttribute('href').match(/openWindow\(\s*'([^']*)'\s*,\s*'[^']*'\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m || !isQuickBuff(m[1])) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      open(m[1], +m[2], +m[3]);
    }, true);
  }
  initQuickBuffPopup();

  // ---------------------------------------------------------------- automatic break down
  // Runs on every game page, not only the backpack: every 5 seconds it asks the game for the bag (cmd=profile&subcmd=fetchinv)
  // and breaks down what fits the settings. Settings and locks are read from localStorage each time, so changes made in
  // another tab count straight away.
  // Equipment only (helmet 0, armor 1, gloves 2, boots 3, weapon 4, shield 5, ring 6, amulet 7, rune 8), never locked,
  // bound, guild tagged or a container. (Worn items are not in the bag data.)
  function autoBreakMatches(items, s, locked) {
    return (items || []).filter((it) =>
      it.t >= 0 && it.t <= 8 &&
      !it.c && !it.bn && !it.tg && !locked(it.a) &&
      s.autoBreakRar.indexOf(it.r === undefined ? 0 : it.r) !== -1 &&
      (s.autoBreakMin === null || it.l >= s.autoBreakMin) &&
      (s.autoBreakMax === null || it.l <= s.autoBreakMax));
  }
  const abLocks = () => { try { return new Set(JSON.parse(recall('locked') || '[]').map(String)); } catch (e) { return new Set(); } };
  const abFailed = new Set(); // refused by the game: not tried again until the page is reloaded
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
  window.__fsbToast = abToast; // for testing: __fsbToast('text') in the console
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
  $(document).on('click', '#bpAbLogBtn', (e) => { e.preventDefault(); showAbLog(); });
  $(document).on('click', '#bpAbLogWin .bpAbX', (e) => { e.preventDefault(); $('#bpAbLogWin').remove(); });
  $(document).on('click', '#bpAbLogWin .bpAbClear', (e) => { e.preventDefault(); remember(AB_LOG, '[]'); showAbLog(); });
  const fetchBag = () => new Promise((resolve) => {
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
  // one tab at a time does it (Web Locks), so several open game tabs do not repeat each other's requests
  setInterval(() => {
    if (!loadSettings().autoBreak) return;
    if (navigator.locks && navigator.locks.request) navigator.locks.request('fsb-autobreak', { ifAvailable: true }, (lock) => (lock ? autoBreak() : undefined));
    else autoBreak();
  }, 5000);

  // ---------------------------------------------------------------- bootstrap
  let tries = 0;
  const poll = setInterval(() => {
    tries++;
    // Not a backpack page: give up quickly. (The game's search box is the marker; it replaced the old .backpackFilter row.)
    if (!$('#backpack_filterName').length) {
      if (tries > 8) clearInterval(poll);
      return;
    }
    const bp = getInstance();
    if (bp) {
      clearInterval(poll);
      init(bp);
    } else if (tries > 60) {
      clearInterval(poll);
      console.warn('[FS Backpack Search] hcs-backpack instance not found on #backpackContainer');
    }
  }, 250);
})();