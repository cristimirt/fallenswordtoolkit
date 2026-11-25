import { bonus, perPoint } from '../features/skillguide.js';
import { withFst } from './game.js';
import { MAX_AGE } from './itemtips.js';
import { recall, remember } from './settings.js';
import { $, esc } from './util.js';

// A buff as the shops write it under or next to an item: the skill's icon and name, with its description as a tooltip. The skills of
// the game (id for the icon, description) are those of the Skills Guide page, read once and kept in the browser for 30 days.
const KEY = 'loyaltySkills';
const CDN = 'https://cdn2.fallensword.com/';
const snorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
let skills = null; // snorm(name) -> [id, description text]

export async function loadSkills() {
  if (!skills) {
    try { const o = JSON.parse(recall(KEY) || 'null'); if (o && Date.now() - o.at <= MAX_AGE && o.s) skills = o.s; } catch (e) { /* none */ }
  }
  if (skills) return;
  const t = await new Promise((resolve) => { $.ajax({ url: withFst('/index.php'), data: { cmd: 'skills', subcmd: 'guide' }, dataType: 'text', success: resolve, error: () => resolve(null) }); });
  if (!t) return;
  const doc = new DOMParser().parseFromString(t, 'text/html');
  const s = {};
  doc.querySelectorAll('tr').forEach((r) => {
    const td = r.querySelectorAll(':scope > td');
    const im = td[0] && td[0].querySelector('img');
    const id = im && /skills\/(\d+)\./.exec(im.getAttribute('src') || '');
    if (td.length >= 3 && id) s[snorm(td[1].textContent)] = [+id[1], td[2].textContent.replace(/\s+/g, ' ').trim()];
  });
  if (!Object.keys(s).length) return;
  skills = s;
  remember(KEY, JSON.stringify({ at: Date.now(), s }));
}

// the description of a skill with its per point value worked out for the level: "+0.2% per point increase ..." at 100 -> "+20% per point increase ..."
// (the figure is replaced, in green); a description without a plain per point value is shown as it is
function describe(desc, lvl) {
  const pp = perPoint(desc);
  if (!pp) return esc(desc);
  if (/\bevery\b|\bper \d+ points|\bper 50\b/i.test(desc)) return esc(desc);
  const m = /([+-]?\d+(?:\.\d+)?)(%| ?seconds?|s)?\s*(?:[a-z' ]{0,30}?)[, ]*per point/i.exec(desc) || /^([+-]?\d+(?:\.\d+)?)(%)/.exec(desc);
  if (!m) return esc(desc);
  const len = m[1].length + (m[2] ? m[2].length : 0);
  return esc(desc.slice(0, m.index)) + '<b style="color:#5fdc5f">' + esc(bonus(pp, lvl)) + '</b>' + esc(desc.slice(m.index + len));
}

export function buffTag(name, lvl) {
  const k = skills && skills[snorm(name)];
  if (!k) return esc(name);
  const tip = '<div style="max-width:280px;white-space:normal"><b>' + esc(name) + '</b><br>' + describe(k[1], parseInt(lvl, 10)) + '</div>';
  return '<span class="tip-static" data-tipped="' + esc(tip).replace(/"/g, '&quot;') + '"><img src="' + CDN + 'skills/' + k[0] + '.png" alt="">' + esc(name) + '</span>';
}
