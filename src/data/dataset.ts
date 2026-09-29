import { DATASETS, DEFAULT_DATASET } from 'virtual:atlas-datasets';
import type { DatasetConfig, DatasetModule, EventData, Kind, PackNote, Phase, Polity, Status, TerritoryData } from './schema';
import { parseDate, toYear } from './time';

export interface AtlasEvent extends EventData {
  /** decimal years: when the event (or its window) starts and ends */
  t0: number;
  t1: number;
  /** true for a 'range' date: the event happened somewhere inside t0–t1 */
  windowed: boolean;
  /** relative pin size, 0–1, from magnitude or importance */
  size: number;
  index: number;
}

export interface Step {
  t: number;
  polity: string;
  status: Status;
}

export interface Territory {
  note: string;
  focusLabel: string;
  polities: Map<string, Polity>;
  timelines: Map<string, Step[]>;
  regionsUrl: string;
  bordersUrl: string;
}

export interface Atlas {
  slug: string;
  title: string;
  subtitle: string;
  from: number;
  to: number;
  /** years of timeline that stand in for one "beat" of animation; see TIME_SCALE */
  unit: number;
  config: DatasetConfig;
  draft: boolean;
  pack: DatasetModule['pack'];
  events: AtlasEvent[];
  phases: Phase[];
  kinds: Map<string, Kind>;
  territory: Territory | null;
  merged: PackNote[];
  excluded: PackNote[];
}

// The engine's animation constants were tuned on an 88-year timeline. Every duration
// is scaled by unit = span / TIME_SCALE so a thousand-year dataset plays just as well.
const TIME_SCALE = 88;

// How long an event reads as "happening now" when the source gives no end date, in years.
const SPAN: Record<string, number> = { day: 1 / 24, month: 1 / 12, season: 0.25, year: 1, circa: 1, range: 1 };
function endGrain(s: string) {
  const { m, d } = parseDate(s);
  return d ? 'day' : m ? 'month' : 'year';
}

const IMPORTANCE_SIZE: Record<number, number> = { 1: 1, 2: 0.62, 3: 0.32 };

function buildEvents(data: DatasetModule, unit: number): AtlasEvent[] {
  const mags = data.events.map((e) => e.magnitude ?? 0);
  const maxMag = Math.max(0, ...mags);
  const byMagnitude = !!data.config.magnitudeLabel && maxMag > 0;
  return data.events
    .map((e) => {
      const t0 = toYear(e.start);
      const windowed = e.datePrecision === 'range' && !!e.end;
      // An end date runs to the end of the day, month or year it names: a window ending
      // in 640 includes all of 640.
      const t1 = e.end ? toYear(e.end) + SPAN[endGrain(e.end)] : t0 + SPAN[e.datePrecision];
      // Point events stay "active" long enough to be seen at playback speed.
      const minActive = windowed ? 0 : 0.35 * unit;
      const size = byMagnitude ? 0.25 + 0.75 * Math.sqrt(Math.max(0, e.magnitude ?? 0) / maxMag) : IMPORTANCE_SIZE[e.importance] ?? 0.5;
      return { ...e, t0, t1: Math.max(t1, t0 + minActive, t0 + 1 / 24), windowed, size, index: 0 };
    })
    .sort((a, b) => a.t0 - b.t0 || a.importance - b.importance)
    .map((e, index) => ({ ...e, index }));
}

function buildTerritory(t: TerritoryData | null): Territory | null {
  if (!t) return null;
  const timelines = new Map<string, Step[]>();
  for (const [region, steps] of Object.entries(t.regions))
    timelines.set(region, steps.map(([d, polity, status]) => ({ t: toYear(d), polity, status: status ?? 'core' })));
  return {
    note: t.note,
    focusLabel: t.focusLabel ?? '',
    polities: new Map(t.polities.map((p) => [p.id, p])),
    timelines,
    regionsUrl: t.regionsUrl,
    bordersUrl: t.bordersUrl,
  };
}

export function buildAtlas(data: DatasetModule): Atlas {
  const c = data.config;
  const unit = (c.timeRange.to - c.timeRange.from) / TIME_SCALE;
  return {
    slug: c.slug,
    title: c.title,
    subtitle: c.subtitle ?? '',
    from: c.timeRange.from,
    to: c.timeRange.to,
    unit,
    config: c,
    draft: data.mode === 'draft',
    pack: data.pack,
    events: buildEvents(data, unit),
    phases: c.phases,
    kinds: new Map(c.kinds.map((k) => [k.id, k])),
    territory: buildTerritory(data.territory),
    merged: data.pack.merged,
    excluded: data.pack.excluded,
  };
}

export const DATASET_LIST = Object.values(DATASETS);

/** The dataset named by ?d=<slug>, or the default. */
export async function loadAtlas(): Promise<Atlas> {
  const want = new URLSearchParams(location.search).get('d');
  const slug = want && DATASETS[want] ? want : DEFAULT_DATASET;
  if (want && !DATASETS[want]) console.warn(`No dataset "${want}"; showing "${slug}".`);
  if (!slug) throw new Error('No datasets found in datasets/.');
  const mod = await DATASETS[slug].load();
  return buildAtlas(mod.default as DatasetModule);
}

export function stepAt(steps: Step[], t: number): { step: Step; prev?: Step } {
  let i = 0;
  while (i + 1 < steps.length && steps[i + 1].t <= t) i++;
  return { step: steps[i], prev: steps[i - 1] };
}

export function phaseAt(phases: Phase[], t: number): Phase {
  return phases.find((p) => t >= p.from && t < p.to) ?? (t < phases[0].from ? phases[0] : phases[phases.length - 1]);
}

export function isFocus(p: Polity | undefined) {
  return !!p?.focus;
}

export function kindLabel(atlas: Atlas, kind: string) {
  return atlas.kinds.get(kind)?.label ?? kind;
}

/** A phase story that has not been written yet is not shown as if it were. */
export function storyOf(p: Phase): string | null {
  return !p.story || /^TODO\b/.test(p.story) ? null : p.story;
}
