import { $ } from './util.js';
import { loadSettings } from './settings.js';

// The game's item tooltips (tip-dynamic) load fetchitem.php with $.ajax on every hover. The answers are kept for a few seconds, so hovering
// the same item again straight away makes no request. Short on purpose: a craft, upgrade or repair shows up in the tooltip after the
// expiry. Hooked at the jQuery ajax level, in front of the browser's own transport.
const TTL = 10000;
const MAX = 300;
const cache = new Map(); // key -> { t: time, text }
// the game adds &fst=... to every request and the url may be absolute: the key is the same either way
const keyOf = (u) => String(u).replace(/^https?:\/\/[^/]+\//, '').replace(/([?&])fst=[^&]*&?/, '$1').replace(/[?&]$/, '');
const isTip = (k) => /^fetchitem\.php\?/.test(k);

export function initTipCache() {
  if (!loadSettings().tipCache) return;
  if (!$ || !$.ajaxTransport || !$.ajaxPrefilter) return;
  const fresh = (k) => { const e = cache.get(k); if (e && Date.now() - e.t < TTL) return e; cache.delete(k); return null; };
  $.ajaxPrefilter('*', (o, orig, xhr) => {
    const k = keyOf(o.url);
    if (!isTip(k) || fresh(k)) return;
    xhr.done((t) => {
      if (typeof t !== 'string' || /<(!doctype|html|head|body)[\s>]/i.test(t)) return; // an error page is not kept
      if (cache.size >= MAX) cache.delete(cache.keys().next().value);
      cache.set(k, { t: Date.now(), text: t });
    });
  });
  $.ajaxTransport('+*', (o) => {
    const e = isTip(keyOf(o.url)) && fresh(keyOf(o.url));
    if (!e) return undefined; // not cached: jQuery uses its normal transport
    return { send: (h, done) => done(200, 'success', { text: e.text }), abort: () => {} };
  });
}
