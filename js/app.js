// Días · interfaz. Meses en vertical como el Calendario del iPhone, con marcas, notas,
// dibujo a mano por mes y una foto de fondo para cada mes.

import { T } from './i18n.js';
import * as db from './store.js';
import {
  SHAPES, PALETTE, NOTE_MAX, NAME_MAX, keyOf, todayKey, monthKeyOf, parseKey, monthGrid, isPast,
  shiftMonth, textOn, normalizeType, normalizeDay, normalizeStrokes, parseBackup, uid,
} from './cal.js';
import { shapeSVG, isBackdrop, CROSS_SVG } from './shapes.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
const ICON_MONTH = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 3v3M16 3v3"/></svg>';
const ICON_LIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
const ICON_ERASER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 20h12M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8.5z"/></svg>';

const DEFAULT_TYPES = [
  { id: 'work', name: T.defaultTypes.work, color: '#FF8A4C', shape: 'circle', style: 'fill' },
  { id: 'off', name: T.defaultTypes.off, color: '#4CD7A0', shape: 'circle', style: 'outline' },
  { id: 'holiday', name: T.defaultTypes.holiday, color: '#FFC145', shape: 'star', style: 'fill' },
];
const DEFAULT_SETTINGS = { strike: true, shade: 0.45, view: 'scroll' };
const DRAW_PREFIX = 'draw:';

const now = new Date();
const state = {
  today: todayKey(now),
  types: [],
  days: new Map(),
  photos: new Map(), // mes (0-11) → URL del blob
  drawings: new Map(), // 'AAAA-MM' → trazos
  settings: { ...DEFAULT_SETTINGS },
  visible: { year: now.getFullYear(), month: now.getMonth() },
  first: shiftMonth(now.getFullYear(), now.getMonth(), -12),
  last: shiftMonth(now.getFullYear(), now.getMonth(), 24),
  marking: false,
  paint: null,
};

const typeById = (id) => state.types.find((t) => t.id === id);
const monthsBetween = (a, b) => (b.year - a.year) * 12 + b.month - a.month;

/* ── Carga ─────────────────────────────────────────── */

async function load() {
  const types = await db.get('kv', 'types');
  state.types = Array.isArray(types) ? types : DEFAULT_TYPES;
  state.settings = { ...DEFAULT_SETTINGS, ...(await db.get('kv', 'settings')) };
  state.days = new Map(await db.entries('days'));
  state.drawings = new Map((await db.entries('kv'))
    .filter(([k]) => typeof k === 'string' && k.startsWith(DRAW_PREFIX))
    .map(([k, v]) => [k.slice(DRAW_PREFIX.length), normalizeStrokes(v)]));
  state.photos.forEach((url) => URL.revokeObjectURL(url));
  state.photos = new Map((await db.entries('photos')).map(([m, blob]) => [m, URL.createObjectURL(blob)]));
}

/* ── Fondo ─────────────────────────────────────────── */

let bgFront = 'bgA';
let shownBg = null;

function renderBackground() {
  const url = state.photos.get(state.visible.month);
  const bg = url ? `url("${url}")` : `var(--m${state.visible.month})`;
  $('bgShade').style.setProperty('--shade', state.settings.shade);
  if (bg === shownBg) return;
  shownBg = bg;
  const back = bgFront === 'bgA' ? 'bgB' : 'bgA';
  const el = $(back);
  const show = () => {
    el.style.background = `${bg} center / cover no-repeat`;
    requestAnimationFrame(() => {
      el.classList.add('on');
      $(bgFront).classList.remove('on');
      bgFront = back;
    });
  };
  if (!url) return show();
  const img = new Image();
  img.onload = img.onerror = show;
  img.src = url;
}

/* ── Celdas ────────────────────────────────────────── */

const isCurrentMonth = (y, m) => { const n = new Date(); return y === n.getFullYear() && m === n.getMonth(); };

/** Una casilla. En la vista continua, `opts.label` pone el mes sobre el día 1 y `opts.alt` sombrea meses alternos. */
function dayCellHTML(cell, opts = {}) {
  const info = state.days.get(cell.key);
  const type = info?.type ? typeById(info.type) : null;
  const past = isPast(cell.key, state.today);
  const isToday = cell.key === state.today;
  const behind = type && !isToday;
  const cls = ['day'];
  if (cell.weekday >= 5) cls.push('weekend');
  if (isToday) cls.push('today');
  if (past) cls.push('past');
  if (opts.alt) cls.push('alt');
  if (opts.label) cls.push('first');
  if (behind && type.style === 'fill' && isBackdrop(type.shape)) cls.push(`on-${textOn(type.color)}`);
  const label = [fmtLong(parseKey(cell.key)), type?.name, info?.note ? T.note : ''].filter(Boolean).join(', ');
  const badges = (type && !behind ? shapeSVG({ ...type, shape: isBackdrop(type.shape) ? type.shape : 'circle', style: 'fill' }, 'mini') : '') + (info?.note ? '<span class="note-dot"></span>' : '');
  return `<button type="button" class="${cls.join(' ')}" data-key="${cell.key}" aria-label="${esc(label)}">`
    + (opts.label ? `<span class="m-tag${opts.current ? ' current' : ''}">${opts.label}</span>` : '')
    + '<span class="disc">'
    + (behind ? `<span class="mark">${shapeSVG(type)}</span>` : '')
    + `<span class="num">${cell.day}</span>`
    + (past && state.settings.strike ? CROSS_SVG : '')
    + '</span>'
    + `<span class="badges">${badges}</span>`
    + '</button>';
}

function cellOf(date) {
  return {
    key: keyOf(date.getFullYear(), date.getMonth(), date.getDate()),
    day: date.getDate(),
    weekday: (date.getDay() + 6) % 7,
  };
}

function refreshCell(key, pop) {
  const d = parseKey(key);
  document.querySelectorAll(`#scroller [data-key="${key}"], #monthView [data-key="${key}"]`).forEach((el) => {
    const opts = el.classList.contains('first')
      ? { label: T.monthsShort[d.getMonth()], current: isCurrentMonth(d.getFullYear(), d.getMonth()), alt: el.classList.contains('alt') }
      : { alt: el.classList.contains('alt') };
    const tmp = document.createElement('div');
    tmp.innerHTML = dayCellHTML(cellOf(d), opts);
    const fresh = tmp.firstChild;
    if (pop) fresh.classList.add('pop');
    el.replaceWith(fresh);
  });
}

/* ── Vista mes a mes ───────────────────────────────── */

/** Un mes: el nombre corto sobre el día 1 y solo las casillas con día (sin huecos al final). */
function monthHTML(year, month) {
  const cells = monthGrid(year, month);
  while (cells.at(-1) === null) cells.pop();
  const lead = cells.findIndex(Boolean);
  const ym = monthKeyOf(year, month);
  return `<section class="month" data-ym="${ym}" data-y="${year}" data-m="${month}">
    <div class="m-head"><span class="${isCurrentMonth(year, month) ? 'current' : ''}" style="grid-column:${lead + 1}">${T.monthsShort[month]}</span></div>
    <div class="m-grid">${cells.map((c) => (c ? dayCellHTML(c) : '<span></span>')).join('')}</div>
    ${state.drawings.get(ym)?.length ? `<canvas class="ink" data-ink="${ym}"></canvas>` : ''}
  </section>`;
}

function renderMonthView(direction = 0) {
  const mv = $('monthView');
  mv.innerHTML = monthHTML(state.visible.year, state.visible.month);
  mv.classList.remove('slide-next', 'slide-prev');
  void mv.offsetWidth;
  if (direction) mv.classList.add(direction > 0 ? 'slide-next' : 'slide-prev');
  paintInks(mv);
}

function goMonth(delta) {
  state.visible = shiftMonth(state.visible.year, state.visible.month, delta);
  renderTitle();
  renderBackground();
  renderMonthView(delta);
}

/* ── Vista continua (semanas seguidas, sin huecos entre meses) ── */

const mondayOf = (y, m, d) => { const date = new Date(y, m, d); date.setDate(d - ((date.getDay() + 6) % 7)); return date; };

function weeksHTML() {
  const start = mondayOf(state.first.year, state.first.month, 1);
  const lastDay = new Date(state.last.year, state.last.month + 1, 0);
  let html = '';
  for (const d = new Date(start); d <= lastDay;) {
    const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
    let row = `<div class="week" data-y="${sunday.getFullYear()}" data-m="${sunday.getMonth()}">`;
    for (let i = 0; i < 7; i++) {
      const y = d.getFullYear(), m = d.getMonth();
      const first = d.getDate() === 1;
      row += dayCellHTML(cellOf(d), {
        alt: (y * 12 + m) % 2 === 1,
        label: first ? T.monthsShort[m] : '',
        current: first && isCurrentMonth(y, m),
      });
      d.setDate(d.getDate() + 1);
    }
    html += `${row}</div>`;
  }
  return `<div class="weeks" id="weeks">${html}</div>`;
}

/** Los dibujos de cada mes, colocados donde empieza su primera semana. */
function placeInks() {
  const weeks = $('weeks');
  if (!weeks) return;
  weeks.querySelectorAll('canvas.ink').forEach((c) => c.remove());
  const rowH = weeks.querySelector('.week')?.offsetHeight ?? 0;
  if (!rowH) return;
  const headH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head-h')) || 40;
  for (const [ym, strokes] of state.drawings) {
    if (!strokes.length) continue;
    const [y, m] = ym.split('-').map(Number);
    const cell = weeks.querySelector(`[data-key="${ym}-01"]`);
    if (!cell) continue;
    const rows = Math.ceil((((new Date(y, m - 1, 1).getDay() + 6) % 7) + new Date(y, m, 0).getDate()) / 7);
    const c = document.createElement('canvas');
    c.className = 'ink';
    c.dataset.ink = ym;
    c.style.cssText = `inset:auto;left:0;top:${cell.parentElement.offsetTop - headH}px;height:${headH + rows * rowH}px`;
    weeks.append(c);
    drawStrokes(c, strokes);
  }
}

function renderScroll() {
  const sc = $('scroller');
  const anchor = topWeek();
  const offset = anchor ? sc.scrollTop - anchor.offsetTop : 0;
  const anchorKey = anchor?.firstElementChild?.dataset.key;
  sc.innerHTML = weeksHTML();
  const again = anchorKey && sc.querySelector(`[data-key="${anchorKey}"]`)?.parentElement;
  if (again) sc.scrollTop = again.offsetTop + offset;
  placeInks();
}

function topWeek() {
  const sc = $('scroller');
  const weeks = $('weeks');
  if (!weeks) return null;
  const y = sc.scrollTop + 30;
  let found = null;
  for (const w of weeks.children) {
    if (!w.classList.contains('week')) continue;
    if (w.offsetTop <= y) found = w; else break;
  }
  return found;
}

function updateVisible() {
  const w = topWeek();
  if (!w) return;
  const v = { year: Number(w.dataset.y), month: Number(w.dataset.m) };
  if (v.year === state.visible.year && v.month === state.visible.month) return;
  state.visible = v;
  renderTitle();
  renderBackground();
}

function extendIfNeeded() {
  const sc = $('scroller');
  if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 1200) {
    state.last = shiftMonth(state.last.year, state.last.month, 12);
    renderScroll();
  } else if (sc.scrollTop < 800) {
    state.first = shiftMonth(state.first.year, state.first.month, -12);
    renderScroll();
  }
}

function scrollToMonth(year, month, smooth) {
  const target = { year, month };
  if (!$('weeks') || monthsBetween(state.first, target) < 2 || monthsBetween(target, state.last) < 2) {
    if (monthsBetween(state.first, target) < 2 || monthsBetween(target, state.last) < 2) {
      state.first = shiftMonth(year, month, -12);
      state.last = shiftMonth(year, month, 24);
    }
    $('scroller').innerHTML = weeksHTML();
    placeInks();
  }
  const cell = $('scroller').querySelector(`[data-key="${keyOf(year, month, 1)}"]`);
  if (cell) $('scroller').scrollTo({ top: cell.parentElement.offsetTop, behavior: smooth ? 'smooth' : 'auto' });
}

/* ── Las dos vistas ────────────────────────────────── */

function paintInks(root) {
  root.querySelectorAll('canvas.ink').forEach((c) => drawStrokes(c, state.drawings.get(c.dataset.ink) ?? []));
}

const isScroll = () => state.settings.view === 'scroll';

function renderTitle() {
  const t = $('monthName');
  t.textContent = T.months[state.visible.month];
  t.classList.remove('swap'); void t.offsetWidth; t.classList.add('swap');
  $('year').textContent = state.visible.year;
}

/** Vuelve a pintar la vista activa sin mover lo que se ve. */
function renderAll() {
  state.today = todayKey();
  const scroll = isScroll();
  $('scroller').hidden = !scroll;
  $('monthView').hidden = scroll;
  const vb = $('viewBtn');
  vb.innerHTML = scroll ? ICON_MONTH : ICON_LIST;
  vb.setAttribute('aria-label', scroll ? T.viewMonth : T.viewScroll);
  if (scroll) {
    if ($('weeks')) renderScroll();
    else scrollToMonth(state.visible.year, state.visible.month);
  } else {
    renderMonthView();
  }
  renderTitle();
  renderLegend();
  renderBackground();
}

async function toggleView() {
  state.settings.view = isScroll() ? 'month' : 'scroll';
  await saveSettings();
  if (isScroll()) {
    $('scroller').hidden = false;
    $('scroller').innerHTML = '';
  }
  renderAll();
  if (isScroll()) scrollToMonth(state.visible.year, state.visible.month);
}

function goToday() {
  const n = new Date();
  if (isScroll()) return scrollToMonth(n.getFullYear(), n.getMonth(), true);
  const delta = monthsBetween(state.visible, { year: n.getFullYear(), month: n.getMonth() });
  if (delta) goMonth(delta);
}

/* ── Dibujo a mano ─────────────────────────────────── */

function drawStrokes(canvas, strokes, live) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  for (const s of live ? [...strokes, live] : strokes) drawStroke(ctx, s, w, h);
}

function drawStroke(ctx, s, w, h) {
  const pts = s.points.map(([x, y]) => [x * w, y * h]);
  ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.erase ? '#000' : s.color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = s.width * w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  ctx.lineTo(pts.at(-1)[0], pts.at(-1)[1]);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

const PEN_COUNT = 6;
const SIZES = [0.006, 0.012, 0.024];
const editor = { year: 0, month: 0, pen: 1, size: 1, erase: false, live: null };

const penColor = (i) => getComputedStyle(document.documentElement).getPropertyValue(`--pen-${i}`).trim().toUpperCase();

function openEditor() {
  closeSheet();
  editor.year = state.visible.year;
  editor.month = state.visible.month;
  $('editor').hidden = false;
  renderEditor();
}

function renderEditor() {
  $('edTitle').textContent = T.months[editor.month];
  $('edYear').textContent = editor.year;
  const stage = $('edStage');
  const ym = monthKeyOf(editor.year, editor.month);
  stage.innerHTML = monthHTML(editor.year, editor.month);
  const sec = stage.firstElementChild;
  let canvas = sec.querySelector('canvas.ink');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'ink';
    canvas.dataset.ink = ym;
    sec.append(canvas);
  }
  bindCanvas(canvas, ym);
  requestAnimationFrame(() => drawStrokes(canvas, state.drawings.get(ym) ?? []));
  $('pens').innerHTML = Array.from({ length: PEN_COUNT }, (_, i) => i + 1)
    .map((i) => `<button type="button" class="pen" data-pen="${i}" style="--c:var(--pen-${i})" aria-label="${T.pen} ${i}" aria-pressed="${!editor.erase && editor.pen === i}"></button>`)
    .join('') + `<button type="button" class="pen eraser" data-pen="erase" aria-label="${T.eraser}" aria-pressed="${editor.erase}">${ICON_ERASER}</button>`;
  renderSize();
}

function renderSize() {
  const b = $('sizeBtn');
  b.style.setProperty('--s', `${6 + editor.size * 6}px`);
  b.setAttribute('aria-label', T.sizes[editor.size]);
}

function bindCanvas(canvas, ym) {
  let pid = null;
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (pid !== null) return;
    pid = e.pointerId;
    canvas.setPointerCapture(pid);
    editor.live = editor.erase
      ? { erase: true, color: null, width: SIZES[editor.size] * 2.5, points: [point(e)] }
      : { erase: false, color: penColor(editor.pen), width: SIZES[editor.size], points: [point(e)] };
    drawStrokes(canvas, state.drawings.get(ym) ?? [], editor.live);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid || !editor.live) return;
    const evs = e.getCoalescedEvents?.() ?? [e];
    for (const ev of evs) editor.live.points.push(point(ev));
    drawStrokes(canvas, state.drawings.get(ym) ?? [], editor.live);
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    const stroke = editor.live;
    editor.live = null;
    if (!stroke) return;
    const strokes = [...(state.drawings.get(ym) ?? []), stroke];
    saveDrawing(ym, strokes);
    drawStrokes(canvas, strokes);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

async function saveDrawing(ym, strokes) {
  if (strokes.length) {
    state.drawings.set(ym, strokes);
    await db.put('kv', DRAW_PREFIX + ym, strokes);
  } else {
    state.drawings.delete(ym);
    await db.del('kv', DRAW_PREFIX + ym);
  }
}

function closeEditor() {
  $('editor').hidden = true;
  editor.live = null;
  const moved = editor.year !== state.visible.year || editor.month !== state.visible.month;
  state.visible = { year: editor.year, month: editor.month };
  renderAll();
  if (isScroll() && moved) scrollToMonth(editor.year, editor.month);
}

function bindEditor() {
  $('edDone').addEventListener('click', closeEditor);
  $('edPrev').addEventListener('click', () => { Object.assign(editor, shiftMonth(editor.year, editor.month, -1)); renderEditor(); });
  $('edNext').addEventListener('click', () => { Object.assign(editor, shiftMonth(editor.year, editor.month, 1)); renderEditor(); });
  $('edUndo').addEventListener('click', async () => {
    const ym = monthKeyOf(editor.year, editor.month);
    const strokes = (state.drawings.get(ym) ?? []).slice(0, -1);
    await saveDrawing(ym, strokes);
    drawStrokes($('edStage').querySelector('canvas.ink'), strokes);
  });
  $('edClear').addEventListener('click', async () => {
    const ym = monthKeyOf(editor.year, editor.month);
    if (!state.drawings.get(ym)?.length) return;
    if (!(await ask(T.confirmClear(T.months[editor.month]), T.delete, true))) return;
    await saveDrawing(ym, []);
    drawStrokes($('edStage').querySelector('canvas.ink'), []);
  });
  $('pens').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pen]');
    if (!b) return;
    editor.erase = b.dataset.pen === 'erase';
    if (!editor.erase) editor.pen = Number(b.dataset.pen);
    $('pens').querySelectorAll('.pen').forEach((p) => p.setAttribute('aria-pressed', p === b));
  });
  $('sizeBtn').addEventListener('click', () => {
    editor.size = (editor.size + 1) % SIZES.length;
    renderSize();
  });
}

/* ── Marcar días con un tipo ───────────────────────── */

function renderLegend() {
  $('legend').hidden = !state.marking;
  $('markBtn').setAttribute('aria-pressed', state.marking);
  $('markLabel').textContent = state.marking ? T.done : T.markMode;
  $('scroller').classList.toggle('marking', state.marking && !!state.paint);
  if (!state.marking) return;
  $('legend').innerHTML = state.types
    .map((t) => `<button type="button" class="chip" data-type="${t.id}" aria-pressed="${state.paint === t.id}">${shapeSVG(t)}${esc(t.name)}</button>`)
    .join('') + `<button type="button" class="chip ghost" data-action="types">${esc(T.editTypes)}</button>`;
}

/* ── Datos de los días ─────────────────────────────── */

async function setDay(key, patch) {
  const ids = new Set(state.types.map((t) => t.id));
  const next = normalizeDay({ ...state.days.get(key), ...patch }, ids);
  if (next) { state.days.set(key, next); await db.put('days', key, next); }
  else { state.days.delete(key); await db.del('days', key); }
}

/* ── Hoja inferior ─────────────────────────────────── */

let onSheetClose = null;

function openSheet(html, bind, onClose) {
  const body = $('sheetBody');
  body.innerHTML = html;
  body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap');
  body.scrollTop = 0;
  onSheetClose = onClose ?? null;
  const wrap = $('sheetWrap');
  if (wrap.hidden) {
    wrap.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  }
  bind?.(body);
  body.querySelector('[data-close]')?.addEventListener('click', closeSheet);
}

function closeSheet() {
  const wrap = $('sheetWrap');
  if (wrap.hidden) return;
  onSheetClose?.();
  onSheetClose = null;
  document.activeElement?.blur?.();
  wrap.classList.remove('open');
  setTimeout(() => { if (!wrap.classList.contains('open')) wrap.hidden = true; }, 450);
}

const head = (title, sub = '', back = false) => `
  <div class="sheet-head">
    ${back ? `<button class="icon-btn" type="button" data-back aria-label="${T.back}">${ICON_BACK}</button>` : ''}
    <div style="flex:1;min-width:0"><h2>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>
    <button class="icon-btn" type="button" data-close aria-label="${T.close}">${ICON_X}</button>
  </div>`;

const fmtLong = (d) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);

/* Día */

function openDay(key) {
  const info = state.days.get(key) ?? { type: null, note: '' };
  const sub = key === state.today ? T.dayToday : isPast(key, state.today) ? T.dayPast : '';
  const chip = (id, label, svg = '') =>
    `<button type="button" class="chip" data-type="${id}" aria-pressed="${(info.type ?? '') === id}">${svg}${esc(label)}</button>`;
  const html = head(fmtLong(parseKey(key)), sub) + `
    <div class="section">
      <span class="label">${T.mark}</span>
      <div class="chips" id="dayTypes">
        ${state.types.map((t) => chip(t.id, t.name, shapeSVG(t))).join('')}
        ${chip('', T.noMark)}
      </div>
    </div>
    <div class="section">
      <label class="label" for="dayNote">${T.note}</label>
      <textarea id="dayNote" maxlength="${NOTE_MAX}" placeholder="${esc(T.notePlaceholder)}">${esc(info.note)}</textarea>
    </div>`;

  let timer;
  const saveNote = async () => {
    clearTimeout(timer);
    const note = $('dayNote')?.value ?? '';
    if (note.trim() === (state.days.get(key)?.note ?? '')) return;
    await setDay(key, { note });
    refreshCell(key);
  };

  openSheet(html, (body) => {
    body.querySelector('#dayTypes').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-type]');
      if (!b) return;
      body.querySelectorAll('#dayTypes .chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
      await setDay(key, { type: b.dataset.type || null });
      refreshCell(key, true);
    });
    const ta = body.querySelector('#dayNote');
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(saveNote, 500); });
    ta.addEventListener('blur', saveNote);
  }, saveNote);
}

/* Ajustes */

function openSettings() {
  const typeRows = state.types.map((t) => `
    <button type="button" class="row" data-edit="${t.id}">${shapeSVG(t, 'shape')}<span class="grow">${esc(t.name)}</span>${CHEV}</button>`).join('');
  const tiles = T.months.map((name, m) => {
    const url = state.photos.get(m);
    const bg = url ? `url('${url}')` : `var(--m${m})`;
    return `<button type="button" class="month-tile${m === state.visible.month ? ' current' : ''}" data-month="${m}" style="--bg:${bg}">
      <span>${name}</span>
      ${url ? `<span class="remove" data-remove="${m}" role="button" aria-label="${T.removePhoto}">${ICON_X}</span>` : ''}
    </button>`;
  }).join('');

  const html = head(T.settings) + `
    <div class="section">
      <span class="label">${T.types}</span>
      <p class="hint">${T.typesHint}</p>
      <div class="rows">${typeRows}
        <button type="button" class="row add" data-edit=""><span class="grow">+ ${T.newType}</span></button>
      </div>
    </div>
    <div class="section">
      <span class="label">${T.backgrounds}</span>
      <p class="hint">${T.backgroundsHint}</p>
      <div class="months">${tiles}</div>
      <label class="label" for="shade" style="margin-top:18px">${T.shade}</label>
      <input type="range" id="shade" min="0" max="0.7" step="0.05" value="${state.settings.shade}">
    </div>
    <div class="section">
      <span class="label">${T.options}</span>
      <div class="toggle-row">
        <span>${T.strikePast}</span>
        <button type="button" class="switch" role="switch" id="strikeSw" aria-checked="${state.settings.strike}" aria-label="${T.strikePast}"></button>
      </div>
    </div>
    <div class="section">
      <span class="label">${T.backup}</span>
      <p class="hint">${T.backupHint}</p>
      <div class="actions">
        <button type="button" class="pill" id="exportBtn">${T.exportBtn}</button>
        <button type="button" class="pill" id="importBtn">${T.importBtn}</button>
      </div>
    </div>`;

  openSheet(html, (body) => {
    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openTypeEditor(b.dataset.edit)));
    body.querySelector('.months').addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-remove]');
      if (rm) {
        const m = Number(rm.dataset.remove);
        await db.del('photos', m);
        URL.revokeObjectURL(state.photos.get(m));
        state.photos.delete(m);
        renderBackground();
        return openSettings();
      }
      const tile = e.target.closest('[data-month]');
      if (tile) pickPhoto(Number(tile.dataset.month));
    });
    body.querySelector('#shade').addEventListener('input', (e) => {
      state.settings.shade = Number(e.target.value);
      $('bgShade').style.setProperty('--shade', state.settings.shade);
    });
    body.querySelector('#shade').addEventListener('change', saveSettings);
    body.querySelector('#strikeSw').addEventListener('click', (e) => {
      state.settings.strike = !state.settings.strike;
      e.currentTarget.setAttribute('aria-checked', state.settings.strike);
      saveSettings();
      renderAll();
    });
    body.querySelector('#exportBtn').addEventListener('click', exportBackup);
    body.querySelector('#importBtn').addEventListener('click', () => $('importInput').click());
  });
}

const saveSettings = () => db.put('kv', 'settings', state.settings);
const saveTypes = () => db.put('kv', 'types', state.types);

/* Editor de tipo */

function openTypeEditor(id) {
  const existing = id ? typeById(id) : null;
  const draft = existing ? { ...existing } : { id: uid(), name: '', color: PALETTE[6], shape: 'circle', style: 'fill' };

  const previewHTML = () => {
    const saved = { types: state.types, today: state.today, day: state.days.get('2000-01-05') };
    state.types = [draft];
    state.days.set('2000-01-05', { type: draft.id, note: '' });
    state.today = '0000';
    const future = dayCellHTML({ key: '2000-01-05', day: 5, weekday: 2 });
    state.today = '9999';
    const past = dayCellHTML({ key: '2000-01-05', day: 5, weekday: 2 });
    Object.assign(state, { types: saved.types, today: saved.today });
    if (saved.day) state.days.set('2000-01-05', saved.day); else state.days.delete('2000-01-05');
    return future + past;
  };

  const html = head(existing ? T.editType : T.newType, '', true) + `
    <div class="section">
      <label class="label" for="typeName">${T.typeName}</label>
      <input type="text" id="typeName" maxlength="${NAME_MAX}" value="${esc(draft.name)}" placeholder="${esc(T.typeNamePlaceholder)}" autocomplete="off">
      <p class="error" id="typeErr"></p>
    </div>
    <div class="section">
      <span class="label">${T.typeColor}</span>
      <div class="swatches" id="swatches">
        ${PALETTE.map((c) => `<button type="button" class="swatch" data-color="${c}" style="--c:${c}" aria-label="${c}" aria-pressed="${c === draft.color}"></button>`).join('')}
        <label class="swatch custom" aria-label="${T.typeCustomColor}"><input type="color" id="customColor" value="${draft.color.toLowerCase()}"></label>
      </div>
    </div>
    <div class="section">
      <span class="label">${T.typeShape}</span>
      <div class="shapes" id="shapes"></div>
    </div>
    <div class="section">
      <span class="label">${T.typeStyle}</span>
      <div class="segmented" id="styles">
        <button type="button" data-style="fill">${T.styleFill}</button>
        <button type="button" data-style="outline">${T.styleOutline}</button>
      </div>
    </div>
    <div class="section">
      <span class="label">${T.preview}</span>
      <div class="preview" id="preview"></div>
    </div>
    <div class="actions">
      ${existing ? `<button type="button" class="pill pill-danger" id="typeDelete">${T.delete}</button>` : ''}
      <button type="button" class="pill pill-light" id="typeSave">${T.save}</button>
    </div>`;

  openSheet(html, (body) => {
    const update = () => {
      body.querySelector('#shapes').innerHTML = SHAPES.map((s) => `
        <button type="button" class="shape-btn" data-shape="${s}" aria-pressed="${s === draft.shape}">
          ${shapeSVG({ ...draft, shape: s })}${T.shapes[s]}
        </button>`).join('');
      body.querySelectorAll('#swatches [data-color]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.color === draft.color));
      const custom = body.querySelector('.swatch.custom');
      custom.setAttribute('aria-pressed', !PALETTE.includes(draft.color));
      custom.style.setProperty('--c', draft.color);
      body.querySelectorAll('#styles button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.style === draft.style));
      body.querySelector('#preview').innerHTML = previewHTML();
    };
    update();
    body.querySelector('#typeName').addEventListener('input', (e) => { draft.name = e.target.value; });
    body.querySelector('#swatches').addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (b) { draft.color = b.dataset.color; update(); }
    });
    body.querySelector('#customColor').addEventListener('input', (e) => { draft.color = e.target.value.toUpperCase(); update(); });
    body.querySelector('#shapes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-shape]');
      if (b) { draft.shape = b.dataset.shape; update(); }
    });
    body.querySelector('#styles').addEventListener('click', (e) => {
      const b = e.target.closest('[data-style]');
      if (b) { draft.style = b.dataset.style; update(); }
    });
    body.querySelector('[data-back]').addEventListener('click', openSettings);

    body.querySelector('#typeSave').addEventListener('click', async () => {
      const clean = normalizeType(draft);
      if (!clean) { body.querySelector('#typeErr').textContent = T.errName; return; }
      state.types = existing ? state.types.map((t) => (t.id === clean.id ? clean : t)) : [...state.types, clean];
      await saveTypes();
      renderAll();
      openSettings();
    });

    body.querySelector('#typeDelete')?.addEventListener('click', async () => {
      const used = [...state.days].filter(([, v]) => v.type === draft.id);
      if (!(await ask(T.confirmDeleteType(existing.name, used.length), T.delete, true))) return;
      state.types = state.types.filter((t) => t.id !== draft.id);
      if (state.paint === draft.id) state.paint = null;
      await saveTypes();
      for (const [key] of used) await setDay(key, { type: null });
      renderAll();
      openSettings();
    });
  });
}

/* ── Fotos ─────────────────────────────────────────── */

let photoMonth = 0;

function pickPhoto(month) {
  photoMonth = month;
  $('photoInput').value = '';
  $('photoInput').click();
}

/** Reduce la foto a un tamaño razonable para no llenar el almacenamiento. */
async function shrink(file, max = 2200) {
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej()), 'image/jpeg', 0.86));
  } finally {
    URL.revokeObjectURL(src);
  }
}

$('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const blob = await shrink(file);
    await db.put('photos', photoMonth, blob);
    if (state.photos.has(photoMonth)) URL.revokeObjectURL(state.photos.get(photoMonth));
    state.photos.set(photoMonth, URL.createObjectURL(blob));
    db.persist();
    if (photoMonth === state.visible.month) { shownBg = null; renderBackground(); }
    openSettings();
  } catch {
    toast(T.photoError);
  }
});

/* ── Copia de seguridad ────────────────────────────── */

const blobToDataURL = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

async function exportBackup() {
  const photos = {};
  for (const [m, blob] of await db.entries('photos')) photos[m] = await blobToDataURL(blob);
  const data = {
    app: 'dias', version: 1, exportedAt: new Date().toISOString(),
    types: state.types, settings: state.settings,
    days: Object.fromEntries(state.days), drawings: Object.fromEntries(state.drawings), photos,
  };
  const name = T.exportName(todayKey());
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (err) { if (err?.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$('importInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  let parsed;
  try { parsed = parseBackup(JSON.parse(await file.text())); } catch { parsed = null; }
  if (!parsed) return toast(T.importError);
  if (!(await ask(T.confirmImport, T.importBtn))) return;
  const photos = await Promise.all(parsed.photos.map(async ([m, url]) => [m, await (await fetch(url)).blob()]));
  await db.replaceAll({
    kv: [['types', parsed.types], ['settings', parsed.settings],
      ...parsed.drawings.map(([ym, s]) => [DRAW_PREFIX + ym, s])],
    days: parsed.days,
    photos,
  });
  await load();
  shownBg = null;
  renderAll();
  closeSheet();
  toast(T.importOk);
});

/* ── Confirmación (sin confirm() del navegador) ─────── */

function ask(message, okLabel, danger = false) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'ask';
    el.innerHTML = `<div class="ask-box" role="alertdialog" aria-modal="true">
      <p>${esc(message)}</p>
      <div class="actions">
        <button type="button" class="pill" data-no>${esc(T.cancel)}</button>
        <button type="button" class="pill ${danger ? 'pill-danger' : 'pill-light'}" data-yes>${esc(okLabel)}</button>
      </div></div>`;
    const done = (v) => { el.remove(); resolve(v); };
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-yes]')) done(true);
      else if (e.target.closest('[data-no]') || e.target === el) done(false);
    });
    document.body.append(el);
    el.querySelector('[data-yes]').focus();
  });
}

/* ── Aviso ─────────────────────────────────────────── */

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ── Eventos ───────────────────────────────────────── */

function bindEvents() {
  $('todayBtn').addEventListener('click', goToday);
  $('viewBtn').addEventListener('click', toggleView);
  $('settingsBtn').addEventListener('click', openSettings);
  $('editBtn').addEventListener('click', openEditor);
  $('scrim').addEventListener('click', closeSheet);

  $('markBtn').addEventListener('click', () => {
    state.marking = !state.marking;
    if (!state.marking) state.paint = null;
    renderLegend();
  });

  $('legend').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.action === 'types') return openSettings();
    state.paint = state.paint === b.dataset.type ? null : b.dataset.type;
    renderLegend();
  });

  const onDayClick = async (e) => {
    const cell = e.target.closest('[data-key]');
    if (!cell) return;
    const key = cell.dataset.key;
    if (state.marking && state.paint) {
      const current = state.days.get(key)?.type;
      await setDay(key, { type: current === state.paint ? null : state.paint });
      refreshCell(key, true);
    } else {
      openDay(key);
    }
  };
  $('scroller').addEventListener('click', onDayClick);
  $('monthView').addEventListener('click', onDayClick);

  // Vista mes a mes: deslizar a los lados para cambiar de mes
  let sx = 0, sy = 0, tracking = false;
  const mv = $('monthView');
  mv.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = e.touches.length === 1;
  }, { passive: true });
  mv.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) goMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  let ticking = false;
  $('scroller').addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateVisible();
      extendIfNeeded();
    });
  }, { passive: true });

  // Arrastrar la hoja hacia abajo para cerrarla
  let gy = null;
  const sheet = $('sheet');
  sheet.addEventListener('touchstart', (e) => {
    const body = $('sheetBody');
    gy = body.scrollTop <= 0 || e.target.closest('.grabber') ? e.touches[0].clientY : null;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (gy === null) return;
    const dy = e.touches[0].clientY - gy;
    if (dy > 0) { sheet.style.transition = 'none'; sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (gy === null) return;
    const dy = e.changedTouches[0].clientY - gy;
    gy = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 110) closeSheet();
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
    if (isScroll() || !$('sheetWrap').hidden || !$('editor').hidden || e.target.matches('input, textarea')) return;
    if (e.key === 'ArrowLeft') goMonth(-1);
    if (e.key === 'ArrowRight') goMonth(1);
  });

  // Al volver a la app (p. ej. al día siguiente) se actualiza la cruz de los días pasados
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && todayKey() !== state.today) renderAll();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { paintInks($('monthView')); paintInks($('edStage')); placeInks(); }, 150);
  });

  bindEditor();
}

/* ── Arranque ──────────────────────────────────────── */

function staticTexts() {
  document.title = T.appName;
  const wd = T.weekdaysShort.map((d) => `<span>${d}</span>`).join('');
  $('weekdays').innerHTML = wd;
  $('edWeekdays').innerHTML = wd;
  $('settingsBtn').setAttribute('aria-label', T.settings);
  $('editBtn').setAttribute('aria-label', T.edit);
  $('edUndo').setAttribute('aria-label', T.undo);
  $('edClear').setAttribute('aria-label', T.clearDrawing);
  $('edPrev').setAttribute('aria-label', T.prev);
  $('edNext').setAttribute('aria-label', T.next);
  $('todayBtn').textContent = T.today;
  $('edDone').textContent = T.done;
}

function registerSW() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!('serviceWorker' in navigator) || (local && !location.search.includes('sw=1'))) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

staticTexts();
bindEvents();
await load();
renderAll();
registerSW();
