import { CRAFT_COLORS, RARITIES } from '../core/items.js';
import { $ } from '../core/util.js';
import { ensureSearchStyle, searchSelect } from './searchselect.js';

// ---------------------------------------------------------------- buff market: searchable buff select
// The Buff Market search form has a 140-option select per buff row (buff_type_0, _1, ...; "Add Buff"
// clones the row). The real select stays in the page, hidden, so the form and the game's own code
// work as before; a search box with a filtered list in front of it sets its value.
export function initBuffMarket() {
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

// ---------------------------------------------------------------- auction house: searchable, colour-coded filters
// Every filter select of the Auction House gets a search box (the real selects stay, hidden, so the page's own search works as
// before), in the look of the backpack's dropdowns. Item rarity gets the colour diamonds of the backpack's quality buttons, Minimum
// Craft the colour squares of its craft filter.
export function initAuctionHouse() {
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
