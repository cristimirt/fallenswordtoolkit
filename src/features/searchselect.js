import { norm } from '../core/items.js';
import { $, esc } from '../core/util.js';

// ---------------------------------------------------------------- searchable select
// The real select stays in the page, hidden, so forms and the game's own code work as before; a search box with a
// filtered list in front of it sets its value (used by the buff market and the backpack's "move to folder").
export function ensureSearchStyle() {
  if (!$('#bpBuffStyle').length) {
    $('head').append(
      '<style id="bpBuffStyle">' +
        'select.bpBuffNative{display:none !important;}' +
        'select.bpBuffNative.bpKeep{display:inline-block !important;position:absolute !important;width:1px !important;height:1px !important;opacity:0 !important;pointer-events:none !important;}' +
        '.bpBuffBox{position:relative;display:inline-block;vertical-align:middle;}' +
        '.bpBuffBox input{width:136px;box-sizing:border-box;}' +
        '.bpBuffList{display:none;position:absolute;left:0;top:100%;z-index:1000;min-width:100%;max-height:220px;overflow-y:auto;' +
        'margin:0;padding:0;list-style:none;white-space:nowrap;text-align:left;font:12px Helvetica,Arial;' +
        'background:#e8c88e;border:1px solid #6b5230;border-radius:4px;box-shadow:0 3px 8px rgba(0,0,0,.4);}' +
        '.bpBuffList{scrollbar-width:thin;scrollbar-color:#8a6a38 #d9b774;}' +
        '.bpBuffList::-webkit-scrollbar{width:9px;}' +
        '.bpBuffList::-webkit-scrollbar-track{background:#d9b774;border-radius:4px;box-shadow:inset 0 0 2px #20170399;}' +
        '.bpBuffList::-webkit-scrollbar-thumb{background:#8a6a38;border:1px solid #20170396;border-radius:4px;}' +
        '.bpBuffList::-webkit-scrollbar-thumb:hover{background:#6b5230;}' +
        '.bpBuffList li{padding:2px 6px;cursor:pointer;color:#3b2a14;}' +
        '.bpBuffList li.bpBuffActive{background:#d9b774;}' +
        '#backpack-multi-options .bpBuffBox input{width:120px;height:18px;box-sizing:border-box;padding:0 6px;border:1px solid #6b5230;border-radius:4px;' +
        'background:#e8c88e;color:#3b2a14;font:bold 11px Arial,sans-serif;}' +
        '#backpack-multi-options .bpBuffBox input::placeholder{color:#7a6a50;}' +
        '#backpack-multi-options .bpBuffList{font:bold 11px Arial,sans-serif;}' +
        '.bpBuffList li.bpBuffCur{font-weight:bold;}' +
        '.bpBuffList li.bpBuffNone{cursor:default;color:#7a6a50;}' +
        // the Auction House filters: the look of the backpack's dropdowns (orange paper, bold dark brown text, dark border with a glow)
        // and a colour swatch in front of the options that have a colour (a square for craft, a diamond for rarity)
        '.bpBuffBox.bpAh{display:block;}' +
        '.bpBuffBox.bpAh input{height:22px;padding:0 6px;border:1px solid #20170396;border-radius:4px;background:#e8c88e;color:#3b2a14;' +
        'font:bold 11px Arial,sans-serif;box-shadow:0 0 3px 0 #000;}' +
        '.bpBuffBox.bpAh input:hover,.bpBuffBox.bpAh input:focus{background:#f0d6a2;border-color:#3b2a14;outline:none;}' +
        '.bpBuffBox.bpAh input::placeholder{color:#7a6a50;}' +
        '.bpBuffBox.bpAh.bpHasSw input{padding-left:24px;}' +
        '.bpBuffBox.bpAh .bpBuffList{margin-top:2px;padding:2px;border:1px solid #20170396;box-shadow:0 3px 8px rgba(0,0,0,.4);font:bold 11px Arial,sans-serif;}' +
        '.bpBuffBox.bpAh .bpBuffList li{display:flex;align-items:center;gap:6px;height:22px;padding:0 6px;color:#3b2a14;}' +
        '.bpBuffBox.bpAh .bpBuffList li:hover{background:#f3dfb2;}' +
        '.bpBuffBox.bpAh .bpBuffList li.bpBuffActive{background:#d9b774;}' +
        '.bpBuffBox.bpAh .bpBuffList li.bpBuffNone{color:#7a6a50;}' +
        '.bpAhSw{display:inline-block;flex:none;width:11px;height:11px;box-sizing:border-box;border:1px solid #3b2a14;border-radius:2px;}' +
        '.bpAhDia{display:inline-block;flex:none;width:9px;height:9px;margin:1px;box-sizing:border-box;border:1px solid #1a1208;transform:rotate(45deg);}' +
        '.bpAhNone{visibility:hidden;}' +
        // a small down arrow at the right end of the closed box, and a scrollbar in the paper colours
        '.bpBuffBox.bpAh{position:relative;}' +
        '.bpBuffBox.bpAh input{padding-right:20px;text-overflow:ellipsis;}' +
        '.bpBuffBox.bpAh::after{content:"";position:absolute;right:7px;top:9px;border:4px solid transparent;border-top:5px solid #3b2a14;border-bottom:0;pointer-events:none;}' +
        '.bpBuffBox.bpAh .bpBuffList::-webkit-scrollbar{width:9px;}' +
        '.bpBuffBox.bpAh .bpBuffList::-webkit-scrollbar-track{background:#d9b774;border-radius:4px;box-shadow:inset 0 0 2px #20170399;}' +
        '.bpBuffBox.bpAh .bpBuffList::-webkit-scrollbar-thumb{background:#8a6a38;border:1px solid #20170396;border-radius:4px;}' +
        '.bpBuffBox.bpAh .bpBuffList::-webkit-scrollbar-thumb:hover{background:#6b5230;}' +
        '.bpBuffBox .bpBoxSw{position:absolute;left:7px;top:50%;margin-top:-6px;pointer-events:none;}' +
      '</style>'
    );
  }

  }

// opts.resetOnEmpty: emptying the box selects the first option ("any"); opts.look: the backpack dropdowns' look (the Auction House); opts.matchWidth: the box is as wide as the select was;
// opts.swatch(value, text) -> { color, shape: 'square' | 'diamond' } or null: a colour mark in front of the option
export function searchSelect(select, placeholder, noMatch, opts) {
  ensureSearchStyle();
  if (select.bpSearchDone) return;
  select.bpSearchDone = true;
  opts = opts || {};
  const width = opts.matchWidth ? select.offsetWidth : 0;
  // a cloned row can carry a copy of an earlier box (without handlers): start clean
  $(select).siblings('.bpBuffBox').remove();

  // read live: the game rebuilds the folder list now and then
  const readOpts = () => Array.from(select.options).map((o) => ({ value: o.value, text: o.text, lower: norm(o.text), sw: opts.swatch ? opts.swatch(o.value, o.text) : null }));
  const $box = $(
    '<span class="bpBuffBox"><input type="text" class="custominput" autocomplete="off" spellcheck="false" placeholder="' + esc(placeholder) + '">' +
    '<ul class="bpBuffList"></ul></span>'
  ).insertAfter(select);
  const $in = $box.find('input');
  const $list = $box.find('ul');
  if (width) $in.css('width', width + 'px');
  if (opts.look) $box.addClass('bpAh');
  select.classList.add('bpBuffNative');
  // The Auction House reads only the filters that are :visible (it skips what has no size), so there the real select stays
  // in the layout, 1px big and invisible, instead of display:none.
  if (opts.look) { select.classList.add('bpKeep'); select.tabIndex = -1; }

  let shown = [];
  let active = 0;
  let open = false;
  // a swatch can be { color, shape } or { html, textless }: markup of its own, and with textless it stands in for the text of the option
  const curOpt = () => select.options[select.selectedIndex];
  const curText = () => { const o = curOpt(); if (!o) return ''; const sw = opts.swatch ? opts.swatch(o.value, o.text) : null; return sw && sw.textless ? '' : o.text; };
  const swHtml = (sw, extra) => (sw && sw.html
    ? '<span class="bpAhHtml' + (extra ? ' ' + extra : '') + '">' + sw.html + '</span>'
    : sw
    ? '<i class="' + (sw.shape === 'diamond' ? 'bpAhDia' : 'bpAhSw') + (extra ? ' ' + extra : '') + '" style="background:' + sw.color + '"></i>'
    : '<i class="bpAhSw bpAhNone"></i>'); // no mark: the same room, so that the names line up
  const paintBox = () => { // the box shows the mark of the chosen option
    if (!opts.swatch) return;
    const sw = opts.swatch(select.value, curOpt() ? curOpt().text : '');
    $in.attr('placeholder', sw && sw.textless ? '' : placeholder);
    $box.children('.bpBoxSw').remove();
    $box.toggleClass('bpHasSw', !!sw);
    if (sw) $box.prepend(swHtml(sw, 'bpBoxSw'));
  };

  function paint() {
    $list.html(
      shown.length
        ? shown.map((o, i) =>
            '<li data-i="' + i + '" class="' + (i === active ? 'bpBuffActive ' : '') + (o.value === select.value ? 'bpBuffCur' : '') + '"' + '>' + (opts.swatch ? swHtml(o.sw) : '') + esc(o.sw && o.sw.textless ? '' : o.text) + '</li>'
          ).join('')
        : '<li class="bpBuffNone">' + esc(noMatch) + '</li>'
    );
    const li = $list.children('.bpBuffActive')[0];
    if (li) li.scrollIntoView({ block: 'nearest' });
  }
  function show(query) {
    const words = norm(query).split(/\s+/).filter(Boolean);
    shown = readOpts().filter((o) => words.every((w) => o.lower.includes(w)));
    const cur = shown.findIndex((o) => o.value === select.value);
    active = cur >= 0 ? cur : 0;
    open = true;
    $list.show();
    paint();
  }
  function hide() {
    open = false;
    $list.hide();
    $in.val(curText());
    paintBox();
  }
  function pick(i) {
    const o = shown[i];
    if (!o) return;
    if (select.value !== o.value) {
      select.value = o.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    hide();
    $in.trigger('blur');
  }
  function move(step) {
    if (!shown.length) return;
    active = (active + step + shown.length) % shown.length;
    paint();
  }

  $in.val(curText());
  paintBox();
  // the page sets the selects without a change event (Clear Filters, a saved filter): the box follows
  if (opts.look) {
    let last = select.selectedIndex;
    const timer = setInterval(() => {
      if (!select.isConnected) { clearInterval(timer); return; }
      if (open || select.selectedIndex === last) return;
      last = select.selectedIndex;
      $in.val(curText());
      paintBox();
    }, 250);
    $(select).on('change', () => { last = select.selectedIndex; });
  }
  // a click on the box of an open list closes it (a toggle); the mousedown comes before the focus, so it sees the state before it
  let wasOpen = false;
  $in.on('mousedown', () => { wasOpen = open; });
  $in.on('focus click', function (e) {
    if (e.type === 'click' && wasOpen) { wasOpen = false; hide(); return; }
    if (open) return;
    this.select();
    show(''); // the whole list first, so it can still be browsed like the original select
  });
  $in.on('input', function () {
    // opts.resetOnEmpty: emptying the box goes back to the first option ("any")
    if (opts.resetOnEmpty && !$in.val() && select.selectedIndex > 0) { select.selectedIndex = 0; select.dispatchEvent(new Event('change', { bubbles: true })); }
    show($in.val());
  });
  $in.on('blur', hide);
  $in.on('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) show('');
      else move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' && open) {
      e.preventDefault(); // do not submit the search while picking
      pick(active);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      hide();
    }
  });
  $list.on('mousedown', 'li[data-i]', function (e) {
    e.preventDefault(); // keep the focus in the box until the pick is made
    pick(parseInt($(this).attr('data-i'), 10));
  });
  $list.on('mousemove', 'li[data-i]', function () {
    const i = parseInt($(this).attr('data-i'), 10);
    if (i === active) return;
    $list.children('.bpBuffActive').removeClass('bpBuffActive');
    $(this).addClass('bpBuffActive');
    active = i;
  });
  // something else changed the select (the game, or a restored form): follow it
  $(select).on('change', () => { if (!open) { $in.val(curText()); paintBox(); } });
}
