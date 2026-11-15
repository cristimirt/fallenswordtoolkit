// ---------------------------------------------------------------- settings
// Stored in localStorage under the FSB_ prefix (Fallen Sword Backpack).
export const FSB = 'FSB_';

const SETTINGS_KEY = FSB + 'settings';

// [key, label, group]: group q = quality row, p = property buttons, d = dropdowns.
export const FILTERS = [
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

export const PER_PAGE_CHOICES = [10, 20, 30, 40, 50, 100];

export const SIZE_CHOICES = [50, 75, 100];

 // item icon size, percent
export const DEFAULT_SETTINGS = { typeStyle: 'new', always: ['tg'], perPage: 20, size: 100, empty: true, modernPager: true, lockUse: true, lockExtract: true, quickBuffPopup: true, quickBuffInfo: true, autoBreak: false, autoBreakDry: false, autoBreakRar: [0, 1], autoBreakMin: null, autoBreakMax: null, breakBtn: true, wikiBtn: true, pfEnabled: true };

export const lvlOrNull = (v) => { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? null : n; };

export function loadSettings() {
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
    breakBtn: o.breakBtn !== false,
    wikiBtn: o.wikiBtn !== false,
    pfEnabled: o.pfEnabled !== false,
  };
}

export function saveSettings(v) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
}

// changes some settings, keeps the others as they are saved now (another tab may have changed them)
export function mergeSettings(patch) {
  SET = Object.assign(loadSettings(), patch);
  saveSettings(SET);
  return SET;
}

export let SET = loadSettings();

// Last state of Match Any, Advanced filters, Sort by and Sort order: written whenever
// they change, read back when the page loads.
export const remember = (k, v) => { try { localStorage.setItem(FSB + k, v); } catch (e) { /* storage unavailable */ } };

export const recall = (k) => { try { return localStorage.getItem(FSB + k); } catch (e) { return null; } };
// reads the stored settings again (after they were replaced as a whole)
export function reloadSettings() {
  SET = loadSettings();
  return SET;
}
