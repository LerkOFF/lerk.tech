import { HALL, SEATS, ROWS, HALL_LIST, getSeat, seatMetrics, formatPrice } from './hall.js';

// All visible strings live here. Static texts in index.html carry the same
// wording and are re-applied from this table through data-t / data-t-aria.
const T = {
  pageTitle: 'Выбор места',
  chooseSeat: 'Выберите место',
  proceed: 'Продолжить',
  screen: 'ЭКРАН',
  back: 'Назад',
  switchHall: 'Сменить зал',
  switchHallTo: (name) => `Сменить зал: ${name}`,
  showtimes: 'Сеансы',
  seats: 'Места',
  legend: 'Обозначения',
  hallMap: 'Схема зала',
  legAvail: 'Свободно',
  legRecliner: 'Комфорт',
  legTaken: 'Занято',
  legSelected: 'Выбрано',
  flyBack: 'Назад к схеме зала',
  flyView: (seat) => `Вид с места ${seat.id}`,
  flyViewEmbed: (seat) => `Вид с места: ряд ${seat.row}, место ${seat.number}`,
  sheetAria: 'Данные о месте',
  sheetToggle: 'Свернуть или развернуть карточку',
  toScreen: 'до экрана',
  fov: 'угол обзора',
  unit: 'м',
  change: 'Другое место',
  book: (price) => `Забронировать · ${price}`,
  booked: (seat) => `Забронировано · ${seat.id}`,
  done: 'Готово',
  close: 'Закрыть',
  standard: 'Стандарт',
  recliner: 'Комфорт',
  barTitle: (seat) => `Ряд ${seat.row} · место ${seat.number}`,
  sheetTitle: (seat) => `Ряд ${seat.row}, место ${seat.number}`,
  seatTaken: (seat) => `Ряд ${seat.row}, место ${seat.number}, занято`,
  seatFree: (seat, kind, price) => `Ряд ${seat.row}, место ${seat.number}, ${kind.toLowerCase()}, ${price}`,
  bookedSub: (seat, price, hall) => `Ряд ${seat.row}, место ${seat.number} · ${price} · ${hall}`,
};

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function initUI(scene) {
  const el = {
    app: $('app'), map: $('map'), grid: $('grid'), gridWrap: document.querySelector('.grid-wrap'), shows: $('shows'),
    hallName: $('hallName'), hallSub: $('hallSub'),
    bar: $('bar'), barTitle: $('barTitle'), barPrice: $('barPrice'), btnContinue: $('btnContinue'),
    flybar: $('flybar'), flyLabel: $('flyLabel'), btnFlyBack: $('btnFlyBack'),
    sheet: $('sheet'), sheetHead: $('sheetHead'), sheetDetail: $('sheetDetail'), sheetBooked: $('sheetBooked'),
    sheetTag: $('sheetTag'), sheetTitle: $('sheetTitle'), sheetSub: $('sheetSub'), minimap: $('minimap'),
    mDistance: $('mDistance'), mFov: $('mFov'), mOffset: $('mOffset'), mOffsetLabel: $('mOffsetLabel'),
    btnChange: $('btnChange'), btnBook: $('btnBook'), btnClose: $('btnClose'), btnDone: $('btnDone'),
    bookedTitle: $('bookedTitle'), bookedSub: $('bookedSub'),
    btnBack: $('btnBack'), btnInfo: $('btnInfo'),
  };

  let selected = null;     // seat object or null
  let busy = false;        // a transition is running
  let flying = false;
  let backRequested = false;
  const buttons = new Map();

  const safe = async (fn) => { try { return await fn(); } catch (e) { console.warn(e); } };
  const sceneSelect = (s) => { if (scene) try { scene.setSelected(s); } catch (e) { console.warn(e); } };

  /* ---------- static text, mode ---------- */
  const staticText = {
    barTitle: T.chooseSeat, btnContinue: T.proceed, btnChange: T.change, btnDone: T.done, btnClose: T.close,
    mDistanceLabel: T.toScreen, mFovLabel: T.fov, legAvail: T.legAvail, legRecliner: T.legRecliner,
    legTaken: T.legTaken, legSelected: T.legSelected, screenLabel: T.screen,
  };
  document.title = T.pageTitle;
  document.documentElement.lang = 'ru';
  document.querySelectorAll('[data-t]').forEach((n) => {
    const v = staticText[n.dataset.t];
    if (typeof v === 'string') n.textContent = v;
  });
  const ariaText = {
    map: T.hallMap, back: T.back, switchHall: T.switchHall, shows: T.showtimes, seats: T.seats,
    legend: T.legend, flyBack: T.flyBack, sheet: T.sheetAria, sheetToggle: T.sheetToggle,
  };
  document.querySelectorAll('[data-t-aria]').forEach((n) => {
    const v = ariaText[n.dataset.tAria];
    if (v) n.setAttribute('aria-label', v);
  });

  const query = new URLSearchParams(window.location.search);
  const embedMode = query.get('embed') === '1';
  const WIDE_MIN = embedMode ? 700 : 900;
  const postToParent = (msg) => { try { window.parent.postMessage(msg, '*'); } catch (e) { /* no parent */ } };
  const postClose = () => postToParent({ type: 'kinozal:close' });
  let wide = false;

  /* ---------- header + showtimes ---------- */
  el.hallName.textContent = HALL.name;
  el.hallSub.textContent = HALL.subtitle;
  el.shows.hidden = !(HALL.shows && HALL.shows.length);
  (HALL.shows || []).forEach((show, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'show' + (show.active ? ' is-active' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', show.active ? 'true' : 'false');
    b.innerHTML = `<b>${show.time}</b><span>${show.format}</span>`;
    b.addEventListener('click', () => {
      if (busy) return;
      el.shows.querySelectorAll('.show').forEach((n) => {
        n.classList.toggle('is-active', n === b);
        n.setAttribute('aria-selected', n === b ? 'true' : 'false');
      });
    });
    el.shows.appendChild(b);
  });

  /* ---------- seat grid ---------- */
  function seatLabel(s) {
    const kind = s.type === 'recliner' ? T.recliner : T.standard;
    return s.taken ? T.seatTaken(s) : T.seatFree(s, kind, formatPrice(s.price));
  }

  const GAP = 4, LETTER = 16, NUM_MIN = 26;
  function sizeGrid() {
    if (!el.grid.isConnected || embedMode) return;
    const avail = el.grid.clientWidth - LETTER - GAP;
    if (avail <= 0) return;
    const maxSeat = wide ? 40 : 34;
    const rgap = wide ? 11 : 8;
    const rows = Math.max(1, ROWS.length);
    const byW = Math.floor((avail - (HALL.cols - 1) * GAP) / HALL.cols);
    const wrapH = el.gridWrap ? el.gridWrap.clientHeight - 14 : 0;
    const byH = wrapH > 0 ? Math.floor((wrapH - (rows - 1) * rgap) / rows) : maxSeat;
    const size = Math.max(10, Math.min(maxSeat, byW, byH));
    el.grid.style.setProperty('--s', `${size}px`);
    el.grid.style.setProperty('--gap', `${GAP}px`);
    el.grid.style.setProperty('--rgap', `${rgap}px`);
    el.grid.style.setProperty('--cols', String(HALL.cols));
    el.grid.classList.toggle('show-nums', size >= NUM_MIN);
  }

  function renderGrid() {
    el.grid.innerHTML = '';
    buttons.clear();
    ROWS.forEach((rowData) => {
      const r = document.createElement('div');
      r.className = 'row';
      r.dataset.row = rowData.label;
      const letter = document.createElement('span');
      letter.className = 'row-letter';
      letter.textContent = rowData.label;
      letter.setAttribute('aria-hidden', 'true');
      r.appendChild(letter);
      const cells = document.createElement('div');
      cells.className = 'cells';
      rowData.seats.forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `seat ${s.type}${s.taken ? ' taken' : ''}`;
        b.dataset.id = s.id;
        b.style.setProperty('--c', String(s.col));
        b.disabled = s.taken;
        b.setAttribute('aria-label', seatLabel(s));
        b.setAttribute('aria-pressed', 'false');
        b.innerHTML = `<span>${s.number}</span>`;
        b.addEventListener('click', () => onSeatClick(s));
        buttons.set(s.id, b);
        cells.appendChild(b);
      });
      r.appendChild(cells);
      el.grid.appendChild(r);
    });
    sizeGrid();
  }

  // recliner legend only when the hall has recliners
  const legRecliner = $('legRecliner');
  if (legRecliner) legRecliner.hidden = !SEATS.some((s) => s.type === 'recliner');

  // hall switcher
  (function bindSwitcher() {
    const other = HALL_LIST.find((h) => !h.active);
    if (HALL_LIST.length < 2 || !other) { el.btnInfo.hidden = true; return; }
    const label = T.switchHallTo(other.name);
    el.btnInfo.setAttribute('aria-label', label);
    el.btnInfo.title = label;
    el.btnInfo.addEventListener('click', () => {
      if (busy) return;
      const u = new URL(window.location.href);
      u.searchParams.set('hall', other.id);
      window.location.href = u.toString();
    });
  })();

  function onSeatClick(s) {
    if (busy || s.taken) return;
    selected = selected && selected.id === s.id ? null : s;
    syncSelection();
    sceneSelect(selected);
  }

  function syncSelection() {
    buttons.forEach((b, id) => {
      const on = !!selected && selected.id === id;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (selected) {
      el.barTitle.textContent = T.barTitle(selected);
      el.barPrice.textContent = formatPrice(selected.price);
      el.barPrice.hidden = false;
      el.btnContinue.disabled = false;
      el.bar.classList.add('has-seat');
    } else {
      el.barTitle.textContent = T.chooseSeat;
      el.barPrice.hidden = true;
      el.btnContinue.disabled = true;
      el.bar.classList.remove('has-seat');
    }
  }

  /* ---------- minimap ---------- */
  function renderMinimap(seat) {
    const W = 84, H = 72, padX = 9, top = 17, bottom = 8;
    const cols = Math.max(1, HALL.cols - 1), rows = Math.max(1, ROWS.length - 1);
    const px = (c) => (HALL.cols === 1 ? W / 2 : padX + (c / cols) * (W - padX * 2));
    const pz = (r) => (ROWS.length === 1 ? (top + H - bottom) / 2 : top + (r / rows) * (H - top - bottom));
    const rad = Math.max(1.2, Math.min(2.4, (W - padX * 2) / HALL.cols / 2.4, (H - top - bottom) / ROWS.length / 2.4));
    let svg = `<defs><filter id="mmGlow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>`;
    svg += `<path d="M10 9 Q42 2 74 9" fill="none" stroke="#7ee2a8" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>`;
    SEATS.forEach((s) => {
      if (s.id === seat.id) return;
      svg += `<circle cx="${px(s.col).toFixed(1)}" cy="${pz(s.rowIndex).toFixed(1)}" r="${rad.toFixed(1)}" fill="${s.taken ? '#2a2a31' : '#4a4a54'}"/>`;
    });
    const cx = px(seat.col).toFixed(1), cy = pz(seat.rowIndex).toFixed(1);
    svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="#7ee2a8" filter="url(#mmGlow)" opacity=".9"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="${(rad + 1).toFixed(1)}" fill="#7ee2a8"/>`;
    el.minimap.innerHTML = svg;
  }

  /* ---------- sheet ---------- */
  let sheetState = 'hidden'; // hidden | open | peek

  function fillSheet(seat) {
    const m = seatMetrics(seat);
    const kind = seat.type === 'recliner' ? T.recliner : T.standard;
    el.sheetTag.textContent = m.tag;
    el.sheetTitle.textContent = T.sheetTitle(seat);
    el.sheetSub.textContent = `${kind} · ${formatPrice(seat.price)}`;
    el.mDistance.textContent = `${m.distance.toFixed(1).replace('.', ',')} ${T.unit}`;
    el.mFov.textContent = `${m.fov}°`;
    el.mOffset.textContent = `${m.offset.toFixed(1).replace('.', ',')} ${T.unit}`;
    el.mOffsetLabel.textContent = m.offsetLabel;
    el.btnBook.textContent = T.book(formatPrice(seat.price));
    renderMinimap(seat);
    el.sheetDetail.hidden = false;
    el.sheetBooked.hidden = true;
  }

  function peekOffset() {
    return Math.max(0, el.sheet.offsetHeight - 96);
  }

  function setSheet(state) {
    if (wide && state === 'peek') state = 'open'; // the floating card has no peek
    sheetState = state;
    el.sheet.style.setProperty('--peek', `${peekOffset()}px`);
    el.sheet.style.removeProperty('--ty');
    el.sheet.classList.remove('dragging');
    el.sheet.classList.toggle('is-open', state === 'open');
    el.sheet.classList.toggle('is-peek', state === 'peek');
    el.sheet.setAttribute('aria-hidden', state === 'hidden' ? 'true' : 'false');
    el.sheetHead.setAttribute('aria-expanded', state === 'open' ? 'true' : 'false');
    el.sheet.inert = state === 'hidden';
    reportInset();
  }

  function reportInset() {
    let px = 0;
    if (wide) px = 0;
    else if (sheetState === 'open') px = el.sheet.offsetHeight;
    else if (sheetState === 'peek') px = el.sheet.offsetHeight - peekOffset();
    if (scene && typeof scene.setBottomInset === 'function') {
      try { scene.setBottomInset(Math.round(px)); } catch (e) { console.warn(e); }
    }
  }

  async function showSheet() {
    setSheet('hidden');
    // let the hidden position paint before animating in
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    setSheet('open');
    await wait(480);
  }

  async function hideSheet() {
    if (sheetState === 'hidden') return;
    setSheet('hidden');
    await wait(420);
  }

  // drag / tap on the head to collapse and expand
  (function bindDrag() {
    let dragged = false, startY = 0, startTy = 0, moved = 0, active = false, lastY = 0, lastT = 0, vel = 0, pid = null;
    el.sheetHead.addEventListener('pointerdown', (e) => {
      if (sheetState === 'hidden' || wide) return;
      dragged = false; active = true; pid = e.pointerId; moved = 0; vel = 0;
      startY = lastY = e.clientY; lastT = performance.now();
      startTy = sheetState === 'peek' ? peekOffset() : 0;
      el.sheet.classList.add('dragging');
      try { el.sheetHead.setPointerCapture(pid); } catch (_) {}
    });
    el.sheetHead.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== pid) return;
      const dy = e.clientY - startY;
      moved = Math.max(moved, Math.abs(dy));
      const now = performance.now();
      vel = (e.clientY - lastY) / Math.max(1, now - lastT);
      lastY = e.clientY; lastT = now;
      const ty = Math.min(peekOffset(), Math.max(0, startTy + dy));
      el.sheet.style.setProperty('--ty', `${ty}px`);
    });
    const end = (e) => {
      if (!active || e.pointerId !== pid) return;
      active = false;
      try { el.sheetHead.releasePointerCapture(pid); } catch (_) {}
      if (moved < 6) return; // a plain tap is handled by the click listener
      dragged = true;
      const cur = parseFloat(el.sheet.style.getPropertyValue('--ty')) || 0;
      if (Math.abs(vel) > 0.4) setSheet(vel > 0 ? 'peek' : 'open');
      else setSheet(cur > peekOffset() / 2 ? 'peek' : 'open');
    };
    el.sheetHead.addEventListener('pointerup', end);
    el.sheetHead.addEventListener('pointercancel', end);
    el.sheetHead.addEventListener('click', () => {
      if (dragged) { dragged = false; return; }
      if (sheetState === 'hidden' || wide) return;
      setSheet(sheetState === 'open' ? 'peek' : 'open');
    });
    el.sheetHead.addEventListener('keydown', (e) => {
      if (wide) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet(sheetState === 'open' ? 'peek' : 'open'); }
      else if (e.key === 'ArrowDown') setSheet('peek');
      else if (e.key === 'ArrowUp') setSheet('open');
    });
  })();

  /* ---------- flows ---------- */
  function setMapVisible(on) {
    el.map.classList.toggle('is-away', !on);
    el.map.inert = !on;
    el.map.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  function setFlybar(on, seat) {
    if (seat) el.flyLabel.textContent = embedMode ? T.flyViewEmbed(seat) : T.flyView(seat);
    el.flybar.classList.toggle('is-on', on);
    el.flybar.setAttribute('aria-hidden', on ? 'false' : 'true');
    el.btnFlyBack.tabIndex = on ? 0 : -1;
  }

  async function goToSeat() {
    if (busy || !selected) return;
    busy = true; flying = true; backRequested = false;
    const seat = selected;
    setMapVisible(false);
    setFlybar(true, seat);
    if (scene) await safe(() => scene.flyToSeat(seat));
    else await wait(650);
    flying = false;
    if (backRequested) { backRequested = false; await returnToMap(true); return; }
    fillSheet(seat);
    await showSheet();
    busy = false;
  }

  // Returns from the seat view to the map. Assumes busy is true or sets it.
  async function returnToMap(alreadyBusy) {
    if (!alreadyBusy) { if (busy) return; busy = true; }
    await hideSheet();
    if (scene) await safe(() => scene.leaveSeat());
    else await wait(300);
    setFlybar(false);
    setMapVisible(true);
    await wait(380);
    busy = false;
  }

  function onBack() {
    if (flying) { backRequested = true; return; } // handled when the flight lands
    if (busy) return;
    returnToMap(false);
  }

  async function onBook() {
    if (busy || !selected) return;
    busy = true;
    const seat = selected;
    seat.taken = true;
    el.bookedTitle.textContent = T.booked(seat);
    el.bookedSub.textContent = T.bookedSub(seat, formatPrice(seat.price), HALL.name);
    el.sheetDetail.hidden = true;
    el.sheetBooked.hidden = false;
    setSheet('open');
    await wait(250);
    busy = false;
  }

  async function onDone() {
    if (busy) return;
    busy = true;
    const seat = selected;
    await hideSheet();
    if (scene) await safe(() => scene.leaveSeat());
    else await wait(300);
    selected = null;
    sceneSelect(null);
    if (seat) {
      const b = buttons.get(seat.id);
      if (b) {
        b.disabled = true;
        b.classList.add('taken');
        b.setAttribute('aria-label', seatLabel(seat));
      }
    }
    syncSelection();
    setFlybar(false);
    setMapVisible(true);
    await wait(380);
    busy = false;
  }

  /* ---------- layout (decided by the app width) ---------- */
  function updateLayout() {
    const w = el.app.clientWidth || window.innerWidth;
    const next = w >= WIDE_MIN;
    const changed = next !== wide;
    wide = next;
    el.app.classList.toggle('is-wide', wide);
    el.app.classList.toggle('is-narrow', !wide);
    sizeGrid();
    if (sheetState !== 'hidden' && changed) setSheet(sheetState);
    else if (sheetState === 'peek') { el.sheet.style.setProperty('--peek', `${peekOffset()}px`); reportInset(); }
    else reportInset();
  }
  window.addEventListener('resize', updateLayout);
  if (typeof ResizeObserver === 'function') new ResizeObserver(updateLayout).observe(el.app);

  /* ---------- embed mode ---------- */
  let embedReady = false, embedPending = null, embedRunning = false;

  async function embedShow(seat) {
    embedPending = seat;
    if (embedRunning) return;
    embedRunning = true;
    busy = true;
    while (embedPending) {
      const s = embedPending;
      embedPending = null;
      selected = s;
      flying = true;
      await hideSheet();
      setFlybar(true, s);
      if (scene) await safe(() => scene.flyToSeat(s));
      else await wait(650);
      flying = false;
      if (!embedReady) { embedReady = true; postToParent({ type: 'kinozal:ready' }); }
      if (embedPending) continue;
      fillSheet(s);
      await showSheet();
    }
    busy = false;
    embedRunning = false;
  }

  if (embedMode) {
    el.app.classList.add('is-embed');
    el.map.hidden = true;
    el.btnChange.hidden = true;
    el.btnBook.hidden = true;
    el.btnClose.hidden = false;
    el.btnClose.addEventListener('click', postClose);
    el.btnFlyBack.addEventListener('click', postClose);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') postClose(); });
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object' || d.type !== 'kinozal:seat' || typeof d.id !== 'string') return;
      const seat = getSeat(d.id);
      if (seat) embedShow(seat);
    });
    setSheet('hidden');
    updateLayout();
    const first = getSeat(query.get('seat') || '');
    if (!first) {
      el.app.classList.add('is-empty');
      postClose();
      return;
    }
    embedShow(first);
    return;
  }

  el.btnContinue.addEventListener('click', goToSeat);
  el.btnFlyBack.addEventListener('click', onBack);
  el.btnChange.addEventListener('click', () => { if (!busy) returnToMap(false); });
  el.btnBook.addEventListener('click', onBook);
  el.btnDone.addEventListener('click', onDone);
  el.btnBack.addEventListener('click', () => { if (!busy && selected) { selected = null; syncSelection(); sceneSelect(null); } });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.flybar.classList.contains('is-on')) onBack();
  });

  renderGrid();
  syncSelection();
  setMapVisible(true);
  setSheet('hidden');
  updateLayout();
}
