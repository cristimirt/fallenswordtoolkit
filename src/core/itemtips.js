import { withFst } from './game.js';
import { RARITIES } from './items.js';
import { recall, remember } from './settings.js';
import { $ } from './util.js';

// Name, type, quality and buffs of items, read from their tooltips (fetchitem.php, the one the game shows on hover). Used by the
// Loyalty page and the Arena shop. One request at a time, kept in the browser (FSB_loyaltyTips) for 30 days: what shops sell almost
// never changes.
const KEY = 'loyaltyTips';
export const MAX_AGE = 30 * 24 * 3600 * 1000;
// the quality colours (in the order of RARITIES), darker so that they can be read on the paper
export const PAPER_COLORS = ['#3b2a14', '#007a7a', '#a000a0', '#a87400', '#c00000', '#6a3fb5', '#1a8a1a'];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the rarity of an item as an index in RARITIES (-1: not known), from the quality text, or else the colour of its name
export function rarityOf(info) {
  const q = String(info.q).replace(/\s*\(.*$/, '').trim().toLowerCase(); // "Crystalline (Non-Repairable)"
  const i = RARITIES.findIndex((r) => r[0].toLowerCase() === q);
  return i !== -1 ? i : RARITIES.findIndex((r) => r[1] === info.c);
}
// kept entries: not too old, and not one read before the "Item Details" heading was skipped
const fresh = (e) => !!e && Date.now() - e.at <= MAX_AGE && e.n !== 'Item Details';
export const itemIdOf = (tip) => { const m = /item_id=(\d+)/.exec(tip); return m ? m[1] : ''; };

function parseTip(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) { const x = n.nodeValue.replace(/\s+/g, ' ').trim(); if (x) nodes.push(x); }
  if (nodes[0] === 'Item Details') nodes.shift(); // the heading over the tooltip of an equippable item
  const eq = nodes.indexOf('Equipped Details'); // after it comes what you wear now, not this item
  if (eq !== -1) nodes.length = eq;
  if (nodes.length < 2) return null;
  const font = Array.from(doc.querySelectorAll('font[color]')).find((f) => f.textContent.trim() === nodes[0]); // the name, in the rarity's colour
  const tq = /^(.*?)\s+-\s+(.+)$/.exec(nodes[1]);
  const rest = nodes.slice(tq ? 2 : 1);
  const d = rest.indexOf('Duration');
  const buffs = [];
  if (d !== -1) {
    for (let i = d + 1; i + 2 < rest.length && /^\d+$/.test(rest[i + 1]) && /^\d+\s*[mhd]/i.test(rest[i + 2]); i += 3) buffs.push([rest[i], rest[i + 1], rest[i + 2]]);
  }
  const extra = buffs.length ? '' : rest.filter((x) => !/^Note:/.test(x)).join(' · ').slice(0, 220);
  return { n: nodes[0], t: tq ? tq[1] : nodes[1] === 'Quest' ? 'Quest Item' : '', q: tq ? tq[2] : '', c: font ? font.getAttribute('color').toUpperCase() : '', b: buffs, x: extra, at: Date.now() };
}

const getTip = (u) => new Promise((resolve) => { $.ajax({ url: withFst('/' + u.replace(/^\//, '')), dataType: 'text', success: (t) => resolve({ ok: true, t }), error: (x) => resolve({ ok: false, status: x.status }) }); });

// items: [{ key: item id, tip: the fetchitem address }]; onInfo(key, info) is called for each key, cached ones at once
export async function readItemTips(items, onInfo) {
  let cache = {};
  try { cache = JSON.parse(recall(KEY) || '{}') || {}; } catch (e) { cache = {}; }
  const save = () => {
    const now = Date.now();
    Object.keys(cache).forEach((k) => { if (!cache[k] || now - cache[k].at > MAX_AGE) delete cache[k]; });
    remember(KEY, JSON.stringify(cache));
  };
  const todo = new Map();
  items.forEach((it) => {
    if (fresh(cache[it.key])) onInfo(it.key, cache[it.key]);
    else todo.set(it.key, it.tip);
  });
  let fails = 0;
  for (const [key, tip] of todo) {
    for (;;) {
      const res = await getTip(tip);
      if (res.ok) {
        const info = parseTip(res.t);
        if (info) { cache[key] = info; save(); onInfo(key, info); }
        fails = 0;
        break;
      }
      // the game answers 503 when asked too fast: wait longer and try again, give up for this visit after a few
      if (++fails >= 4 || !(res.status === 503 || res.status === 429 || !res.status)) return;
      await sleep(2500 * fails);
    }
    await sleep(300 + Math.random() * 200);
  }
}
