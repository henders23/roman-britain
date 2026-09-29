// Pin artwork is drawn once into canvases at startup so the map can render every
// pin in WebGL; no icon font or sprite sheet to download.

export type Theme = 'dark' | 'light';

/** Pin fill and glyph ink for each theme. One accent: the pack, not colour, carries the meaning. */
export const PIN_COLORS: Record<Theme, { fill: string; ink: string; ring: string; plate: string }> = {
  dark: { fill: '#f2b544', ink: '#17120b', ring: 'rgba(20,16,10,0.9)', plate: 'rgba(12,14,20,0.78)' },
  light: { fill: '#9c3b1f', ink: '#fbf3e4', ring: 'rgba(255,250,240,0.95)', plate: 'rgba(251,246,236,0.9)' },
};

type Glyph = (c: CanvasRenderingContext2D) => void;

const line = (c: CanvasRenderingContext2D, pts: number[][]) => {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
  c.stroke();
};

const poly = (c: CanvasRenderingContext2D, pts: number[][]) => {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
  c.closePath();
  c.fill();
};

// Glyphs are drawn in a 24×24 box centred on (12,12). A dataset kind uses the glyph
// named by its `icon` in dataset.json, or the glyph with the same name as its id, or a dot.
export const GLYPHS: Record<string, Glyph> = {
  dot: (c) => {
    c.beginPath();
    c.arc(12, 12, 4.2, 0, Math.PI * 2);
    c.fill();
  },
  town: (c) => {
    // three roofs of different heights
    poly(c, [[3.5, 19], [3.5, 12], [7, 8.5], [10.5, 12], [10.5, 19]]);
    poly(c, [[9.5, 19], [9.5, 9], [13, 5], [16.5, 9], [16.5, 19]]);
    poly(c, [[15.5, 19], [15.5, 13], [18, 10.5], [20.5, 13], [20.5, 19]]);
  },
  settlement: (c) => {
    // a single roundhouse-like hut
    poly(c, [[4, 13], [12, 5], [20, 13]]);
    c.fillRect(6.5, 13, 11, 6.5);
  },
  villa: (c) => {
    // pediment on columns
    poly(c, [[4, 9.5], [12, 4.5], [20, 9.5]]);
    for (const x of [5.5, 9.5, 13.5, 17.5]) c.fillRect(x - 0.6, 10.5, 2.2, 7);
    c.fillRect(4, 18, 16, 2);
  },
  fort: (c) => {
    // crenellated wall
    poly(c, [[5, 19], [5, 7], [7.4, 7], [7.4, 9.4], [9.8, 9.4], [9.8, 7], [14.2, 7], [14.2, 9.4], [16.6, 9.4], [16.6, 7], [19, 7], [19, 19]]);
  },
  religious: (c) => {
    // arched doorway under a small cross
    c.fillRect(11, 3, 2, 6);
    c.fillRect(9, 4.8, 6, 1.8);
    c.beginPath();
    c.moveTo(6, 20); c.lineTo(6, 14); c.arc(12, 14, 6, Math.PI, 0); c.lineTo(18, 20); c.closePath();
    c.fill();
  },
  burial: (c) => {
    // a mound on the ground line
    c.beginPath();
    c.moveTo(3.5, 17); c.bezierCurveTo(6, 8, 18, 8, 20.5, 17); c.closePath();
    c.fill();
    c.fillRect(3, 18, 18, 2);
  },
  hoard: (c) => {
    // a coin with a rim
    c.lineWidth = 2.2;
    c.beginPath();
    c.arc(12, 12, 7.2, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(12, 12, 3.6, 0, Math.PI * 2);
    c.fill();
  },
  text: (c) => {
    // a writing tablet with lines
    c.lineWidth = 2;
    c.strokeRect(5, 5, 14, 14);
    c.lineWidth = 1.6;
    line(c, [[8, 9.5], [16, 9.5]]);
    line(c, [[8, 12.5], [16, 12.5]]);
    line(c, [[8, 15.5], [13.5, 15.5]]);
  },
  political: (c) => {
    // a crown
    poly(c, [[5, 17], [5, 8], [8.5, 12], [12, 6], [15.5, 12], [19, 8], [19, 17]]);
    c.fillRect(5, 18, 14, 2);
  },
  battle: (c) => {
    line(c, [[6, 6], [18, 18]]);
    line(c, [[18, 6], [6, 18]]);
  },
  treaty: (c) => {
    c.beginPath();
    c.arc(9.5, 12, 4.5, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(14.5, 12, 4.5, 0, Math.PI * 2);
    c.stroke();
  },
  death: (c) => {
    c.fillRect(10.8, 4, 2.4, 16);
    c.fillRect(6.5, 8, 11, 2.4);
  },
  naval: (c) => {
    poly(c, [[4.5, 14.5], [19.5, 14.5], [17, 19], [7, 19]]);
    poly(c, [[12, 4], [12, 13], [6.5, 13]]);
    c.fillRect(12, 4, 1.3, 10);
  },
  flag: (c) => {
    c.fillRect(7, 4, 1.8, 16);
    poly(c, [[8.8, 5], [18.5, 7.5], [8.8, 11.5]]);
  },
};

export function glyphFor(kind: string, icon?: string): string {
  if (icon && GLYPHS[icon]) return icon;
  return GLYPHS[kind] ? kind : 'dot';
}

const SIZE = 64;

/** A pin: solid badge for a located event, dashed ring for an area-only event. */
export function drawPin(glyph: string, area: boolean, theme: Theme): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext('2d')!;
  const col = PIN_COLORS[theme];
  const r = SIZE / 2 - 5;
  c.save();
  c.translate(SIZE / 2, SIZE / 2);
  c.shadowColor = theme === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(60,40,20,0.35)';
  c.shadowBlur = 6;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  if (area) {
    c.fillStyle = col.plate;
    c.fill();
    c.shadowBlur = 0;
    c.setLineDash([5, 4]);
    c.lineWidth = 3;
    c.strokeStyle = col.fill;
    c.stroke();
  } else {
    c.fillStyle = col.fill;
    c.fill();
    c.shadowBlur = 0;
    c.lineWidth = 2.5;
    c.strokeStyle = col.ring;
    c.stroke();
  }
  c.restore();
  c.save();
  const s = (r * 1.25) / 24;
  c.translate(SIZE / 2 - 12 * s, SIZE / 2 - 12 * s);
  c.scale(s, s);
  const ink = area ? col.fill : col.ink;
  c.fillStyle = ink;
  c.strokeStyle = ink;
  c.lineWidth = 2.4;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  (GLYPHS[glyph] ?? GLYPHS.dot)(c);
  c.restore();
  return c.getImageData(0, 0, SIZE, SIZE);
}

/** Small glyph for HTML (legend, lists), returned as a data URL. */
export function pinDataUrl(glyph: string, area: boolean, theme: Theme): string {
  const img = drawPin(glyph, area, theme);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

export function hatch(color: string, gap: number, width: number): ImageData {
  const n = 16;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const c = canvas.getContext('2d')!;
  c.strokeStyle = color;
  c.lineWidth = width;
  for (let o = -n; o <= n * 2; o += gap) {
    c.beginPath();
    c.moveTo(o, 0);
    c.lineTo(o - n, n);
    c.stroke();
  }
  return c.getImageData(0, 0, n, n);
}
