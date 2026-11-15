import { loadSettings } from '../core/settings.js';

// ---------------------------------------------------------------- wiki button (world page)
// A "W" button at the end of the helper's own buttons beside the map (#fshWorldButtonContainer, which FallenSwordHelper adds a
// moment after the page loads), or next to the area name when there are none. It opens the wiki page of the map you are on now.
export function initWikiButton() {
  if (!loadSettings().wikiBtn) return;
  const WIKI = 'https://wiki.fallensword.com/index.php/';
  const mapName = () => {
    try { return (window.GameData.realm().name || '').trim(); } catch (e) { return ''; }
  };
  const wikiUrl = (name) => WIKI + encodeURIComponent(name.replace(/ /g, '_')).replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2C/g, ',').replace(/%27/g, "'");
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'fsbWikiBtn';
  btn.textContent = 'W';
  btn.className = 'tip-static';
  btn.setAttribute('data-tipped', 'Open the wiki page of this map');
  btn.addEventListener('click', () => {
    const name = mapName() || (document.getElementById('worldName') || {}).textContent;
    if (name && name.trim()) window.open(wikiUrl(name.trim()), '_blank', 'noopener');
  });
  const css = document.createElement('style');
  css.textContent =
    '#fsbWikiBtn{width:17px;height:17px;padding:0;margin:0 0 0 3px;box-sizing:border-box;border:1px solid #4f3717;border-radius:3px;background:#e9d6a8;color:#4f3717;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font:700 11px/1 Georgia,serif}' +
    '#fsbWikiBtn:hover{background:#f6e7bf}#fsbWikiBtn.fsbBeside{margin-left:8px;vertical-align:middle}';
  document.head.appendChild(css);
  // other scripts rebuild these elements, so the button is put back (and kept last) whenever it goes missing
  function placeButton() {
    const box = document.getElementById('fshWorldButtonContainer');
    const title = document.getElementById('worldName');
    if (box) {
      btn.classList.remove('fsbBeside');
      if (btn.parentNode !== box || box.lastElementChild !== btn) box.appendChild(btn);
    } else if (title) {
      btn.classList.add('fsbBeside');
      if (btn.parentNode !== title) title.appendChild(btn);
    }
  }
  let tries = 0;
  const wait = setInterval(() => {
    tries++;
    if (document.getElementById('worldName')) {
      clearInterval(wait);
      placeButton();
      const mo = new MutationObserver(placeButton);
      const wc = document.getElementById('worldContainer');
      if (wc) mo.observe(wc, { childList: true });
      mo.observe(document.getElementById('worldName'), { childList: true });
      const box = document.getElementById('fshWorldButtonContainer');
      if (box) mo.observe(box, { childList: true });
    } else if (tries > 40) {
      clearInterval(wait); // not the world page
    }
  }, 300);
}
