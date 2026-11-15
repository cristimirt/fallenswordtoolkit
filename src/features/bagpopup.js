import { withFst } from '../core/game.js';
import { recall, remember } from '../core/settings.js';
import { $ } from '../core/util.js';

// ---------------------------------------------------------------- backpack pop-up
// The backpack icon in the info bar at the top leads to the game's small "manage" page. Here it opens the real backpack, the one
// from the profile page, in a pop-up: the profile page is loaded in a frame and everything but the backpack is hidden, so it
// is the same backpack with all of our tools (and the helper's buttons) instead of a copy that could drift.
export function initBackpackPopup() {
  if (window.top !== window.self) return; // this is the frame of the pop-up itself
  const FRAME_CSS =
    '.bpPopHide{display:none !important;}' +
    'html,body{margin:0 !important;padding:0 !important;min-width:0 !important;width:auto !important;height:auto !important;' +
    'background:#d6b277 !important;overflow-x:hidden;}' +
    '.bpPopKeep{margin:0 !important;padding:0 !important;float:none !important;width:auto !important;min-width:0 !important;' +
    'max-width:none !important;background:none !important;border:0 !important;position:static !important;}' +
    '.bpPopKeep > .innerColumnHeader{width:auto !important;}' +
    // the gap goes on the page's container (not on the right column, whose padding lets the parchment image show through)
    'html body #profileContainer{padding:6px 6px !important;background-color:#d6b277 !important;}' +
    // the folder strip and the type icons sit on a dark patch in the page's own layout
    '#backpackFolders,#backpack_tabs,#backpack_tabs ul{background:#d6b277 !important;}' +
    '.bpPopHdr{display:none !important;}' +
    'html::-webkit-scrollbar{width:12px;height:12px;}' +
    'html::-webkit-scrollbar-track{background:#c9a869;box-shadow:inset 1px 0 3px #20170366;}' +
    'html::-webkit-scrollbar-thumb{background:#e9d3a0;border:1px solid #20170396;border-radius:3px;box-shadow:0 0 3px 0 #000;}' +
    'html::-webkit-scrollbar-thumb:hover{background:#f3e2b8;}' +
    'html::-webkit-scrollbar-corner{background:#c9a869;}' +

    // a tooltip is squeezed into the narrow frame and can end up under the pointer: it would take the hover, close, open again, and so on
    '.qtip{pointer-events:none !important;}' +
    // as many 64px columns as fit (the game's grid is a fixed 5)
    '#backpackContainer .backpackTabContent{grid-template-columns:repeat(auto-fill,64px) !important;}';
  const STALE_MS = 30 * 1000; // a frame that has been closed for longer is reloaded when it is opened again
  let loadedAt = 0; // when the frame last loaded, or was last closed
  let docOf = () => document; // the document the backpack lives in: this page (on the profile page) or the frame's
  let restore = null; // on the profile page: puts the page's own backpack back where it was

  // dialogs and tooltips (jQuery UI, qTip, the helper) wait hidden in the page and are shown by the game when needed: they must not be
  // tagged, or their own show() loses against the !important
  function keepAlive(doc, el) {
    const view = doc.defaultView;
    if (/ui-dialog|ui-widget|qtip|tipped|dialog|tooltip|helper-menu/i.test(el.id + ' ' + el.className)) return true;
    return view.getComputedStyle(el).display === 'none';
  }
  // the backpack header, the folder strip and the bag, in page order
  // found by what they contain, not by position: the helper may add elements around them
  function backpackParts(doc) {
    const bag = doc.getElementById('backpackContainer');
    const sibling = (el) => { // the child of the bag's parent that holds el
      let n = el;
      while (n && n.parentElement !== bag.parentElement) n = n.parentElement;
      return n;
    };
    const parts = [bag];
    const folders = sibling(doc.getElementById('backpackFolders'));
    const header = sibling(doc.getElementById('backpack_current'));
    if (folders && folders !== bag) parts.unshift(folders);
    if (header && header !== bag && header !== folders) parts.unshift(header);
    return parts;
  }
  // in the frame: keep the backpack and hide everything else on the way up to the page
  function prepareFrame(doc) {
    const bag = doc.getElementById('backpackContainer');
    if (!bag || doc.getElementById('bpPopCss')) return !!bag;
    const style = doc.createElement('style');
    style.id = 'bpPopCss';
    style.textContent = FRAME_CSS;
    doc.head.appendChild(style);
    // Esc closes the pop-up also when the focus is in the frame (unless a game dialog is open: that one closes first)
    doc.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || doc.querySelector('.ui-dialog:not([style*="display: none"])')) return;
      hide();
    });
    const keep = new Set(backpackParts(doc));
    keep.forEach((el) => { if (el.classList.contains('innerColumnHeader')) el.classList.add('bpPopHdr'); });
    let node = bag;
    while (node.parentElement && node !== doc.body) {
      const parent = node.parentElement;
      Array.from(parent.children).forEach((sib) => {
        if (sib !== node && !keep.has(sib) && !/^(SCRIPT|STYLE|LINK)$/.test(sib.tagName) && !keepAlive(doc, sib)) sib.classList.add('bpPopHide');
      });
      parent.classList.add('bpPopKeep');
      keep.clear(); // only the first level keeps neighbours
      node = parent;
    }
    return true;
  }

  function ensureStyle() {
    if ($('#bpPopStyle').length) return;
    $('head').append(
      '<style id="bpPopStyle">' +
        '#bpPopup{position:fixed;inset:0;z-index:99990;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);}' +
        '#bpPopup.bpPopOpen{display:flex;}' +
        '#bpPopup .bpPopBox{width:760px;max-width:96vw;height:88vh;display:flex;flex-direction:column;background:#d6b277;' +
        'border:1px solid #20170396;border-radius:4px;box-shadow:0 0 12px #000;overflow:hidden;}' +
        '#bpPopup .bpPopBar{cursor:move;touch-action:none;user-select:none;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:#3b2a14;' +
        'color:#f2ecdf;font:bold 13px Arial,sans-serif;}' +
        '#bpPopup .bpPopTools{display:flex;align-items:center;gap:10px;}' +
        '#bpPopup .bpPopTools{cursor:default;}' +
        '#bpPopup .bpPopTools a{cursor:pointer;font-weight:normal;color:#f2ecdf;text-decoration:underline;}' +
        '#bpPopup .bpPopTools [data-act]:hover{color:#fff;}' +
        '#bpPopup .bpPopTools span[data-act]{cursor:pointer;font-size:16px;}' +
        '#bpPopup .bpPopX{cursor:pointer;font-size:18px;line-height:1;padding:0 4px;}' +
        '#bpPopup .bpPopX:hover{color:#fff;}' +
        '#bpPopup .bpPopBody{position:relative;flex:1;min-height:0;}' +
        '#bpPopup .bpPopLoad{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#3b2a14;font:12px Arial;}' +
        '#bpPopup iframe{position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;transition:opacity .15s;}' +
        '#bpPopup iframe.bpPopReady{opacity:1;}' +
        // on the profile page the page's own backpack is moved in here
        '#bpPopup .bpPopInline{position:absolute;inset:0;overflow:auto;padding:6px 8px;box-sizing:border-box;background:#d6b277;}' +
        '#bpPopup .bpPopInline .innerColumnHeader{display:none;}' +
        '#bpPopup .bpPopInline::-webkit-scrollbar{width:12px;height:12px;}' +
        '#bpPopup .bpPopInline::-webkit-scrollbar-track{background:#c9a869;box-shadow:inset 1px 0 3px #20170366;}' +
        '#bpPopup .bpPopInline::-webkit-scrollbar-thumb{background:#e9d3a0;border:1px solid #20170396;border-radius:3px;box-shadow:0 0 3px 0 #000;}' +
        '#bpPopup .bpPopInline::-webkit-scrollbar-thumb:hover{background:#f3e2b8;}' +
        '#bpPopup .bpPopInline::-webkit-scrollbar-corner{background:#c9a869;}' +

        '#bpPopup .bpPopInline > *{background:#d6b277 !important;}' +
        '#bpPopup .bpPopInline #backpackFolders,#bpPopup .bpPopInline #backpack_tabs,#bpPopup .bpPopInline #backpack_tabs ul{background:#d6b277 !important;}' +
        '#bpPopup .bpPopInline .backpackTabContent{grid-template-columns:repeat(auto-fill,64px) !important;}' +
        // the game's dialogs (settings, confirm boxes) and tooltips have to show above the pop-up
        'html[data-bp-ov] .ui-dialog{z-index:100000 !important;}html[data-bp-ov] .ui-widget-overlay{z-index:99995 !important;}' +
        'html[data-bp-ov] .qtip{z-index:100001 !important;}' +
      '</style>'
    );
  }
  // the shell: title bar with the buttons of the page's own backpack header, and the area for the backpack
  function buildShell(body) {
    ensureStyle();
    const $pop = $(
      '<div id="bpPopup"><div class="bpPopBox"><div class="bpPopBar"><span class="bpPopTitle">Backpack</span>' +
      '<span class="bpPopTools"><a data-act="folders">Folders</a><a data-act="manage">Manage</a>' +
      '<span data-act="refresh" title="Refresh bag">↻</span><span data-act="gear" title="Backpack settings">⚙</span>' +
      '<span class="bpPopX" role="button" title="Close">×</span></span></div>' +
      '<div class="bpPopBody">' + body + '</div></div></div>'
    ).appendTo('body');
    $pop.on('mousedown', (e) => { if (e.target === $pop[0]) hide(); });
    $pop.find('.bpPopX').on('click', hide);
    // the title bar is the handle: the box follows the pointer (the offset from the centre is kept for the next time)
    const box = $pop.find('.bpPopBox')[0];
    const place = (x, y) => { // keep a good part of the title bar on screen
      const r = box.getBoundingClientRect();
      const cx = Math.min(Math.max(x, -(window.innerWidth - r.width) / 2 - r.width + 80), (window.innerWidth + r.width) / 2 - 80);
      const cy = Math.min(Math.max(y, -(window.innerHeight - r.height) / 2), (window.innerHeight + r.height) / 2 - 30);
      box.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
      return [cx, cy];
    };
    try { const p = JSON.parse(recall('popPos')); if (p) place(p[0], p[1]); } catch (e) { /* centred */ }
    let grab = null;
    const bar = $pop.find('.bpPopBar')[0];
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.bpPopTools')) return;
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(box.style.transform) || [0, 0, 0];
      grab = { x: e.clientX, y: e.clientY, ox: +m[1], oy: +m[2] };
      bar.setPointerCapture(e.pointerId);
      $pop.find('iframe').css('pointer-events', 'none');
    });
    bar.addEventListener('pointermove', (e) => { if (grab) place(grab.ox + e.clientX - grab.x, grab.oy + e.clientY - grab.y); });
    const drop = () => {
      if (!grab) return;
      grab = null;
      $pop.find('iframe').css('pointer-events', '');
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(box.style.transform);
      if (m) remember('popPos', JSON.stringify([+m[1], +m[2]]));
    };
    bar.addEventListener('pointerup', drop);
    bar.addEventListener('pointercancel', drop);
    // the title bar stands in for the page's own backpack header, whose buttons are clicked through
    $pop.find('.bpPopTools').on('click', '[data-act]', function () {
      const doc = docOf();
      const act = this.getAttribute('data-act');
      const link = (label) => Array.from(doc.querySelectorAll('.innerColumnHeader a')).filter((a) => a.textContent.trim() === label)[0];
      if (act === 'refresh') { const b = doc.getElementById('bpRefreshBtn'); if (b) b.click(); }
      else if (act === 'gear') { const b = doc.getElementById('bpSettingsBtn'); if (b) b.click(); }
      else { const a = link(act === 'folders' ? 'Folders' : 'Manage'); if (a) window.location.href = a.href; }
    });
    const sync = setInterval(() => { // "Backpack (39/45)"
      if (!$pop.parent().length) { clearInterval(sync); return; }
      try {
        const doc = docOf();
        const cur = doc.getElementById('backpack_current');
        const max = doc.getElementById('guildStore_max');
        if (cur && max) $pop.find('.bpPopTitle').text('Backpack (' + cur.textContent.trim() + '/' + max.textContent.trim() + ')');
      } catch (err) { /* the frame is loading */ }
    }, 700);
    return $pop;
  }
  function lockPage() {
    document.documentElement.setAttribute('data-bp-ov', document.documentElement.style.overflow || '');
    document.documentElement.style.overflow = 'hidden';
    $(document).on('keydown.bpPop', (e) => { if (e.key === 'Escape') hide(); });
  }

  // on the profile page the backpack is already there: it is moved into the pop-up and put back when that closes
  function showInline() {
    const parts = backpackParts(document);
    const holders = parts.map((el) => {
      const mark = document.createComment('bpPop');
      el.parentNode.insertBefore(mark, el);
      return mark;
    });
    const $pop = buildShell('<div class="bpPopInline"></div>');
    const inline = $pop.find('.bpPopInline')[0];
    parts.forEach((el) => inline.appendChild(el));
    restore = () => {
      parts.forEach((el, i) => {
        holders[i].parentNode.insertBefore(el, holders[i]);
        holders[i].remove();
      });
      $pop.remove();
      restore = null;
    };
    docOf = () => document;
    lockPage();
    $pop.addClass('bpPopOpen');
  }

  // on any other page the profile page is loaded in a frame, built once and then only hidden
  function load() {
    const $pop = $('#bpPopup');
    const frame = $pop.find('iframe')[0];
    frame.classList.remove('bpPopReady');
    if (!$pop.find('.bpPopLoad').length) $pop.find('.bpPopBody').prepend('<div class="bpPopLoad">Loading backpack...</div>');
    loadedAt = Date.now();
    frame.src = withFst('/index.php?cmd=profile');
  }
  function build() {
    if ($('#bpPopup').length) return;
    const $pop = buildShell('<iframe name="bpBackpackPopup"></iframe>');
    const frame = $pop.find('iframe')[0];
    docOf = () => frame.contentDocument;
    frame.addEventListener('load', () => {
      let tries = 0;
      // the page, the helper and our own script need a moment to build the backpack inside the frame
      const wait = setInterval(() => {
        tries++;
        let ok = false;
        try {
          const w = frame.contentWindow;
          const bag = w.jQuery && w.jQuery('#backpackContainer').data('hcs-backpack');
          if (bag && prepareFrame(frame.contentDocument) && bag.srcData && bag.srcData.length) {
            if (!frame.contentDocument.querySelector('.backpackItem')) bag._showPage(-1, bag.page || 0);
            ok = true;
          }
        } catch (err) { /* the frame is still loading */ }
        if (ok || tries > 80) {
          clearInterval(wait);
          frame.classList.add('bpPopReady');
          $pop.find('.bpPopLoad').remove();
        }
      }, 150);
    });
    load();
  }
  function show() {
    if (document.getElementById('backpackContainer')) { // this is the profile page
      if (!restore) showInline();
      return;
    }
    build();
    const $pop = $('#bpPopup');
    if ($pop.hasClass('bpPopOpen')) return;
    if (Date.now() - loadedAt > STALE_MS) load(); // the bag may have changed since
    lockPage();
    $pop.addClass('bpPopOpen');
  }
  function hide() {
    if (restore) restore();
    else $('#bpPopup').removeClass('bpPopOpen');
    loadedAt = Date.now(); // the frame is as fresh as the moment it was last looked at
    document.documentElement.style.overflow = document.documentElement.getAttribute('data-bp-ov') || '';
    document.documentElement.removeAttribute('data-bp-ov');
    $(document).off('keydown.bpPop');
  }

  document.addEventListener('click', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // let new-tab clicks through
    const hit = e.target.closest && e.target.closest('#statbar-inventory');
    if (!hit) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    show();
  }, true);
  // start loading while the pointer is on the icon, so the pop-up is ready (or nearly) by the time it is clicked
  document.addEventListener('mouseover', (e) => {
    if (!document.getElementById('backpackContainer') && e.target.closest && e.target.closest('#statbar-inventory')) build();
  }, true);
}
