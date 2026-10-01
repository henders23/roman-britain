import type { AtlasEvent } from './dataset';
import { parseDate } from './time';

// The interlude shown between two journey stops: how much time passes and how far the
// story moves. Phrased from the pack's own dates and coordinates, and no more precise
// than they are.

const imprecise = (e: AtlasEvent) => e.datePrecision === 'circa' || e.datePrecision === 'range';

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : `${n} ${many}`;
}

export function timeGap(a: AtlasEvent, b: AtlasEvent): string {
  // Two date windows that overlap cannot be put in order.
  if (a.windowed && b.windowed && a.t0 <= b.t1 && b.t0 <= a.t1 && a.t0 !== b.t0) return 'Around the same time';
  const pa = parseDate(a.start);
  const pb = parseDate(b.start);
  if (pa.d && pb.d && pa.m && pb.m) {
    const days = Math.round((Date.UTC(2000 + (pb.y - pa.y), pb.m - 1, pb.d) - Date.UTC(2000, pa.m - 1, pa.d)) / 86400000);
    if (days === 0) return 'The same day';
    if (days === 1) return 'The next day';
    if (days > 0 && days < 14) return `${days} days later`;
    if (days >= 14 && days < 60) return `${Math.round(days / 7)} weeks later`;
  }
  const dy = pb.y - pa.y;
  const about = imprecise(a) || imprecise(b) ? 'About ' : '';
  if (dy === 0) {
    if (pa.m && pb.m) return pb.m === pa.m ? 'The same month' : pb.m < pa.m ? 'Earlier the same year' : plural(pb.m - pa.m, 'The next month', 'months later');
    return about ? 'Around the same time' : 'The same year';
  }
  if (dy < 0) return `${about}${plural(-dy, 'a year', 'years')} earlier`.replace(/^a/, 'A');
  if (dy === 1) return about ? 'About a year later' : 'The following year';
  const n = dy < 20 ? dy : dy < 100 ? Math.round(dy / 5) * 5 : Math.round(dy / 10) * 10;
  return `${about}${n} years later`;
}

/** Kilometres between two events, as the crow flies. */
export function kmBetween(a: AtlasEvent, b: AtlasEvent) {
  const r = Math.PI / 180;
  const φ1 = a.lat * r, φ2 = b.lat * r, dλ = (b.lon - a.lon) * r;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2));
}

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export function placeGap(a: AtlasEvent, b: AtlasEvent): string {
  const r = Math.PI / 180;
  const φ1 = a.lat * r, φ2 = b.lat * r, dλ = (b.lon - a.lon) * r;
  const km = 2 * 6371 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2));
  if (km < 3) return 'at the same place';
  const bearing = (Math.atan2(Math.sin(dλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)) / r + 360) % 360;
  const dist = km < 20 ? Math.round(km) : km < 100 ? Math.round(km / 5) * 5 : Math.round(km / 10) * 10;
  // Regions have no single point, so their distances are only rough.
  const rough = a.geometry === 'area' || b.geometry === 'area' ? 'about ' : '';
  return `${rough}${dist} km ${DIRS[Math.round(bearing / 45) % 8]}`;
}
