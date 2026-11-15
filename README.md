# Fallen Sword Toolkit

A userscript for [Fallen Sword](https://fallensword.com/): a better backpack and a set of small tools for the pages around it. Free and open source (MIT).

**Install:** open **https://cristimirt.github.io/fallenswordtoolkit/** and click Install (you need the [Tampermonkey](https://www.tampermonkey.net/) browser extension). Updates are picked up automatically.

## What it does

- **Backpack:** search by name as you type, level range and set filters, rarity / equippable / usable / container / guild tagged / bound / duplicates / hellforge level / craft quality filters, item counts on the type icons, durability sort, items per page and icon size, locked items (a locked item cannot be destroyed or broken down), and a backpack pop-up from the top bar.
- **Break down:** a button next to world loot, and an automatic break down (off by default) with rarity and level choices, a dry run mode, and a log of everything broken down with the fragments gained. It never touches locked, bound or guild tagged items or containers.
- **Markets:** a searchable Buff Market list; search boxes and colour filters in the Auction House.
- **World map:** a wiki button for the area you are in, and a Path Finder that shows the way step by step.
- **Quick Buff:** opens in a draggable window with buffs already on the target, enhancements, last activity, stamina cost, and an Activate link.
- **Everything else:** draggable sidebar widgets, the game's own tooltip and scrollbar style, works next to the Fallen Sword Helper.

Settings: the **FST** tab of the game's Preferences page holds every setting (General, Backpack, Break down, Map, Path Finder), each with a [?] description. The gear button on the backpack page opens the quick settings of the backpack only.

## Repository

| Path | What |
|---|---|
| `src/fs_toolkit.js` | the userscript |
| `tools/build-site.js` | builds `dist/`: the install page and the script with `@updateURL` / `@downloadURL` |
| `.github/workflows/deploy.yml` | publishes `dist/` to GitHub Pages on every push to `main` |

To release a change: edit `src/fs_toolkit.js`, raise `@version`, push to `main`. To build locally: `node tools/build-site.js`.

Setup, once: in the repository on GitHub, Settings > Pages > Source: **GitHub Actions**.
