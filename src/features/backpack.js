/* global fsAlert -- the game's own alert function (a global of its page) */
import { CRAFT_COLORS, RARITIES, norm } from '../core/items.js';
import { FILTERS, SET, recall, remember } from '../core/settings.js';
import { $ } from '../core/util.js';
import { searchSelect } from './searchselect.js';
import { openBackpackSettings } from './settingsui.js';

const DEBOUNCE_MS = 100;

const getInstance = () => $('#backpackContainer').data('hcs-backpack');

// The game's own search box (#backpack_filterName); we only change how it matches: every
// word has to appear in the name, in any order.
function getWords() {
  return norm($('#backpack_filterName').val()).split(/\s+/).filter(Boolean);
}

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
  const $gear = $('#bpSettingsBtn').length ? $() : $('<a href="#" id="bpSettingsBtn" title="Backpack settings"></a>');
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

  function applySettings() {
    applyDisplay(bp);
    applyLayout();
    bp.page = 0;
    bp._applyFilter(); // redraws the grid and the type icons
  }
  $(document).on('click', '#bpSettingsBtn', (e) => {
    e.preventDefault();
    openBackpackSettings(applySettings);
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
        'html.bpNoScroll,html.bpNoScroll body{overflow:hidden !important;}' +
        '.bpSettingsDlg .ui-dialog-titlebar-close{display:none !important;}' +
        '.bpSettingsDlg .ui-dialog-titlebar{position:relative;}' +
        '.bpSetX{position:absolute;top:2px;right:6px;width:28px;height:28px;padding:0;border:1px solid transparent;border-radius:6px;' +
        'background:transparent;color:#f3e3b8;font-size:26px;font-weight:bold;line-height:1;cursor:pointer;opacity:1;}' +
        '.bpSetX:hover{background:rgba(224,178,82,.25);border-color:#e0b252;color:#fff;}' +
        // the game's grid is 5 columns of 64px; zoomed out it gets more columns so it still fills the width
        'body.bpSize50 .backpackTabContent{zoom:.5;grid-template-columns:repeat(10,64px);}' +
        'body.bpSize75 .backpackTabContent{zoom:.75;grid-template-columns:repeat(6,64px);}' +
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

export function installBackpack() {
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
}
