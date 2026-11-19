/* global GameController, TileLocation, Sprite -- the game's own controller and classes of the world page */
import { loadSettings, recall, remember } from '../core/settings.js';

// The game's Footprints button (GameController.ToggleFootprints) forgets everything when the page is loaded again: that it was on,
// and the tiles it had marked. The game keeps the marks as a list of tiles on the current map (Realm.footprintTileList, one
// TileLocation per tile, added by Player._dropFootprint) and starts a new list whenever the button is pressed or the map changes.
// This keeps the button's state (FSB_footprintsOn) and, per map, the tiles (FSB_footprints: { <map id>: [[x, y], ...] }), and puts
// them back after a reload and when you come back to a map. Pressing the button clears them, as in the game.
const KEY = 'footprints';
const MAX_MAPS = 60; // the oldest maps are forgotten beyond this
const readAll = () => { try { const o = JSON.parse(recall(KEY)); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };

function saveRealm(realm) {
  if (!realm || realm.ID == null || !Array.isArray(realm.footprintTileList)) return;
  const all = readAll();
  delete all[realm.ID]; // written last = newest
  all[realm.ID] = realm.footprintTileList.map((t) => [t.RealmX, t.RealmY]);
  const ids = Object.keys(all);
  while (ids.length > MAX_MAPS) delete all[ids.shift()];
  remember(KEY, JSON.stringify(all));
}

// puts the saved tiles of this map into its list, the way Player._dropFootprint makes them
function restoreRealm(realm) {
  const tiles = readAll()[realm.ID];
  if (!Array.isArray(tiles) || !tiles.length) return;
  if (!Array.isArray(realm.footprintTileList)) realm.footprintTileList = [];
  const have = new Set(realm.footprintTileList.map((t) => t.RealmX + ',' + t.RealmY));
  tiles.forEach(([x, y]) => {
    if (have.has(x + ',' + y)) return;
    const frames = [{ source: { x: 0, y: 0 }, duration: 0 }];
    const tile = new TileLocation(realm, x, y, new Sprite(40, 40, realm.footprintTexture, frames), '');
    tile.x = 40 * x;
    tile.y = 40 * y;
    realm.footprintTileList.push(tile);
  });
  realm.footprintsUpdated = true;
}

export function initFootprints() {
  if (!/[?&]cmd=world(&|$)/.test(location.search) || !loadSettings().footprints) return;
  let tries = 0;
  const wait = setInterval(() => {
    tries++;
    const gc = typeof GameController !== 'undefined' ? GameController : null;
    // the Realm (the map) exists once the map data has arrived; the toggle and the player need it
    if (gc && gc.Realm && gc.Player && typeof gc.ToggleFootprints === 'function' && document.getElementById('toggle-footprints-button')) {
      clearInterval(wait);
      start(gc);
    } else if (tries > 80) {
      clearInterval(wait); // not the world page after all
    }
  }, 250);
}

function start(gc) {
  const toggle = gc.ToggleFootprints;
  gc.ToggleFootprints = function () {
    const r = toggle.apply(this, arguments);
    remember('footprintsOn', this.footprintsEnabled ? '1' : '0');
    remember(KEY, '{}'); // the game starts a new list: so do we
    return r;
  };
  const drop = gc.Player._dropFootprint;
  if (typeof drop === 'function') {
    gc.Player._dropFootprint = function () {
      const r = drop.apply(this, arguments);
      saveRealm(gc.Realm);
      return r;
    };
  }
  if (recall('footprintsOn') === '1' && !gc.footprintsEnabled) toggle.call(gc); // the game's own, which does not clear what was saved

  // a new Realm object means a new map (or the page's first one): put its saved footprints back once its picture is ready
  let done = null;
  setInterval(() => {
    const realm = gc.Realm;
    if (!realm || realm === done || !gc.footprintsEnabled || !realm.footprintTexture) return;
    done = realm;
    try { restoreRealm(realm); } catch (e) { console.warn('[Fallen Sword Toolkit] could not restore the footprints', e); }
  }, 400);
}
