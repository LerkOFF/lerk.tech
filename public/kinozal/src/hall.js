// Single source of truth for the hall: geometry, seats, prices, view metrics.
// Units are metres. World axes: x to the right (viewer facing the screen),
// y up, z away from the screen. The screen plane is at z = 0, centred on x = 0.
//
// Several halls are described here. The active one is picked once, at module
// load, from the URL: ?hall=<id>. Everything else (2D map, 3D scene) is built
// from HALL and SEATS only, so adding a hall means adding one entry below.

const SEAT_WIDTH = 0.6; // pitch between seat centres; aisles are a multiple of it

const HALLS = {
  meridian: {
    id: 'meridian',
    name: 'Меридиан',
    subtitle: 'Зал 3 · пт, 14 ноября',
    lang: 'ru',
    shows: [
      { time: '17:30', format: '2D' },
      { time: '19:45', format: 'IMAX', active: true },
      { time: '22:15', format: '2D' },
    ],
    screen: { width: 11.3, height: 4.73, bottom: 1.6 },
    // each row: label, blocks (seats per block, left to right), offsetX (shift of the whole row)
    rowSpecs: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((label) => ({
      label, blocks: [3, 8, 3], offsetX: 0,
    })),
    aisleWidth: 0.6,
    firstRowZ: 5.2,
    rowPitch: 1.05,
    rowRise: 0.22,
    eyeHeight: 1.15,
    reclinerRows: ['H', 'I'],
    prices: { standard: 450, recliner: 600 },
    currency: ' ₽',
    currencyAfter: true,
    priceDecimals: 0,
    idSeparator: '',            // seat id "B4"
    taken: { random: 0.34, seed: 20261114, keepFree: ['B4', 'F8', 'I12'] },
  },

  // Small hall: three rows of 7 and a back row of 8 that sticks out one seat to the left.
  small: {
    id: 'small',
    name: 'Малый зал',
    subtitle: '4 ряда · 29 мест',
    lang: 'ru',
    shows: [
      { time: '16:10', format: '2D' },
      { time: '18:30', format: '2D', active: true },
      { time: '21:00', format: '2D' },
    ],
    screen: { width: 6.0, height: 2.5, bottom: 1.3 },
    rowSpecs: [
      { label: '1', blocks: [7], offsetX: 0 },
      { label: '2', blocks: [7], offsetX: 0 },
      { label: '3', blocks: [7], offsetX: 0 },
      { label: '4', blocks: [8], offsetX: -SEAT_WIDTH / 2 },
    ],
    aisleWidth: 0.6,
    firstRowZ: 3.6,
    rowPitch: 1.1,
    rowRise: 0.25,
    eyeHeight: 1.15,
    reclinerRows: [],
    prices: { standard: 350, recliner: 350 },
    currency: ' ₽',
    currencyAfter: true,
    priceDecimals: 0,
    idSeparator: '-',           // seat id "2-4" (row-seat), rows are numeric
    taken: { list: ['2-3', '2-4', '2-5', '3-3', '3-4', '4-4', '4-5', '4-7', '4-8'] },
  },
};

function pickHallId() {
  try {
    const id = new URLSearchParams(globalThis.location?.search || '').get('hall');
    if (id && HALLS[id]) return id;
  } catch (e) { /* no location (tests) */ }
  return 'meridian';
}

// A hall can also be passed in by the embedding page through the URL hash:
//   #hall=<encodeURIComponent(JSON)>
// JSON: { name, subtitle, lang, currency, currencyAfter, priceDecimals,
//         seats: [[id, rowLabel, number, xMetres, rowIndex, taken(0|1), price], ...],
//         screen?: {width, height, bottom}, firstRowZ?, rowPitch?, rowRise? }
// x is the seat centre relative to the screen centre line, rowIndex 0 is the
// row nearest to the screen. Missing geometry is estimated from the seat span.
function customSpecFromHash() {
  try {
    const hash = (globalThis.location?.hash || '').replace(/^#/, '');
    const raw = new URLSearchParams(hash).get('hall');
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!Array.isArray(j.seats) || !j.seats.length) return null;
    const seatList = j.seats.map((a) => ({
      id: String(a[0]), row: String(a[1]), number: Number(a[2]),
      x: Number(a[3]), rowIndex: Number(a[4]), taken: !!a[5], price: Number(a[6]) || 0,
    }));
    const span = Math.max(...seatList.map((s) => s.x)) - Math.min(...seatList.map((s) => s.x)) + SEAT_WIDTH;
    const width = j.screen?.width || Math.max(4, +(span * 1.25).toFixed(2));
    const rowCount = Math.max(...seatList.map((s) => s.rowIndex)) + 1;
    const rowLabels = [];
    for (let i = 0; i < rowCount; i++) {
      rowLabels.push(seatList.find((s) => s.rowIndex === i)?.row ?? String(i + 1));
    }
    return {
      id: 'custom',
      name: j.name || 'Зал',
      subtitle: j.subtitle || '',
      lang: j.lang || 'ru',
      shows: [],
      screen: {
        width,
        height: j.screen?.height || +(width / 2.39).toFixed(2),
        bottom: j.screen?.bottom ?? 1.3,
      },
      rowLabels,
      seatList,
      aisleWidth: SEAT_WIDTH,
      firstRowZ: j.firstRowZ || +Math.max(3, width * 0.6).toFixed(2),
      rowPitch: j.rowPitch || 1.1,
      rowRise: j.rowRise ?? 0.22,
      eyeHeight: 1.15,
      reclinerRows: [],
      prices: { standard: 0, recliner: 0 },
      currency: j.currency ?? ' ₽',
      currencyAfter: j.currencyAfter ?? true,
      priceDecimals: j.priceDecimals ?? 0,
      idSeparator: '-',
      taken: {},
    };
  } catch (e) {
    return null;
  }
}

const spec = customSpecFromHash() || HALLS[pickHallId()];

// Deterministic pseudo-random so "taken" seats are the same on every load.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSeats() {
  const rand = mulberry32(spec.taken.seed || 1);
  const keepFree = new Set(spec.taken.keepFree || []);
  const takenList = new Set(spec.taken.list || []);
  const seats = [];

  if (spec.seatList) {
    spec.seatList.forEach((c) => {
      seats.push({
        id: c.id, row: c.row, rowIndex: c.rowIndex, number: c.number, blockIndex: 0,
        type: 'standard', price: c.price, taken: c.taken, col: 0,
        x: +c.x.toFixed(3),
        y: +(c.rowIndex * spec.rowRise).toFixed(3),
        z: +(spec.firstRowZ + c.rowIndex * spec.rowPitch).toFixed(3),
      });
    });
  }

  (spec.rowSpecs || []).forEach((rowSpec, rowIndex) => {
    const perRow = rowSpec.blocks.reduce((a, b) => a + b, 0);
    const totalWidth = perRow * SEAT_WIDTH + (rowSpec.blocks.length - 1) * spec.aisleWidth;
    let x = -totalWidth / 2 + SEAT_WIDTH / 2 + (rowSpec.offsetX || 0);
    let number = 1;
    rowSpec.blocks.forEach((count, blockIndex) => {
      for (let i = 0; i < count; i++) {
        const id = `${rowSpec.label}${spec.idSeparator}${number}`;
        const type = spec.reclinerRows.includes(rowSpec.label) ? 'recliner' : 'standard';
        const taken = takenList.has(id)
          || (spec.taken.random ? !keepFree.has(id) && rand() < spec.taken.random : false);
        seats.push({
          id,
          row: rowSpec.label,
          rowIndex,
          number,
          blockIndex,
          type,
          price: spec.prices[type],
          taken,
          col: 0, // filled below
          // seat centre on the row floor
          x: +x.toFixed(3),
          y: +(rowIndex * spec.rowRise).toFixed(3),
          z: +(spec.firstRowZ + rowIndex * spec.rowPitch).toFixed(3),
        });
        x += SEAT_WIDTH;
        number++;
      }
      x += spec.aisleWidth;
    });
  });

  // Grid column for the 2D map: 0 is the leftmost seat position in the hall,
  // aisles are empty columns, rows may start at different columns. Integer for
  // the built-in halls; a hall passed in from outside may have half-seat
  // offsets, so there it is rounded to 0.5.
  const minX = Math.min(...seats.map((s) => s.x));
  const step = spec.seatList ? 2 : 1;
  seats.forEach((s) => { s.col = Math.round(((s.x - minX) / SEAT_WIDTH) * step) / step; });
  return seats;
}

export const SEATS = buildSeats();

const xs = SEATS.map((s) => s.x);
const zs = SEATS.map((s) => s.z);

export const HALL = {
  ...spec,
  rows: spec.rowLabels || spec.rowSpecs.map((r) => r.label),
  lang: spec.lang || 'ru',
  custom: !!spec.seatList,                                 // hall came from the embedding page
  seatWidth: SEAT_WIDTH,
  cols: Math.ceil(Math.max(...SEATS.map((s) => s.col))) + 1, // grid width of the 2D map
  // extent of seat centres; add seatWidth / 2 for the outer edges
  bounds: {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
  },
  // half-width that walls, floor and the overhead camera must cover
  halfWidth: Math.max(
    spec.screen.width / 2,
    Math.max(...xs.map(Math.abs)) + SEAT_WIDTH / 2,
  ),
};

// For a hall switcher in the UI: [{ id, name, active }]
export const HALL_LIST = spec.seatList ? [] : Object.values(HALLS).map((h) => ({
  id: h.id, name: h.name, active: h.id === spec.id,
}));

// Seats grouped by row, in row order: [{ label, rowIndex, seats: [...] }]
export const ROWS = HALL.rows.map((label, rowIndex) => ({
  label, rowIndex, seats: SEATS.filter((s) => s.rowIndex === rowIndex),
}));

export const SCREEN_CENTER = {
  x: 0,
  y: HALL.screen.bottom + HALL.screen.height / 2,
  z: 0,
};

export function getSeat(id) {
  return SEATS.find((s) => s.id === id) || null;
}

// Where the viewer's eyes are when sitting in the seat.
export function eyePosition(seat) {
  return { x: seat.x, y: seat.y + HALL.eyeHeight, z: seat.z };
}

// Numbers shown on the seat card. All derived from geometry.
export function seatMetrics(seat) {
  const eye = eyePosition(seat);
  const dx = eye.x - SCREEN_CENTER.x;
  const dy = eye.y - SCREEN_CENTER.y;
  const dz = eye.z - SCREEN_CENTER.z;
  const distance = Math.hypot(dx, dy, dz);

  // Horizontal angle between the left and right screen edges as seen from the eye.
  const half = HALL.screen.width / 2;
  const left = Math.atan2(-half - eye.x, eye.z);
  const right = Math.atan2(half - eye.x, eye.z);
  const fov = ((right - left) * 180) / Math.PI;

  const offset = Math.abs(seat.x);
  const side = offset < 0.05 ? 'centre' : seat.x < 0 ? 'left' : 'right';

  const depth = HALL.rows.length > 1 ? seat.rowIndex / (HALL.rows.length - 1) : 0;
  let tagKey;
  if (depth <= 0.25) tagKey = 'close';
  else if (depth >= 0.85) tagKey = 'far';
  else if (offset <= HALL.screen.width * 0.15) tagKey = 'sweet';
  else tagKey = 'side';

  const ru = HALL.lang === 'ru';
  const tags = ru
    ? { close: 'Близко к экрану', far: 'Весь экран в кадре', sweet: 'Лучшее место', side: 'Сбоку' }
    : { close: 'Up close', far: 'Full picture', sweet: 'Sweet spot', side: 'Off-axis' };
  const sides = ru
    ? { left: 'левее центра', right: 'правее центра', centre: 'по центру' }
    : { left: 'left of centre', right: 'right of centre', centre: 'on centre' };

  return {
    distance: +distance.toFixed(1),      // metres to screen centre
    fov: Math.round(fov),                // degrees
    offset: +offset.toFixed(1),          // metres from the centre line
    side,                                // 'left' | 'right' | 'centre'
    offsetLabel: sides[side],
    tag: tags[tagKey],
    tagKey,
  };
}

export function formatPrice(value) {
  const n = value.toFixed(HALL.priceDecimals);
  return HALL.currencyAfter ? `${n}${HALL.currency}` : `${HALL.currency}${n}`;
}
