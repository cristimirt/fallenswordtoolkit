// ---------------------------------------------------------------- toggle switch
// The switch on the paper (used instead of a checkbox): one markup and one style for every window and list. Put toggleHtml() inside
// a <label> with its text, and call useToggleStyle() once before it is shown. The sizes are of the whole box, borders included, and
// box-sizing is fixed here, so that a "* {box-sizing}" rule of the window around it cannot push the knob off centre.
const CSS =
  '.fsbTg{position:relative;display:inline-block;flex:none;vertical-align:middle;}' +
  '.fsbTg,.fsbTg *{cursor:pointer !important;}' +
  '.fsbTg input{position:absolute;opacity:0;left:0;top:0;width:100%;height:100%;margin:0;}' +
  '.fsbTg .trk{display:block;position:relative;box-sizing:border-box !important;width:28px;height:15px;border:1px solid #20170396;border-radius:8px;background:#b79862;transition:background .15s;}' +
  '.fsbTg .trk::after{content:"";position:absolute;box-sizing:border-box !important;top:2px;left:2px;width:9px;height:9px;border:1px solid #20170396;border-radius:50%;background:#f6e8c4;transition:left .15s;}' +
  '.fsbTg input:checked+.trk{background:#5f8f2a;}.fsbTg input:checked+.trk::after{left:15px;}' +
  '.fsbTg input:focus-visible+.trk{outline:1px dotted #3b2a14;outline-offset:2px;}';

export function useToggleStyle() {
  if (document.getElementById('fsbTgStyle')) return;
  const style = document.createElement('style');
  style.id = 'fsbTgStyle';
  style.textContent = CSS;
  document.head.appendChild(style);
}

// attrs: the checkbox's own attributes (an id or data-...), already escaped
export const toggleHtml = (attrs, on) => '<span class="fsbTg"><input type="checkbox" ' + attrs + (on ? ' checked' : '') + '><span class="trk"></span></span>';
