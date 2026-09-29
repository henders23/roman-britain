// Time in the atlas is a decimal year: 410.5 is the middle of AD 410. Years are
// written with one to four digits ("43", "410", "1066"); negative years are BC
// ("-55" is 55 BC). There is no year 0, but the timeline does not need one.

const DATE = /^(-?\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export function parseDate(s: string): { y: number; m?: number; d?: number } {
  const hit = DATE.exec(s.trim());
  if (!hit) throw new Error(`Bad date "${s}"`);
  return { y: Number(hit[1]), m: hit[2] ? Number(hit[2]) : undefined, d: hit[3] ? Number(hit[3]) : undefined };
}

export function toYear(s: string): number {
  const { y, m = 1, d = 1 } = parseDate(s);
  return y + (m - 1) / 12 + (d - 1) / 365;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function yearOf(t: number) {
  return Math.floor(t);
}

export function monthOf(t: number) {
  return Math.min(11, Math.floor((t - Math.floor(t)) * 12));
}

/** "55 BC", "AD 43", "AD 999", "1066": AD is written before 1000 and dropped from 1000 on. */
export function formatYear(y: number): string {
  if (y < 0) return `${-y} BC`;
  if (y < 1000) return `AD ${y}`;
  return String(y);
}

/** A year without its era, for the second half of a range that shares the first half's era. */
function bareYear(y: number) {
  return String(Math.abs(y));
}

/** The playhead as the clock shows it. Months only mean something on short timelines. */
export function formatClock(t: number, withMonth: boolean) {
  const y = yearOf(t);
  return {
    era: y < 0 ? 'BC' : y < 1000 ? 'AD' : '',
    year: bareYear(y),
    month: withMonth ? MONTHS_LONG[monthOf(t)] : '',
    label: `${withMonth ? MONTHS_LONG[monthOf(t)] + ' ' : ''}${formatYear(y)}`,
  };
}

function seasonOf(m: number) {
  return m <= 2 || m === 12 ? 'Winter' : m <= 5 ? 'Spring' : m <= 8 ? 'Summer' : 'Autumn';
}

/** One written date, honest about its precision: "AD 122", "c. AD 410", "August AD 410". */
export function formatDate(s: string, precision: string): string {
  const { y, m, d } = parseDate(s);
  const Y = formatYear(y);
  if (precision === 'circa') return `c. ${Y}`;
  if (precision === 'year' || precision === 'range' || !m) return Y;
  if (precision === 'season') return `${seasonOf(m)} ${Y}`;
  if (precision === 'month' || !d) return `${MONTHS_LONG[m - 1]} ${Y}`;
  return `${d} ${MONTHS[m - 1]} ${Y}`;
}

/** Era-aware pair of years: "AD 610 and 640", "55 BC and AD 10", "60 and 55 BC", "AD 950 and 1010". */
function yearPair(a: number, b: number, joiner: string) {
  if (a < 0 && b < 0) return `${bareYear(a)}${joiner}${formatYear(b)}`;
  if (a >= 0 && b >= 0 && a < 1000) return `${formatYear(a)}${joiner}${bareYear(b)}`;
  return `${formatYear(a)}${joiner}${formatYear(b)}`;
}

/**
 * The date line for an event. A 'range' is a window the event happened somewhere
 * inside ("between AD 610 and 640"); an end date on any other precision means the
 * event lasted ("AD 122 – 128").
 */
export function formatRange(start: string, end: string | undefined, precision: string): string {
  if (precision === 'range' && end) {
    const a = parseDate(start).y;
    const b = parseDate(end).y;
    if (a === b) return `at some point in ${formatYear(a)}`;
    return `between ${yearPair(a, b, ' and ')}`;
  }
  const a = formatDate(start, precision);
  if (!end) return a;
  const b = formatDate(end, precision);
  if (a === b) return a;
  const pa = parseDate(start);
  const pb = parseDate(end);
  if (!pa.m && !pb.m) return (precision === 'circa' ? 'c. ' : '') + yearPair(pa.y, pb.y, ' – ');
  return `${a} – ${b}`;
}

/** Short date for lists and tooltips. */
export function formatShort(start: string, end: string | undefined, precision: string): string {
  if (precision === 'range' && end) {
    const a = parseDate(start).y;
    const b = parseDate(end).y;
    return a === b ? formatYear(a) : yearPair(a, b, '–');
  }
  return formatDate(start, precision);
}
