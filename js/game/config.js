// Game data: everything tunable lives here so the systems stay data-driven.

export const SHIFT_SECONDS = 720;          // dusk (18:00) to dawn (06:00) in real seconds
export const SHIFT_START_HOUR = 18;
export const SHIFT_HOURS = 12;
export const LAST_ARRIVAL_HOUR = 5.25;     // 05:15, no new customers after this
export const START_COINS = 80;

export const LEVELS = [0, 100, 280, 550, 900, 1400, 2100, 3000];

/** Items you order from the catalogue and sell as-is. */
export const STOCK = {
  matches:   { name: 'Matchbox',        cost: 0.4, market: 1.2, boxQty: 12, size: 's', level: 1, icon: '🔥', blurb: 'Strike-anywhere, forest pine box.' },
  tealights: { name: 'Tealight Tin',    cost: 1.1, market: 3.2, boxQty: 8,  size: 's', level: 1, icon: '🕯️', blurb: 'Six little lights in a tin.' },
  oil:       { name: 'Lamp Oil',        cost: 1.8, market: 4.5, boxQty: 6,  size: 's', level: 1, icon: '🫙', blurb: 'Clean-burning, faintly cedar.' },
  bulbs:     { name: 'Glow Bulb',       cost: 1.5, market: 4.0, boxQty: 8,  size: 's', level: 2, licence: 'lamps', icon: '💡', blurb: 'Warm filament bulbs.' },
  lantern:   { name: 'Tin Lantern',     cost: 6.0, market: 14,  boxQty: 4,  size: 'm', level: 2, licence: 'lamps', icon: '🏮', blurb: 'For walks home through the pines.' },
};

/** Craft supplies: ordered in boxes, loaded into a workbench. */
export const SUPPLIES = {
  candle_supplies: { name: 'Candle Supplies', cost: 4.8, uses: 6, station: 'candle', level: 1, icon: '🧱', blurb: 'Beeswax blocks and cotton wicks. Makes 6 candles.' },
  lamp_kit:        { name: 'Lamp Parts Kit',  cost: 10.5, uses: 3, station: 'lamp', level: 2, licence: 'lamps', icon: '🧰', blurb: 'Bases, sockets and shade frames. Makes 3 lamps.' },
};

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
  lens:     { name: 'Lens Grinding',      level: 4, price: 90, soon: true, blurb: 'Polish lenses for lanterns and spyglasses.' },
  glass:    { name: 'Stained Glass',      level: 5, price: 140, soon: true, blurb: 'Solder coloured glass into window panels.' },
};

export const SIZE_PER_SECTION = { s: 6, m: 3, l: 2 };

/** Regular townsfolk. `wants` are product-key patterns (see keyMatches). */
export const REGULARS = {
  mira:    { name: 'Mira',       role: 'the baker',         model: 'character-female-b', from: 1, house: 0, wants: ['candle:*:honey', 'candle:*:cream', 'tealights'], blurb: 'Up before anyone to light the ovens.' },
  tomas:   { name: 'Old Tomas',  role: 'the woodcutter',    model: 'character-male-e',   from: 1, house: 1, wants: ['oil', 'matches', 'lantern'], blurb: 'Knows every path in the forest.' },
  juniper: { name: 'Juniper',    role: 'the schoolteacher', model: 'character-female-d', from: 1, house: 2, wants: ['lamp', 'candle:*:sage', 'tealights'], blurb: 'Marks homework by lamplight.' },
  fennel:  { name: 'Fennel',     role: 'the night-fisher',  model: 'character-male-c',   from: 2, house: 3, wants: ['lantern', 'oil', 'matches'], blurb: 'Fishes the stream when the moon is up.' },
  rosa:    { name: 'Rosa',       role: 'the gardener',      model: 'character-female-e', from: 3, house: 4, wants: ['candle:*:rose', 'lamp:*:*:rose', 'candle:jar'], blurb: 'Her windowsills are all flowers.' },
  pip:     { name: 'Pip',        role: 'the student',       model: 'character-male-a',   from: 4, house: 5, wants: ['tealights', 'candle:taper', 'bulbs'], blurb: 'Studies late. Very late.' },
};
export const GENERIC_MODELS = ['character-female-a', 'character-female-c', 'character-female-f', 'character-male-b', 'character-male-d', 'character-male-f'];
export const GENERIC_NAMES = ['Ada', 'Bram', 'Clover', 'Dell', 'Elsie', 'Finn', 'Greta', 'Hollis', 'Ivy', 'Jory', 'Kit', 'Linden', 'Maple', 'Nell', 'Otto', 'Perrin', 'Quill', 'Rowan', 'Sorrel', 'Thea'];
export const GENERIC_WANTS = ['matches', 'tealights', 'candle', 'candle:pillar', 'oil', 'lamp', 'lantern', 'bulbs', 'candle:*:cream', 'candle:*:rose'];

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
  clear: { name: 'Clear',  icon: '✦', demand: {} },
  rain:  { name: 'Rain',   icon: '☂', demand: { candle: 1.3, tealights: 1.2 } },
  fog:   { name: 'Fog',    icon: '≈', demand: { lantern: 1.6, oil: 1.3, lamp: 1.2 } },
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
};
