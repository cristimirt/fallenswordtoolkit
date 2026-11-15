// ==UserScript==
// @name         Fallen Sword Toolkit
// @namespace    https://cristimirt.github.io/fallenswordtoolkit/
// @description  A better backpack and small tools for Fallen Sword: filters and item locks, automatic break down, a Quick Buff pop-up, searchable markets, a wiki button and a Path Finder.
// @author       Aurik16
// @version      1.0.0
// @include      https://www.fallensword.com/*
// @include      https://fallensword.com/*
// @include      https://cristimirt.github.io/fallenswordtoolkit/*
// @exclude      https://forum.fallensword.com/*
// @exclude      https://wiki.fallensword.com/*
// @exclude      https://www.fallensword.com/app.php*
// @exclude      https://www.fallensword.com/fetchdata.php*
// @downloadURL  https://cristimirt.github.io/fallenswordtoolkit/fs_toolkit.user.js
// @updateURL    https://cristimirt.github.io/fallenswordtoolkit/fs_toolkit.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// This is only a loader. The toolkit itself is published at https://cristimirt.github.io/fallenswordtoolkit/ and is fetched on
// every page load (manifest.json names the current build), so it updates without touching this file.
// For development: localStorage.setItem('FST_dev_base', '8787') in the game's tab makes the loader use the local server of
// `npm run dev` instead (a port, host:port or a whole address all work). Remove the key to go back to the published version.
(function () {
  'use strict';
  const ROOT = 'https://cristimirt.github.io/fallenswordtoolkit/';
  const de = document.documentElement;

  // on the install page the loader only announces itself
  if (location.hostname === 'cristimirt.github.io') {
    de.setAttribute('data-fst-loader', (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '1');
    return;
  }
  // `toolkit=off` in the address (index.php?cmd=profile&toolkit=off) keeps the toolkit out of that page, to see the game as it is
  if (/[?&]toolkit=off(&|#|$)/.test(location.search)) return;
  if (de.hasAttribute('data-fst') || window.__fst) return; // once per page
  de.setAttribute('data-fst', '1');

  // Runs in the page itself (like the Fallen Sword Helper does): find the current build, load it, start it.
  async function boot(rootEnc, infoEnc) {
    const root = decodeURIComponent(rootEnc);
    let info = {};
    try { info = JSON.parse(decodeURIComponent(infoEnc)); } catch (e) { /* no info */ }
    // the development server: FST_dev_base is a port ("8787"), host:port ("127.0.0.1:8787") or a whole address
    let dev = '';
    try { dev = (localStorage.getItem('FST_dev_base') || '').trim(); } catch (e) { /* storage blocked */ }
    if (dev) {
      if (/^\d+$/.test(dev)) dev = 'http://127.0.0.1:' + dev;
      else if (!/^https?:\/\//i.test(dev)) dev = 'http://' + dev;
      if (!/\/$/.test(dev)) dev += '/';
    }
    const base = dev || root;
    if (dev) console.info('[Fallen Sword Toolkit] development server: ' + base);
    const key = 'FST_loader' + (dev ? '_dev' : '');
    let manifest = null;
    // the published build starts from the last manifest this browser saw, without waiting for the network (the manifest is read again
    // in the background, so a new build starts with the next page); the development server and a first visit wait for it
    let fast = false;
    if (!dev) { try { manifest = JSON.parse(localStorage.getItem(key)); fast = !!(manifest && manifest.main); } catch (e) { manifest = null; } }
    const fresh = (async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 3000);
        const r = await fetch(base + 'manifest.json', { cache: 'no-cache', signal: ctl.signal });
        clearTimeout(t);
        if (r.ok) {
          const m = await r.json();
          try { localStorage.setItem(key, JSON.stringify(m)); } catch (e) { /* storage full */ }
          return m;
        }
      } catch (e) { /* offline or the site is down: use the last one that worked */ }
      return null;
    })();
    if (!fast) manifest = (await fresh) || manifest;
    if (!manifest) { try { manifest = JSON.parse(localStorage.getItem(key)); } catch (e) { manifest = null; } }
    try {
      if (!manifest || !manifest.main) throw new Error('no manifest' + (dev ? ' (is `npm run dev` running?)' : ''));
      let mod;
      try {
        mod = await import(base + manifest.main);
      } catch (e) {
        // the remembered build is gone from the site: use the current one
        const m = fast && (await fresh);
        if (!m || !m.main) throw e;
        manifest = m;
        mod = await import(base + manifest.main);
      }
      window.__fst = true;
      await mod.default({ build: manifest.build, base, manifest, gmInfo: info });
    } catch (e) {
      console.error('[Fallen Sword Toolkit] could not start', e);
    }
  }

  const arg = (v) => '"' + encodeURIComponent(v) + '"';
  const info = typeof GM_info !== 'undefined' ? JSON.stringify(GM_info) : '{}';
  const s = document.createElement('script');
  s.textContent = 'document.documentElement.setAttribute("data-fst-boot","1");(' + boot.toString() + ')(' + arg(ROOT) + ',' + arg(info) + ');';
  de.appendChild(s);
  de.removeChild(s);
  if (!de.hasAttribute('data-fst-boot')) boot(encodeURIComponent(ROOT), encodeURIComponent(info)); // the page refused inline scripts: run it from here
})();
