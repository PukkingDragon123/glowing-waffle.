// The one item catalog: QuikMart shop, the noodle shelf, cravings, baby care.
// model: which procedural prop the 3D scene builds (see src/game/props.js).
// topping: can be added to the noodle pot. cravingTag: matched against cravings.

export const ITEMS = {
  noodle_chicken: { name: 'Lucky Noodle — Chicken', price: 0.9, cat: 'food', model: 'packet', color: 0xf2b134, hunger: 32, desc: 'The classic. Tastes like 3 a.m.' },
  noodle_spicy:   { name: 'Lucky Noodle — Inferno Tom Yum', price: 1.1, cat: 'food', model: 'packet', color: 0xd63b26, hunger: 34, desc: 'Warning label is mostly crying emojis.', cravingTag: 'spicy' },
  noodle_shrimp:  { name: 'Lucky Noodle — Shrimp Creamy', price: 1.0, cat: 'food', model: 'packet', color: 0x3c8fd1, hunger: 33, desc: 'Creamy. Shrimp. Allegedly.' },
  noodle_cup:     { name: 'Lucky Cup (just add water)', price: 1.5, cat: 'food', model: 'cup', color: 0xe8e1cf, hunger: 26, desc: 'Three minutes to happiness.' },
  egg:            { name: 'Eggs (half dozen)', price: 2.4, cat: 'topping', model: 'egg', color: 0xf3e9d6, topping: true, hunger: 8, desc: 'Crack one into the pot.', cravingTag: 'egg', uses: 6 },
  chili:          { name: 'Dried Chili Flakes', price: 1.2, cat: 'topping', model: 'jar', color: 0xb8291d, topping: true, hunger: 0, desc: 'Ghost-pepper adjacent.', cravingTag: 'spicy', uses: 10 },
  pickles:        { name: 'Pickles in a Jar', price: 2.9, cat: 'topping', model: 'jar', color: 0x6c8f2a, topping: true, hunger: 4, desc: 'Crunchy. Briny. Necessary.', cravingTag: 'pickle', uses: 8 },
  chocolate:      { name: 'Milk Chocolate Bar', price: 1.8, cat: 'topping', model: 'bar', color: 0x5b3420, topping: true, hunger: 6, desc: 'Not for noodles. Unless.', cravingTag: 'sweet', uses: 4 },
  ice:            { name: 'Bag of Ice', price: 1.0, cat: 'topping', model: 'bag', color: 0xcfe9f5, topping: true, hunger: 0, desc: 'You have no fridge. It will melt. Hurry.', cravingTag: 'ice', uses: 5 },
  chalk:          { name: 'Sidewalk Chalk (24)', price: 3.5, cat: 'weird', model: 'box', color: 0xf1f0ea, topping: true, hunger: 1, desc: 'For drawing. Definitely for drawing.', cravingTag: 'chalk', uses: 24 },
  battery:        { name: '9-Volt Batteries', price: 4.0, cat: 'weird', model: 'battery', color: 0x222222, topping: true, hunger: 0, desc: 'Lick test optional.', cravingTag: 'zap', uses: 2 },
  formula:        { name: 'GLOW Infant Formula (xeno)', price: 6.5, cat: 'baby', model: 'tin', color: 0x56e36b, desc: 'Not FDA approved. Not from this galaxy.', uses: 8 },
  diapers:        { name: 'Diapers (size: ???)', price: 7.0, cat: 'baby', model: 'diapers', color: 0xbfe3ff, desc: 'Absorbs liquids, gels, and minor gravity.', uses: 10 },
  wipes:          { name: 'Baby Wipes', price: 2.5, cat: 'baby', model: 'wipes', color: 0xffffff, desc: 'Unscented. Unshaken.', uses: 20 },
  rattle:         { name: 'Rattle Toy', price: 3.0, cat: 'baby', model: 'rattle', color: 0xff8fb3, desc: 'Shake for joy, or to keep things away.' },
  catfood:        { name: 'Cat Food (Salmon Pâté)', price: 1.6, cat: 'pet', model: 'can', color: 0x4b7ab8, desc: 'For a cat who is not here.' },
  coffee:         { name: 'Instant Coffee (3-in-1)', price: 2.2, cat: 'food', model: 'stick', color: 0x7a4a2a, hunger: 3, desc: 'Sugar, creamer, and spite.', cravingTag: 'coffee', uses: 10 },
  crystal:        { name: 'Glowing Diaper Crystal', price: 0, sell: 38, cat: 'weird', model: 'crystal', color: 0x7dffb0, desc: 'Produced by Bean. Hums at night.' },
};

export const SHOP_ORDER = ['noodle_chicken', 'noodle_spicy', 'noodle_shrimp', 'noodle_cup', 'egg', 'chili', 'pickles',
  'chocolate', 'ice', 'coffee', 'formula', 'diapers', 'wipes', 'rattle', 'catfood', 'chalk', 'battery'];

export const item = (id) => ITEMS[id];
