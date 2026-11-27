import { loadMapData } from '../core/mapdata.js';
import { loadSettings } from '../core/settings.js';
import { $, esc } from '../core/util.js';

// ---------------------------------------------------------------- world map (master realm) tooltips
// The places on a world map's picture are the areas of an HTML image map. They have no box of their own, so the game's tooltip
// ends up in the top left corner of the page: here it is made first, under the place on the picture (the game's own call leaves a
// tooltip that exists alone). It also gets the level of the zone. The game does not send that, so it comes from the Path Finder's
// map data; a zone that cannot be matched with certainty enough just shows no level.
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// stairways: the game's [{ id, name }] of this world map; returns { stairway id: area of the map data }
export function matchZones(data, masterId, stairways) {
  const master = data.areas.find((a) => a.kind === 'master' && a.guideId === masterId);
  if (!master) return {};
  const byName = new Map(data.areas.map((a) => [a.name, a]));
  const entries = (master.entries || []).map((n) => byName.get(n)).filter(Boolean);
  const inWorld = data.areas.filter((a) => a.kind === 'realm' && a.world === master.name);
  const lowest = (list) => list.slice().sort((a, b) => a.level - b.level)[0];
  const found = {};
  stairways.forEach((s) => {
    const n = norm(s.name);
    const same = (a) => norm(a.name) === n;
    // "Citadel of Xinderoth" leads to "Citadel of Xinderoth (Floor 10)"
    const part = (a) => a.name.toLowerCase().startsWith(s.name.toLowerCase() + ' (');
    const hit = entries.find(same) || lowest(entries.filter(part)) || inWorld.find(same) || lowest(inWorld.filter(part));
    if (hit) found[s.id] = hit;
  });
  // one place left on the picture and one way in left in the data: they are each other (the game's names have typos)
  const left = stairways.filter((s) => !found[s.id]);
  const unused = entries.filter((a) => !Object.values(found).includes(a));
  if (left.length === 1 && unused.length === 1 && stairways.length === entries.length) found[left[0].id] = unused[0];
  return found;
}

export function initMasterMap() {
  if (window.top !== window.self || !loadSettings().mapTips) return;
  if (!/[?&]cmd=world(&|$)/.test(location.search)) return;
  const page = document.getElementById('worldPage');
  if (!page) return;
  let data = null;
  let asked = false;

  const gameMap = () => { try { return window.GameData.masterRealm(); } catch (e) { return null; } };

  // the point under a place: its circle (or other shape) on the picture, in page coordinates
  function under(area) {
    const box = area.closest('#masterRealmContainer');
    const img = box && box.querySelector('img[usemap]');
    if (!img) return null;
    const c = String(area.getAttribute('coords') || '').split(',').map(Number);
    const shape = (area.getAttribute('shape') || '').toLowerCase();
    let x; let y;
    if (shape === 'circle') { x = c[0]; y = c[1] + c[2]; } else {
      const xs = c.filter((v, i) => i % 2 === 0); const ys = c.filter((v, i) => i % 2 === 1);
      x = (Math.min(...xs) + Math.max(...xs)) / 2; y = Math.max(...ys);
    }
    const r = img.getBoundingClientRect();
    return [Math.round(r.left + window.scrollX + x), Math.round(r.top + window.scrollY + y + 4)];
  }

  function tip() {
    const point = under(this);
    if (!point || !$.fn.qtip) return;
    const api = $(this).qtip('api');
    if (api) { api.set({ 'position.target': point, 'content.text': this.getAttribute('data-tipped') }); return; }
    $(this).qtip({
      overwrite: false,
      show: { ready: true, effect: false },
      style: { classes: 'qtip-tipsy qtip-custom' },
      content: { text: this.getAttribute('data-tipped') },
      position: { target: point, my: 'top center', at: 'bottom center', effect: false, viewport: $(window) },
      hide: { event: 'mouseleave', effect: false },
    });
  }

  function decorate() {
    const areas = page.querySelectorAll('#masterRealmContainer area[data-tipped]');
    if (!areas.length) return;
    const map = gameMap();
    const zones = data && map ? matchZones(data, map.id, map.stairways || []) : {};
    areas.forEach((area) => {
      // bound on the area itself: this runs before the game's handler, which sits on the document
      if (!area.fsbTip) { area.fsbTip = true; $(area).on('mouseover.fsbMap', tip); }
      const id = String(area.getAttribute('href') || '').replace(/^.*#/, '');
      const zone = zones[id];
      const now = area.getAttribute('data-tipped');
      if (!zone || now.indexOf('fsbZoneLv') !== -1) return;
      const stair = map.stairways.find((s) => String(s.id) === id);
      // a name that is not the picture's (apart from a "(Floor 10)" and the like) is shown too: which zone the level is of
      const same = !stair || norm(zone.name.replace(/\s*\([^()]*\)$/, '')) === norm(stair.name) || norm(zone.name) === norm(stair.name);
      const line = '<span class="fsbZoneLv">Min level ' + zone.level + (same ? '' : ' (' + esc(zone.name) + ')') + '</span><br />';
      area.setAttribute('data-tipped', now.indexOf('<strong>') === -1 ? now + '<br />' + line : now.replace('<strong>', line + '<strong>'));
    });
    if (!data && !asked) {
      asked = true;
      loadMapData().then((d) => { data = d; decorate(); }).catch(() => { asked = false; });
    }
  }

  // the game draws the world map again on every visit
  new MutationObserver(decorate).observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tipped'] });
  decorate();
}
