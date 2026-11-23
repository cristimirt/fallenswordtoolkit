import { loadSettings } from '../core/settings.js';

// ---------------------------------------------------------------- notifications in the menu
// The "n new log(s)" and "n new Guild Chat message(s)" notices (#notifications) are the game's old black box with a light border.
// This makes them look like the buttons they are: the dark brown of their icons, rounded corners, a shadow around them, cream text,
// a gold edge when the pointer is on them. Only the looks: the markup, the links and the icons are the game's own.
export function initNotifications() {
  if (!loadSettings().notifStyle) return;
  const el = document.createElement('style');
  el.id = 'fsbNotifStyle';
  el.textContent =
    // a button: the dark brown of the icons, a shadow around it (not inside), a thin light line on top; a gold edge and glow under the pointer (the background stays: the icons' own cannot change), pressed in on click
    '#notifications .notification{box-sizing:border-box;width:130px;height:48px;background:#2e261c;border:1px solid #1a140c;border-radius:4px;overflow:hidden;cursor:pointer;' +
    'box-shadow:0 2px 5px rgba(0,0,0,.6),inset 0 1px 0 rgba(247,234,201,.1);transition:background-color .15s,border-color .15s,box-shadow .15s,transform .08s;}' +
    '#notifications .notification:hover{border-color:rgba(240,199,94,.6);box-shadow:0 2px 6px rgba(0,0,0,.65),0 0 5px rgba(240,199,94,.25),inset 0 1px 0 rgba(247,234,201,.14);}' +
    '#notifications .notification:active{transform:translateY(1px);box-shadow:0 1px 2px rgba(0,0,0,.6),inset 0 1px 0 rgba(247,234,201,.06);}' +
    '#notifications .notification a{display:flex;align-items:stretch;height:100%;color:#f7eac9;}' +
    // the icon is the game's 36x40 sprite (each icon has its own position in it): left as it is, centred in the taller box
    '#notifications .notification-icon{flex:none;float:none;height:40px;align-self:center;}' +
    '#notifications .notification-content{flex:1;float:none;width:auto;height:auto;margin:0;padding:4px 6px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;' +
    'background:transparent;color:#f7eac9;font-size:10px;line-height:1.35;text-align:center;text-shadow:0 1px 2px #000;}' +
    '#notifications .notification:hover .notification-content{color:#ffe9a8;}';
  document.head.appendChild(el);
}
