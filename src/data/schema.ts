// Shared data shapes for an atlas dataset. Everything here is built at load time from
// datasets/<slug>/: dataset.json, the latest round of the research pack, and the
// narrative files. Dates are written as in the pack ("43", "-55", "410-08", "1066-10-14")
// and converted to decimal years at load time.

export type Certainty = 'high' | 'medium' | 'low';

// How precisely the research pack lets us draw an event. 'city' and 'site' get a
// pin; 'area' is drawn as a soft halo of radiusKm because the source row refuses a point.
export type EventGeometry = 'city' | 'site' | 'area';

// 'range' means the event happened at some point within start–end, not that it lasted that long.
export type DatePrecision = 'day' | 'month' | 'season' | 'year' | 'circa' | 'range';

export interface Facet {
  label: string;
  value: string;
}

/** A row the pack folded into an event or left off the map, kept so readers can see why. */
export interface PackNote {
  candidateId: string;
  description: string;
  reason: string;
  target?: string;
}

/** A picture for an event card, from Wikimedia Commons (datasets/<slug>/images.json). */
export interface EventImage {
  /** the Commons file name, without "File:" */
  file: string;
  caption: string;
  author?: string;
  date?: string;
  /** e.g. "Public domain" */
  licence: string;
}

export interface EventData {
  /** canonical_id from the pack; the narrative file has the same name */
  id: string;
  /** candidate_id of the pack row this event renders */
  sourceRow: string;
  title: string;
  geometry: EventGeometry;
  radiusKm?: number;
  /** one of the kinds in dataset.json */
  kind: string;
  start: string;
  end?: string;
  datePrecision: DatePrecision;
  place: string;
  lon: number;
  lat: number;
  locationCertainty: 'exact' | 'approximate' | 'uncertain';
  /** one of the phase ids in dataset.json */
  phase: string;
  facets?: Facet[];
  /** only meaningful when the dataset declares a magnitudeLabel */
  magnitude?: number;
  certainty: Certainty;
  uncertaintyNote?: string;
  /** primary locators first (the first primaryCount entries), then secondary sources */
  sources: string[];
  primaryCount: number;
  /** 1 = major, 2, 3 = minor */
  importance: 1 | 2 | 3;
  dispositionReason: string;
  candidateDescription: string;
  rightsStatus: string;
  reviewStatus: 'unverified' | 'checked' | 'reconciled';
  /** merge rows folded into this event */
  merged: PackNote[];
  /** whether the narrative file exists and is written; drafts may lack one */
  narrative: 'ok' | 'placeholder' | 'missing';
  summary: string;
  detail: string;
  significance: string;
  image?: EventImage;
}

export interface Camera {
  center: [number, number];
  zoom: number;
}

export interface Phase {
  id: string;
  title: string;
  from: number;
  /** the phase's last year, inclusive; phases must not overlap */
  to: number;
  /** the atlas's own synthesis, not a claim made by the pack */
  story: string;
  camera: Camera;
}

export interface Kind {
  id: string;
  label: string;
  /** a glyph name from src/map/icons.ts; defaults to the kind id */
  icon?: string;
}

export interface DatasetConfig {
  slug: string;
  title: string;
  subtitle?: string;
  timeRange: { from: number; to: number };
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number };
  camera: Camera;
  magnitudeLabel: string | null;
  /** path (inside the dataset folder) of an optional territory file, or null for none */
  territory: string | null;
  kinds: Kind[];
  facetLabels: string[];
  phases: Phase[];
}

export type Status = 'core' | 'vassal' | 'contested';

export interface Polity {
  id: string;
  name: string;
  color: string;
  /** polities the dataset is about; their frontier is drawn and their area counted */
  focus?: boolean;
}

export interface TerritoryData {
  /** shown in the About panel; the territory layer is the atlas's synthesis */
  note: string;
  /** e.g. "under Roman rule"; labels the area counter */
  focusLabel?: string;
  polities: Polity[];
  /** region id → [[date, polity id, status?], ...] in date order */
  regions: Record<string, [string, string, Status?][]>;
  regionsUrl: string;
  bordersUrl: string;
}

/** A guided route through included events. Its text is the author's interpretation. */
export interface Journey {
  id: string;
  title: string;
  by: string;
  order: 'chronological' | 'thematic';
  intro: string;
  /** each stop names the canonical_id of an included event */
  stops: { event: string; text: string }[];
  /** true while any of its text is still marked PLACEHOLDER */
  placeholder: boolean;
}

/** What the virtual:atlas-dataset/<slug> module exports. */
export interface DatasetModule {
  config: DatasetConfig;
  mode: 'draft' | 'production';
  pack: {
    file: string;
    round: string;
    rows: number;
    include: number;
    merged: PackNote[];
    excluded: PackNote[];
    unverified: { candidateId: string; disposition: string }[];
  };
  events: EventData[];
  journeys: Journey[];
  territory: TerritoryData | null;
}
