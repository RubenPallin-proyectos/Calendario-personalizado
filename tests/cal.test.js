import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, parseKey, isPast, shiftMonth, monthStats, textOn, normalizeType, normalizeDay, parseBackup, normalizeStrokes, monthKeyOf } from '../js/cal.js';

test('la rejilla empieza en lunes y tiene semanas completas', () => {
  const g = monthGrid(2026, 10); // noviembre 2026 empieza en domingo
  assert.equal(g.length % 7, 0);
  assert.equal(g.slice(0, 6).every((c) => c === null), true);
  assert.deepEqual(g[6], { key: '2026-11-01', day: 1, weekday: 6 });
  assert.equal(g.filter(Boolean).length, 30);
});

test('claves de fecha y días pasados', () => {
  assert.equal(parseKey('2026-02-30'), null);
  assert.equal(parseKey('2026-02-28').getDate(), 28);
  assert.equal(isPast('2026-11-25', '2026-11-26'), true);
  assert.equal(isPast('2026-11-26', '2026-11-26'), false);
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
});

test('resumen del mes por tipo', () => {
  const days = new Map([
    ['2026-11-02', { type: 'work', note: '' }],
    ['2026-11-03', { type: 'work', note: 'x' }],
    ['2026-11-04', { type: null, note: 'solo nota' }],
    ['2026-12-01', { type: 'work', note: '' }],
  ]);
  assert.deepEqual(monthStats(days, 2026, 10), { work: 2 });
});

test('contraste del texto', () => {
  assert.equal(textOn('#FFFFFF'), 'dark');
  assert.equal(textOn('#FFC145'), 'dark');
  assert.equal(textOn('#5B8CFF'), 'light');
});

test('validación de tipos y días', () => {
  const ok = { id: 'a', name: '  Guardia  ', color: '#ff0000', shape: 'star', style: 'outline' };
  assert.deepEqual(normalizeType(ok), { id: 'a', name: 'Guardia', color: '#FF0000', shape: 'star', style: 'outline' });
  assert.equal(normalizeType({ ...ok, name: '' }), null);
  assert.equal(normalizeType({ ...ok, shape: 'hexagono' }), null);
  assert.equal(normalizeType({ ...ok, color: 'red' }), null);
  const ids = new Set(['a']);
  assert.equal(normalizeDay({ type: null, note: '  ' }, ids), null);
  assert.deepEqual(normalizeDay({ type: 'zzz', note: 'hola' }, ids), { type: null, note: 'hola' });
});

test('importar copia', () => {
  assert.equal(parseBackup({ app: 'otra' }), null);
  const b = parseBackup({
    app: 'dias',
    types: [{ id: 'a', name: 'A', color: '#000000', shape: 'dot', style: 'fill' }, { id: 'mal' }],
    days: { '2026-11-01': { type: 'a', note: '' }, 'basura': { note: 'x' } },
    photos: { 3: 'data:image/jpeg;base64,AAAA', 15: 'data:image/jpeg;base64,AAAA', 4: 'http://x' },
    settings: { strike: false, shade: 5 },
  });
  assert.equal(b.types.length, 1);
  assert.deepEqual(b.days, [['2026-11-01', { type: 'a', note: '' }]]);
  assert.deepEqual(b.photos.map(([m]) => m), [3]);
  assert.deepEqual(b.settings, { strike: false, shade: 0.8, view: 'scroll' });
});

test('trazos a mano', () => {
  assert.equal(monthKeyOf(2026, 10), '2026-11');
  const ok = { color: '#FF0000', width: 0.01, points: [[0.1, 0.2], [0.3, 0.4]] };
  const goma = { erase: true, width: 0.03, points: [[0.5, 0.5]] };
  assert.deepEqual(normalizeStrokes([ok, goma, { color: 'x', width: 0.01, points: [[0, 0]] }, { color: '#FFFFFF', width: 0.01, points: [] }]),
    [{ ...ok, erase: false }, { ...goma, color: null }]);
  const b = parseBackup({ app: 'dias', types: [], drawings: { '2026-11': [ok], 'mal': [ok] } });
  assert.deepEqual(b.drawings, [['2026-11', [{ ...ok, erase: false }]]]);
});
