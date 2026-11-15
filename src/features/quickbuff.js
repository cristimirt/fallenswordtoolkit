import { withFst } from '../core/game.js';
import { FSB, loadSettings } from '../core/settings.js';

// ---------------------------------------------------------------- quick buff pop-up (every page)
// The game opens Quick Buff in a separate browser window through openWindow(url, name, width, height, features), from links like
// javascript:openWindow('index.php?fst=..&cmd=quickbuff&t=..', 'fsQuickBuff', 618, 500, ',scrollbars'). Those calls are caught here and
// the same page is shown in a draggable window on the page instead (an iframe). Every other openWindow call is left alone.
export function initQuickBuffPopup() {
  const POS_KEY = FSB + 'qbPos';
  let box = null;
  const css = document.createElement('style');
  css.textContent =
    '#fsbQb{position:fixed;z-index:100000;display:flex;flex-direction:column;background:#d6b277;border:1px solid #20170396;border-radius:4px;box-shadow:0 0 8px 0 #000;max-width:calc(100vw - 8px);}' +
    '#fsbQb .qbHead{cursor:move;user-select:none;touch-action:none;display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#b79862;color:#3b2a14;font:bold 12px Arial,sans-serif;border-radius:3px 3px 0 0;}' +
    '#fsbQb .qbX{cursor:pointer;background:none;border:0;color:#3b2a14;font-size:18px;line-height:14px;padding:0 2px;}#fsbQb .qbX:hover{color:#8a1f0f;}' +
    '#fsbQb iframe{display:block;border:0;background:#d6b277;max-width:100%;}';
  document.head.appendChild(css);

  const place = (x, y) => {
    const r = box.getBoundingClientRect();
    x = Math.min(Math.max(0, x), Math.max(0, innerWidth - r.width));
    y = Math.min(Math.max(0, y), Math.max(0, innerHeight - r.height));
    box.style.left = x + 'px';
    box.style.top = y + 'px';
  };
  function close() {
    if (box) { box.remove(); box = null; }
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open(url, w, h) {
    if (!/[?&]fst=/.test(url)) url = withFst(url);
    const width = Math.min(w || 618, innerWidth - 16), height = Math.min(h || 500, innerHeight - 60);
    if (!box) {
      box = document.createElement('div');
      box.id = 'fsbQb';
      box.innerHTML = '<div class="qbHead"><span>Quick Buff</span><button type="button" class="qbX" title="Close (Esc)" aria-label="Close">&times;</button></div><iframe></iframe>';
      document.body.appendChild(box);
      box.querySelector('.qbX').addEventListener('click', close);
      document.addEventListener('keydown', onKey);
      const head = box.querySelector('.qbHead');
      head.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.qbX')) return;
        const r = box.getBoundingClientRect();
        const dx = e.clientX - r.left, dy = e.clientY - r.top;
        head.setPointerCapture(e.pointerId);
        const mv = (ev) => place(ev.clientX - dx, ev.clientY - dy);
        const up = () => {
          head.removeEventListener('pointermove', mv);
          head.removeEventListener('pointerup', up);
          head.removeEventListener('pointercancel', up);
          const b = box.getBoundingClientRect();
          try { localStorage.setItem(POS_KEY, JSON.stringify({ x: b.left, y: b.top })); } catch (err) { /* storage unavailable */ }
        };
        head.addEventListener('pointermove', mv);
        head.addEventListener('pointerup', up);
        head.addEventListener('pointercancel', up);
      });
    }
    const f = box.querySelector('iframe');
    f.style.width = width + 'px';
    f.style.height = height + 'px';
    if (!f.fsbHooked) { f.fsbHooked = true; f.addEventListener('load', () => { enhanceQuickBuff(f); autoFit(f); }); }
    f.src = url;
    let pos = null;
    try { pos = JSON.parse(localStorage.getItem(POS_KEY)); } catch (err) { /* ignore */ }
    if (pos) place(pos.x, pos.y);
    else place((innerWidth - width) / 2, Math.max(8, (innerHeight - height) / 2 - 20));
  }


  // ---- buff information inside the pop-up
  // The Fallen Sword Helper adds this to the Quick Buff page, but it does not run inside a frame, so it is done here.
  // Based on the Quick Buff module of the Fallen Sword Helper (MIT licence, Copyright (c) 2017 Fallen Sword Helper).
  const QB_CSS =
    '.fsbRed{color:#ff4d4d}.fsbGreen{color:#4cc04c}.fsbLime{color:#5dff5d}.fsbOff{color:#8f8f8f}.fsbAvail{color:#ffa94d}' +
    '#fsbQbInfo table{margin:0 auto}#fsbQbInfo th{color:orange;padding:0 4px;text-align:center;font-weight:bold}' +
    '#fsbQbInfo td{padding:0 4px;text-align:center}#fsbQbInfo .fsbOn{color:#fff;font-size:x-small}' +
    '.player h1{float:left}.player p{clear:both}.fsbLast{color:#ccc;font-size:x-small}' +
    '.fsbAct{color:#ff3b3b;cursor:pointer}.fsbAct:hover{text-decoration:underline}' +
    '#quickbuff #buff-outer .fsbDim span{color:#999}' +
    '#fsbSort{clear:both;color:#e0c493;font-size:12px;padding:5px 0}' +
    '#fsbSort label{display:inline-flex;align-items:center;gap:4px;cursor:pointer}#fsbSort input{margin:0;cursor:pointer}';
  const profileOf = (name) => fetch(withFst('/index.php?cmd=export&subcmd=profile&player_username=' + encodeURIComponent(name)), { credentials: 'same-origin' })
    .then((r) => r.json()).catch(() => null);
  const clock = (secs) => {
    secs = Math.max(0, Math.round(secs));
    const m = Math.floor(secs / 60), sc = secs % 60;
    return (m ? m + 'm' : '') + (m && sc ? ' ' : '') + (sc ? sc + 's' : m ? '' : '0s');
  };
  const ago = (secs) => {
    secs = Math.abs(Math.round(secs));
    const d = Math.floor(secs / 86400), h = Math.floor(secs / 3600) % 24, m = Math.floor(secs / 60) % 60, sc = secs % 60;
    return (d ? d + ' days, ' : '') + (h ? h + ' hours, ' : '') + (m ? m + ' mins, ' : '') + sc + ' secs';
  };

  // The pop-up is as tall as the page inside it (up to the height of the window), and follows it when it grows or shrinks:
  // a target is added, the buff information arrives, a result is shown.
  function autoFit(f) {
    let d;
    try { d = f.contentDocument; } catch (e) { return; }
    if (!d || !d.body) return;
    // when the page is taller than the window it scrolls inside the pop-up: with a scrollbar that matches the dark page
    const sb = d.createElement('style');
    sb.textContent =
      'html::-webkit-scrollbar{width:12px;height:12px}' +
      'html::-webkit-scrollbar-track{background:#0f0d09;border-left:1px solid #2b2417}' +
      'html::-webkit-scrollbar-thumb{background:#6b5a33;border-radius:6px;border:3px solid #0f0d09}' +
      'html::-webkit-scrollbar-thumb:hover{background:#8d7646}' +
      'html::-webkit-scrollbar-corner{background:#0f0d09}';
    d.head.appendChild(sb);
    let queued = false;
    const run = () => {
      queued = false;
      const max = Math.max(200, innerHeight - 60);
      f.style.height = '0px'; // measured with no room to spare, set again straight away (nothing is painted in between)
      const h = Math.max(d.documentElement.scrollHeight, d.body.scrollHeight);
      f.style.height = Math.min(Math.max(h, 120), max) + 'px';
      if (box) { const r = box.getBoundingClientRect(); place(r.left, r.top); }
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
    const inTip = (n) => n.nodeType === 1 && n.closest && n.closest('.qtip');
    new MutationObserver((list) => {
      // the game's tooltips come and go in the page: they do not change its size
      if (list.some((m) => !inTip(m.target) && (m.type !== 'childList' || Array.from(m.addedNodes).concat(Array.from(m.removedNodes)).some((n) => !inTip(n))))) queue();
    }).observe(d.body, { childList: true, subtree: true, attributes: true, characterData: true });
    queue();
    setTimeout(queue, 600);
    setTimeout(queue, 2000);
  }

  function enhanceQuickBuff(frame) {
    let doc, win;
    try { doc = frame.contentDocument; win = frame.contentWindow; } catch (e) { return; }
    if (!doc || !loadSettings().quickBuffInfo) return;
    const root = doc.getElementById('quickbuff');
    if (!root || doc.getElementById('fsbQbInfo')) return;
    const style = doc.createElement('style');
    style.textContent = QB_CSS;
    doc.head.appendChild(style);
    const me = (typeof win.self === 'string' && win.self) || (document.getElementById('statbar-character') || {}).textContent;
    const first = root.children[0];
    if (first && me) {
      const head = doc.createElement('div');
      head.id = 'fsbQbInfo';
      head.innerHTML = '<table><thead><tr><th>Sustain</th><th>Fury Caster</th><th>Guild Buffer</th><th>Buff Master</th><th>Extend</th><th>Reinforce</th></tr></thead>' +
        '<tbody><tr><td data-k="Sustain">&nbsp;</td><td data-k="Fury Caster">&nbsp;</td><td data-k="Guild Buffer">&nbsp;</td><td data-k="Buff Master">&nbsp;</td><td data-k="Extend">&nbsp;</td><td data-k="Reinforce">&nbsp;</td></tr></tbody></table>';
      first.insertAdjacentElement('afterend', head);
      const activatable = (k) => {
        const box = doc.querySelector('#buff-outer input[data-name="' + k + '"]');
        return box ? '<span class="fsbAct" data-id="' + box.value + '" data-k="' + k + '">Activate</span>' : '<span class="fsbOff">Off</span>';
      };
      // Activate: the same request as the page's own form, for yourself and that one skill
      head.addEventListener('click', async (e) => {
        const a = e.target.closest('.fsbAct');
        if (!a || a.dataset.busy) return;
        a.dataset.busy = '1';
        const holder = a.parentNode, k = a.dataset.k;
        a.textContent = '...';
        let reason = '';
        try {
          const body = new URLSearchParams();
          body.set('fst', (withFst('/index.php').match(/[?&]fst=([^&#]+)/) || [])[1] || '');
          body.set('cmd', 'quickbuff');
          body.set('subcmd', 'activate');
          body.set('targetPlayers', me.trim());
          body.append('skills[]', a.dataset.id);
          const res = await fetch(withFst('/index.php'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
          const txt = await res.text();
          if (/was activated on/.test(txt)) { holder.innerHTML = '<span class="fsbLime">On</span>'; return; }
          const rep = new DOMParser().parseFromString(txt, 'text/html').querySelector('#quickbuff-report');
          reason = rep ? rep.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : 'no answer';
        } catch (err) { reason = 'request failed'; }
        holder.innerHTML = '<span class="fsbRed">Failed</span><br><span class="fsbOn">' + reason.replace(/[&<>]/g, '') + '</span>';
        setTimeout(() => { holder.innerHTML = activatable(k); }, 5000);
      });
      profileOf(me.trim()).then((d) => {
        if (!d) return;
        const cell = (k) => head.querySelector('td[data-k="' + k + '"]');
        ['Sustain', 'Fury Caster'].forEach((k) => {
          const e = (d._enhancements || []).find((x) => x.name === k);
          const v = e ? e.value : 0;
          cell(k).innerHTML = '<span class="' + (v < 100 ? 'fsbRed' : 'fsbLime') + '">' + v + '%</span>';
        });
        const dur = {};
        (d._skills || []).forEach((x) => { dur[x.name] = x.duration; });
        ['Guild Buffer', 'Buff Master', 'Extend', 'Reinforce'].forEach((k) => {
          const secs = dur[k] || 0;
          cell(k).innerHTML = secs
            ? '<span class="fsbLime">On</span>&nbsp;<span class="fsbOn">(' + clock(secs) + ')</span>'
            : activatable(k);
        });
      });
    }
    // stamina cost in each buff's tooltip, and low level buffs (under 125, the ones that are mostly prerequisites) dimmed
    const NOT_DIMMED = [50, 54, 55, 56, 60, 61, 98, 101, 179, 181];
    doc.querySelectorAll('#buff-outer label[for^="skill-"]').forEach((label) => {
      const nameSpan = label.children[0], box = label.previousElementSibling;
      if (!nameSpan || !box) return;
      const tip = nameSpan.dataset.tipped;
      if (tip && box.dataset.cost) nameSpan.dataset.tipped = tip.replace('</center>', '<br>Stamina Cost: ' + box.dataset.cost + '$&');
      const lvlEl = nameSpan.children[0];
      const lvl = lvlEl ? Number((lvlEl.textContent || '').replace(/[[\]]/g, '')) : NaN;
      if (NOT_DIMMED.indexOf(Number(label.htmlFor.slice(6))) === -1 && lvl < 125) label.classList.add('fsbDim');
    });
    // sort the buffs alphabetically (a checkbox under Check All, like the Fallen Sword Helper's; remembered)
    const checkAll = doc.getElementById('check-all');
    if (checkAll) {
      const order = {};
      [1, 2, 3].forEach((i) => { order[i] = Array.from(doc.querySelectorAll('#block' + i + ' > p')); });
      const sortBuffs = (on) => [1, 2, 3].forEach((i) => {
        const block = doc.getElementById('block' + i);
        if (!block) return;
        const list = on ? order[i].slice().sort((x, y) => (x.children[0].dataset.name > y.children[0].dataset.name ? 1 : -1)) : order[i];
        list.forEach((pp) => block.appendChild(pp));
      });
      const row = doc.createElement('div');
      row.id = 'fsbSort';
      row.innerHTML = '<label><input type="checkbox">Sort buffs alphabetically</label>';
      // outside #buff-outer: the page's Check All ticks every checkbox inside it
      const outer = doc.getElementById('buff-outer');
      (outer || checkAll).insertAdjacentElement('afterend', row);
      const sw = row.querySelector('input');
      let on = false;
      try { on = localStorage.getItem(FSB + 'qbSort') === '1'; } catch (err) { /* ignore */ }
      sw.checked = on;
      if (on) sortBuffs(true);
      sw.addEventListener('change', () => {
        try { localStorage.setItem(FSB + 'qbSort', sw.checked ? '1' : '0'); } catch (err) { /* ignore */ }
        sortBuffs(sw.checked);
      });
    }
    // what a target already has, next to each buff; and when the target was last active, with the stamina
    const showTarget = (h1) => {
      const name = (h1.textContent || '').trim();
      const holder = h1.parentNode && h1.parentNode.lastElementChild;
      if (!name || !holder) return;
      const have = (holder.textContent || '').split(',').map((t) => t.trim().split(/ \[|]/));
      profileOf(name).then((d) => {
        doc.querySelectorAll('#buff-outer input[name]').forEach((el) => {
          const label = el.nextElementSibling;
          if (!label) return;
          let span = label.nextElementSibling && label.nextElementSibling.classList.contains('fsbPlayer') ? label.nextElementSibling : null;
          const hit = have.find((a) => a[0] === el.getAttribute('data-name'));
          const lvl = hit ? Number(hit[1]) : 0;
          if (!lvl) { if (span) span.innerHTML = ''; return; }
          const mine = Number(((label.querySelector('span span') || {}).textContent || '').replace(/[[\]]/g, ''));
          if (!span) { span = doc.createElement('span'); span.className = 'fsbPlayer'; label.insertAdjacentElement('afterend', span); }
          span.innerHTML = ' <span class="' + (mine > lvl ? 'fsbRed' : 'fsbGreen') + '">[' + lvl + ']</span>';
        });
        if (d && d.username) {
          const box = doc.querySelector('div.player[data-username="' + d.username + '"]');
          if (!box) return;
          let act = box.querySelector('span.fsbLast');
          if (!act) { act = doc.createElement('span'); act.className = 'fsbLast'; const h = box.getElementsByTagName('h1')[0]; if (h) h.insertAdjacentElement('afterend', act); }
          act.innerHTML = 'Last Activity: ' + ago(Date.now() / 1000 - d.last_login) + '<br>Stamina: ' + d.current_stamina + ' / ' + d.stamina + ' ( ' + Math.floor((d.current_stamina / d.stamina) * 100) + '% )';
        }
      });
    };
    const players = doc.getElementById('players');
    if (players) players.addEventListener('click', (e) => { if (e.target.tagName === 'H1') showTarget(e.target); });
    const targets = doc.getElementById('targetPlayers');
    if (targets && targets.value) { // the first target is shown without a click
      let tries = 0;
      const t = setInterval(() => {
        const h1 = players && players.getElementsByTagName('h1')[0];
        if (h1) { clearInterval(t); showTarget(h1); } else if (++tries > 30) clearInterval(t);
      }, 100);
    }
  }

  const isQuickBuff = (url) => /[?&]cmd=quickbuff(&|#|$)/.test(String(url || ''));
  // wraps one function that takes openWindow's arguments; true once it is wrapped
  function wrap(owner, name) {
    const orig = owner && owner[name];
    if (typeof orig !== 'function') return false;
    if (orig.fsbWrapped) return true;
    const wrapped = function (url, target, w, h) {
      if (isQuickBuff(url) && loadSettings().quickBuffPopup) { open(String(url), w, h); return undefined; }
      return orig.apply(this, arguments);
    };
    wrapped.fsbWrapped = true;
    owner[name] = wrapped;
    return true;
  }
  // The helper replaces window.openWindow when its "resize quick buff" option is on, so it is wrapped again whenever that happens...
  setInterval(() => {
    wrap(window.HCS && window.HCS.utils, 'openWindow'); // what the global openWindow() calls
    wrap(window, 'openWindow');
  }, 1000);
  // ...and the links themselves are caught before any of that: javascript:openWindow('<quick buff address>', name, width, height, ...)
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="javascript:openWindow"]');
    if (!a || !loadSettings().quickBuffPopup) return;
    const m = a.getAttribute('href').match(/openWindow\(\s*'([^']*)'\s*,\s*'[^']*'\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m || !isQuickBuff(m[1])) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(m[1], +m[2], +m[3]);
  }, true);
}
