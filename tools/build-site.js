// Builds the folder that is published on GitHub Pages: node tools/build-site.js (the deploy workflow runs it)
// The script in src/ stays as it is; the copy in dist/ gets @updateURL and @downloadURL so that
// Tampermonkey can update itself. BASE_URL is the address of the GitHub Pages site.
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://cristimirt.github.io/fallenswordtoolkit'; // GitHub Pages address, no slash at the end
const OUT = path.join(__dirname, '..', 'dist');
const SRC = 'fs_toolkit.js';
const OUT_JS = 'fs_toolkit.user.js';

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const meta = (text, key) => (new RegExp('^// @' + key + '\\s+(.+)$', 'm').exec(text) || [])[1] || '';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let text = fs.readFileSync(path.join(__dirname, '..', 'src', SRC), 'utf8');
const url = BASE_URL + '/' + OUT_JS;
text = text.replace(/^\/\/ @(updateURL|downloadURL)\s.*\n/gm, ''); // never twice
text = text.replace(/^\/\/ @grant\b/m, '// @updateURL    ' + url + '\n// @downloadURL  ' + url + '\n// @grant');
fs.writeFileSync(path.join(OUT, OUT_JS), text);
const name = meta(text, 'name');
const version = meta(text, 'version');

// what the script does, for the page people read before installing
const SECTIONS = [
  ['Backpack', [
    'Search by name as you type: every word has to appear, in any order.',
    'Live level range and set filters, plus filters for rarity, equippable, usable, container, guild tagged, bound, duplicates, hellforge level and craft quality.',
    'Item counts on the type icons, with the types you have none of dimmed; a durability sort; choose how many items are shown per page and the size of the icons.',
    'Lock items: a locked item cannot be destroyed or broken down (and optionally not used or extracted). A small padlock marks it.',
    'A backpack pop-up from the icon in the top bar, so you do not have to leave the page you are on.',
  ]],
  ['Break down', [
    'A break down button next to the loot you get from creatures in the world action list.',
    'Automatic break down (off by default): every few seconds, on any page, equipment of the rarities and levels you choose is broken down. It never touches locked, bound or guild tagged items or containers. A dry run mode only lists what it would break down in the browser console. Every item broken down is logged, with the fragments you got.',
  ]],
  ['Markets', [
    'Buff Market: a searchable buff list instead of the 140-option drop-down.',
    'Auction House: search boxes on every filter, with the colour diamonds of the backpack for rarity and colour squares for craft quality.',
  ]],
  ['World map', [
    'A wiki button that opens the page of the area you are in.',
    'Path Finder: type where you want to go and see the way from where you stand, step by step, following you as you move.',
  ]],
  ['Quick Buff', [
    'Quick Buff opens in a window on the page that you can drag, not a separate browser window.',
    'Shows the same information as the Fallen Sword Helper (buffs a target already has, your buff enhancements, last activity and stamina), an Activate link for your own buffs, the stamina cost of each buff, low level buffs dimmed, and an option to sort the buffs alphabetically.',
  ]],
  ['Everything else', [
    'Draggable widgets in the sidebars: move them between the two sides.',
    'Our own pop-ups use the game\'s own tooltips and scrollbars style.',
    'Works next to the Fallen Sword Helper; the www.fallensword.com address is sent to fallensword.com so that your settings are kept in one place.',
  ]],
];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(name)}</title>
<style>
  :root { --bg: #2b1d0e; --card: #d6b277; --ink: #3b2a14; }
  body { margin: 0; padding: 32px 16px; background: var(--bg); color: #f2ecdf; font: 15px/1.5 Arial, sans-serif; }
  main { max-width: 680px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  p.lead { margin: 0 0 20px; opacity: .9; }
  .card { background: var(--card); color: var(--ink); border: 1px solid #20170396; border-radius: 6px; padding: 14px 16px; margin: 0 0 14px; box-shadow: 0 0 6px #000; }
  .card h2 { font-size: 17px; margin: 0 0 6px; }
  .card ul { margin: 0; padding-left: 20px; }
  .card li { margin: 4px 0; }
  .install { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .install .v { font-size: 13px; opacity: .8; }
  a.btn { display: inline-block; padding: 8px 18px; background: #e9d3a0; color: var(--ink); font-weight: bold; text-decoration: none;
          border: 1px solid #20170396; border-radius: 4px; box-shadow: 0 0 3px 0 #000; }
  a.btn:hover { background: #f3e2b8; }
  a { color: #e9d3a0; }
  .card a { color: #5a3a10; }
  small { opacity: .7; display: block; margin-top: 18px; }
</style>
</head>
<body>
<main>
  <h1>${esc(name)}</h1>
  <p class="lead">A userscript for <a href="https://fallensword.com/">Fallen Sword</a> with a better backpack and a set of small tools for the pages around it.</p>
  <div class="card install">
    <a class="btn" href="${esc(OUT_JS)}">Install</a>
    <span class="v">version ${esc(version)}</span>
    <span>Needs <a href="https://www.tampermonkey.net/">Tampermonkey</a> (or a similar userscript manager). Click Install and confirm in the tab that opens; updates are picked up automatically.</span>
  </div>
${SECTIONS.map(([title, items]) => `  <div class="card">
    <h2>${esc(title)}</h2>
    <ul>
${items.map((i) => `      <li>${esc(i)}</li>`).join('\n')}
    </ul>
  </div>`).join('\n')}
  <div class="card">
    <h2>Settings</h2>
    <ul>
      <li>Open them with the gear button on the backpack page. The settings window can be dragged and scrolled; the automatic break down is off until you turn it on, and asks for a confirmation with the number of items that match before it starts.</li>
    </ul>
  </div>
  <small>Built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</small>
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);

fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log('Built ' + OUT);
console.log('  ' + OUT_JS + '  v' + version);
console.log('Base URL: ' + BASE_URL);
