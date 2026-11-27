import { recall } from './settings.js';

// The map data of the Path Finder website (route.json: every area with its level, stairs, portals and world maps), used by the
// Path Finder panel and the world map's tooltips. Fetched once per page; a different address can be set in localStorage
// FSB_pathfinderUrl. After a failure the next call tries again.
export const PF_SITE = 'https://cristimirt.github.io/fspathfinder/';
export const mapDataUrl = () => recall('pathfinderUrl') || PF_SITE + 'route.json';

let pending = null;
export function loadMapData() {
  if (!pending) {
    pending = fetch(mapDataUrl()).then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
    pending.catch(() => { pending = null; });
  }
  return pending;
}
