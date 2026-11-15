// Our own elements show the game's tooltip (tip-static + data-tipped), never the browser's plain title one: every title="" that
// appears on them, now or later, is turned into the game's tooltip. (Skipped on pages where the game has no tooltip library.)
export function useGameTips() {
  const OURS = '[id^="bp"],[class^="bp"],[class*=" bp"],[id^="fsb"],[class^="fsb"],[class*=" fsb"],[id^="pf"],[class^="pf"],[class*=" pf"]';
  const ready = () => !!(window.Tipped || (window.jQuery && window.jQuery.fn && window.jQuery.fn.qtip));
  const fix = (el) => {
    if (el.nodeType !== 1 || !el.hasAttribute('title') || !(el.matches(OURS) || el.closest(OURS))) return;
    const t = el.getAttribute('title');
    el.removeAttribute('title');
    if (!t) return;
    el.setAttribute('data-tipped', t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])));
    el.classList.add('tip-static');
  };
  // A tooltip whose element was removed from the page (a closed window, a list that was drawn again) would stay on the screen: take it away.
const dropTips = (root) => {
  if (root.nodeType !== 1) return;
  const els = [root].concat(Array.from(root.querySelectorAll('[aria-describedby^="qtip-"]')));
  els.forEach((el) => {
    const id = el.getAttribute('aria-describedby');
    if (id && id.indexOf('qtip-') === 0) { const t = document.getElementById(id); if (t) t.remove(); }
  });
};
const scan = (root) => { if (root.nodeType === 1) { fix(root); root.querySelectorAll('[title]').forEach(fix); } };
  new MutationObserver((list) => {
    if (!ready()) return;
    const tipsOpen = !!document.querySelector('.qtip');
  for (const m of list) {
    if (m.type === 'attributes') { fix(m.target); continue; }
    m.addedNodes.forEach(scan);
    if (tipsOpen) m.removedNodes.forEach(dropTips);
  }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  if (ready()) scan(document.body);
}
