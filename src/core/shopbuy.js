import { sleep } from './itemtips.js';
import { $, esc } from './util.js';

// Buying several of an item in a token shop that sells one at a time (Arena Token Shop, PvP Ladder rewards, Loyalty rewards): the
// game's own "Please confirm" dialog (what fsConfirm opens: a jQuery UI dialog with these classes), with the item, a quantity and
// the cost added. The purchases are then made one after another in the background, with a counter and a progress bar in the same
// window. It stops at the first purchase that does not go through, says why, and how many were bought. A purchase counts only when
// the balance on the page the game answers with has gone down; nothing is ever asked a second time.
const PAUSE = 350; // between two purchases: the game answers 503 when asked too fast

const CSS =
  // inside the game's own dialog: only what is added to it
  '.fsbArDlg p{margin:10px 0 0;}' +
  '.fsbArDlg p.item{font-weight:bold;margin-top:4px;}' +
  '.fsbArDlg p.pic img{max-width:60px;max-height:90px;vertical-align:middle;}' +
  '.fsbArDlg .tip-dynamic{cursor:help;}' +
  '.fsbArDlg input{width:80px;margin-left:6px;text-align:center;}' +
  '.fsbArDlg .bar{height:12px;margin-top:2px;border:1px solid #c8a45c;border-radius:6px;overflow:hidden;}' +
  '.fsbArDlg .bar i{display:block;height:100%;width:0;background:#c8a45c;transition:width .2s;}' +
  '.fsbArDlg .err,.fsbArDlg .total.over{color:#ff7a66;font-weight:bold;}';

const num = (s) => parseInt(String(s).replace(/,/g, ''), 10);

// a balance written in the page: re has the number as its first group
export const textBalance = (re) => (doc) => {
  const root = doc.getElementById('pCC') || doc.body;
  const m = re.exec(root.textContent.replace(/\s+/g, ' '));
  return m ? num(m[1]) : null;
};
// the gold of the bar at the top
export const goldBalance = (doc) => {
  const e = doc.getElementById('statbar-gold');
  const m = e && /\d[\d,]*/.exec(e.textContent);
  return m ? num(m[0]) : null;
};
// writes a new balance into the page: the first number in the text nodes of root, from the one that holds the words `after` on
export function writeNumber(root, after, n) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = !after;
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    let from = 0;
    if (!seen) {
      const i = t.nodeValue.indexOf(after);
      if (i === -1) continue;
      seen = true;
      from = i + after.length;
    }
    const m = /\d[\d,]*/.exec(t.nodeValue.slice(from));
    if (m) { t.nodeValue = t.nodeValue.slice(0, from + m.index) + n.toLocaleString('en-US') + t.nodeValue.slice(from + m.index + m[0].length); return; }
  }
}

// the message the game shows for the last action (#info-msg), as plain text
function messageOf(doc) {
  const m = doc.getElementById('info-msg');
  return m ? m.innerHTML.replace(/<br[\s\S]*/i, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

// one purchase: resolves with { balance, message } or { error }
function buyOne(item, quantity) {
  return new Promise((resolve) => {
    $.ajax($.extend({
      dataType: 'text',
      timeout: 30000,
      success: (t) => {
        const doc = new DOMParser().parseFromString(t, 'text/html');
        resolve({ balance: item.balance(doc), message: messageOf(doc) });
      },
      error: (x, why) => resolve({ error: why === 'timeout' ? 'The game did not answer in time (this purchase may or may not have gone through).' : 'The request failed' + (x.status ? ' (error ' + x.status + ')' : '') + '.' }),
    }, item.request(quantity || 1)));
  });
}

let busy = false;
const guard = (e) => { e.preventDefault(); e.returnValue = ''; }; // asks before the page is left while buying

// item: { name, color, tip, img, cost (of one, 0 not known), unit (what it is paid with), max (quantity),
//         balance(doc) -> number or null, show(n) writes the balance into the page, request(quantity) -> the settings of one purchase,
//         bulk (for a shop that takes a quantity): the whole quantity in one request; true: it went through when the balance went
//         down; or bulk(message), which says by the game's message whether it did }
export function buyDialog(item) {
  if (document.querySelector('.fsbArDlg')) return;
  if (!document.getElementById('fsbBuyCss')) {
    const css = document.createElement('style');
    css.id = 'fsbBuyCss';
    css.textContent = CSS;
    document.head.appendChild(css);
  }
  const attr = (v) => esc(v).replace(/"/g, '&quot;');
  const hover = item.tip ? ' class="tip-dynamic" data-tipped="' + attr(item.tip) + '"' : '';
  const $box = $('<div class="fs-dialog-message fsbArDlg">').html('Are you sure you wish to buy this item?' +
    // the picture and the name, each with the game's own item tooltip
    '<p class="pic">' + (item.img ? '<img' + hover + ' src="' + attr(item.img) + '" alt="">' : '') + '</p>' +
    '<p class="item"><span' + hover + ' style="color:' + item.color + '">' + esc(item.name) + '</span></p>' +
    '<p><label>Quantity <input type="number" class="custominput" min="1" max="' + item.max + '" value="1"></label></p>' +
    (item.cost ? '<p class="total"></p>' : ''));
  const input = $box.find('input')[0];
  const qty = () => Math.min(item.max, Math.max(1, parseInt(input.value, 10) || 1));
  const have = item.balance(document);
  // the cost in red when it is more than there is
  const totals = () => {
    const total = item.cost * qty();
    if (item.cost) $box.find('.total').text('Cost: ' + total.toLocaleString('en-US') + ' ' + item.unit).toggleClass('over', have !== null && total > have);
  };
  totals();
  input.addEventListener('input', totals);
  let started = false;
  const ok = () => { if (!started) { started = true; (item.bulk ? runBulk : run)($box, item, qty()); } };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
  $box.dialog({
    title: 'Please confirm',
    modal: true,
    width: 380,
    resizable: false,
    draggable: false,
    classes: { 'ui-dialog': 'fs-dialog fs-dialog-confirm', 'ui-dialog-titlebar': 'ui-corner-all' },
    buttons: [
      { text: 'Cancel', class: 'fs-dialog-cancel', click: () => $box.dialog('close') },
      { text: 'OK', class: 'fs-dialog-ok', click: ok },
    ],
    beforeClose: () => !busy, // not while buying
    close: () => $box.dialog('destroy').remove(),
  });
  input.focus();
  input.select();
}

// the shop takes a quantity: one request, which cannot be stopped once it is sent
async function runBulk($box, item, total) {
  busy = true;
  window.addEventListener('beforeunload', guard);
  $box.html('<div class="bar"><i></i></div><p class="count">Buying ' + total + '…</p><p class="state"></p>');
  const box = $box[0];
  $box.dialog('option', 'title', 'Buying ' + item.name);
  $box.dialog('option', 'buttons', []);
  const before = item.balance(document);
  const byBalance = typeof item.bulk !== 'function';
  // when only the balance can tell whether it went through, nothing is bought without it
  const res = byBalance && before === null ? { error: 'Your balance could not be read on this page, so nothing was bought.' } : await buyOne(item, total);
  let bought = 0;
  let error = res.error || '';
  if (!error) {
    if (byBalance ? res.balance !== null && res.balance < before : item.bulk(res.message)) {
      bought = total;
      // the cost of fewer was taken: say how many that is
      const paid = before !== null && res.balance !== null ? before - res.balance : 0;
      if (item.cost && paid > 0) bought = Math.min(total, Math.max(1, Math.round(paid / item.cost)));
      if (bought < total) error = 'Only ' + bought + (bought === 1 ? ' was' : ' were') + ' paid for.' + (res.message ? ' The game said: ' + res.message : '');
    } else if (byBalance && res.balance === null) error = 'Your balance could not be read in the answer: check what was bought.' + (res.message ? ' The game said: ' + res.message : '');
    else error = res.message || (byBalance ? 'The purchase did not go through (your balance did not change).' : 'The game did not say that the purchase went through.');
  }
  if (res.balance !== null && res.balance !== undefined) item.show(res.balance);
  const have = res.balance === undefined ? null : res.balance;
  box.querySelector('.bar i').style.width = (100 * bought / total) + '%';
  finish($box, item, total, bought, have, error, false);
}

function finish($box, item, total, bought, have, error, stopped) {
  busy = false;
  window.removeEventListener('beforeunload', guard);
  const box = $box[0];
  const state = box.querySelector('.state');
  state.className = 'state' + (error ? ' err' : '');
  state.textContent = error || (stopped && bought < total ? 'Stopped.' : 'Done.');
  box.querySelector('.count').textContent = 'Bought ' + bought + ' of ' + total + ' successfully' + (have === null ? '' : ' · ' + have.toLocaleString('en-US') + ' ' + item.unit + ' left');
  $box.dialog('option', 'buttons', [{ text: 'Close', class: 'fs-dialog-ok', click: () => $box.dialog('close') }]);
}

async function run($box, item, total) {
  busy = true;
  window.addEventListener('beforeunload', guard);
  $box.html('<div class="bar"><i></i></div><p class="count">Bought 0 of ' + total + '</p><p class="state"></p>');
  const box = $box[0];
  const state = box.querySelector('.state');
  let stopped = false;
  $box.dialog('option', 'title', 'Buying ' + item.name);
  $box.dialog('option', 'buttons', [{ text: 'Stop', class: 'fs-dialog-cancel', click: (e) => { stopped = true; e.currentTarget.disabled = true; state.textContent = 'Stopping…'; } }]);

  let bought = 0;
  let have = item.balance(document);
  // without the balance there is no telling whether a purchase went through: nothing is bought
  let error = have === null ? 'Your balance could not be read on this page, so nothing was bought.' : '';
  while (!error && bought < total && !stopped) {
    const res = await buyOne(item);
    if (res.error) { error = res.error; break; }
    if (res.balance === null || res.balance >= have) {
      // the balance did not go down: not bought, and the game's message says why
      error = res.message || (res.balance === null ? 'The game answered with an unexpected page.' : 'The purchase did not go through (your balance did not change).');
      if (res.balance !== null) have = res.balance;
      break;
    }
    have = res.balance;
    bought += 1;
    item.show(have);
    box.querySelector('.bar i').style.width = (100 * bought / total) + '%';
    box.querySelector('.count').textContent = 'Bought ' + bought + ' of ' + total;
    if (bought < total && !stopped) await sleep(PAUSE);
  }

  finish($box, item, total, bought, have, error, stopped);
}
