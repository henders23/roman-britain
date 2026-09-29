import type { StyleSpecification, SkySpecification, ExpressionSpecification } from 'maplibre-gl';
import type { Theme } from './icons';

// Two relief palettes over the same terrain. Dark: bathymetry in inks, land in umber,
// high ground in pale stone. Light: a paper map, sea in grey-blue, land in parchment and
// fawn. Everything else in the atlas is drawn on top of this.
// VITE_TERRAIN_TILES can point at a mirror or self-hosted copy of the same Terrarium tiles.
export const TERRAIN_TILES = import.meta.env.VITE_TERRAIN_TILES || 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export interface MapTheme {
  background: string;
  water: string;
  river: string;
  relief: ExpressionSpecification;
  shadow: string;
  highlight: string;
  accent: string;
  sky: SkySpecification;
}

export const MAP_THEMES: Record<Theme, MapTheme> = {
  dark: {
    background: '#081424',
    water: '#0f2238',
    river: '#3f6f96',
    relief: [
      'interpolate', ['linear'], ['elevation'],
      -9000, '#040a14', -5000, '#071224', -2500, '#0a1a30', -600, '#0d2139', -60, '#12304f', -1, '#173a5c',
      0, '#26291f', 60, '#2b2e21', 150, '#2e3123', 300, '#353525', 500, '#3a3927', 800, '#453f2b', 1000, '#4a452f',
      1600, '#5a5037', 2400, '#6a5d45', 3400, '#81766a', 4600, '#a8a39b', 6000, '#dcd8d0',
    ] as ExpressionSpecification,
    shadow: 'rgba(4,3,2,0.85)',
    highlight: 'rgba(255,240,210,0.22)',
    accent: 'rgba(0,0,0,0.3)',
    sky: {
      'sky-color': '#060a14', 'horizon-color': '#1c2740', 'fog-color': '#0b1220',
      'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.9,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 0.8, 8, 0],
    },
  },
  light: {
    background: '#c9d6de',
    water: '#b7cad6',
    river: '#6f93ad',
    relief: [
      'interpolate', ['linear'], ['elevation'],
      -9000, '#8fa9bb', -5000, '#9bb3c4', -2500, '#a7bdcc', -600, '#b3c7d4', -60, '#bfd0db', -1, '#c8d7e0',
      0, '#ece3cc', 60, '#e7ddc3', 150, '#e2d6b9', 300, '#dacdab', 500, '#d1c19b', 800, '#c4b08a', 1000, '#b9a37c',
      1600, '#a58f6c', 2400, '#948068', 3400, '#9a9087', 4600, '#bdb7ae', 6000, '#e8e4dc',
    ] as ExpressionSpecification,
    shadow: 'rgba(70,50,30,0.45)',
    highlight: 'rgba(255,255,250,0.35)',
    accent: 'rgba(60,40,20,0.18)',
    sky: {
      'sky-color': '#dfe7ec', 'horizon-color': '#eef2f3', 'fog-color': '#e8edef',
      'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.9,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 0.6, 8, 0],
    },
  },
};

export function baseStyle(theme: Theme): StyleSpecification {
  const t = MAP_THEMES[theme];
  return {
    version: 8,
    projection: { type: 'globe' },
    sky: t.sky,
    sources: {
      dem: {
        type: 'raster-dem',
        tiles: [TERRAIN_TILES],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 11,
        attribution:
          '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> (Mapzen, SRTM, ETOPO1, GMTED)',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': t.background } },
      {
        id: 'relief',
        type: 'color-relief',
        source: 'dem',
        paint: { 'color-relief-color': t.relief, 'color-relief-opacity': 1 },
      },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'dem',
        paint: {
          'hillshade-shadow-color': t.shadow,
          'hillshade-highlight-color': t.highlight,
          'hillshade-accent-color': t.accent,
          // Britain's relief is low; a little more exaggeration at regional zoom keeps it legible.
          'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 1, 0.55, 5, 0.5, 8, 0.4],
          'hillshade-illumination-direction': 315,
        },
      },
    ],
  };
}
