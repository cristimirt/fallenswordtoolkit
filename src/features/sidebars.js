import { recall, remember } from '../core/settings.js';
import { $ } from '../core/util.js';

// ---------------------------------------------------------------- sidebars: draggable widgets
// The widgets of the right sidebar (FS Box, News, Guild, ...) can be dragged by their title to
// another place in that sidebar or into the left one (under the menu). The menu itself stays put.
// The layout is saved by widget title; boxes that are not in it stay where the game put them.
export function initSidebarWidgets() {
  const L = document.getElementById('pCL');
  const R = document.getElementById('pCR');
  const C = document.getElementById('pCC');
  if (!L || !R || !C) return;

  const keyOf = (box) => {
    const h = box.querySelector(':scope > h3');
    return h ? h.textContent.trim() : '';
  };
  const boxesIn = (col) => Array.from(col.children).filter((el) => el.classList.contains('minibox') && keyOf(el));
  const loadLayout = () => {
    try {
      const o = JSON.parse(recall('sidebar'));
      if (o && Array.isArray(o.left) && Array.isArray(o.right)) return o;
    } catch (e) { /* no saved layout */ }
    return null;
  };
  function saveLayout() {
    const prev = loadLayout() || { left: [], right: [] };
    const left = boxesIn(L).map(keyOf);
    const right = boxesIn(R).map(keyOf);
    const here = new Set(left.concat(right));
    // widgets that are not on this page keep their side
    prev.left.forEach((k) => { if (!here.has(k)) left.push(k); });
    prev.right.forEach((k) => { if (!here.has(k)) right.push(k); });
    remember('sidebar', JSON.stringify({ left, right }));
  }

  // Some of the game's rules are written for "#pCR ..." only (links, guild icons, ...): copy them
  // for widgets that sit in the left sidebar. Rules that style the column itself are skipped.
  function mirrorColumnStyles() {
    const out = [];
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode && sheet.ownerNode.id === 'bpMirrorStyle') continue;
      let rules;
      try { rules = Array.from(sheet.cssRules); } catch (e) { continue; } // other origin
      for (const r of rules) {
        if (r.type !== 1 || !r.selectorText || r.selectorText.indexOf('#pCR') === -1) continue;
        const parts = r.selectorText.split(',').map((s) => s.trim()).filter((s) => /^#pCR\s+\S/.test(s));
        if (!parts.length) continue;
        // for the left column, and for the copy of a widget that follows the cursor while dragging
        const sel = parts.map((s) => s.replace('#pCR', '#pCL .minibox')).concat(parts.map((s) => s.replace('#pCR', '#bpSideGhost .minibox')));
        out.push(sel.join(',') + '{' + r.style.cssText + '}');
      }
    }
    // our own style element: rules inserted into the game's sheets are lost when the helper rewrites them
    let el = document.getElementById('bpMirrorStyle');
    if (!el) { el = document.createElement('style'); el.id = 'bpMirrorStyle'; document.head.appendChild(el); }
    const css = out.join(' ');
    if (el.textContent !== css) el.textContent = css;
  }

  // Puts the boxes where the saved layout says; does nothing when they are already there.
  function applyLayout() {
    const lay = loadLayout();
    if (!lay) return;
    const inL = boxesIn(L);
    const inR = boxesIn(R);
    const byKey = new Map();
    inL.concat(inR).forEach((b) => { if (!byKey.has(keyOf(b))) byKey.set(keyOf(b), b); });
    const saved = new Set(lay.left.concat(lay.right));
    const pick = (keys, unsaved) =>
      keys.filter((k) => byKey.has(k)).map((k) => byKey.get(k))
        .concat(unsaved.filter((b) => !saved.has(keyOf(b))));
    const wantL = pick(lay.left, inL);
    const wantR = pick(lay.right, inR);
    const same = (a, b) => a.length === b.length && a.every((el, i) => el === b[i]);
    if (!same(wantL, inL)) wantL.forEach((b) => L.appendChild(b));
    if (!same(wantR, inR)) wantR.forEach((b) => R.appendChild(b));
  }

  if (!$('#bpSideStyle').length) {
    $('head').append(
      '<style id="bpSideStyle">' +
        '.minibox > h3{cursor:grab;touch-action:none;}' +
        'body.bpSideDrag, body.bpSideDrag *{cursor:grabbing !important;user-select:none !important;}' +
        '.minibox.bpSideDragging{opacity:.35;}' +
        // a see-through copy of the widget; very tall ones are cut off and fade out
        // (the dark panel behind a widget belongs to the column, so the copy brings its own)
        '#bpSideGhost{position:fixed;z-index:10000;pointer-events:none;opacity:.85;max-height:240px;overflow:hidden;' +
        'background:#241a10;box-shadow:0 4px 12px rgba(0,0,0,.6);}' +
        '#bpSideGhost.bpSideCut{-webkit-mask-image:linear-gradient(#000 70%,transparent);mask-image:linear-gradient(#000 70%,transparent);}' +
        '#bpSideGhost .minibox{margin:0;opacity:1;}' +
        '#bpSideLine{position:fixed;z-index:10000;height:3px;background:#d9b774;box-shadow:0 0 4px #d9b774;pointer-events:none;}' +
      '</style>'
    );
  }
  mirrorColumnStyles();
  applyLayout();
  // the helper adds its stylesheets after this script has run: mirror again when styles are added
  let mirrorQueued = false;
  new MutationObserver((muts) => {
    if (mirrorQueued || !muts.some((m) => Array.from(m.addedNodes).some((n) => n.tagName === 'STYLE' && n.id !== 'bpMirrorStyle' && n.id !== 'bpPopStyle'))) return;
    mirrorQueued = true;
    setTimeout(() => { mirrorQueued = false; mirrorColumnStyles(); }, 300);
  }).observe(document.head, { childList: true });

  // The game may rebuild a column after loading; keep the saved layout.
  let queued = false;
  const watcher = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; applyLayout(); });
  });
  [L, R].forEach((col) => watcher.observe(col, { childList: true }));

  // ---- dragging (pointer events: a click on the title, or a link inside it, still works)
  let drag = null;
  const THRESHOLD = 5;

  // Which column and which spot (before which box) the pointer is over.
  function targetAt(x, y) {
    const cr = C.getBoundingClientRect();
    const col = x < cr.left + cr.width / 2 ? L : R;
    const boxes = boxesIn(col).filter((b) => b !== drag.box);
    let before = null;
    for (const b of boxes) {
      const r = b.getBoundingClientRect();
      if (y < r.top + r.height / 2) { before = b; break; }
    }
    return { col, before, boxes };
  }
  function update() {
    const t = targetAt(drag.x, drag.y);
    drag.target = t;
    const cr = t.col.getBoundingClientRect();
    let top;
    if (t.before) top = t.before.getBoundingClientRect().top - 5;
    else if (t.boxes.length) top = t.boxes[t.boxes.length - 1].getBoundingClientRect().bottom + 5;
    else {
      const shown = Array.from(t.col.children).filter((el) => el !== drag.box && el.offsetHeight);
      top = shown.length ? shown[shown.length - 1].getBoundingClientRect().bottom + 5 : cr.top;
    }
    drag.line.style.cssText = 'left:' + cr.left + 'px;width:' + cr.width + 'px;top:' + (top - 1) + 'px;';
    // the widget is held at the spot where it was grabbed
    drag.ghost.style.left = (drag.x - drag.offX) + 'px';
    drag.ghost.style.top = (drag.y - drag.offY) + 'px';
  }
  function scrollLoop() {
    if (!drag || !drag.active) return;
    const edge = 60;
    if (drag.y < edge) window.scrollBy(0, -Math.ceil((edge - drag.y) / 4));
    else if (drag.y > window.innerHeight - edge) window.scrollBy(0, Math.ceil((drag.y - (window.innerHeight - edge)) / 4));
    update();
    requestAnimationFrame(scrollLoop);
  }
  function end(drop) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.active) {
      d.ghost.remove();
      d.line.remove();
      d.box.classList.remove('bpSideDragging');
      document.body.classList.remove('bpSideDrag');
      if (drop && d.target) {
        if (d.target.before) d.target.col.insertBefore(d.box, d.target.before);
        else d.target.col.appendChild(d.box);
        saveLayout();
      }
      // the click that ends the drag must not follow a link in the title
      const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 50);
    }
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.target || typeof e.target.closest !== 'function') return;
    const h = e.target.closest('h3');
    const box = h && h.parentElement;
    if (!box || !box.classList.contains('minibox') || box.firstElementChild !== h) return;
    if (box.parentElement !== L && box.parentElement !== R) return;
    drag = { box, h, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, active: false, target: null };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active) {
      if (Math.abs(drag.x - drag.sx) < THRESHOLD && Math.abs(drag.y - drag.sy) < THRESHOLD) return;
      drag.active = true;
      // a copy of the widget: no ids (they must stay unique), no scripts, and it never takes clicks
      const rect = drag.box.getBoundingClientRect();
      const copy = drag.box.cloneNode(true);
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      copy.querySelectorAll('script').forEach((el) => el.remove());
      copy.classList.remove('bpSideDragging');
      drag.ghost = $('<div id="bpSideGhost"></div>').css('width', rect.width + 'px').append(copy).appendTo('body')[0];
      drag.ghost.classList.toggle('bpSideCut', rect.height > 240);
      drag.offX = drag.sx - rect.left;
      drag.offY = Math.min(drag.sy - rect.top, 240);
      drag.line = $('<div id="bpSideLine"></div>').appendTo('body')[0];
      drag.box.classList.add('bpSideDragging');
      document.body.classList.add('bpSideDrag');
      window.getSelection && window.getSelection().removeAllRanges();
      requestAnimationFrame(scrollLoop);
    }
    e.preventDefault();
    update();
  });
  document.addEventListener('pointerup', () => end(true));
  document.addEventListener('pointercancel', () => end(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') end(false); });
}
