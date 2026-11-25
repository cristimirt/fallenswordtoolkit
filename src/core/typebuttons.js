import { esc } from './util.js';

// The item type buttons: the game's own type icons (of the guild store window), each with a count. Used by the Guild Store window
// and the Arena Token Shop. Several types can be selected at once; none selected means all.
export const ITEM_TYPES = ['Helmet', 'Armor', 'Gloves', 'Boots', 'Weapon', 'Shield', 'Ring', 'Amulet', 'Rune', 'Quest Item', 'Potion', 'Component', 'Resource', 'Recipe', 'Container', 'Composed', 'Frag Stash'];
const SPRITE = 'https://cdn2.fallensword.com/ui/misc/backpack_tabs2.png';
const ICON_TYPES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16];
const TYPE_X = (t) => -20 * (t > 11 ? t - 1 : t); // the icons are in the sprite in this order: type 11 has none

// the styles, under the given selector (the buttons have data-t: the type, or '' for all)
export const typeButtonsCss = (s) =>
  s + ' .gsTypes{display:flex;flex-wrap:wrap;gap:5px;}' +
  s + ' .gsTyp{position:relative;box-sizing:border-box;margin:0;padding:2px;cursor:pointer;background:#e6d6ab;border:2px solid #8a6a3a;border-radius:4px;box-shadow:inset 0 1px 0 rgba(255,255,255,.5);}' +
  s + ' .gsTyp:hover{background:#f0e3bf;}' + s + ' .gsTyp.on{background:#c8dc86;border-color:#4f6f12;box-shadow:inset 0 2px 4px rgba(0,0,0,.35);}' + s + ' .gsTyp.z:not(.on){opacity:.4;}' +
  s + ' .gsTyp i{display:block;width:18px;height:18px;background:url(' + SPRITE + ') 0 0 no-repeat;}' +
  s + ' .gsTyp i.gsTx{background:none;font:bold 9px/18px Arial,sans-serif;color:#3b2a14;text-align:center;font-style:normal;}' +
  s + ' .gsCnt{position:absolute;right:-4px;bottom:-5px;min-width:13px;height:13px;padding:0 3px;box-sizing:border-box;border-radius:7px;background:#2b2620;border:1px solid #8a6a3a;color:#fff;font:bold 9px/11px Arial,sans-serif;text-align:center;pointer-events:none;}';

// selected: a Set of types; counts: { type: number of items }; present: types of items that exist, to add those without an icon
export function typeButtonsHtml(selected, counts, present) {
  // every type the game has an icon for, also those with no item; another type that is present is added
  const have = Array.from(new Set(ICON_TYPES.concat(present))).sort((a, b) => a - b);
  const total = Object.keys(counts).reduce((n, t) => n + counts[t], 0);
  const btn = (t, name, n, inner) => '<button type="button" class="gsTyp' + ((t === '' ? !selected.size : selected.has(t)) ? ' on' : '') + (n ? '' : ' z') + '" data-t="' + t + '" title="' + esc(name) + '">' + inner + '<span class="gsCnt">' + n + '</span></button>';
  return btn('', 'All types', total, '<i style="background-position:-340px 0"></i>') +
    have.map((t) => btn(t, ITEM_TYPES[t] || 'Type ' + t, counts[t] || 0, ICON_TYPES.indexOf(t) === -1 ? '<i class="gsTx">' + esc((ITEM_TYPES[t] || '?').slice(0, 3)) + '</i>' : '<i style="background-position:' + TYPE_X(t) + 'px 0"></i>')).join('');
}

// a click on a button: '' clears the selection, a type is switched on or off
export function toggleType(selected, v) {
  if (v === '') { selected.clear(); return; }
  const n = +v;
  if (selected.has(n)) selected.delete(n); else selected.add(n);
}
