// Lógica pura del calendario (sin DOM ni IndexedDB). Fechas siempre en hora local.

export const SHAPES = ['circle', 'square', 'diamond', 'star', 'triangle', 'heart', 'underline', 'dot'];
export const STYLES = ['fill', 'outline'];
export const PALETTE = ['#FF6B6B', '#FF8A4C', '#FFC145', '#B8E05A', '#4CD7A0', '#3CC7E6',
  '#5B8CFF', '#9B7BFF', '#E26BFF', '#FF6FB5', '#FFFFFF'];
export const NOTE_MAX = 500;
export const NAME_MAX = 24;

const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const monthKeyOf = (y, m) => `${y}-${pad(m + 1)}`;
export const todayKey = (now = new Date()) => keyOf(now.getFullYear(), now.getMonth(), now.getDate());

/** Fecha local a medianoche, o null si la clave no es válida. */
export function parseKey(key) {
  const m = typeof key === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
}

/** Celdas del mes (lunes a domingo), con null en los huecos; siempre semanas completas. */
export function monthGrid(year, month) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const cells = Array(lead).fill(null);
  for (let day = 1; day <= total; day++) {
    cells.push({ key: keyOf(year, month, day), day, weekday: (lead + day - 1) % 7 });
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

export const isPast = (key, today) => key < today;

export function shiftMonth(year, month, delta) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Cuántos días de cada tipo hay en el mes: { typeId: n }. */
export function monthStats(days, year, month) {
  const prefix = `${year}-${pad(month + 1)}-`;
  const out = {};
  for (const [key, v] of days) {
    if (key.startsWith(prefix) && v?.type) out[v.type] = (out[v.type] ?? 0) + 1;
  }
  return out;
}

/** Color de texto legible sobre un fondo `hex`. */
export function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? 'dark' : 'light';
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Valida un tipo de marca; devuelve el tipo limpio o null. */
export function normalizeType(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || [...name].length > NAME_MAX) return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (!HEX.test(raw.color ?? '')) return null;
  if (!SHAPES.includes(raw.shape) || !STYLES.includes(raw.style)) return null;
  return { id: raw.id, name, color: raw.color.toUpperCase(), shape: raw.shape, style: raw.style };
}

/** Limpia los datos de un día; null si queda vacío. */
export function normalizeDay(raw, typeIds) {
  if (!raw || typeof raw !== 'object') return null;
  const type = typeof raw.type === 'string' && typeIds.has(raw.type) ? raw.type : null;
  const note = typeof raw.note === 'string' ? raw.note.slice(0, NOTE_MAX).trim() : '';
  if (!type && !note) return null;
  return { type, note };
}

const num01 = (n) => typeof n === 'number' && Number.isFinite(n) && n >= -0.1 && n <= 1.1;

/** Limpia los trazos dibujados a mano de un mes. Coordenadas y grosor relativos (0-1). */
export function normalizeStrokes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s === 'object'
    && (s.erase === true || HEX.test(s.color ?? ''))
    && num01(s.width) && s.width > 0
    && Array.isArray(s.points) && s.points.length > 0
    && s.points.every((p) => Array.isArray(p) && p.length === 2 && num01(p[0]) && num01(p[1])))
    .map((s) => ({ color: s.erase ? null : s.color, erase: s.erase === true, width: s.width, points: s.points }));
}

/** Valida una copia importada. Devuelve { types, days, settings, photos, drawings } o null. */
export function parseBackup(obj) {
  if (!obj || obj.app !== 'dias' || !Array.isArray(obj.types)) return null;
  const types = obj.types.map(normalizeType).filter(Boolean);
  const ids = new Set(types.map((t) => t.id));
  const days = [];
  for (const [key, v] of Object.entries(obj.days ?? {})) {
    const d = parseKey(key) && normalizeDay(v, ids);
    if (d) days.push([key, d]);
  }
  const photos = [];
  for (const [m, url] of Object.entries(obj.photos ?? {})) {
    const month = Number(m);
    if (Number.isInteger(month) && month >= 0 && month < 12
      && typeof url === 'string' && url.startsWith('data:image/')) photos.push([month, url]);
  }
  const s = obj.settings ?? {};
  const settings = {
    strike: s.strike !== false,
    shade: typeof s.shade === 'number' ? Math.min(0.8, Math.max(0, s.shade)) : 0.45,
    view: s.view === 'month' ? 'month' : 'scroll',
  };
  const drawings = [];
  for (const [ym, strokes] of Object.entries(obj.drawings ?? {})) {
    const clean = /^\d{4}-\d{2}$/.test(ym) ? normalizeStrokes(strokes) : [];
    if (clean.length) drawings.push([ym, clean]);
  }
  return { types, days, settings, photos, drawings };
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
