import { loadSettings, recall, remember } from '../core/settings.js';
import { toggleHtml, useToggleStyle } from '../core/toggle.js';
import { $, esc } from '../core/util.js';
import { withFst } from '../core/game.js';
import { COMPOSE, LEARN, POTIONS, TREES } from '../data/skillpotions.js';
import { UNRELEASED_SKILLS } from '../data/unreleasedskills.js';

// ---------------------------------------------------------------- improved Skills Guide
// index.php?cmd=skills&subcmd=guide lists every skill of the game: the icon, the name and what it does. This replaces the list (setting
// skillGuide, FST tab > Looks) with one where every skill also shows
//   - its type (Offense / Defense / Special: the three skill trees; a skill that is in none of them has no known type),
//   - whether players can learn it (it is in a skill tree) or it only comes from potions; for a skill that can be learned also the level needed,
//     the skill that has to be learned first, the stamina it costs and how long it lasts (LEARN in src/data/skillpotions.js),
//   - the potions that have it, with the level, the duration and where the potion comes from (wiki data, src/data/skillpotions.js),
//   - whether it can be in a composed potion: from which composing level on, and the highest level a composed potion can have it,
// and a bar of filters, and two boxes that work out the bonus at a skill level and what a composing level allows.
// The skills and their descriptions are the game's own: they are read from the page that was replaced. Added to them are the
// unreleased ones (src/data/unreleasedskills.js), marked as such.
const TYPE_NAMES = ['Offense', 'Defense', 'Special'];
const CDN = 'https://cdn2.fallensword.com/';
const LIGHT = { Common: '#3b2a14', Rare: '#007a7a', Unique: '#a000a0', Legendary: '#a87400', 'Super Elite': '#c00000', Crystalline: '#6a3fb5', Epic: '#1a8a1a' };
const KIND_ORDER = ['chest', 'drop', 'quest', 'recipe', 'gift', 'shop', 'won', 'pvp', 'ladder', 'allegiance'];
const KIND_FILTER = [['', 'Any source'], ['chest', 'Chest'], ['drop', 'Creature drop'], ['quest', 'Quest reward'], ['recipe', 'Recipe'], ['gift', 'Gift / event'], ['shop', 'Shop'], ['won', 'Auction'], ['pvp', 'PvP tokens'], ['ladder', 'Ladder tokens'], ['allegiance', 'Allegiance tokens']];
const sourceText = (s) => {
  const v = s[1];
  switch (s[0]) {
    case 'chest': return v;
    case 'drop': return 'Dropped by ' + v;
    case 'quest': return 'Quest: ' + v;
    case 'recipe': return v === 'craftable' ? 'Crafted' : v;
    case 'gift': return 'Gift: ' + v;
    case 'won': return 'Won: ' + v;
    case 'pvp': return v + ' PvP tokens';
    case 'ladder': return v + ' Ladder tokens';
    case 'allegiance': return v + ' Allegiance tokens';
    case 'shop': return 'Shop: ' + v;
    default: return v;
  }
};
// "Christmas Gift Box 2015", "... 2016", ... -> "Christmas Gift Box 2015-2026" (a run of years of the same chest)
function joinYears(list) {
  const base = new Map(); const out = [];
  list.forEach((t) => {
    const m = t.match(/^(.*\D) (\d{4})$/);
    if (!m) { out.push(t); return; }
    if (!base.has(m[1])) { base.set(m[1], []); out.push({ b: m[1] }); }
    base.get(m[1]).push(+m[2]);
  });
  return out.map((o) => {
    if (typeof o === 'string') return o;
    const ys = base.get(o.b).sort((a, b) => a - b); const parts = []; let s = ys[0], p = ys[0];
    for (let i = 1; i <= ys.length; i++) { if (ys[i] === p + 1) { p = ys[i]; continue; } parts.push(s === p ? String(s) : s + '-' + p); s = ys[i]; p = ys[i]; }
    return o.b + ' ' + parts.join(', ');
  });
}
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v) => (v === '' || v == null ? null : Math.max(0, parseFloat(v)) || 0);
const fmt = (n) => String(Math.round(n * 1000) / 1000);

// "+0.1% chance per point to ..." -> { v: 0.1, unit: '%' }; null when the skill has no plain per point value
export function perPoint(descHtml) {
  const t = descHtml.replace(/<[^>]+>/g, '');
  if (/\bevery\b|\bper \d+ points|\bper 50\b/i.test(t)) return null;
  let m = t.match(/([+-]?\d+(?:\.\d+)?)(%| ?seconds?|s)?\s*(?:[a-z' ]{0,30}?)[, ]*per point/i);
  if (!m) m = t.match(/^([+-]?\d+(?:\.\d+)?)(%)/);
  return m ? { v: parseFloat(m[1]), unit: (m[2] || '').trim() === 's' ? ' s' : (m[2] || '').replace(/^ ?seconds?$/i, ' s') } : null;
}
export const bonus = (pp, level) => (pp ? (pp.v * level >= 0 && pp.v > 0 ? '+' : '') + fmt(pp.v * level) + pp.unit : '');

// the highest level of a skill in a composed potion at a composing level; null = not yet possible
function composeMax(c, lvl) {
  if (!c || lvl < c[0]) return null;
  return Math.min(c[3], c[1] + (lvl - c[0]) * c[4]);
}

export function initSkillGuide() {
  if (!loadSettings().skillGuide) return;
  if (!/[?&]cmd=skills\b/.test(location.search) || !/[?&]subcmd=guide\b/.test(location.search)) return;
  const $tbl = $('#pCC table table').first();
  if (!$tbl.length) return;

  // the game's own list: id (the icon), name, description
  const skills = [];
  $tbl.find('tr').each(function () {
    const td = this.querySelectorAll('td');
    const im = td[0] && td[0].querySelector('img');
    if (td.length < 3 || !im) return;
    const id = +((im.src.match(/skills\/(\d+)\./) || [])[1]);
    skills.push({ id, name: td[1].textContent.trim(), desc: td[2].innerHTML.replace(/\s+/g, ' ').trim() });
  });
  if (!skills.length) return;
  UNRELEASED_SKILLS.forEach(([id, name]) => {
    if (skills.some((s) => s.id === id || norm(s.name) === norm(name))) return;
    skills.push({ id, name, desc: 'Unreleased. Only listed in the Auction House\'s "Grants Buff" filter.', unreleased: true });
  });
  const byName = new Map(skills.map((s) => [norm(s.name), s]));
  skills.forEach((s) => { s.pp = perPoint(s.desc); s.potions = []; s.comp = COMPOSE[s.name] || null; s.type = -1; s.learn = false; s.rec = false; s.lr = LEARN[s.id] || null; });
  const byId = new Map(skills.map((s) => [s.id, s]));
  POTIONS.forEach((p) => p[3].forEach((b) => { const s = byName.get(norm(b[0])); if (s) s.potions.push({ id: p[0], name: p[1], rar: p[2], lvl: b[1], min: b[2], src: p[4] }); }));
  skills.forEach((s) => s.potions.sort((a, b) => b.lvl - a.lvl || a.name.localeCompare(b.name)));

  const setTrees = (trees) => skills.forEach((s) => { trees.forEach((ids, t) => { if (ids.indexOf(s.id) !== -1) { s.type = t; s.learn = true; } }); });
  setTrees(TREES);
  // the skill trees of the game are the truth: ask for them and use the built in ids only if that fails
  Promise.all([0, 1, 2].map((t) => new Promise((resolve) => {
    $.ajax({ url: withFst('/index.php'), data: { cmd: 'skills', tree_id: t }, dataType: 'text', success: resolve, error: () => resolve(null) });
  }))).then((pages) => {
    if (pages.some((p) => !p)) return;
    const trees = pages.map((h) => { const ids = []; $('<div>').html(h.replace(/<img/g, '<i data-x').replace(/src=/g, 'data-src=')).find('a[href*="skill_id="]').each(function () { ids.push(+((this.getAttribute('href').match(/skill_id=(\d+)/) || [])[1])); }); return ids; });
    if (trees.some((t) => !t.length)) return;
    skills.forEach((s) => { s.type = -1; s.learn = false; });
    setTrees(trees);
    draw();
  });

  // ---------- state
  const st = { q: recall('sgQ') || '', type: recall('sgType') || '', learn: recall('sgLearn') || '', pot: recall('sgPot') || '', comp: recall('sgComp') || '', src: recall('sgSrc') || '', sort: recall('sgSort') || 'name', lvl: num(recall('sgLvl')), clvl: num(recall('sgCLvl')) };
  const open = new Set();
  const simBy = new Map(); // skill id -> the level simulated for that skill alone (the Simulate button next to a potion)
  const WIKI = 'https://wiki.fallensword.com/index.php/';
  const wikiUrl = (name) => WIKI + encodeURIComponent(name.replace(/ /g, '_')).replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2C/g, ',').replace(/%27/g, "'");
  const guideUrl = (id) => 'https://guide.fallensword.com/index.php?cmd=items&subcmd=view&item_id=' + id;
  const lk = (href, label, title) => '<a class="sgLk" href="' + esc(href) + '" target="_blank" rel="noopener" title="' + esc(title) + '">' + label + '</a>';
  const sw = (id, on, label) => '<label class="sgSw">' + toggleHtml('id="' + id + '"', on) + label + '</label>';
  const opts = (list, cur) => list.map((o) => '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('');

  // ---------- style
  if (!document.getElementById('fsbSgStyle')) {
    const el = document.createElement('style');
    el.id = 'fsbSgStyle';
    el.textContent =
      '#fsbSg{font-size:12px;color:#3b2a14;text-align:left;}#fsbSg *{box-sizing:border-box;}' +
      '#fsbSg .sgBar{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:0 0 8px;padding:7px 8px;background:#e9d6a3;border:1px solid #20170396;border-radius:4px;}' +
      '#fsbSg .sgBar input[type=text],#fsbSg .sgBar input[type=number],#fsbSg .sgBar select{font:inherit;background:#f6e8c4;border:1px solid #20170396;border-radius:3px;padding:2px 4px;color:#3b2a14;}' +
      '#fsbSg .sgBar input[type=text]{width:170px;}#fsbSg .sgBar input[type=number]{width:70px;}' +
      '#fsbSg .sgBar b{font-weight:600;}#fsbSg .sgBtn{font:inherit;background:#d9b774;border:1px solid #20170396;border-radius:3px;padding:2px 8px;color:#3b2a14;cursor:pointer;}#fsbSg .sgBtn:hover{background:#e6c783;}' +
      '#fsbSg .sgCount{margin-left:auto;color:#6b5230;}' +
      '#fsbSg .sgSw,#fsbSg .sgSw *{cursor:pointer !important;}#fsbSg .sgSw{display:inline-flex;align-items:center;gap:5px;}' +
      '#fsbSg .sgRow{display:flex;gap:10px;padding:8px 6px;border-top:1px solid #20170340;}#fsbSg .sgRow:first-child{border-top:0;}' +
      '#fsbSg .sgIco{flex:none;width:40px;height:40px;border:1px solid #20170396;border-radius:3px;background:#2e261c;}' +
      '#fsbSg .sgNoImg{display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#d9b774;}' +
      '#fsbSg .sgMain{flex:1;min-width:0;}#fsbSg .sgName{font-size:14px;font-weight:700;color:#201703;}' +
      '#fsbSg .sgDesc{margin:2px 0 4px;color:#3b2a14;}' +
      '#fsbSg .sgFacts{display:flex;flex-wrap:wrap;gap:3px 14px;color:#6b5230;}#fsbSg .sgFacts b{font-weight:600;color:#3b2a14;}#fsbSg .sgYes{color:#2f6a12 !important;}#fsbSg .sgNo{color:#8a6a38 !important;}' +
      '#fsbSg .sgLine{margin-top:3px;}#fsbSg .sgLine b{color:#201703;}#fsbSg .sgSimv{color:#2f6a12;font-weight:600;}' +
      '#fsbSg a.sgLk,#fsbSg button.sgLk{display:inline-block;margin-left:6px;padding:0 6px;font:bold 10px/16px Arial,sans-serif;color:#3b2a14;background:#e9d3a0;border:1px solid #20170396;border-radius:3px;text-decoration:none;cursor:pointer;vertical-align:middle;}' +
      '#fsbSg a.sgLk:hover,#fsbSg button.sgLk:hover{background:#f3e2b8;}#fsbSg button.sgLk.on{background:#c9dc9a;border-color:#4f6f12;}' +
      '#fsbSg .sgToggle{margin-top:4px;background:none;border:0;padding:0;font:inherit;color:#0b5394;cursor:pointer;text-decoration:underline;}' +
      '#fsbSg .sgPots{margin-top:4px;border:1px solid #20170340;border-radius:3px;background:#f6e8c4;max-height:320px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#8a6a38 #d9b774;}' +
      '#fsbSg .sgPots::-webkit-scrollbar{width:9px;height:9px;}#fsbSg .sgPots::-webkit-scrollbar-track{background:#d9b774;border-radius:4px;box-shadow:inset 0 0 2px #20170399;}#fsbSg .sgPots::-webkit-scrollbar-thumb{background:#8a6a38;border:1px solid #20170396;border-radius:4px;}#fsbSg .sgPots::-webkit-scrollbar-thumb:hover{background:#6b5230;}' +
      '#fsbSg .sgPot{display:flex;gap:8px;align-items:center;padding:3px 6px;border-top:1px solid #20170326;}#fsbSg .sgPot:first-child{border-top:0;}' +
      '#fsbSg .sgPot img{flex:none;width:24px;height:36px;border-radius:2px;background:#2e261c;}#fsbSg .sgPot .sgNoIc{flex:none;width:24px;height:36px;border-radius:2px;background:#d9b774;}' +
      '#fsbSg .sgPotT{min-width:0;flex:1;}#fsbSg .sgPotT a{font-weight:600;cursor:default;text-decoration:none;}#fsbSg .sgPotT small{display:block;color:#6b5230;font-size:11px;}' +
      '#fsbSg .sgPotL{flex:none;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}#fsbSg .sgPotL small{display:block;color:#6b5230;font-size:11px;}' +
      '#fsbSg .sgNone{padding:20px;text-align:center;color:#6b5230;}';
    document.head.appendChild(el);
    useToggleStyle();
  }

  // ---------- page
  const $host = $tbl.closest('td');
  $tbl.hide();
  const $root = $('<div id="fsbSg"></div>').appendTo($host);
  const types = [['', 'Any type']].concat(TYPE_NAMES.map((n, i) => [String(i), n]), [['-1', 'No known type']]);
  const yn = (a) => [['', a], ['y', 'Yes'], ['n', 'No']];
  const sorts = [['name', 'Sort: name'], ['type', 'Sort: type'], ['level', 'Sort: level to learn'], ['pots', 'Sort: most potions'], ['max', 'Sort: highest potion level']];
  $root.html(
    '<div class="sgBar"><input type="text" id="sgQ" placeholder="Name, text or potion" autocomplete="off" spellcheck="false">' +
    '<select id="sgType">' + opts(types, st.type) + '</select>' +
    '<select id="sgLearn">' + opts([['', 'Learned: any'], ['y', 'Can be learned'], ['n', 'Cannot be learned']], st.learn) + '</select>' +
    '<select id="sgPot">' + opts([['', 'Potions: any'], ['y', 'In potions'], ['n', 'Not in potions']], st.pot) + '</select>' +
    '<select id="sgComp">' + opts([['', 'Composed: any'], ['y', 'In composed potions'], ['n', 'Not in composed potions']], st.comp) + '</select>' +
    '<select id="sgSrc" title="Skills that are in a potion from this source">' + opts(KIND_FILTER, st.src) + '</select>' +
    '<select id="sgSort">' + opts(sorts, st.sort) + '</select></div>' +
    '<div class="sgBar"><b>Simulate</b> skill level <input type="number" id="sgLvl" min="0" placeholder="level"> composing level <input type="number" id="sgCLvl" min="1" placeholder="level">' +
    sw('sgAll', false, 'Show all potion lists') + '<button type="button" class="sgBtn" id="sgReset">Clear</button><span class="sgCount" id="sgCount"></span></div>' +
    '<div id="sgList"></div>');
  $('#sgQ').val(st.q);
  if (st.lvl != null) $('#sgLvl').val(st.lvl);
  if (st.clvl != null) $('#sgCLvl').val(st.clvl);

  // ---------- drawing
  const matches = (s) => {
    if (st.type !== '' && String(s.type) !== st.type) return false;
    if (st.learn && s.learn !== (st.learn === 'y')) return false;
    if (st.pot && (s.potions.length > 0) !== (st.pot === 'y')) return false;
    if (st.comp && !!s.comp !== (st.comp === 'y')) return false;
    if (st.src && !s.potions.some((p) => p.src.some((x) => x[0] === st.src))) return false;
    if (st.q) {
      const q = st.q.toLowerCase();
      const hay = (s.name + ' ' + s.desc.replace(/<[^>]+>/g, '')).toLowerCase();
      if (hay.indexOf(q) === -1 && !s.potions.some((p) => p.name.toLowerCase().indexOf(q) !== -1)) return false;
    }
    return true;
  };
  const fact = (label, yes, text) => '<span>' + label + ' <b class="' + (yes ? 'sgYes' : 'sgNo') + '">' + text + '</b></span>';
  const potHtml = (s) => s.potions.map((p) => {
    const tip = p.id ? ' class="tip-dynamic" data-tipped="' + esc('fetchitem.php?item_id=' + p.id + '&inv_id=-1&t=2&p=-1') + '"' : '';
    const ss = p.src.slice().sort((a, b) => KIND_ORDER.indexOf(a[0]) - KIND_ORDER.indexOf(b[0]));
    const srcs = joinYears(ss.filter((x) => x[0] === 'chest').map(sourceText)).concat(ss.filter((x) => x[0] !== 'chest').map(sourceText));
    const b = s.pp ? bonus(s.pp, p.lvl) : '';
    return '<div class="sgPot">' + (p.id ? '<img' + tip + ' src="' + CDN + 'items/' + p.id + '.gif" alt="" loading="lazy">' : '<span class="sgNoIc"></span>') +
      '<div class="sgPotT"><a' + tip + ' style="color:' + (LIGHT[p.rar] || '#3b2a14') + '">' + esc(p.name) + '</a>' + lk(wikiUrl(p.name), 'Wiki', 'Wiki page of ' + p.name) + (p.id ? lk(guideUrl(p.id), 'Guide', 'Guide page of ' + p.name) : '') + '<small>' + (srcs.length ? esc(srcs.join(' · ')) : 'Source not known') + '</small></div>' +
      '<div class="sgPotL"><b>Level ' + p.lvl + '</b> <button type="button" class="sgLk sgSim' + (simBy.get(s.id) === p.lvl ? ' on' : '') + '" data-id="' + s.id + '" data-lvl="' + p.lvl + '" title="Simulate this skill at level ' + p.lvl + '">Simulate</button>' + (b ? ' <span class="sgSimv">' + esc(b) + '</span>' : '') + '<small>' + p.min + ' min</small></div></div>';
  }).join('');
  // what the skill tree of the game shows for a skill that can be learned
  const learnFacts = (s) => {
    const l = s.lr;
    if (!s.learn || !l) return '';
    const pre = l[3] >= 0 && byId.get(l[3]);
    return fact('Level', true, l[0] + '+') + fact('Needs', !!pre, pre ? esc(pre.name) + ' (10 points)' : 'nothing first') + fact('Stamina', true, l[1]) + fact('Duration', true, l[2] + ' min');
  };
  const rowHtml = (s) => {
    const showPots = open.has(s.id) || $('#sgAll').prop('checked');
    const c = s.comp;
    let sim = '';
    const lv = simBy.has(s.id) ? simBy.get(s.id) : st.lvl; // the level of the Simulate button next to a potion, else the one of the box on top
    if (lv != null && !s.unreleased) sim += s.pp ? '<div class="sgLine">At skill level <b>' + lv + '</b>: <span class="sgSimv">' + esc(bonus(s.pp, lv)) + '</span></div>' : '<div class="sgLine">At skill level <b>' + lv + '</b>: this skill has no simple bonus per point.</div>';
    let comp = '';
    if (c) {
      comp = '<div class="sgLine">Composed potions: from composing level <b>' + c[0] + '</b>, up to skill level <b>' + c[3] + '</b>' + (c[2] > c[0] ? ' (the maximum is reached at composing level ' + c[2] + ')' : '') + '.';
      if (st.clvl != null) {
        const m = composeMax(c, st.clvl);
        comp += m == null ? ' <span class="sgNo">At composing level ' + st.clvl + ' it cannot be used yet.</span>' : ' At composing level <b>' + st.clvl + '</b>: up to skill level <span class="sgSimv">' + m + '</span>' + (s.pp ? ' (<span class="sgSimv">' + esc(bonus(s.pp, m)) + '</span>)' : '') + '.';
      }
      comp += '</div>';
    }
    return '<div class="sgRow" data-id="' + s.id + '"><img class="sgIco" src="' + CDN + 'skills/' + s.id + '.png" alt="" width="40" height="40">' +
      '<div class="sgMain"><div class="sgName">' + esc(s.name) + lk(wikiUrl(s.name), 'Wiki', 'Wiki page of ' + s.name) + '</div><div class="sgDesc">' + s.desc + '</div>' +
      '<div class="sgFacts">' + fact('Type', s.type >= 0, s.type >= 0 ? TYPE_NAMES[s.type] : 'not in a skill tree') + fact('Learned by players', s.learn, s.learn ? 'Yes' : s.unreleased ? 'No' : 'No, potions only') + learnFacts(s) +
      fact('In potions', s.potions.length > 0, s.potions.length ? 'Yes (' + s.potions.length + ')' : 'No') + fact('In composed potions', !!c, c ? 'Yes' : 'No') + '</div>' +
      sim + comp +
      (s.potions.length ? '<button type="button" class="sgToggle" data-id="' + s.id + '">' + (showPots ? 'Hide' : 'Show') + ' the ' + s.potions.length + ' potions</button>' + (showPots ? '<div class="sgPots">' + potHtml(s) + '</div>' : '') : '') +
      '</div></div>';
  };
  const topLevel = (s) => (s.potions.length ? s.potions[0].lvl : -1);
  function draw() {
    let list = skills.filter(matches);
    const by = { name: (a, b) => a.name.localeCompare(b.name), type: (a, b) => (a.type === -1 ? 9 : a.type) - (b.type === -1 ? 9 : b.type) || a.name.localeCompare(b.name), pots: (a, b) => b.potions.length - a.potions.length || a.name.localeCompare(b.name), level: (a, b) => (a.lr ? a.lr[0] : 1e9) - (b.lr ? b.lr[0] : 1e9) || a.name.localeCompare(b.name), max: (a, b) => topLevel(b) - topLevel(a) || a.name.localeCompare(b.name) };
    list = list.sort(by[st.sort] || by.name);
    $('#sgCount').text(list.length + ' of ' + skills.length + ' skills');
    $('#sgList').html(list.length ? list.map(rowHtml).join('') : '<div class="sgNone">No skill matches these filters.</div>');
    // some unreleased skills have no icon (yet): a question mark in its place
    $('#sgList img.sgIco').on('error', function () { $(this).replaceWith('<span class="sgIco sgNoImg" title="No icon">?</span>'); });
  }

  // ---------- events
  const keep = { sgQ: ['q', 'sgQ'], sgType: ['type', 'sgType'], sgLearn: ['learn', 'sgLearn'], sgPot: ['pot', 'sgPot'], sgComp: ['comp', 'sgComp'], sgSrc: ['src', 'sgSrc'], sgSort: ['sort', 'sgSort'] };
  $root.on('input change', '#sgQ,#sgType,#sgLearn,#sgPot,#sgComp,#sgSrc,#sgSort', function () { const k = keep[this.id]; if (st[k[0]] === this.value) return; st[k[0]] = this.value; remember(k[1], this.value); draw(); }); // a change that follows the typing (when the box loses focus) draws nothing: the list under the click would be replaced and the click lost
  $root.on('input change', '#sgLvl,#sgCLvl', function () {
    const v = num(this.value);
    if (v === (this.id === 'sgLvl' ? st.lvl : st.clvl)) return;
    if (this.id === 'sgLvl') { st.lvl = v; remember('sgLvl', v == null ? '' : v); } else { st.clvl = v; remember('sgCLvl', v == null ? '' : v); }
    draw();
  });
  $root.on('change', '#sgAll', draw);
  $root.on('click', '.sgSim', function () { const id = +this.getAttribute('data-id'), l = +this.getAttribute('data-lvl'); if (simBy.get(id) === l) simBy.delete(id); else simBy.set(id, l); draw(); });
  $root.on('click', '.sgToggle', function () { const id = +this.getAttribute('data-id'); if (open.has(id)) open.delete(id); else open.add(id); draw(); });
  $root.on('click', '#sgReset', () => {
    simBy.clear();
    Object.assign(st, { q: '', type: '', learn: '', pot: '', comp: '', src: '', sort: 'name', lvl: null, clvl: null });
    ['sgQ', 'sgType', 'sgLearn', 'sgPot', 'sgComp', 'sgSrc', 'sgSort', 'sgLvl', 'sgCLvl'].forEach((k) => remember(k, ''));
    $('#sgQ,#sgLvl,#sgCLvl').val('');
    $('#sgType,#sgLearn,#sgPot,#sgComp,#sgSrc').val('');
    $('#sgSort').val('name');
    draw();
  });
  draw();
}
