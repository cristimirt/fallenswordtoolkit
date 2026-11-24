// The install page (index.html): what the toolkit does, and the Install button for the loader.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The visits of this page are counted with GoatCounter (no cookies, no personal data). Put the code of your GoatCounter site here
// (https://CODE.goatcounter.com): while it is empty nothing is counted and the page does not mention it.
const COUNTER_CODE = 'fst';

// what the toolkit does, for the page people read before installing
const SECTIONS = [
  ['Backpack', [
    'Search as you type, and filters for level, set, rarity, craft, hell forge, guild tagged and more.',
    'Item counts on the type icons, locked items, and a backpack pop-up from the top bar.',
  ]],
  ['Break down', [
    'A break down button next to world loot, and an optional automatic break down with a log.',
  ]],
  ['Guild Store', [
    'A list or tile window with search, filters and sorting.',
    'Take or deposit several items at once, and take or recall items from other members.',
  ]],
  ['Loyalty page', [
    'The name, type, quality and buffs of every item shown next to it.',
  ]],
  ['Skills Guide', [
    'Every skill with its type, who can learn it, the potions that give it and a bonus calculator.',
  ]],
  ['Markets', [
    'A searchable Buff Market, and search boxes and colour filters in the Auction House.',
  ]],
  ['World map', [
    'A wiki button, Footprints kept after a reload, and a Path Finder with a switch for portals.',
  ]],
  ['Quick Buff', [
    'A draggable window with the buffs a target already has.',
  ]],
  ['Also', [
    'Draggable sidebar widgets, and it works next to the Fallen Sword Helper.',
    "All settings are in the FST tab of the game's Preferences page.",
  ]],
];

export function pageHtml({ name, version, loaderVersion, loaderFile, build }) {
  return `<!doctype html>
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
  .state { font-weight: bold; }
  small { opacity: .7; display: block; margin-top: 18px; }
</style>
</head>
<body>
<main>
  <h1>${esc(name)}</h1>
  <p class="lead">A userscript for <a href="https://fallensword.com/">Fallen Sword</a> with a better backpack and a set of small tools for the pages around it.</p>
  <div class="card install">
    <a class="btn" href="${esc(loaderFile)}">Install</a>
    <span class="v">toolkit ${esc(version)}, build ${esc(build)}</span>
    <span>Needs <a href="https://www.tampermonkey.net/">Tampermonkey</a> (or a similar userscript manager). Click Install and confirm in the tab that opens. What you install is a small loader: the toolkit itself is fetched from this site, so it updates by itself, without installing again.</span>
    <span class="state" id="state"></span>
  </div>
${SECTIONS.map(([title, items]) => `  <div class="card">
    <h2>${esc(title)}</h2>
    <ul>
${items.map((i) => `      <li>${esc(i)}</li>`).join('\n')}
    </ul>
  </div>`).join('\n')}
  <small>Built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC &middot; loader ${esc(loaderVersion)}${COUNTER_CODE ? ' &middot; visits of this page are counted anonymously (no cookies)' : ''}</small>
</main>
<script>
  // the loader announces itself on this page: show whether it is installed
  setTimeout(function () {
    var v = document.documentElement.getAttribute('data-fst-loader');
    var el = document.getElementById('state');
    el.textContent = v ? 'Installed (loader ' + v + ')' : '';
  }, 800);
</script>
${COUNTER_CODE ? `<script data-goatcounter="https://${esc(COUNTER_CODE)}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
` : ''}</body>
</html>
`;
}
