import type { AtlasEvent } from './dataset';
import { parseDate } from './time';

// The interlude shown between two journey stops: how much time passes and how far the
// story moves. Phrased from the pack's own dates and coordinates, and no more precise
// than they are.

const imprecise = (e: AtlasEvent) => e.datePrecision === 'circa' || e.datePrecision === 'range';

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : `${n} ${many}`;
}

/** How much time passes between two stops: "About 80 years later". */
export function timeGap(a: AtlasEvent, b: AtlasEvent): string {
  return gap(a, b, false);
}

/** The same gap, phrased to lead into the earlier stop's title: "About 80 years after". */
export function timeLink(a: AtlasEvent, b: AtlasEvent): string {
  return gap(a, b, true);
}

function gap(a: AtlasEvent, b: AtlasEvent, link: boolean): string {
  // Each phrase comes in two forms: standing alone, and leading into the earlier stop's title.
  const w = (later: string, after: string) => (link ? after : later);
  // Two date windows that overlap cannot be put in order.
  if (a.windowed && b.windowed && a.t0 <= b.t1 && b.t0 <= a.t1 && a.t0 !== b.t0) return w('Around the same time', 'Around the same time as');
  const pa = parseDate(a.start);
  const pb = parseDate(b.start);
  if (pa.d && pb.d && pa.m && pb.m) {
    const days = Math.round((Date.UTC(2000 + (pb.y - pa.y), pb.m - 1, pb.d) - Date.UTC(2000, pa.m - 1, pa.d)) / 86400000);
    if (days === 0) return w('The same day', 'The same day as');
    if (days === 1) return w('The next day', 'The day after');
    if (days > 0 && days < 14) return w(`${days} days later`, `${days} days after`);
    if (days >= 14 && days < 60) return w(`${Math.round(days / 7)} weeks later`, `${Math.round(days / 7)} weeks after`);
  }
  const dy = pb.y - pa.y;
  const about = imprecise(a) || imprecise(b) ? 'About ' : '';
  if (dy === 0) {
    if (pa.m && pb.m) {
      if (pb.m === pa.m) return w('The same month', 'The same month as');
      if (pb.m < pa.m) return w('Earlier the same year', 'Earlier in the same year as');
      return pb.m - pa.m === 1 ? w('The next month', 'The month after') : w(`${pb.m - pa.m} months later`, `${pb.m - pa.m} months after`);
    }
    return about ? w('Around the same time', 'Around the same time as') : w('The same year', 'The same year as');
  }
  if (dy < 0) return `${about}${plural(-dy, 'a year', 'years')} ${w('earlier', 'before')}`.replace(/^a/, 'A');
  if (dy === 1) return about ? w('About a year later', 'About a year after') : w('The following year', 'The year after');
  const n = dy < 20 ? dy : dy < 100 ? Math.round(dy / 5) * 5 : Math.round(dy / 10) * 10;
  return `${about}${n} years ${w('later', 'after')}`;
}

/** Kilometres between two events, as the crow flies. */
export function kmBetween(a: AtlasEvent, b: AtlasEvent) {
  const r = Math.PI / 180;
  const φ1 = a.lat * r, φ2 = b.lat * r, dλ = (b.lon - a.lon) * r;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2));
}

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

function placeParts(a: AtlasEvent, b: AtlasEvent) {
  const r = Math.PI / 180;
  const φ1 = a.lat * r, φ2 = b.lat * r, dλ = (b.lon - a.lon) * r;
  const km = kmBetween(a, b);
  const bearing = (Math.atan2(Math.sin(dλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)) / r + 360) % 360;
  const dist = km < 20 ? Math.round(km) : km < 100 ? Math.round(km / 5) * 5 : Math.round(km / 10) * 10;
  // Regions have no single point, so their distances are only rough.
  const rough = a.geometry === 'area' || b.geometry === 'area' ? 'about ' : '';
  return { same: km < 3, rough, dist, dir: DIRS[Math.round(bearing / 45) % 8] };
}

/** How far the story moves between two stops: "120 km north-west". */
export function placeGap(a: AtlasEvent, b: AtlasEvent): string {
  const p = placeParts(a, b);
  return p.same ? 'at the same place' : `${p.rough}${p.dist} km ${p.dir}`;
}

/** The same move as the end of a sentence: "120 km to the north-west". */
export function placeLink(a: AtlasEvent, b: AtlasEvent): string {
  const p = placeParts(a, b);
  return p.same ? 'in the same place' : `${p.rough}${p.dist} km to the ${p.dir}`;
}
