import { withFst } from '../core/game.js';
import { info } from '../core/info.js';
import { DEFAULT_SETTINGS, FILTERS, PER_PAGE_CHOICES, SET, SIZE_CHOICES, loadSettings, lvlOrNull, mergeSettings, recall, reloadSettings, remember, saveSettings } from '../core/settings.js';
import { $, esc, openDialog } from '../core/util.js';
import { abLocks, autoBreakMatches, fetchBag } from './autobreak.js';

// ---------------------------------------------------------------- settings UI
// The settings are shown in two places: the quick settings of the backpack (only what belongs to the backpack, with a Save button)
// and the FST tab of the preferences page (everything, each change is saved at once). Both are built from the same pieces.
const SET_UI_CSS =
  '.bpMore{margin-top:12px;}' +
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
  '.bpChip:hover{background:#f0e3bf;}.bpChip.bpDragging{opacity:.4;}' +
  '';

export function ensureSetCss() {
  if (!$('#bpSetCss').length) $('head').append('<style id="bpSetCss">' + SET_UI_CSS + '</style>');
}

export let draftAlways = new Set();

 // the filters in "always visible" while the form is open
export let onSettingEdit = null;

 // the FST tab sets this: called after a filter was moved or a choice was clicked
// [?] with a dotted question mark; the text is shown by the #bpTipBox handlers below
const tip = (text) => '<span class="bpTip" data-tip="' + text + '">[<span class="bpQ">?</span>]</span>';

const sw = (id, on, label, help, attrs) =>
  '<div class="bpSwRow"><label class="bpSwitch"><input type="checkbox"' + (id ? ' id="' + id + '"' : '') + (attrs || '') + (on ? ' checked' : '') + '><span class="bpSlider"></span>' + label + '</label>' + (help ? ' ' + tip(help) : '') + '</div>';

const choiceHtml = (group, values, cur, unit) =>
  '<div>' + values.map((n) => '<span class="bpChoice' + (n === cur ? ' bp-on' : '') + '" data-g="' + group + '" data-v="' + n + '" role="button" tabindex="0">' + n + unit + '</span>').join('') + '</div>';

const choiceVal = (group, fallback) => {
  const n = parseInt($('.bpChoice[data-g="' + group + '"].bp-on').attr('data-v'), 10);
  return isNaN(n) ? fallback : n;
};

const chipsHtml = (inZone) =>
  FILTERS.filter((f) => draftAlways.has(f[0]) === inZone)
    .map((f) => '<span class="bpChip" draggable="true" data-f="' + f[0] + '" title="Drag to the other area (or click to move it)">' + f[1] + '</span>')
    .join('');

export function renderZones() {
  $('#bpZoneAlways').html(chipsHtml(true));
  $('#bpZoneAdv').html(chipsHtml(false));
}

function moveChip(key, toAlways) {
  if (toAlways) draftAlways.add(key); else draftAlways.delete(key);
  renderZones();
  if (onSettingEdit) onSettingEdit();
}

// the pieces of the forms
export const part = {
  type: (v) =>
    '<div class="bpSetH">Item type filter</div>' +
    sw('bpSetType', v.typeStyle === 'new', 'Item counts on the type icons', 'On shows how many items each type has and dims the types you have none of. Off keeps the game&#39;s own icons.'),
  filters: () =>
    '<div class="bpSetH">Filters ' + tip('Drag a filter to the other area, or click it. Always visible filters are shown at all times; the others appear when you press &quot;Advanced filters&quot; (the button is hidden when nothing is advanced). The game&#39;s own search box and Filters panel (level, set, sort) are always there.') + '</div>' +
    '<div class="bpZoneT">Always visible</div><div class="bpZone" id="bpZoneAlways" data-zone="a" data-empty="Drop filters here"></div>' +
    '<div class="bpZoneT">Advanced filters</div><div class="bpZone" id="bpZoneAdv" data-zone="v" data-empty="Drop filters here"></div>',
  display: (v) =>
    '<div class="bpSetH">Display</div>' +
    '<div class="bpZoneT">Items per page ' + tip('How many items the backpack shows on one page.') + '</div>' + choiceHtml('perPage', PER_PAGE_CHOICES, v.perPage, '') +
    '<div class="bpZoneT">Item size ' + tip('Scales the item icons in the backpack. Smaller icons fit more on the screen.') + '</div>' + choiceHtml('size', SIZE_CHOICES, v.size, '%') +
    sw('bpSetEmpty', v.empty, 'Show empty slots', 'Fills the last page with empty slots, up to the number of items per page.') +
    sw('bpSetModernPager', v.modernPager, 'Modern pagination', 'Rounded page buttons. The &quot;&lt;&quot; and &quot;&gt;&quot; buttons stay in place and are greyed out when there is no previous or next page, instead of disappearing. Also adds a copy of the page buttons above the items.'),
  locks: (v) =>
    '<div class="bpSetH">Locked items</div>' +
    sw('bpSetLockUse', v.lockUse, 'Locked items cannot be used', 'A locked item is always protected from Destroy and Break Down. With this on it also cannot be used (potions and other usable items), so you have to unlock it first. Equipping is never blocked.') +
    sw('bpSetLockExtract', v.lockExtract, 'Block extracting', 'With this on, a locked item cannot be extracted (components), and Extract All is refused when any item of that type is locked.'),
  autoBreak: (v) =>
    '<div class="bpSetH">Automatic break down</div>' +
    sw('bpSetAutoBreak', v.autoBreak, 'Break down items automatically', 'On every game page, every 5 seconds, every piece of equipment (helmet, armor, gloves, boots, weapon, shield, ring, amulet, rune) that matches the rarities and levels below is broken down. Locked, bound and guild tagged items and containers are never touched. Breaking down cannot be undone.') +
    sw('bpSetAutoBreakDry', v.autoBreakDry, 'Dry run', 'Nothing is broken down: the items that would be are listed in the browser console (F12) instead.') +
    [[0, 'Common'], [1, 'Rare'], [2, 'Unique']].map((r) => sw('', v.autoBreakRar.indexOf(r[0]) !== -1, r[1] + ' items', 'Equipment of this rarity is broken down.', ' class="bpAbRar" data-r="' + r[0] + '"')).join('') +
    '<div class="bpZoneT">Level range ' + tip('Only items from this minimum to this maximum level are broken down. Leave a box empty for no limit.') + '</div>' +
    '<div class="bpSwRow">Min <input type="number" min="0" id="bpSetAbMin" class="bpAbLvl" value="' + (v.autoBreakMin === null ? '' : v.autoBreakMin) + '"> Max <input type="number" min="0" id="bpSetAbMax" class="bpAbLvl" value="' + (v.autoBreakMax === null ? '' : v.autoBreakMax) + '"></div>' +
    '<div class="bpSwRow"><a href="#" id="bpAbLogBtn">View the log of broken down items</a> ' + tip('Every item that was broken down automatically, with the fragments it gave. The last 300 are kept.') + '</div>',
  quickBuff: (v) =>
    '<div class="bpSetH">Quick Buff</div>' +
    sw('bpSetQuickBuff', v.quickBuffPopup, 'Open Quick Buff in a pop-up', 'Instead of a separate browser window, Quick Buff opens in a window on the page that you can drag around.') +
    sw('bpSetQuickBuffInfo', v.quickBuffInfo, 'Buff information in the pop-up', 'In the Quick Buff pop-up: your Sustain and Fury Caster enhancements, whether Guild Buffer, Buff Master, Extend and Reinforce are on, the buffs a target already has (with their level) next to each buff, and the last activity and stamina of the target.'),
  look: (v) =>
    '<div class="bpSetH">Looks</div>' +
    sw('fstNotifStyle', v.notifStyle, 'Restyled notifications', 'The &quot;new logs&quot; and &quot;new Guild Chat messages&quot; notices in the menu get a softer look that matches the rest of the page, instead of the game&#39;s black box with a light border. Applied from the next page load.') +
    sw('fstTipCache', v.tipCache, 'Remember item tooltips for 10 seconds', 'Hovering an item again within 10 seconds shows the tooltip it had a moment ago, without asking the game again. A craft or upgrade shows up after those 10 seconds. Applied from the next page load.') +
    sw('fstSkillGuide', v.skillGuide, 'Improved Skills Guide', 'The Skill Guide page (Character > Skills > View Skill Guide) lists every skill with its type, whether it can be learned, the potions that have it (with level, duration and where they come from), whether it can be in a composed potion and from which composing level, with filters and a box to simulate the bonus at a skill level. The potion data comes from the wiki and was collected on 2026-11-20. Applied from the next page load.') +
    sw('fstLoyalty', v.loyaltyInfo, 'Item information on the Loyalty page', 'The Loyalty page shows, next to every item you can buy, its name, type and quality and, for potions, the buffs with their level and duration, so you do not have to hover each item. What it reads is kept for 30 days. Applied from the next page load.'),
  guild: (v) =>
    '<div class="bpSetH">Guild Store</div>' +
    sw('fstGuildStore', v.guildStore, 'Improved Guild Store window', 'The Store link of the Guild menu opens a window that lists the items of the guild store with their name, type, level and quality, has search and filters, can list the guild tagged items in the backpacks of the other members, and can deposit items from your backpack. Off: the game&#39;s own window. Takes effect on the next page load.'),
  map: (v) =>
    '<div class="bpSetH">World map</div>' +
    sw('fstBreakBtn', v.breakBtn, 'Quick Breakdown Button', 'A small hammer next to the loot you get from creatures in the action list: it breaks the item down instead of destroying it. Shown from the next page load.') +
    sw('fstWikiBtn', v.wikiBtn, 'Map Wiki button', 'A &quot;W&quot; button on the world page that opens the wiki page of the map you are on. Shown from the next page load.') +
    sw('fstFootprints', v.footprints, 'Remember Footprints', 'The game&#39;s Footprints button on the world page stays on after you reload the page, and the tiles it marked are kept for each map and put back. Pressing the button clears them, as in the game. Takes effect on the next page load.'),
  pf: (v) =>
    '<div class="bpSetH">Path Finder</div>' +
    sw('fstPfOn', v.pfEnabled, 'Path Finder', 'The Path Finder button on the world page, which opens a panel that shows the way to any area, step by step. Shown from the next page load.') +
    sw('fstPfPortals', recall('pathfinderPortals') !== '0', 'Use portals', 'Use portals to reach other world maps when working out the way. Off: the way never uses a portal. Same as the switch in the Path Finder panel.') +
    sw('fstPfWays', recall('pathfinderWaysOnly') === '1', 'Only the Cathedral of Ways portal', 'All the other portals, except the one in the Cathedral of Ways, are ignored when working out the way. Same as the switch in the Path Finder panel.'),
};

// what the forms hold (a piece that is not on the screen is not read)
const chk = (id, was) => { const $e = $('#' + id); return $e.length ? $e.prop('checked') : was; };

export const readBackpack = () => ({
  typeStyle: $('#bpSetType').prop('checked') ? 'new' : 'old',
  always: FILTERS.map((f) => f[0]).filter((k) => draftAlways.has(k)),
  perPage: choiceVal('perPage', DEFAULT_SETTINGS.perPage),
  size: choiceVal('size', DEFAULT_SETTINGS.size),
  empty: $('#bpSetEmpty').prop('checked'),
  modernPager: $('#bpSetModernPager').prop('checked'),
  lockUse: $('#bpSetLockUse').prop('checked'),
  lockExtract: $('#bpSetLockExtract').prop('checked'),
});

const readOthers = (was) => ({
  autoBreak: chk('bpSetAutoBreak', was.autoBreak),
  autoBreakDry: chk('bpSetAutoBreakDry', was.autoBreakDry),
  autoBreakRar: $('#bpSetAutoBreak').length ? $('.bpAbRar:checked').map(function () { return parseInt($(this).attr('data-r'), 10); }).get() : was.autoBreakRar,
  autoBreakMin: $('#bpSetAbMin').length ? lvlOrNull($('#bpSetAbMin').val()) : was.autoBreakMin,
  autoBreakMax: $('#bpSetAbMax').length ? lvlOrNull($('#bpSetAbMax').val()) : was.autoBreakMax,
  quickBuffPopup: chk('bpSetQuickBuff', was.quickBuffPopup),
  quickBuffInfo: chk('bpSetQuickBuffInfo', was.quickBuffInfo),
  breakBtn: chk('fstBreakBtn', was.breakBtn),
  wikiBtn: chk('fstWikiBtn', was.wikiBtn),
  pfEnabled: chk('fstPfOn', was.pfEnabled),
  footprints: chk('fstFootprints', was.footprints),
  notifStyle: chk('fstNotifStyle', was.notifStyle),
  guildStore: chk('fstGuildStore', was.guildStore),
  loyaltyInfo: chk('fstLoyalty', was.loyaltyInfo),
  tipCache: chk('fstTipCache', was.tipCache),
  skillGuide: chk('fstSkillGuide', was.skillGuide),
});

// Drag and drop between the two areas; a click moves the chip too (touch screens).
let dragKey = null;

// ------------------------------------------------------------ quick settings (backpack only)
// Only what belongs to the backpack is here, with a Save button. Everything else is in the FST tab of the preferences page
// (the link at the bottom). The pieces of the form are shared with that tab (see "settings UI" below).
const bpPopupHtml = (v) =>
  '<div id="bpSettingsWin">' +
  part.type(v) + part.filters() + part.display(v) + part.locks(v) +
  '<div class="bpSwRow bpMore"><a href="' + esc(withFst('/index.php?cmd=settings')) + '#fstSettings">More settings</a></div>' +
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
export function openBackpackSettings(applied) {
  ensureSetCss();
  draftAlways = new Set(SET.always);
  onSettingEdit = null;
  const buttons = [
    {
      text: 'Save',
      click: function () {
        mergeSettings(readBackpack());
        $(this).dialog('close');
        applied();
      },
    },
    {
      text: 'Defaults',
      click: function () {
        draftAlways = new Set(DEFAULT_SETTINGS.always);
        $('#bpSetBody').html(bpPopupHtml(DEFAULT_SETTINGS));
        renderZones();
      },
    },
    { text: 'Cancel', click: function () { $(this).dialog('close'); } },
  ];
  try { gameDraggable = $('#dialog_msg').dialog('option', 'draggable'); } catch (e) { /* keep the last value */ }
  openDialog({ title: 'Backpack settings', buttons, width: 440, draggable: true, close: settingsClosed },'<div id="bpSetBody">' + bpPopupHtml(SET) + '</div>');
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

// ---------------------------------------------------------------- the FST tab of the preferences page
// Every setting of the script, in categories. Each change is saved at once (like the tabs of the other scripts), except that
// turning on the automatic break down first shows how many items would go. Needs the tabs of the game's own preferences page.
// The Fallen Sword Helper adds its FSH tab after the page loaded, maybe after ours: keep our tab behind it (moved when it shows up).
function keepAfterFsh(tabs, id) {
  const nav = $(tabs).find('.ui-tabs-nav')[0];
  if (!nav) return;
  const fix = () => {
    const fsh = nav.querySelector('a[href="#fshSettings"]'), me = nav.querySelector('a[href="#' + id + '"]');
    if (!fsh || !me) return;
    const fli = fsh.closest('li'), mli = me.closest('li');
    if (fli.compareDocumentPosition(mli) & window.Node.DOCUMENT_POSITION_FOLLOWING) return;
    const act = Array.from(nav.children)[$(tabs).tabs('option', 'active')];
    fli.after(mli);
    $(tabs).tabs('refresh');
    if (act) $(tabs).tabs('option', 'active', Array.from(nav.children).indexOf(act));
  };
  fix();
  const mo = new MutationObserver(fix);
  mo.observe(nav, { childList: true });
  setTimeout(() => mo.disconnect(), 30000);
}

export function initFstTab() {
  if (!/[?&]cmd=settings(&|$)/.test(location.search)) return;
  const CATS = [['general', 'General'], ['backpack', 'Backpack'], ['break', 'Break down'], ['map', 'Map'], ['pf', 'Path Finder'], ['guild', 'Guild']];
  const panel = (c, v) => ({
    general: part.quickBuff(v) + part.look(v) +
      '<div class="bpSetH">All settings</div><div class="bpSwRow"><a href="#" id="fstReset">Restore the default settings</a> ' + tip('Puts every setting of the Fallen Sword Toolkit back to how it was when you installed it. Item locks and the log are kept.') + '</div>' +
      '<div class="bpSwRow"><a href="#" id="fstClearLog">Clear logs</a> ' + tip('Deletes the list of items that the automatic break down has broken down.') + '</div>' +
      '<div class="bpSwRow"><a href="#" id="fstIo">Export/Import settings</a> ' + tip('Shows your settings as text that you can copy, download, or replace with settings from a file, for example to use on another browser.') + '</div>' +
      '<div id="fstIoBox" style="display:none"><textarea id="fstIoText" spellcheck="false" aria-label="Settings as JSON"></textarea>' +
      '<div class="fstIoBtns"><button type="button" class="fstBtn go" id="fstIoApply">Apply settings</button><button type="button" class="fstBtn" id="fstIoDown">Download JSON</button><button type="button" class="fstBtn" id="fstIoUp">Upload JSON</button>' +
      '<input type="file" id="fstIoFile" accept=".json,application/json" style="display:none"></div><div id="fstIoMsg"></div></div>',
    backpack: part.type(v) + part.filters() + part.display(v) + part.locks(v),
    break: part.autoBreak(v),
    map: part.map(v),
    pf: part.pf(v),
    guild: part.guild(v),
  }[c]);
  let cat = recall('fstCat');
  if (!CATS.some((c) => c[0] === cat)) cat = CATS[0][0];
  const msg = (t) => { $('#fstMsg').text(t); };
  function render() {
    const v = loadSettings();
    draftAlways = new Set(v.always);
    $('#fstBody').html(
      '<div class="fstNav">' + CATS.map((c) => '<span class="fstCat' + (c[0] === cat ? ' bp-on' : '') + '" data-c="' + c[0] + '" role="button" tabindex="0">' + c[1] + '</span>').join('') + '</div>' +
      CATS.map((c) => '<div class="fstPanel" data-c="' + c[0] + '"' + (c[0] === cat ? '' : ' style="display:none"') + '>' + panel(c[0], v) + '</div>').join(''));
    renderZones();
  }
  let busy = false;
  async function save() {
    if (busy) return;
    busy = true;
    try {
      const cur = loadSettings();
      const patch = Object.assign({}, readBackpack(), readOthers(cur));
      const next = Object.assign({}, cur, patch);
      const same = ['autoBreak', 'autoBreakDry', 'autoBreakMin', 'autoBreakMax'].every((k) => cur[k] === next[k]) && cur.autoBreakRar.join() === next.autoBreakRar.join();
      if (!same && next.autoBreak && !next.autoBreakDry && next.autoBreakRar.length) {
        const items = await fetchBag();
        const locked = abLocks();
        const n = items ? autoBreakMatches(items, next, (id) => locked.has(String(id))).length : 0;
        if (n && !window.confirm('Automatic break down is on: ' + n + ' item' + (n === 1 ? '' : 's') + ' in your backpack match and will be broken down right away. This cannot be undone. Continue?')) { render(); return; }
      }
      mergeSettings(patch);
      if ($('#fstPfPortals').length) remember('pathfinderPortals', $('#fstPfPortals').prop('checked') ? '1' : '0');
      if ($('#fstPfWays').length) remember('pathfinderWaysOnly', $('#fstPfWays').prop('checked') ? '1' : '0');
      msg('Saved.');
    } finally { busy = false; }
  }
  onSettingEdit = save;

  function build(tabs) {
    ensureSetCss();
    $('head').append('<style id="fstStyle">' +
      '#settingsTabs.ui-tabs .ui-tabs-nav .ui-tabs-anchor{padding:.5em .7em;}' + // the tabs of the preferences page fit next to each other
      '#fstSettings{padding:10px 14px;color:#3b2a14;text-align:left}' +
      '#fstSettings .fstTitle{font-size:16px;font-weight:bold;margin:0 0 8px}#fstSettings .fstTitle small{font-size:11px;font-weight:normal;opacity:.7}' +
      '#fstSettings .fstNav{margin:0 0 6px}' +
      '#fstSettings .fstCat{display:inline-block;min-width:34px;box-sizing:border-box;margin:0 4px 4px 0;padding:4px 12px;text-align:center;cursor:pointer;user-select:none;-webkit-user-select:none;' +
      'font:bold 12px Arial,sans-serif;color:#3a2a12;background:#e6d6ab;border:2px solid #8a6a3a;border-radius:4px;}' +
      '#fstSettings .fstCat:hover{background:#f0e3bf}#fstSettings .fstCat.bp-on{background:#c8dc86;border-color:#4f6f12;box-shadow:inset 0 2px 4px rgba(0,0,0,.35)}' +
      '#fstSettings .fstPanel{max-width:520px;padding-bottom:6px}' +
      '#fstSettings .fstMsg{min-height:18px;margin:8px 0 0;font-weight:bold;color:#2c6a12}' +
      '#fstSettings a{color:#5a3a10}' +
      '#fstSettings #fstIoText{display:block;box-sizing:border-box;width:100%;height:200px;margin:4px 0 6px;padding:6px;resize:vertical;font:11px/1.35 Consolas,monospace;color:#3b2a14;background:#f6e8c4;border:1px solid #20170396;border-radius:3px;scrollbar-width:thin;scrollbar-color:#8a6a38 #d9b774;}' +
      '#fstSettings #fstIoText::-webkit-scrollbar{width:9px;height:9px;}#fstSettings #fstIoText::-webkit-scrollbar-track{background:#d9b774;border-radius:4px;box-shadow:inset 0 0 2px #20170399;}' +
      '#fstSettings #fstIoText::-webkit-scrollbar-thumb{background:#8a6a38;border:1px solid #20170396;border-radius:4px;}#fstSettings #fstIoText::-webkit-scrollbar-thumb:hover{background:#6b5230;}' +
      '#fstSettings .fstIoBtns{display:flex;flex-wrap:wrap;gap:6px;}#fstSettings #fstIoMsg{min-height:18px;margin-top:6px;font-weight:bold;}' +
      '#fstSettings .fstBtn{cursor:pointer;background:#e9d3a0;color:#3b2a14;border:1px solid #20170396;border-radius:3px;padding:3px 12px;font:bold 12px Arial,sans-serif;box-shadow:0 0 2px #00000066;}' +
      '#fstSettings .fstBtn:hover{background:#f3e2b8;}#fstSettings .fstBtn.go{background:#c9dc9a;}#fstSettings .fstBtn.go:hover{background:#d6e8a8;}' +
      '</style>');
    $(tabs).find('.ui-tabs-nav').append('<li><a href="#fstSettings">FST</a></li>');
    $(tabs).append('<div id="fstSettings"><div class="fstTitle">Fallen Sword Toolkit <small>version ' + esc(info.version) + ', build ' + esc(info.build) + '</small></div><div id="fstBody"></div><div class="fstMsg" id="fstMsg"></div></div>');
    render();
    $(tabs).tabs('refresh');
    keepAfterFsh(tabs, 'fstSettings');
    // the link "More settings" of the backpack lands here
    if (location.hash === '#fstSettings') $(tabs).tabs('option', 'active', $(tabs).find('.ui-tabs-nav li').index($(tabs).find('a[href="#fstSettings"]').parent()));
  }

  $(document).on('change', '#fstSettings input[type=checkbox], #fstSettings input[type=number]', save);
  $(document).on('keydown', '#fstSettings input[type=number]', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }); // not the game's form
  $(document).on('click keydown', '#fstSettings .fstCat', function (e) {
    if (e.type === 'keydown') {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
    }
    cat = $(this).attr('data-c');
    remember('fstCat', cat);
    $('#fstSettings .fstCat').removeClass('bp-on');
    $(this).addClass('bp-on');
    $('#fstSettings .fstPanel').hide().filter('[data-c="' + cat + '"]').show();
  });
  $(document).on('click', '#fstClearLog', (e) => {
    e.preventDefault();
    if (!window.confirm('Delete the break down log?')) return;
    remember('abLog', '[]');
    msg('Logs cleared.');
  });
  $(document).on('click', '#fstReset', (e) => {
    e.preventDefault();
    if (!window.confirm('Put all the Fallen Sword Toolkit settings back to their defaults?')) return;
    saveSettings(Object.assign({}, DEFAULT_SETTINGS, { always: DEFAULT_SETTINGS.always.slice(), autoBreakRar: DEFAULT_SETTINGS.autoBreakRar.slice() }));
    reloadSettings();
    remember('pathfinderWaysOnly', '0');
    remember('pathfinderPortals', '1');
    render();
    msg('Defaults restored.');
  });

  // export / import: the settings, the item locks and the choices made in the windows (not the log, caches or window positions)
  const KEEP = ['sidebar', 'pathfinderWaysOnly', 'pathfinderPortals', 'gsMembers', 'gsView', 'gsSize', 'matchAny', 'advOpen', 'sortKey', 'sortDesc', 'sortOrder', 'footprintsOn', 'qbSort'];
  const exportFile = () => {
    const data = {};
    KEEP.forEach((k) => { const x = recall(k); if (x !== null) data[k] = x; });
    return { app: 'fallen-sword-toolkit', version: info.version, exported: new Date().toISOString(), settings: loadSettings(), locked: Array.from(abLocks()), data };
  };
  const ioMsg = (t, bad) => { $('#fstIoMsg').text(t).css('color', bad ? '#a00000' : '#2c6a12'); };
  // the text must be JSON of this script: returns the object, or '' with the reason shown
  function readFile(text) {
    let o = null;
    try { o = JSON.parse(String(text)); } catch (err) { ioMsg('That is not valid JSON: ' + err.message, true); return null; }
    if (!o || typeof o !== 'object' || o.app !== 'fallen-sword-toolkit') { ioMsg('This JSON is not from the Fallen Sword Toolkit.', true); return null; }
    if (!o.settings || typeof o.settings !== 'object' || Array.isArray(o.settings)) { ioMsg('This Fallen Sword Toolkit file has no settings in it.', true); return null; }
    return o;
  }
  $(document).on('click', '#fstIo', (e) => {
    e.preventDefault();
    const $b = $('#fstIoBox');
    if ($b.is(':visible')) { $b.hide(); return; }
    $('#fstIoText').val(JSON.stringify(exportFile(), null, 2));
    ioMsg('');
    $b.show();
  });
  $(document).on('click', '#fstIoDown', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(exportFile(), null, 2)], { type: 'application/json' }));
    a.download = 'fallen-sword-toolkit-settings.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    ioMsg('Settings downloaded.');
  });
  $(document).on('click', '#fstIoUp', () => { $('#fstIoFile').val('').trigger('click'); });
  $(document).on('change', '#fstIoFile', function () {
    const f = this.files && this.files[0];
    if (!f) return;
    if (f.size > 2e6) { ioMsg('That file is too big to be a settings file.', true); return; }
    const r = new FileReader();
    r.onload = () => {
      const o = readFile(r.result);
      if (!o) return;
      $('#fstIoText').val(JSON.stringify(o, null, 2));
      ioMsg('The file was loaded into the box. Click "Apply settings" to use it.');
    };
    r.onerror = () => ioMsg('The file could not be read.', true);
    r.readAsText(f);
  });
  $(document).on('click', '#fstIoApply', () => {
    const o = readFile($('#fstIoText').val());
    if (!o) return;
    saveSettings(Object.assign({}, DEFAULT_SETTINGS, o.settings));
    reloadSettings();
    KEEP.forEach((k) => { if (o.data && typeof o.data[k] === 'string') remember(k, o.data[k]); });
    if (Array.isArray(o.locked)) { const all = abLocks(); o.locked.forEach((id) => all.add(String(id))); remember('locked', JSON.stringify(Array.from(all))); }
    render();
    $('#fstIoBox').show();
    $('#fstIoText').val(JSON.stringify(exportFile(), null, 2));
    ioMsg('Settings applied. Reload the page to see all of it.');
  });

  // the game builds its tabs after the page is loaded (and other scripts add their own): wait for them
  let tries = 0;
  const wait = setInterval(() => {
    const tabs = document.getElementById('settingsTabs');
    if (tabs && $(tabs).hasClass('ui-tabs') && $(tabs).find('.ui-tabs-nav').length) {
      clearInterval(wait);
      if (!document.getElementById('fstSettings')) build(tabs);
    } else if (++tries > 40) clearInterval(wait);
  }, 500);
}

export function installSettingsui() {
  // tooltip for the [?] marks; one box in the page, so a window cannot clip it
  $(document).on('mouseenter', '.bpTip', function () {
    let $b = $('#bpTipBox');
    if (!$b.length) $b = $('<div id="bpTipBox"></div>').appendTo('body');
    const r = this.getBoundingClientRect();
    $b.text(this.getAttribute('data-tip')).show();
    const w = $b.outerWidth();
    $b.css({ left: Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)), top: r.bottom + 6 });
  });
  $(document).on('mouseleave', '.bpTip', () => $('#bpTipBox').hide());
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
    if (onSettingEdit) onSettingEdit();
  });
  $(document).on('click', '.bpChip', function () {
    const key = $(this).attr('data-f');
    moveChip(key, !draftAlways.has(key));
  });
}
