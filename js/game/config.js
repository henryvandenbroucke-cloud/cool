// Game data: everything tunable lives here so the systems stay data-driven.

export const SHIFT_SECONDS = 720;          // dusk (18:00) to dawn (06:00) in real seconds
export const SHIFT_START_HOUR = 18;
export const SHIFT_HOURS = 12;
export const LAST_ARRIVAL_HOUR = 5.25;     // 05:15, no new customers after this
export const START_COINS = 80;

export const LEVELS = [0, 100, 280, 550, 900, 1400, 2100, 3000];

/** Items you order from the catalogue and sell as-is. */
export const STOCK = {
  matches:   { name: 'Matchbox',        cost: 0.4, market: 1.2, boxQty: 12, size: 's', level: 1, icon: 'i-match', blurb: 'Strike-anywhere, forest pine box.' },
  tealights: { name: 'Tealight Tin',    cost: 1.1, market: 3.2, boxQty: 8,  size: 's', level: 1, icon: 'i-tin', blurb: 'Six little lights in a tin.' },
  oil:       { name: 'Lamp Oil',        cost: 1.8, market: 4.5, boxQty: 6,  size: 's', level: 1, icon: 'i-bottle', blurb: 'Clean-burning, faintly cedar.' },
  bulbs:     { name: 'Glow Bulb',       cost: 1.5, market: 4.0, boxQty: 8,  size: 's', level: 2, licence: 'lamps', icon: 'i-bulb', blurb: 'Warm filament bulbs.' },
  lantern:   { name: 'Tin Lantern',     cost: 6.0, market: 14,  boxQty: 4,  size: 'm', level: 2, licence: 'lamps', icon: 'i-lantern', blurb: 'For walks home through the pines.' },
};

/** Craft supplies: ordered in boxes, loaded into a workbench. */
export const SUPPLIES = {
  candle_supplies: { name: 'Candle Supplies', cost: 4.8, uses: 6, station: 'candle', level: 1, icon: 'i-candle', blurb: 'Beeswax blocks and cotton wicks. Makes 6 candles.' },
  lamp_kit:        { name: 'Lamp Parts Kit',  cost: 10.5, uses: 3, station: 'lamp', level: 2, licence: 'lamps', icon: 'i-lamp', blurb: 'Bases, sockets and shade frames. Makes 3 lamps.' },
  glass_blanks:    { name: 'Glass Blanks',    cost: 9, uses: 4, station: 'lens', level: 4, licence: 'lens', icon: 'i-lens', blurb: 'Rough glass rounds and brass rims. Makes 4 lenses.' },
  glass_sheets:    { name: 'Coloured Glass',  cost: 14, uses: 3, station: 'glass', level: 5, licence: 'glass', icon: 'i-glass', blurb: 'Sheets of coloured glass, lead came and solder. Makes 3 panels.' },
};

export const LENS_FORMS = {
  reading:  { name: 'Reading Lens', market: 13, unitCost: 2.2 },
  spyglass: { name: 'Spyglass',     market: 24, unitCost: 4, licence: 'brass' },
};

/** 5×5 stained-glass patterns: 1 = motif colour, 0 = background colour. */
export const GLASS_PATTERNS = {
  moon:   { name: 'Crescent Moon', market: 0, grid: ['01110', '11000', '11000', '11000', '01110'] },
  leaf:   { name: 'Forest Leaf',   market: 2, grid: ['00011', '00111', '01110', '11100', '10000'] },
  star:   { name: 'Evening Star',  market: 3, grid: ['00100', '01110', '11111', '01110', '00100'] },
  heart:  { name: 'Hearth Heart',  market: 4, grid: ['01010', '11111', '11111', '01110', '00100'] },
};
export const GLASS_COLORS = {
  amber:  { name: 'Amber',  hex: '#f0a04a' },
  rose:   { name: 'Rose',   hex: '#e07a7c' },
  teal:   { name: 'Teal',   hex: '#4fb0a4' },
  moss:   { name: 'Moss',   hex: '#7aa05a' },
  violet: { name: 'Violet', hex: '#9a7ad0' },
  sky:    { name: 'Sky',    hex: '#7ab4e0' },
};
export const GLASS_BASE_MARKET = 30;
export const GLASS_UNIT_COST = 4.5;

export const CANDLE_FORMS = {
  pillar: { name: 'Pillar Candle', market: 6.0, unitCost: 0.8 },
  taper:  { name: 'Taper Pair',    market: 4.5, unitCost: 0.6 },
  jar:    { name: 'Jar Candle',    market: 8.5, unitCost: 1.1, licence: 'jar' },
};

export const CANDLE_COLORS = {
  cream:    { name: 'Cream',    hex: '#f3e6c8' },
  honey:    { name: 'Honey',    hex: '#e9b45a' },
  rose:     { name: 'Rose',     hex: '#e48f86' },
  sage:     { name: 'Sage',     hex: '#9cbf9a' },
  lavender: { name: 'Lavender', hex: '#b5a3d8', licence: 'lavender' },
};

export const LAMP_BASES = {
  wood:    { name: 'Walnut',  hex: '#8a5a3b', market: 0 },
  brass:   { name: 'Brass',   hex: '#c99a3e', market: 4, licence: 'brass' },
  ceramic: { name: 'Ceramic', hex: '#d9e2dc', market: 3, licence: 'brass' },
};
export const LAMP_SHADES = {
  drum:  { name: 'Paper Drum',  market: 0 },
  dome:  { name: 'Glass Dome',  market: 3 },
  pleat: { name: 'Pleated',     market: 2 },
};
export const LAMP_FILTERS = {
  amber: { name: 'Amber', hex: '#ffb35c', light: '#ffb766' },
  rose:  { name: 'Rose',  hex: '#ff9a8a', light: '#ff9e8e' },
  teal:  { name: 'Teal',  hex: '#7fd6c6', light: '#8fe3d3' },
  white: { name: 'Moon',  hex: '#fff3dc', light: '#fff1d6' },
};
export const LAMP_BASE_MARKET = 18;
export const LAMP_UNIT_COST = 3.5;

export const LICENCES = {
  lamps:    { name: 'Lamp Workbench',     level: 2, price: 40, blurb: 'Build table lamps. Unlocks lamp kits, bulbs and tin lanterns.' },
  jar:      { name: 'Jar Candles',        level: 2, price: 25, blurb: 'Pour candles into little glass jars.' },
  lavender: { name: 'Lavender Dye',       level: 3, price: 30, blurb: 'A soft purple wax dye.' },
  brass:    { name: 'Brass & Ceramic',    level: 3, price: 50, blurb: 'Fancier lamp bases.' },
  lens:     { name: 'Lens Grinding',      level: 4, price: 90, requires: 'studio', blurb: 'Polish reading lenses and spyglasses. Needs the Back Studio.' },
  glass:    { name: 'Stained Glass',      level: 5, price: 140, requires: 'studio', blurb: 'Solder coloured glass into window panels. Needs the Back Studio.' },
};

export const SIZE_PER_SECTION = { s: 6, m: 3, l: 2 };

export const EXPANSIONS = {
  stall:  { name: 'Porch Market Stall', level: 2, price: 60, icon: 'i-house', blurb: 'A striped stall on the porch with two more shelves. Passers-by love it.' },
  studio: { name: 'Back Studio',        level: 3, price: 150, icon: 'i-hammer', blurb: 'A bright workroom behind the shop for lens grinding and stained glass.' },
};

/** Decor you can buy and place. cozy makes the shop more inviting. */
export const DECOR = {
  plant:     { name: 'Potted Fern',    price: 10, level: 1, cozy: 2, icon: 'i-sprout',  model: 'furniture/pottedPlant.glb', height: 1.15, r: 0.28 },
  rug:       { name: 'Round Rug',      price: 14, level: 1, cozy: 2, icon: 'i-flower',  model: 'furniture/rugRound.glb', width: 2.0, flat: true },
  catbed:    { name: 'Cat Basket',     price: 12, level: 1, cozy: 3, icon: 'i-cat',     proc: 'catbed', r: 0.35, flat: true },
  stool:     { name: 'Wooden Stool',   price: 8,  level: 1, cozy: 1, icon: 'i-chair',   model: 'furniture/stoolBar.glb', height: 0.75, r: 0.22 },
  chair:     { name: 'Reading Chair',  price: 26, level: 2, cozy: 3, icon: 'i-chair',   model: 'furniture/loungeChair.glb', width: 0.95, r: 0.45 },
  sidetable: { name: 'Side Table',     price: 12, level: 1, cozy: 1, icon: 'i-lamp',    model: 'furniture/sideTable.glb', width: 0.6, r: 0.3 },
  bookcase:  { name: 'Little Bookcase', price: 22, level: 2, cozy: 3, icon: 'i-ledger', model: 'furniture/bookcaseOpenLow.glb', width: 0.85, r: 0.42 },
  barrel:    { name: 'Flower Barrel',  price: 16, level: 2, cozy: 2, icon: 'i-flower',  proc: 'barrel', r: 0.3 },
  floorlamp: { name: 'Standing Lamp',  price: 30, level: 2, cozy: 4, icon: 'i-lamp',    proc: 'floorlamp', r: 0.25 },
  bench:     { name: 'Garden Bench',   price: 18, level: 2, cozy: 2, icon: 'i-chair',   model: 'holiday/bench.glb', width: 1.4, r: 0.6, outdoor: true },
  shelf:     { name: 'Shelf Unit',     price: 60, level: 2, cozy: 0, icon: 'i-crate',   proc: 'shelf', r: 0.85, sells: 6 },
  table:     { name: 'Display Table',  price: 40, level: 3, cozy: 1, icon: 'i-tag',     proc: 'table', r: 0.75, sells: 2 },
};

export const STAFF = {
  bramble: { name: 'Bramble', role: 'Restocker', wage: 12, level: 2, model: 'character-male-f',   icon: 'i-box',  blurb: 'Unpacks delivery boxes onto matching shelves while you work.' },
  wren:    { name: 'Wren',    role: 'Cashier',   wage: 14, level: 3, model: 'character-female-c', icon: 'i-coin', blurb: 'Stands at the register and rings up customers for you.' },
};

export const SEASONS = [
  { id: 'spring', name: 'Spring', icon: 'i-sprout', demand: { glass: 1.3, lens: 1.15 } },
  { id: 'summer', name: 'Summer', icon: 'i-sun',    demand: { tealights: 1.3, lantern: 1.2 } },
  { id: 'autumn', name: 'Autumn', icon: 'i-leaf',   demand: { lantern: 1.3, oil: 1.25, candle: 1.15 } },
  { id: 'winter', name: 'Winter', icon: 'i-snow',   demand: { candle: 1.4, lamp: 1.35, tealights: 1.2 } },
];
export const NIGHTS_PER_SEASON = 7;

/** Regular townsfolk. `wants` are product-key patterns (see keyMatches). */
export const REGULARS = {
  mira:    { name: 'Mira',       role: 'the baker',         model: 'character-female-b', from: 1, house: 0, wants: ['candle:*:honey', 'candle:*:cream', 'tealights'], blurb: 'Up before anyone to light the ovens.' },
  tomas:   { name: 'Old Tomas',  role: 'the woodcutter',    model: 'character-male-e',   from: 1, house: 1, wants: ['oil', 'matches', 'lantern'], blurb: 'Knows every path in the forest.' },
  juniper: { name: 'Juniper',    role: 'the schoolteacher', model: 'character-female-d', from: 1, house: 2, wants: ['lamp', 'candle:*:sage', 'tealights', 'lens:reading'], blurb: 'Marks homework by lamplight.' },
  fennel:  { name: 'Fennel',     role: 'the night-fisher',  model: 'character-male-c',   from: 2, house: 3, wants: ['lantern', 'oil', 'matches', 'lens:spyglass'], blurb: 'Fishes the stream when the moon is up.' },
  rosa:    { name: 'Rosa',       role: 'the gardener',      model: 'character-female-e', from: 3, house: 4, wants: ['candle:*:rose', 'lamp:*:*:rose', 'candle:jar', 'glass'], blurb: 'Her windowsills are all flowers.' },
  pip:     { name: 'Pip',        role: 'the student',       model: 'character-male-a',   from: 4, house: 5, wants: ['tealights', 'candle:taper', 'bulbs'], blurb: 'Studies late. Very late.' },
};
export const GENERIC_MODELS = ['character-female-a', 'character-female-c', 'character-female-f', 'character-male-b', 'character-male-d', 'character-male-f'];
export const GENERIC_NAMES = ['Ada', 'Bram', 'Clover', 'Dell', 'Elsie', 'Finn', 'Greta', 'Hollis', 'Ivy', 'Jory', 'Kit', 'Linden', 'Maple', 'Nell', 'Otto', 'Perrin', 'Quill', 'Rowan', 'Sorrel', 'Thea'];
export const GENERIC_WANTS = ['matches', 'tealights', 'candle', 'candle:pillar', 'oil', 'lamp', 'lantern', 'bulbs', 'candle:*:cream', 'candle:*:rose', 'lens', 'glass'];

/** Houses in the village; regulars own 0–5, the rest are lit by everyone else. */
export const HOUSES = [
  { owner: 'mira',    windows: 3 },
  { owner: 'tomas',   windows: 3 },
  { owner: 'juniper', windows: 3 },
  { owner: 'fennel',  windows: 3 },
  { owner: 'rosa',    windows: 3 },
  { owner: 'pip',     windows: 3 },
  { owner: null, windows: 3 },
  { owner: null, windows: 2 },
  { owner: null, windows: 3 },
  { owner: null, windows: 2 },
  { owner: null, windows: 3 },
];
export const REP_WINDOW_STEPS = [15, 45, 85];
export const GENERIC_SALES_PER_WINDOW = 3;

export const WEATHERS = {
  clear: { name: 'Clear',  icon: 'i-clear', demand: {} },
  rain:  { name: 'Rain',   icon: 'i-rain',  demand: { candle: 1.3, tealights: 1.2 } },
  fog:   { name: 'Fog',    icon: 'i-fog',   demand: { lantern: 1.6, oil: 1.3, lamp: 1.2 } },
  snow:  { name: 'Snow',   icon: 'i-snow',  demand: { candle: 1.3, lamp: 1.25, tealights: 1.2 } },
};

export const LETTERS = {
  mira: [
    { at: 45, text: "Dear shopkeeper,\n\nThe honey candle you sold me sits on the bakery counter every morning now. The dough rises better by its light — I'm sure of it.\n\nThere's a warm loaf with your name on it whenever you like." },
    { at: 85, text: "Little lantern-keeper,\n\nI walked home past your window last night and counted every light on the street. Most of them came from you.\n\nThank you for making our mornings gentle." },
  ],
  tomas: [
    { at: 45, text: "Shopkeep,\n\nThat oil burns clean. Didn't have to trim the wick once all week, which is more than I can say for my old knees.\n\nIf you ever need firewood, knock twice." },
    { at: 85, text: "Shopkeep,\n\nForty years I've walked those pines in the dark. First winter I haven't felt it.\n\n— T." },
  ],
  juniper: [
    { at: 45, text: "Hello!\n\nThe children asked why my marking is suddenly so cheerful. I told them it's the new lamp. (It is also the biscuits.)\n\nWith thanks," },
    { at: 85, text: "Dear friend,\n\nWe did a lesson on light today and half the class drew your shop. Several gave it a cat. Accurate.\n\nSee you after supper," },
  ],
  fennel: [
    { at: 45, text: "Evening,\n\nThe lantern doesn't scare the fish, and it doesn't scare me either. Good trade.\n\nCaught a silver one. Thought you should know." },
    { at: 85, text: "Evening,\n\nFrom the stream you can see your window glowing through the trees. I steer home by it now.\n\n— F." },
  ],
  rosa: [
    { at: 45, text: "Darling shop,\n\nI put the rose candle beside the geraniums and they have never looked so smug.\n\nCuttings for your windowsill, any time." },
    { at: 85, text: "Darling shop,\n\nA garden needs sun. A home needs a little lamp. You seem to know that.\n\nAll my love, and some tomatoes," },
  ],
  pip: [
    { at: 45, text: "hi!!\n\npassed my exam. studied every night by your tealights. coincidence? no.\n\nthank you!!" },
    { at: 85, text: "hello again,\n\nmy desk is the coziest place in the whole world now. i may never leave. send snacks.\n\n— pip" },
  ],
};

export const MILESTONE_LETTERS = {
  firstNight: { from: 'The Village Council', text: "To the new keeper of the light shop,\n\nThe old shop stood dark for many winters. Last night someone noticed a glow at the edge of the forest and we all went to our windows to look.\n\nWelcome. We're so glad you're here." },
  tenWindows: { from: 'The Village Council', text: "Ten windows! From the hill, the village looks like a little constellation now.\n\nKeep going, keeper." },
  allWindows: { from: 'The Village Council', text: "Every window in the hamlet is glowing.\n\nWe have decided: tomorrow night there will be a Lantern Festival, the first in living memory. Everyone is coming, and everyone is bringing a light you made.\n\nPlease keep the shop open late." },
  festival: { from: 'Everyone in the Village', text: "Thank you for the Lantern Festival.\n\nWe sent a hundred little lights up over the pines and every one of them came from your shop. The forest has never been so bright, and nobody has ever been so warm.\n\nThe shop will always be the heart of the village.\n\nWith love, from every window." },
};
