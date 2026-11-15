export const $ = window.jQuery;

// ---------------------------------------------------------------- shared helpers
export const esc = (str) => $('<div>').text(str == null ? '' : String(str)).html();

// The game shows messages by re-configuring the shared #dialog_msg dialog. The settings
// window is wider, so the original width is remembered and restored for every other use.
let dialogWidth = null;

export function openDialog(opts, html) {
  const $d = $('#dialog_msg');
  if (dialogWidth === null) dialogWidth = $d.dialog('option', 'width');
  $d.dialog($.extend({ width: dialogWidth }, opts));
  $d.html(html).dialog('open');
}

export function showInfo(html, title) {
  const $d = $('#dialog_msg');
  if (!$d.length || typeof $d.dialog !== 'function') {
    window.alert($('<div>').html(html).text());
    return;
  }
  openDialog({ title: title || 'Information', buttons: [{ text: 'Ok', click: function () { $(this).dialog('close'); } }] }, html);
}
