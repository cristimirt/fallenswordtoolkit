// Entry point of the bundle. The loader (the small userscript in Tampermonkey) imports this file and calls the default
// export: ctx = { build, base, manifest, gmInfo }. It must only run once per page; the loader makes sure of that.
import { setInfo } from './core/info.js';
import { useGameTips } from './core/tips.js';
import { $ } from './core/util.js';
import { initActionList } from './features/actionlist.js';
import { installAutobreak } from './features/autobreak.js';
import { installBackpack } from './features/backpack.js';
import { initBackpackPopup } from './features/bagpopup.js';
import { initFootprints } from './features/footprints.js';
import { initTipCache } from './core/tipcache.js';
import { initNotifications } from './features/notifications.js';
import { initGuildStore } from './features/guildstore.js';
import { initBazaar } from './features/bazaar.js';
import { initComposeGold } from './features/composegold.js';
import { initArenaShop } from './features/arenashop.js';
import { initLoyalty } from './features/loyalty.js';
import { initMasterMap } from './features/mastermap.js';
import { initSkillGuide } from './features/skillguide.js';
import { initAuctionHouse, initBuffMarket } from './features/markets.js';
import { initPathfinder } from './features/pathfinder.js';
import { initPortalSearch } from './features/portalsearch.js';
import { initQuickBuffPopup } from './features/quickbuff.js';
import { initFstTab, installSettingsui } from './features/settingsui.js';
import { initSidebarWidgets } from './features/sidebars.js';
import { initWikiButton } from './features/wiki.js';

export default function start(ctx) {
  // www.fallensword.com and fallensword.com keep separate browser storage (settings, locks, logs): stay on the one without www
  if (location.hostname === 'www.fallensword.com') { location.replace(location.href.replace('//www.', '//')); return; }
  if (!$) return; // a page without jQuery is not a game page
  setInfo(ctx);
  initActionList();
  initBuffMarket();
  initAuctionHouse();
  initBackpackPopup();
  initSidebarWidgets();
  useGameTips();
  initWikiButton();
  initFootprints();
  initTipCache();
  initNotifications();
  initGuildStore();
  initLoyalty();
  initArenaShop();
  initBazaar();
  initComposeGold();
  initSkillGuide();
  initPathfinder();
  initPortalSearch();
  initMasterMap();
  initQuickBuffPopup();
  installAutobreak();
  installSettingsui();
  initFstTab();
  installBackpack();
}
