import { withFst } from '../core/game.js';
import { loadSettings, mergeSettings } from '../core/settings.js';
import { goldBalance, writeNumber } from '../core/shopbuy.js';
import { $, esc } from '../core/util.js';

// ---------------------------------------------------------------- composed potions: not enough gold
// Two things on the Composing page cost gold: starting a potion and finishing one at once ("Instant Finish").
// - When one is refused for lack of gold, this offers to take what is missing from the bank and do it again.
// - With the page's "Automatic Bank Withdrawal" switch on, the gold is checked just before the request is sent, and what is
//   missing is taken from the bank first.
// Every way of starting a potion is the same request (cmd=composing&subcmd=createajax: the game's Create buttons, the Helper's
// Quick Create and Fast Compose), so its answer is watched wherever it comes from. What one potion costs is the total of the
// template's buff levels times its duration, at least 5,000 (the template list of app.php). Instant Finish loads a new page
// (subcmd=instant...), so its price, which is on the button, is kept for that page to see. Nothing is withdrawn without a
// button or the switch.
const MIN_COST = 5000;
const PENDING = 'FSB_instantPending'; // the Instant Finish that was just sent
const NOTE = 'FSB_goldNote'; // what to say after the page it was sent from is gone
const NO_GOLD = /(?=.*\bgold\b)(?=.*(not (have )?enough|insufficient|afford|need|require))/i;

const fmt = (n) => n.toLocaleString('en-US');
const plain = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const num = (s) => parseInt(String(s).replace(/,/g, ''), 10);

// what a request or its answer is made of: the parameters in the address and in the body
function paramsOf(s) {
  const p = new URLSearchParams(String(s.url).split('?')[1] || '');
  if (typeof s.data === 'string') new URLSearchParams(s.data).forEach((v, k) => p.set(k, v));
  return p;
}

const ajax = (o) => new Promise((resolve, reject) => { $.ajax(Object.assign({ timeout: 30000, success: resolve, error: (x) => reject(new Error('The request failed' + (x.status ? ' (error ' + x.status + ')' : '') + '.')) }, o)); });
const getPage = async (u) => new DOMParser().parseFromString(await ajax({ url: withFst(u), dataType: 'text' }), 'text/html');

async function templateCost(id) {
  const r = await ajax({ url: withFst('/app.php?cmd=composing&subcmd=view&browser=1&v=9'), dataType: 'json' });
  const t = r && r.s && r.r.templates.find((x) => String(x.id) === String(id));
  if (!t) return null;
  const levels = t.buffs.reduce((a, b) => a + b.level, 0);
  return { name: t.name, cost: Math.max(levels * t.duration, MIN_COST) };
}

// how many potions "Create all" would start now: the empty slots, each with its own template box
const emptySlots = (doc) => doc.querySelectorAll('select[id^="composing-template-"]:not(#composing-template-multi)').length;

async function bankBalance() {
  const doc = await getPage('/index.php?cmd=bank');
  const root = doc.getElementById('pCC') || doc.body;
  const m = /Account Balance:\s*([\d,]+)/.exec(root.textContent.replace(/\s+/g, ' '));
  return { bank: m ? num(m[1]) : null, gold: goldBalance(doc) };
}

function showGold(gold) {
  if (gold !== null) writeNumber(document.getElementById('statbar-gold'), '', gold);
}

async function withdraw(amount) {
  const t = await ajax({ url: withFst('/index.php'), type: 'POST', dataType: 'text', data: { cmd: 'bank', subcmd: 'transaction', mode: 'withdraw', amount: String(amount) } });
  const doc = new DOMParser().parseFromString(t, 'text/html');
  const msg = doc.getElementById('info-msg');
  return { gold: goldBalance(doc), message: msg ? plain(msg.innerHTML) : '' };
}

function toComposing() {
  location.href = withFst('/index.php?cmd=composing&m=0');
}

let open = false;

// the window, looking like the game's own "Please confirm"
function dialog(html, buttons) {
  const $box = $('<div class="fs-dialog-message fsbCompGold">').html(html);
  open = true;
  let busy = false;
  $box.dialog({
    title: 'Not enough gold',
    modal: true,
    width: 380,
    resizable: false,
    draggable: false,
    classes: { 'ui-dialog': 'fs-dialog fs-dialog-confirm', 'ui-dialog-titlebar': 'ui-corner-all' },
    buttons,
    beforeClose: () => !busy, // not while the gold is on its way
    close: () => { open = false; $box.dialog('destroy').remove(); },
  });
  return { $box, setBusy: (v) => { busy = v; } };
}

// The offer: what costs how much, what there is, and one button that withdraws what is missing and then does it.
// o: { what (html), total, gold, bank, message (the game's), many, button, act() -> text of what went wrong, or '' }
function offerWindow(o) {
  const missing = o.total - o.gold;
  const intro = o.message ? '<p>' + esc(o.message) + '</p>' : '';
  const facts = '<p>' + o.what + ' costs <b>' + fmt(o.total) + '</b> gold.<br>You have ' + fmt(o.gold) + ' gold, and ' + fmt(o.bank) + ' in the bank.</p>';
  if (o.bank < missing) {
    dialog(intro + facts + '<p>The bank does not hold the ' + fmt(missing) + ' gold that is missing.</p>', [{ text: 'Close', class: 'fs-dialog-ok', click() { $(this).dialog('close'); } }]);
    return;
  }

  let started = false;
  const d = dialog(intro + facts + '<p>Withdraw <b>' + fmt(missing) + '</b> gold from the bank and ' + o.button + (o.many ? ' them' : ' it') + '?</p><p class="state"></p>', [
    { text: 'Cancel', class: 'fs-dialog-cancel', click() { $(this).dialog('close'); } },
    { text: 'Withdraw & ' + o.button, class: 'fs-dialog-ok', click: () => go() },
  ]);

  async function go() {
    if (started) return;
    started = true;
    const $box = d.$box;
    const state = $box.find('.state')[0];
    const say = (text, bad) => { state.textContent = text; state.style.color = bad ? '#ff7a66' : ''; };
    const end = (text, reload) => {
      d.setBusy(false);
      say(text, true);
      $box.dialog('option', 'buttons', [{ text: 'Close', class: 'fs-dialog-ok', click: () => { $box.dialog('close'); if (reload) toComposing(); } }]);
    };
    d.setBusy(true);
    $box.dialog('option', 'buttons', []);
    say('Withdrawing ' + fmt(missing) + ' gold…');
    const failed = await takeGold(missing, o.total);
    if (failed) { end(failed + ' Nothing else was done.'); return; }
    say('Gold withdrawn…');
    const wrong = await o.act();
    if (wrong) { end(wrong, true); return; }
    d.setBusy(false);
    say('Done.');
  }
}

// withdraws, and makes sure that there is then enough: '' or what went wrong
async function takeGold(amount, needed) {
  try {
    const w = await withdraw(amount);
    showGold(w.gold);
    return w.gold === null || w.gold < needed ? w.message || 'The gold did not arrive: check the bank.' : '';
  } catch (e) {
    return e.message + ' Check the bank: the gold may or may not have been withdrawn.';
  }
}

// the game's own error window makes way (it stays when ours cannot be made)
function closeGameError() {
  const $err = $('#composing-error-dialog');
  if ($err.hasClass('ui-dialog-content') && $err.dialog('isOpen')) $err.dialog('close');
}

const potions = (count, name) => (count > 1 ? count + ' × ' : '') + '<b>' + esc(name) + '</b>';

// a refused start; settings: those of its request; message: what the game said
async function offerStart(settings, message) {
  const p = paramsOf(settings);
  const info = await templateCost(p.get('template_id'));
  if (!info) return;
  let count = 1;
  if (p.get('multi')) count = emptySlots(await getPage('/index.php?cmd=composing'));
  const have = await bankBalance();
  if (!count || have.gold === null || have.bank === null) return;
  const total = info.cost * count;
  if (total <= have.gold) return; // there is enough: the refusal was about something else
  showGold(have.gold);
  closeGameError();
  offerWindow({
    what: potions(count, info.name), total, gold: have.gold, bank: have.bank, message, many: count > 1, button: 'start',
    act: async () => {
      try {
        // the same request again, marked so that its answer is not watched a second time
        const raw = await ajax({ url: settings.url, type: settings.type, data: settings.data, dataType: 'text', fsbRetry: true });
        const res = JSON.parse(raw);
        if (res.error) return 'The gold was withdrawn, but the game said: ' + plain(res.error);
      } catch (e) {
        return 'The gold was withdrawn, but there was no clear answer to the start: check the Composing page.';
      }
      toComposing();
      return '';
    },
  });
}

// ---------------------------------------------------------------- Instant Finish
const isInstant = (href) => /[?&]cmd=composing\b/.test(href) && /[?&]subcmd=instant/.test(href);
const priceOn = (el) => { const m = /([\d,]+)\s*gold/i.exec(el.value || el.textContent || ''); return m ? num(m[1]) : 0; };
const potionOf = (href) => (/[?&]potion_id=(\d+)/.exec(href) || [])[1] || '';
// the button on this page that does the same (its address is the newest), when there is still something for it to finish
// (the "Instant Finish All" button stays on the page, greyed out at 0 gold)
const sameButton = (href) => Array.from(document.querySelectorAll('[data-confirm-href]')).find((el) => {
  const h = el.getAttribute('data-confirm-href');
  return isInstant(h) && potionOf(h) === potionOf(href) && !el.disabled && priceOn(el) > 0;
});

const keep = (key, value) => { try { sessionStorage.setItem(key, value); } catch (e) { /* storage unavailable */ } };
const takeKept = (key) => { try { const v = sessionStorage.getItem(key); sessionStorage.removeItem(key); return v; } catch (e) { return null; } };

const rememberInstant = (href, cost, retried) => keep(PENDING, JSON.stringify({ href, cost, retried: !!retried, at: Date.now() }));

// the page an Instant Finish answered with: when there was not enough gold for it, offer it again with the bank's help
async function afterInstant() {
  let p = null;
  try { p = JSON.parse(takeKept(PENDING) || 'null'); } catch (e) { p = null; }
  if (!p || Date.now() - p.at > 60000) return;
  const msg = document.getElementById('info-msg');
  if (p.retried || open) return;
  const have = await bankBalance();
  if (have.gold === null || have.bank === null || have.gold >= p.cost) return;
  const message = msg ? plain(msg.innerHTML.replace(/<br[\s\S]*/i, '')) : '';
  // nothing left to finish and no word about gold: it went through
  if (!sameButton(p.href) && !NO_GOLD.test(message)) return;
  const button = sameButton(p.href);
  const cost = (button && priceOn(button)) || p.cost;
  showGold(have.gold);
  offerWindow({
    what: potionOf(p.href) ? '<b>Instant Finish</b>' : '<b>Instant Finish All</b>', total: cost, gold: have.gold, bank: have.bank, message, many: !potionOf(p.href), button: 'finish',
    act: async () => {
      const now = sameButton(p.href);
      const href = now ? now.getAttribute('data-confirm-href') : p.href;
      rememberInstant(href, cost, true);
      location.href = withFst('/' + href.replace(/^\//, ''));
      return '';
    },
  });
}

// ---------------------------------------------------------------- the switch: withdraw before the request is sent
let note = null; // the line beside the switch
function tell(text, bad) {
  if (note) { note.textContent = text; note.style.color = bad ? '#a00000' : '#2c5f12'; }
}

// what a click is about to pay: null when it is not such a click; info() resolves with { cost, what } (nothing is asked before)
function costOfClick(target) {
  const el = target.closest('[data-confirm-href], input[id^="create-"], .quickCreate, #fshFastCompose input[data-template-id]');
  if (!el) return null;
  if (el.hasAttribute('data-confirm-href')) {
    const href = el.getAttribute('data-confirm-href');
    // only the click after the game's "Are you sure?": that one sends it
    if (!isInstant(href) || !$(el).data('fsConfirmed')) return null;
    const cost = priceOn(el);
    return cost ? { el, instant: href, info: () => Promise.resolve({ cost, what: potionOf(href) ? 'Instant Finish' : 'Instant Finish All' }) } : null;
  }
  if (el.disabled) return null;
  let templateId;
  let count = 1;
  if (el.matches('.quickCreate')) {
    const box = el.previousElementSibling && el.previousElementSibling.previousElementSibling;
    templateId = box && box.value;
  } else if (el.dataset.templateId) {
    templateId = el.dataset.templateId;
    count = parseInt(el.value, 10) || 1;
  } else {
    const slot = el.id.slice('create-'.length);
    const box = document.getElementById('composing-template-' + slot);
    templateId = box && box.value;
    if (slot === 'multi') count = emptySlots(document);
  }
  if (!/^\d+$/.test(templateId || '') || !count) return null;
  return { el, info: () => templateCost(templateId).then((t) => t && { cost: t.cost * count, what: (count > 1 ? count + ' × ' : '') + t.name }) };
}

let checking = false;

// makes sure of the gold: true when the click may go on
async function ensureGold(job) {
  let info = null;
  let have = null;
  try {
    info = await job.info();
    if (!info) return { go: true };
    have = await bankBalance();
  } catch (e) {
    return { go: true, cost: info ? info.cost : 0 }; // nothing can be checked: the game answers as it always does
  }
  if (have.gold === null || have.bank === null || have.gold >= info.cost) return { go: true, cost: info.cost };
  const missing = info.cost - have.gold;
  if (have.bank < missing) {
    tell('The bank does not hold the ' + fmt(missing) + ' gold missing for ' + info.what + '. Nothing was done.', true);
    return { go: false };
  }
  tell('Withdrawing ' + fmt(missing) + ' gold…');
  const failed = await takeGold(missing, info.cost);
  if (failed) { tell(failed + ' Nothing else was done.', true); return { go: false }; }
  const done = 'Withdrew ' + fmt(missing) + ' gold from the bank for ' + info.what + '.';
  tell(done);
  return { go: true, cost: info.cost, done };
}

function onClick(e) {
  const target = e.target && e.target.closest ? e.target : null;
  if (!target || !target.closest('#pCC')) return;
  const job = costOfClick(target);
  if (!job) return;
  // our own second click, after the gold was seen to
  if (job.el.dataset.fsbGoldGo) {
    delete job.el.dataset.fsbGoldGo;
    return;
  }
  if (!loadSettings().composeAuto) {
    if (job.instant) rememberInstant(job.instant, priceOn(job.el));
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  if (checking) return;
  checking = true;
  tell('Checking your gold…');
  ensureGold(job).then((r) => {
    checking = false;
    if (!r.go) return;
    if (!r.done) tell('');
    if (job.instant) {
      rememberInstant(job.instant, priceOn(job.el));
      if (r.done) keep(NOTE, r.done);
    }
    job.el.dataset.fsbGoldGo = '1';
    (job.el.contains(target) ? target : job.el).click();
  });
}

const SWITCH_CSS =
  '.fsbAutoW{text-align:center;margin:6px 0 2px;font:12px/1.4 Arial,sans-serif;color:#3b2a14;}' +
  '.fsbAutoW label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:bold;}' +
  '.fsbAutoW .tg{position:relative;display:inline-block;width:32px;height:16px;flex:none;}' +
  '.fsbAutoW input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:1;}' +
  '.fsbAutoW .trk{position:absolute;inset:0;border-radius:8px;background:#8a7a5c;transition:background .2s;}' +
  '.fsbAutoW .trk::before{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#f3e6c4;transition:transform .2s;}' +
  '.fsbAutoW input:checked + .trk{background:#4f8a1f;}' +
  '.fsbAutoW input:checked + .trk::before{transform:translateX(16px);}' +
  '.fsbAutoW input:focus-visible + .trk{outline:1px dotted #3b2a14;outline-offset:2px;}' +
  '.fsbAutoW span.note{display:block;min-height:0;margin-top:2px;font-size:11px;}';

// under the page's links, whenever the Composing page is shown (the game also swaps it in without loading a new page)
function addSwitch() {
  const mark = document.getElementById('composing-error-dialog');
  if (!mark || document.querySelector('.fsbAutoW')) return;
  const head = Array.from(document.querySelectorAll('#pCC h2')).find((h) => h.textContent.trim() === 'Composing');
  if (!head || !head.nextElementSibling) return;
  if (!document.getElementById('fsbAutoWCss')) {
    const css = document.createElement('style');
    css.id = 'fsbAutoWCss';
    css.textContent = SWITCH_CSS;
    document.head.appendChild(css);
  }
  const row = document.createElement('div');
  row.className = 'fsbAutoW';
  row.innerHTML = '<label title="Before a potion is started or instantly finished: if you do not have enough gold, what is missing is withdrawn from the bank."><span class="tg"><input type="checkbox"><span class="trk"></span></span>Automatic Bank Withdrawal</label><span class="note"></span>';
  head.nextElementSibling.after(row);
  const box = row.querySelector('input');
  box.checked = loadSettings().composeAuto;
  box.addEventListener('change', () => mergeSettings({ composeAuto: box.checked }));
  note = row.querySelector('.note');
  const kept = takeKept(NOTE);
  if (kept) tell(kept);
}

export function initComposeGold() {
  if (window.top !== window.self || !loadSettings().composeGold) return;
  // at the window, before the game's and the Helper's own handlers
  window.addEventListener('click', onClick, true);
  const ready = () => {
    addSwitch();
    new MutationObserver(addSwitch).observe(document.body, { childList: true, subtree: true });
    afterInstant().catch(() => {}).then(() => { if (!document.querySelector('.fsbCompGold')) open = false; });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  $(document).on('ajaxComplete.fsbCompGold', (e, xhr, settings) => {
    if (!settings || settings.fsbRetry || open) return;
    const p = paramsOf(settings);
    if (p.get('cmd') !== 'composing' || p.get('subcmd') !== 'createajax') return;
    let res = null;
    try { res = xhr.responseJSON || JSON.parse(xhr.responseText); } catch (err) { return; }
    const message = plain(res && res.error);
    if (!NO_GOLD.test(message)) return;
    open = true; // one offer, also when several starts are refused at once (Fast Compose)
    offerStart(settings, message).catch(() => {}).then(() => { if (!document.querySelector('.fsbCompGold')) open = false; });
  });
}
