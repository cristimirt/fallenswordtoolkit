/* global removeTooltips -- the game's own tooltip cleaner (a global of its page) */
import { adjustInventoryCount, requestFrag, withFst } from '../core/game.js';
import { loadSettings } from '../core/settings.js';
import { $, esc, showInfo } from '../core/util.js';

// ---------------------------------------------------------------- hunting: break down loot
// The action list shows a discard X next to loot dropped by a creature. We add a
// second link next to it that breaks the item down instead of destroying it.
export function initActionList() {
  // Small hammer, drawn as an inline SVG so no image has to be loaded.
  const ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
    '<line x1="2.6" y1="13.4" x2="9.4" y2="6.6" stroke="#8a5a24" stroke-width="2.6" stroke-linecap="round"/>' +
    '<line x1="2.6" y1="13.4" x2="9.4" y2="6.6" stroke="#d9a35c" stroke-width="1.4" stroke-linecap="round"/>' +
    '<rect x="6" y="2.2" width="9.6" height="5.2" rx="1" transform="rotate(45 10.8 4.8)" ' +
    'fill="#d7dde5" stroke="#4d5662" stroke-width="1"/>' +
    '<line x1="8.4" y1="3.6" x2="12.6" y2="7.8" stroke="#ffffff" stroke-width="0.9" opacity=".8"/>' +
    '</svg>';
  const ICON_URL = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(ICON_SVG) + '")';
  // Green "play" triangle for Use.
  const USE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
    '<path d="M4 2.2 L13.4 8 L4 13.8 Z" fill="#6fcf4a" stroke="#2f6b1c" stroke-width="1.2" stroke-linejoin="round"/>' +
    '</svg>';
  const USE_URL = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(USE_SVG) + '")';

  if (!$('#bpFragStyle').length) {
    $('head').append(
      '<style id="bpFragStyle">' +
        // mirrors ".actionList .discard" (11x11, float: left, margin: 4px -11px 0 2px),
        // pushed 13px further right so it sits just after the discard X
        'a.bpFrag{width:11px;height:11px;float:left;display:block;margin:4px -11px 0 15px;' +
        'background:' + ICON_URL + ' center/11px 11px no-repeat;cursor:pointer;}' +
        'a.bpFrag:hover{filter:brightness(1.4);}' +
        'a.bpFrag[data-busy]{opacity:.4;cursor:default;}' +
        'a.bpUse{width:11px;height:11px;float:left;display:block;margin:4px -11px 0 15px;' +
        'background:' + USE_URL + ' center/11px 11px no-repeat;cursor:pointer;}' +
        'a.bpUse:hover{filter:brightness(1.4);}' +
        'a.bpUse[data-busy]{opacity:.4;cursor:default;}' +
        '.bpFragDone{color:#9fdc6b;}' +
      '</style>'
    );
  }

  function decorate() {
    $('#actionList a.discard').each(function () {
      const $d = $(this);
      const id = $d.attr('data-invid');
      if (!id) return;
      const $mine = $d.nextAll('.bpUse').first();
      if ($mine.length) {
        // list reused with a new item
        if ($mine.attr('data-invid') !== id) $d.nextAll('.bpFrag, .bpUse').attr('data-invid', id);
        return;
      }
      $d.after(
        (loadSettings().breakBtn ? '<a href="#" class="bpFrag tip-static" data-tipped="Break down?" data-invid="' + esc(id) + '"></a>' : '') +
        '<a href="#" class="bpUse tip-static" data-tipped="Use?" data-invid="' + esc(id) + '"></a>'
      );
    });
  }

  // Using an item is a normal page load in the game (index.php?cmd=profile&subcmd=useitem&inventory_id=<id>).
  // Fetch it in the background and show what the game says in a pop-up instead of leaving the hunt.
  function readUseResult(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
    const root = doc.querySelector('#pCC') || doc.body;
    // the game puts its answer in <center id="info-msg"> inside an INFORMATION box
    const box = doc.getElementById('info-msg') || root.querySelector('.notice, .message, .info, .error');
    const text = ((box || root).innerText || (box || root).textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    return text.slice(0, 600);
  }
  function requestUse(id) {
    return fetch(withFst('/index.php?cmd=profile&subcmd=useitem&inventory_id=' + encodeURIComponent(id)), { credentials: 'same-origin' })
      .then((r) => r.text())
      .then(readUseResult);
  }

  // Capture phase, so the game's own handlers on the list never see this click.
  document.addEventListener(
    'click',
    (e) => {
      const u = e.target && typeof e.target.closest === 'function' ? e.target.closest('a.bpUse') : null;
      if (u) {
        e.preventDefault();
        e.stopPropagation();
        if (u.hasAttribute('data-busy')) return;
        u.setAttribute('data-busy', '1');
        try { removeTooltips(); } catch (err) { /* game helper may be missing */ }
        const $drop = $(u).closest('.drop');
        requestUse(u.getAttribute('data-invid')).then(
          (text) => {
            $drop.html('<span class="bpFragDone">Used.</span>');
            showInfo(esc(text || 'Item used.').replace(/\n/g, '<br>'), 'Item used');
          },
          () => {
            u.removeAttribute('data-busy');
            showInfo('The item could not be used. Please try again.');
          }
        );
        return;
      }
      const a = e.target && typeof e.target.closest === 'function' ? e.target.closest('a.bpFrag') : null;
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      if (a.hasAttribute('data-busy')) return;
      a.setAttribute('data-busy', '1');
      try { removeTooltips(); } catch (err) { /* game helper may be missing */ }
      const $drop = $(a).closest('.drop');
      requestFrag([a.getAttribute('data-invid')]).then((res) => {
        if (res && res.r == 1) {
          a.removeAttribute('data-busy');
          showInfo((res && res.m) || 'This item could not be broken down.');
          return;
        }
        adjustInventoryCount(1);
        const msg = res && res.m ? $('<div>').html(res.m).text() : 'Broken down.';
        $drop.html('<span class="bpFragDone">' + esc(msg) + '</span>');
      });
    },
    true
  );

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; decorate(); });
  };

  let tries = 0;
  const wait = setInterval(() => {
    tries++;
    const box = document.getElementById('actionContainer');
    if (box) {
      clearInterval(wait);
      decorate();
      // the game rebuilds the list after every action, so keep decorating
      new MutationObserver(schedule).observe(box, { childList: true, subtree: true });
    } else if (tries > 60) {
      clearInterval(wait);
    }
  }, 500);
}
