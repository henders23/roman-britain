import * as maplibregl from 'maplibre-gl';
import type { MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { baseStyle, MAP_THEMES } from './style';
import { drawPin, glyphFor, hatch, PIN_COLORS, type Theme } from './icons';
import { isFocus, phaseAt, stepAt, type Atlas, type AtlasEvent, type Territory } from '../data/dataset';
import type { Polity, Status } from '../data/schema';
import { store } from '../store';

maplibregl.setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`);

type RegionFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, { region: string; name: string; areaKm2: number; labelLon: number; labelLat: number }>;

export interface RegionInfo {
  region: string;
  name: string;
  polity: Polity;
  status: Status;
  since: number;
}

interface RegionState {
  fid: number;
  polity: string;
  status: Status;
  color: string;
  opacity: number;
  flash: number;
  contested: number;
  vassal: number;
}

interface EvState {
  vis: number;
  active: number;
  sel: number;
  hover: number;
  pulse: number;
  past: number;
  win: number;
}

// Durations below are in multiples of atlas.unit (span / 88 years), so they read the
// same on an 88-year and a thousand-year timeline.
const TRANSITION = 0.3; // over which a region's colour blends to its new owner
const FLASH = 0.7; // how long a newly gained region glows
const APPEAR = 0.06; // fade-in of a point event
const SETTLE = 0.35; // an ended event's badge stops pulsing
const LINGER = 2.5; // an ended event's badge shrinks to a small dot

const hexToRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, k: number) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => x * x * (3 - 2 * x);

function opacityFor(p: Polity | undefined, status: Status) {
  if (!p) return 0;
  if (isFocus(p)) return status === 'vassal' ? 0.26 : status === 'contested' ? 0.3 : 0.44;
  return status === 'vassal' ? 0.18 : 0.2;
}

function circlePolygon(lon: number, lat: number, km: number, n = 72): GeoJSON.Polygon {
  const ring: number[][] = [];
  const R = 6371;
  const d = km / R;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  for (let i = 0; i <= n; i++) {
    const θ = (i / n) * 2 * Math.PI;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
    ring.push([(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

/** A dotted ring drawn around a pin while the playhead is inside its date window. */
function windowRing(theme: Theme): ImageData {
  const S = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const c = canvas.getContext('2d')!;
  c.strokeStyle = PIN_COLORS[theme].fill;
  c.lineWidth = 3;
  c.lineCap = 'round';
  c.setLineDash([0.1, 7.5]);
  c.beginPath();
  c.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
  c.stroke();
  return c.getImageData(0, 0, S, S);
}

export class AtlasMap {
  map: maplibregl.Map;
  private atlas: Atlas;
  private territory: Territory | null;
  private theme: Theme;
  private regions: RegionFeature[] = [];
  private regionState = new Map<string, RegionState>();
  private borders: { id: number; a: string; b: string }[] = [];
  private borderKind = new Map<number, number>();
  private labels = new Map<string, { marker: maplibregl.Marker; el: HTMLElement; area: number; shown: boolean }>();
  private evLabels: { marker: maplibregl.Marker; el: HTMLElement; ev: AtlasEvent; shown: boolean }[] = [];
  private declutterAt = 0;
  private ownerKey = '';
  private evState = new Map<number, EvState>();
  private ready = false;
  private lastT = NaN;
  private hoveredRegion: number | null = null;
  onRegionHover?: (info: RegionInfo | null, point?: { x: number; y: number }) => void;
  onEventHover?: (ev: AtlasEvent | null, point?: { x: number; y: number }) => void;
  onReady?: () => void;

  constructor(container: HTMLElement, atlas: Atlas, geoBase: string, theme: Theme) {
    this.atlas = atlas;
    this.territory = atlas.territory;
    this.theme = theme;
    const small = window.innerWidth < 720;
    const cam = atlas.config.camera;
    this.map = new maplibregl.Map({
      container,
      style: baseStyle(theme),
      center: cam.center,
      zoom: cam.zoom - (small ? 0.8 : 0) - 0.6,
      minZoom: 1.2,
      maxZoom: 11,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
      renderWorldCopies: false,
      fadeDuration: 0,
    } as maplibregl.MapOptions);
    this.map.dragRotate.disable();
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disable();
    this.applyPadding();
    this.map.on('load', () => void this.init(geoBase));
    this.map.on('zoom', () => this.onZoom());
    this.map.on('idle', () => this.declutter());
    this.map.on('render', () => {
      const now = performance.now();
      if (now - this.declutterAt > 250) {
        this.declutterAt = now;
        this.declutter();
      }
    });
  }

  private async init(geoBase: string) {
    const get = (url: string) => fetch(url).then((r) => r.json());
    const T = this.territory;
    const [rivers, lakes, regions, borders] = await Promise.all([
      get(`${geoBase}rivers.json`),
      get(`${geoBase}lakes.json`),
      T ? get(T.regionsUrl) : null,
      T ? get(T.bordersUrl) : null,
    ]);
    const m = this.map;
    const th = MAP_THEMES[this.theme];

    m.addSource('lakes', { type: 'geojson', data: lakes });
    m.addSource('rivers', { type: 'geojson', data: rivers });
    m.addLayer({ id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': th.water, 'fill-opacity': 0.95 } });
    m.addLayer({
      id: 'rivers', type: 'line', source: 'rivers',
      paint: {
        'line-color': th.river,
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 1.5, 0.45, 5, 0.85],
        'line-width': ['interpolate', ['linear'], ['zoom'], 1.5, ['case', ['<=', ['get', 'rank'], 3], 0.9, 0.4], 6, ['case', ['<=', ['get', 'rank'], 3], 2.4, 1.2]],
      },
    });

    if (T && regions && borders) this.addTerritoryLayers(regions, borders);
    this.addEventLayers();
    this.addEventLabels();
    this.onZoom();
    this.bindPointer();
    this.ready = true;
    this.update(store.get().t, true);
    this.onReady?.();
  }

  private addTerritoryLayers(regions: GeoJSON.FeatureCollection, borders: GeoJSON.FeatureCollection) {
    const m = this.map;
    this.regions = regions.features as RegionFeature[];
    this.borders = borders.features.map((f) => ({ id: f.id as number, ...(f.properties as { a: string; b: string }) }));
    m.addSource('regions', { type: 'geojson', data: regions });
    m.addSource('borders', { type: 'geojson', data: borders });
    m.addImage('hatch-contested', hatch('rgba(255,120,70,0.9)', 8, 2.2), { pixelRatio: 2 });
    m.addImage('hatch-vassal', hatch('rgba(255,236,190,0.55)', 8, 1.2), { pixelRatio: 2 });
    m.addLayer({
      id: 'terr-fill', type: 'fill', source: 'regions',
      paint: { 'fill-color': ['coalesce', ['feature-state', 'color'], '#000'], 'fill-opacity': ['coalesce', ['feature-state', 'opacity'], 0], 'fill-antialias': false },
    });
    m.addLayer({ id: 'terr-vassal', type: 'fill', source: 'regions', paint: { 'fill-pattern': 'hatch-vassal', 'fill-opacity': ['coalesce', ['feature-state', 'vassal'], 0] } });
    m.addLayer({ id: 'terr-contested', type: 'fill', source: 'regions', paint: { 'fill-pattern': 'hatch-contested', 'fill-opacity': ['*', 0.75, ['coalesce', ['feature-state', 'contested'], 0]] } });
    m.addLayer({
      id: 'terr-flash', type: 'fill', source: 'regions',
      paint: { 'fill-color': '#ffd98a', 'fill-opacity': ['*', 0.55, ['coalesce', ['feature-state', 'flash'], 0]], 'fill-antialias': false },
    });
    m.addLayer({
      id: 'terr-hover', type: 'line', source: 'regions',
      paint: { 'line-color': '#fff4d8', 'line-width': 1.4, 'line-opacity': ['*', 0.8, ['coalesce', ['feature-state', 'hover'], 0]] },
    });
    // Frontiers: kind 1 = focus polities against the rest, 2 = between focus polities, 3 = between others.
    m.addLayer({
      id: 'frontier-glow', type: 'line', source: 'borders',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ffb347', 'line-blur': 6,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1.5, 5, 6, 12],
        'line-opacity': ['match', ['coalesce', ['feature-state', 'kind'], 0], 1, 0.45, 0],
      },
    });
    m.addLayer({
      id: 'frontier', type: 'line', source: 'borders',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['match', ['coalesce', ['feature-state', 'kind'], 0], 1, '#ffd27a', 2, '#f7e3a8', '#d9d0bf'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 1.5, ['match', ['coalesce', ['feature-state', 'kind'], 0], 1, 1.3, 0.6], 6, ['match', ['coalesce', ['feature-state', 'kind'], 0], 1, 2.6, 1.3]],
        'line-opacity': ['match', ['coalesce', ['feature-state', 'kind'], 0], 1, 0.95, 3, 0.32, 0],
      },
    });
    m.addLayer({
      id: 'frontier-focus', type: 'line', source: 'borders',
      paint: {
        'line-color': '#f7e3a8',
        'line-width': ['interpolate', ['linear'], ['zoom'], 1.5, 1, 6, 2],
        'line-dasharray': [2, 2],
        'line-opacity': ['match', ['coalesce', ['feature-state', 'kind'], 0], 2, 0.9, 0],
      },
    });
  }

  private iconKey(e: AtlasEvent) {
    return `ev-${glyphFor(e.kind, this.atlas.kinds.get(e.kind)?.icon)}-${e.geometry === 'area' ? 'a' : 'p'}`;
  }

  private drawImages(update: boolean) {
    const m = this.map;
    const put = (key: string, img: ImageData) => (update && m.hasImage(key) ? m.updateImage(key, img) : !m.hasImage(key) && m.addImage(key, img, { pixelRatio: 2 }));
    for (const e of this.atlas.events) {
      const key = this.iconKey(e);
      put(key, drawPin(glyphFor(e.kind, this.atlas.kinds.get(e.kind)?.icon), e.geometry === 'area', this.theme));
    }
    put('ev-window', windowRing(this.theme));
  }

  private addEventLayers() {
    const m = this.map;
    const evs = this.atlas.events;
    const cz = this.atlas.config.camera.zoom;
    this.drawImages(false);
    m.addSource('ev-areas', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: evs.filter((e) => e.geometry === 'area').map((e) => ({ type: 'Feature', id: e.index, properties: {}, geometry: circlePolygon(e.lon, e.lat, e.radiusKm!) })),
      },
    });
    const pts: GeoJSON.Feature[] = evs.map((e) => ({
      type: 'Feature', id: e.index,
      properties: { icon: this.iconKey(e), size: e.size, importance: e.importance, eid: e.id, windowed: e.windowed ? 1 : 0 },
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
    }));
    m.addSource('ev-pts', { type: 'geojson', data: { type: 'FeatureCollection', features: pts } });

    const accent = PIN_COLORS[this.theme].fill;
    const vis = ['coalesce', ['feature-state', 'vis'], 0] as maplibregl.ExpressionSpecification;
    const active = ['coalesce', ['feature-state', 'active'], 0] as maplibregl.ExpressionSpecification;
    const size = ['get', 'size'] as maplibregl.ExpressionSpecification;
    // Pins are sized relative to the dataset's own camera zoom, not a world view.
    const zoomed = (far: number, near: number) =>
      ['interpolate', ['linear'], ['zoom'], cz - 3.8, ['+', far * 0.55, ['*', far * 0.45, size]], cz + 0.7, ['+', near * 0.55, ['*', near * 0.45, size]]] as maplibregl.ExpressionSpecification;

    m.addLayer({ id: 'ev-area-fill', type: 'fill', source: 'ev-areas', paint: { 'fill-color': accent, 'fill-opacity': ['+', ['*', vis, 0.06], ['*', active, 0.16]] } });
    m.addLayer({
      id: 'ev-area-line', type: 'line', source: 'ev-areas',
      paint: { 'line-color': accent, 'line-width': ['+', 1, ['*', active, 1]], 'line-dasharray': [3, 3], 'line-opacity': ['+', ['*', vis, 0.35], ['*', active, 0.55]] },
    });
    m.addLayer({
      id: 'ev-pulse', type: 'circle', source: 'ev-pts',
      paint: {
        'circle-radius': ['+', 14, ['*', 34, ['coalesce', ['feature-state', 'pulse'], 0]], ['*', 14, size]],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': accent,
        'circle-stroke-width': 2,
        // A windowed event does not pulse: pulsing would claim "happening now".
        'circle-stroke-opacity': ['*', active, ['-', 1, ['get', 'windowed']], ['-', 1, ['coalesce', ['feature-state', 'pulse'], 0]]],
        'circle-pitch-alignment': 'map',
      },
    });
    m.addLayer({
      id: 'ev-halo', type: 'circle', source: 'ev-pts',
      paint: {
        'circle-radius': ['+', 15, ['*', 9, size]],
        'circle-color': this.theme === 'dark' ? '#fff6dd' : '#ffffff',
        'circle-blur': 0.6,
        'circle-opacity': ['*', 0.5, ['max', ['coalesce', ['feature-state', 'sel'], 0], ['coalesce', ['feature-state', 'hover'], 0]]],
      },
    });
    m.addLayer({
      id: 'ev-past', type: 'circle', source: 'ev-pts',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], cz - 3.8, ['+', 1.8, ['*', 1.8, size]], cz + 0.7, ['+', 3, ['*', 3, size]]],
        'circle-color': accent,
        'circle-stroke-color': this.theme === 'dark' ? 'rgba(10,8,4,0.8)' : 'rgba(255,250,240,0.9)',
        'circle-stroke-width': 1,
        'circle-opacity': ['*', 0.85, ['coalesce', ['feature-state', 'past'], 0]],
        'circle-stroke-opacity': ['coalesce', ['feature-state', 'past'], 0],
      },
    });
    m.addLayer({
      id: 'ev-window', type: 'symbol', source: 'ev-pts',
      filter: ['==', ['get', 'windowed'], 1],
      layout: { 'icon-image': 'ev-window', 'icon-size': zoomed(0.62, 0.95), 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      paint: { 'icon-opacity': ['coalesce', ['feature-state', 'win'], 0] },
    });
    m.addLayer({
      id: 'ev-icons', type: 'symbol', source: 'ev-pts',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': zoomed(0.5, 0.82),
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['-', 4, ['get', 'importance']],
      },
      paint: { 'icon-opacity': vis },
    });
  }

  /** Title labels beside pins; shown while a pin is on the map and decluttered by importance. */
  private addEventLabels() {
    for (const ev of this.atlas.events) {
      const wrap = document.createElement('div');
      const el = document.createElement('div');
      el.className = `ev-label imp-${ev.importance}`;
      el.textContent = ev.title;
      wrap.appendChild(el);
      const marker = new maplibregl.Marker({ element: wrap, anchor: 'left', offset: [15 + 6 * ev.size, 0], opacityWhenCovered: '0' } as maplibregl.MarkerOptions)
        .setLngLat([ev.lon, ev.lat])
        .addTo(this.map);
      this.evLabels.push({ marker, el, ev, shown: false });
    }
  }

  private onZoom() {
    const z = this.map.getZoom();
    const cz = this.atlas.config.camera.zoom;
    const c = this.map.getContainer();
    c.style.setProperty('--z', String(z));
    c.classList.toggle('z-far', z < cz - 2.7);
    c.classList.toggle('z-near', z >= cz - 2.3);
  }

  private hitEvent(box: [maplibregl.PointLike, maplibregl.PointLike]) {
    return this.map
      .queryRenderedFeatures(box, { layers: ['ev-icons', 'ev-past'] })
      .filter((f) => {
        const s = this.evState.get(f.id as number);
        return (s?.vis ?? 0) > 0.05 || (s?.past ?? 0) > 0.05;
      })
      .sort((a, b) => (a.properties.importance as number) - (b.properties.importance as number))[0];
  }

  private bindPointer() {
    const m = this.map;
    let hoverEv: number | null = null;
    m.on('mousemove', (e) => {
      const hit = this.hitEvent([[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]]);
      const ev = hit ? this.atlas.events[hit.id as number] : null;
      if ((ev?.index ?? null) !== hoverEv) {
        hoverEv = ev?.index ?? null;
        store.set({ hovered: ev?.id ?? null });
      }
      m.getCanvas().style.cursor = ev ? 'pointer' : '';
      this.onEventHover?.(ev, e.point);
      const reg = ev || !this.territory ? undefined : m.queryRenderedFeatures(e.point, { layers: ['terr-fill'] })[0];
      this.setRegionHover(reg, e.point);
    });
    m.on('mouseout', () => {
      store.set({ hovered: null });
      this.onEventHover?.(null);
      this.setRegionHover(undefined);
    });
    m.on('click', (e) => {
      const hit = this.hitEvent([[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]]);
      if (hit) {
        store.set({ selected: this.atlas.events[hit.id as number].id });
        return;
      }
      const area = m.queryRenderedFeatures(e.point, { layers: ['ev-area-fill'] }).filter((f) => (this.evState.get(f.id as number)?.active ?? 0) > 0.5)[0];
      if (area) store.set({ selected: this.atlas.events[area.id as number].id });
      else store.set({ selected: null });
    });
  }

  private setRegionHover(f: MapGeoJSONFeature | undefined, point?: { x: number; y: number }) {
    const T = this.territory;
    if (!T) return;
    const id = f ? (f.id as number) : null;
    if (id !== this.hoveredRegion) {
      if (this.hoveredRegion !== null) this.map.setFeatureState({ source: 'regions', id: this.hoveredRegion }, { hover: 0 });
      if (id !== null) this.map.setFeatureState({ source: 'regions', id }, { hover: 1 });
      this.hoveredRegion = id;
    }
    if (!f) return this.onRegionHover?.(null);
    const region = f.properties.region as string;
    const { step } = stepAt(T.timelines.get(region)!, store.get().t);
    this.onRegionHover?.({ region, name: f.properties.name as string, polity: T.polities.get(step.polity)!, status: step.status, since: step.t }, point);
  }

  /** Render the world at time t. Cheap enough to call every animation frame. */
  update(t: number, force = false) {
    if (!this.ready) return;
    const tChanged = force || t !== this.lastT;
    if (tChanged && this.territory) this.updateTerritory(t);
    this.updateEvents(t);
    this.lastT = t;
  }

  setTheme(theme: Theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    const m = this.map;
    const th = MAP_THEMES[theme];
    m.setSky(th.sky);
    m.setPaintProperty('background', 'background-color', th.background);
    m.setPaintProperty('relief', 'color-relief-color', th.relief);
    m.setPaintProperty('hillshade', 'hillshade-shadow-color', th.shadow);
    m.setPaintProperty('hillshade', 'hillshade-highlight-color', th.highlight);
    m.setPaintProperty('hillshade', 'hillshade-accent-color', th.accent);
    if (!this.ready) return;
    const pc = PIN_COLORS[theme];
    m.setPaintProperty('lakes', 'fill-color', th.water);
    m.setPaintProperty('rivers', 'line-color', th.river);
    m.setPaintProperty('ev-area-fill', 'fill-color', pc.fill);
    m.setPaintProperty('ev-area-line', 'line-color', pc.fill);
    m.setPaintProperty('ev-pulse', 'circle-stroke-color', pc.fill);
    m.setPaintProperty('ev-past', 'circle-color', pc.fill);
    m.setPaintProperty('ev-past', 'circle-stroke-color', theme === 'dark' ? 'rgba(10,8,4,0.8)' : 'rgba(255,250,240,0.9)');
    m.setPaintProperty('ev-halo', 'circle-color', theme === 'dark' ? '#fff6dd' : '#ffffff');
    this.drawImages(true);
  }

  private updateTerritory(t: number) {
    const m = this.map;
    const T = this.territory!;
    const u = this.atlas.unit;
    const P = T.polities;
    let ownerKey = '';
    const owners = new Map<string, { polity: string; status: Status }>();
    for (const f of this.regions) {
      const region = f.properties.region;
      const steps = T.timelines.get(region);
      if (!steps) continue;
      const { step, prev } = stepAt(steps, t);
      const k = prev ? ease(clamp01((t - step.t) / (TRANSITION * u))) : 1;
      const cur = P.get(step.polity);
      const was = prev ? P.get(prev.polity) : cur;
      const color = mix(was!.color, cur!.color, k);
      const opacity = opacityFor(was, prev?.status ?? step.status) * (1 - k) + opacityFor(cur, step.status) * k;
      const gained = prev && isFocus(cur) && (!isFocus(was) || prev.status !== 'core') && step.status !== 'contested';
      const fresh = prev && (gained || (step.status === 'contested' && prev.status !== 'contested'));
      const flash = fresh ? Math.pow(clamp01(1 - (t - step.t) / (FLASH * u)), 2) * (t >= step.t ? 1 : 0) : 0;
      const contested = step.status === 'contested' ? k : prev?.status === 'contested' ? 1 - k : 0;
      const vassal = step.status === 'vassal' ? k : prev?.status === 'vassal' ? 1 - k : 0;
      const next: RegionState = { fid: f.id as number, polity: step.polity, status: step.status, color, opacity, flash, contested, vassal };
      const last = this.regionState.get(region);
      if (!last || last.color !== color || Math.abs(last.opacity - opacity) > 0.004 || Math.abs(last.flash - flash) > 0.01 || Math.abs(last.contested - contested) > 0.01 || Math.abs(last.vassal - vassal) > 0.01) {
        m.setFeatureState({ source: 'regions', id: f.id as number }, { color, opacity, flash, contested, vassal });
      }
      this.regionState.set(region, next);
      owners.set(region, { polity: step.polity, status: step.status });
      ownerKey += step.polity + step.status[0];
    }
    if (ownerKey !== this.ownerKey) {
      this.ownerKey = ownerKey;
      this.updateFrontiers(owners);
      this.updateLabels(owners);
    }
  }

  private updateFrontiers(owners: Map<string, { polity: string; status: Status }>) {
    const P = this.territory!.polities;
    for (const b of this.borders) {
      const A = owners.get(b.a);
      const B = owners.get(b.b);
      let kind = 0;
      if (A && B && A.polity !== B.polity) {
        const fa = isFocus(P.get(A.polity));
        const fb = isFocus(P.get(B.polity));
        kind = fa !== fb ? 1 : fa && fb ? 2 : 3;
      }
      if (this.borderKind.get(b.id) !== kind) {
        this.borderKind.set(b.id, kind);
        this.map.setFeatureState({ source: 'borders', id: b.id }, { kind });
      }
    }
  }

  private updateLabels(owners: Map<string, { polity: string; status: Status }>) {
    const groups = new Map<string, RegionFeature[]>();
    for (const f of this.regions) {
      const o = owners.get(f.properties.region);
      if (!o) continue;
      if (!groups.has(o.polity)) groups.set(o.polity, []);
      groups.get(o.polity)!.push(f);
    }
    const seen = new Set<string>();
    for (const [pid, fs] of groups) {
      const area = fs.reduce((s, f) => s + f.properties.areaKm2, 0);
      const vw = window.innerWidth;
      if (area < (vw < 720 ? 350000 : 90000)) continue;
      // Area-weighted centre, snapped to the nearest region label point so it sits inside the polity.
      let x = 0, y = 0;
      for (const f of fs) {
        x += f.properties.labelLon * f.properties.areaKm2;
        y += f.properties.labelLat * f.properties.areaKm2;
      }
      x /= area;
      y /= area;
      const anchor = fs.reduce((best, f) => {
        const d = (f.properties.labelLon - x) ** 2 + (f.properties.labelLat - y) ** 2 - Math.log(f.properties.areaKm2) * 2;
        return d < best.d ? { f, d } : best;
      }, { f: fs[0], d: Infinity }).f;
      const pol = this.territory!.polities.get(pid)!;
      const scale = Math.max(0.55, Math.min(1, vw / 1200));
      const size = Math.max(9, Math.min(30, 5 + Math.sqrt(area) / 90) * scale);
      let entry = this.labels.get(pid);
      if (!entry) {
        // MapLibre writes inline opacity on the marker element, so styling lives on a child.
        const wrap = document.createElement('div');
        const el = document.createElement('div');
        el.className = `polity-label${isFocus(pol) ? ' is-focus' : ''}`;
        el.textContent = pol.name;
        wrap.appendChild(el);
        const marker = new maplibregl.Marker({ element: wrap, anchor: 'center', opacityWhenCovered: '0' } as maplibregl.MarkerOptions).setLngLat([anchor.properties.labelLon, anchor.properties.labelLat]).addTo(this.map);
        entry = { marker, el, area, shown: true };
        this.labels.set(pid, entry);
        requestAnimationFrame(() => el.classList.add('shown'));
      } else {
        entry.marker.setLngLat([anchor.properties.labelLon, anchor.properties.labelLat]);
        entry.el.classList.add('shown');
      }
      entry.area = area;
      entry.shown = true;
      entry.el.style.setProperty('--size', `${size.toFixed(1)}px`);
      seen.add(pid);
    }
    for (const [pid, entry] of this.labels)
      if (!seen.has(pid)) {
        entry.shown = false;
        entry.el.classList.remove('shown');
      }
    requestAnimationFrame(() => this.declutter());
  }

  /** Hide labels that would overlap a more important one on screen. Pins themselves are never hidden. */
  private declutter() {
    const view = this.map.getContainer().getBoundingClientRect();
    const placed: { r: DOMRect; owner?: number }[] = [];
    const pad = 4;
    const overlaps = (r: DOMRect, self?: number) =>
      placed.some(({ r: p, owner }) => owner !== self && r.left - pad < p.right && r.right + pad > p.left && r.top - pad < p.bottom && r.bottom + pad > p.top);
    // Every visible pin blocks labels, so a label never covers another event's pin.
    for (const l of this.evLabels) {
      const s = this.evState.get(l.ev.index);
      if (!s || Math.max(s.vis, s.past) < 0.3) continue;
      const p = this.map.project([l.ev.lon, l.ev.lat]);
      const r = s.vis > 0.3 ? 12 + 6 * l.ev.size : 4;
      placed.push({ r: new DOMRect(view.left + p.x - r, view.top + p.y - r, r * 2, r * 2), owner: l.ev.index });
    }
    // Event labels, most important first; the selected and hovered events win.
    const { selected, hovered } = store.get();
    const rank = (l: { ev: AtlasEvent }) => (l.ev.id === selected ? -2 : l.ev.id === hovered ? -1 : l.ev.importance);
    const evs = this.evLabels.filter((l) => l.shown).sort((a, b) => rank(a) - rank(b) || b.ev.size - a.ev.size);
    for (const l of evs) {
      const r = l.el.getBoundingClientRect();
      const off = r.right < view.left || r.left > view.right || r.bottom < view.top || r.top > view.bottom;
      const hit = r.width === 0 || overlaps(r, l.ev.index);
      l.el.classList.toggle('collide', hit && !off);
      if (!hit) placed.push({ r });
    }
    const list = [...this.labels.values()].filter((l) => l.shown).sort((a, b) => b.area - a.area);
    for (const l of list) {
      const r = l.el.getBoundingClientRect();
      const hit = r.width === 0 || overlaps(r);
      const off = r.right < view.left || r.left > view.right;
      l.el.classList.toggle('collide', hit && !off);
      if (!hit) placed.push({ r });
    }
  }

  private updateEvents(t: number) {
    const { selected, hovered, showPast } = store.get();
    const u = this.atlas.unit;
    // Frame-by-frame capture drives the pulse clock itself.
    const now = (window as { __clock?: number }).__clock ?? performance.now() / 1000;
    let labelsChanged = false;
    for (const e of this.atlas.events) {
      let vis = 0;
      let active = 0;
      let past = 0;
      let win = 0;
      if (e.windowed) {
        // A date window: the event happened somewhere inside it. The pin holds steady for
        // the whole window, circled by a dotted ring, and never pulses.
        if (t >= e.t0 && t <= e.t1) {
          vis = active = win = 1;
        } else if (t > e.t1) {
          const since = t - e.t1;
          active = clamp01(1 - since / (SETTLE * u));
          vis = clamp01(1 - since / (LINGER * u)) * (0.5 + 0.5 * active);
          win = active;
          past = showPast ? 1 - vis : 0;
        }
      } else if (t >= e.t0 - APPEAR * u) {
        const appear = clamp01((t - e.t0 + APPEAR * u) / (APPEAR * u));
        if (t <= e.t1) {
          vis = active = appear;
        } else {
          // After an event ends its badge lingers a little, then settles to a small dot.
          const since = t - e.t1;
          active = clamp01(1 - since / (SETTLE * u));
          vis = clamp01(1 - since / (LINGER * u)) * (0.5 + 0.5 * active);
          past = showPast ? 1 - vis : 0;
        }
      }
      const sel = selected === e.id ? 1 : 0;
      if (sel) {
        vis = 1;
        past = 0;
      }
      const hover = hovered === e.id ? 1 : 0;
      const pulse = active > 0 && !e.windowed ? (now * 0.7 + e.index * 0.137) % 1 : 0;
      const label = this.evLabels[e.index];
      const show = vis > 0.45 || sel === 1 || hover === 1;
      if (label && label.shown !== show) {
        label.shown = show;
        label.el.classList.toggle('shown', show);
        labelsChanged = true;
      }
      const last = this.evState.get(e.index);
      if (last && Math.abs(last.vis - vis) < 0.005 && Math.abs(last.past - past) < 0.005 && Math.abs(last.active - active) < 0.005 && Math.abs(last.win - win) < 0.005 && last.sel === sel && last.hover === hover && (active === 0 || e.windowed || Math.abs(last.pulse - pulse) < 0.01)) continue;
      const st = { vis, active, sel, hover, pulse, past, win };
      this.evState.set(e.index, st);
      this.map.setFeatureState({ source: 'ev-pts', id: e.index }, st);
      if (e.geometry === 'area') this.map.setFeatureState({ source: 'ev-areas', id: e.index }, { vis, active });
    }
    if (labelsChanged) this.declutter();
  }

  /** Area in km² of regions held by or tributary to a focus polity at time t. */
  focusArea(t: number) {
    const T = this.territory;
    if (!T) return 0;
    let km2 = 0;
    for (const f of this.regions) {
      const steps = T.timelines.get(f.properties.region);
      if (!steps) continue;
      const { step } = stepAt(steps, t);
      if (isFocus(T.polities.get(step.polity)) && step.status !== 'contested') km2 += f.properties.areaKm2;
    }
    return km2;
  }

  flyToEvent(e: AtlasEvent) {
    const z = this.map.getZoom();
    const cz = this.atlas.config.camera.zoom;
    const zoom = e.geometry === 'area' ? Math.max(cz - 1.9, Math.min(cz + 1.5, 8.6 - Math.log2(e.radiusKm ?? 200) + (cz - 5.3) * 0.3)) : Math.max(z, cz + 0.9);
    const small = window.innerWidth < 720;
    this.map.flyTo({
      center: [e.lon, e.lat], zoom, duration: 1800, essential: true, curve: 1.3,
      padding: small ? { top: 60, bottom: window.innerHeight * 0.55, left: 0, right: 0 } : { top: 0, bottom: 140, left: window.innerWidth > 1100 ? 340 : 300, right: 440 },
    });
  }

  flyToPhase(t: number, duration = 2600) {
    const p = phaseAt(this.atlas.phases, t);
    const cam = p.camera ?? this.atlas.config.camera;
    const small = window.innerWidth < 720;
    this.map.flyTo({ center: cam.center, zoom: cam.zoom - (small ? 0.8 : 0), duration, essential: true, curve: 1.2 });
  }

  flyHome(duration = 2600) {
    const cam = this.atlas.config.camera;
    const small = window.innerWidth < 720;
    this.map.flyTo({ center: cam.center, zoom: cam.zoom - (small ? 0.8 : 0), duration, essential: true, curve: 1.2 });
  }

  /** Keep the centre of the map clear of the left-hand clock and bottom timeline. */
  applyPadding() {
    const small = window.innerWidth < 720;
    this.map.setPadding(small ? { top: 120, bottom: 110, left: 0, right: 0 } : { top: 0, bottom: 120, left: window.innerWidth > 1100 ? 340 : 300, right: 0 });
  }

  resize() {
    this.map.resize();
    this.applyPadding();
  }
}
