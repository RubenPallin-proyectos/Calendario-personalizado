// SVG de cada forma de marca, en una caja de 40×40.

function starPoints(cx, cy, outer, inner, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI / n) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

const STAR = starPoints(20, 21.5, 19, 8.6);

const GEOMETRY = {
  circle: '<circle cx="20" cy="20" r="16.5"/>',
  square: '<rect x="4.5" y="4.5" width="31" height="31" rx="9"/>',
  diamond: '<path d="M20 2.5 L37.5 20 L20 37.5 L2.5 20 Z"/>',
  star: `<polygon points="${STAR}"/>`,
  triangle: '<path d="M20 4 L37 34.5 L3 34.5 Z"/>',
  heart: '<path d="M20 35.5C20 35.5 3 25.5 3 14.2 3 8.3 7.6 4.5 12.6 4.5 16.1 4.5 18.8 6.4 20 9 21.2 6.4 23.9 4.5 27.4 4.5 32.4 4.5 37 8.3 37 14.2 37 25.5 20 35.5 20 35.5Z"/>',
  underline: '<rect x="9" y="32" width="22" height="4.5" rx="2.25"/>',
  dot: '<circle cx="20" cy="34.5" r="3.6"/>',
};

/** Formas que se dibujan detrás del número (las otras van debajo y no cambian el color del texto). */
export const isBackdrop = (shape) => shape !== 'underline' && shape !== 'dot';

export function shapeSVG({ shape, color, style }, cls = '') {
  const solid = style === 'fill' || !isBackdrop(shape);
  const paint = solid
    ? `fill="${color}"`
    : `fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"`;
  return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true"><g ${paint}>${GEOMETRY[shape]}</g></svg>`;
}

export const CROSS_SVG = '<svg class="cross" viewBox="0 0 40 40" aria-hidden="true"><path d="M10 10.5 Q 20 19 30 30"/><path d="M30 10 Q 21 20.5 10.5 30"/></svg>';
