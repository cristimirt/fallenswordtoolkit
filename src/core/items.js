// ---------------------------------------------------------------- search helpers
export const norm = (s) => (s == null ? '' : String(s)).toLowerCase();

export const RARITIES = [
  ['Common', '#FFFFFF'],
  ['Rare', '#00CCCC'],
  ['Unique', '#CC00CC'],
  ['Legendary', '#FFCC00'],
  ['Super Elite', '#FF0000'],
  ['Crystalline', '#9955DD'],
  ['Epic', '#00CC00'],
];

// The game's colour for each craft quality, Perfect -> Very Poor (from the wiki).
export const CRAFT_COLORS = ['#FFFF00', '#FFBB00', '#FF8800', '#FF4400', '#FF0000', '#CC0000', '#990000'];
