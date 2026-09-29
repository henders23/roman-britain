// Builds the atlas's physical context from Natural Earth (public domain):
//   public/geo/rivers.json, public/geo/lakes.json
// Usage: node scripts/build-geo.mjs <dir containing the Natural Earth geojson files>
// It needs ne_50m_rivers_lake_centerlines.geojson and ne_50m_lakes.geojson.
// Territory layers are per dataset (see README) and are not built here.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2] ?? '.geo-cache';
const out = new URL('../public/geo/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const read = (f) => JSON.parse(readFileSync(join(src, f), 'utf8'));
const round = (g) => JSON.parse(JSON.stringify(g, (k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v)));

// Rivers and lakes, restricted to Europe and Asia and to rivers worth drawing.
const inTheatre = ([minx, miny, maxx, maxy]) => maxx > -15 && minx < 150 && maxy > -12 && miny < 72;
const bbox = (g) => {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  JSON.stringify(g.coordinates, (k, v) => {
    if (Array.isArray(v) && typeof v[0] === 'number') b = [Math.min(b[0], v[0]), Math.min(b[1], v[1]), Math.max(b[2], v[0]), Math.max(b[3], v[1])];
    return v;
  });
  return b;
};
const rivers = read('ne_50m_rivers_lake_centerlines.geojson').features
  .filter((f) => f.geometry && inTheatre(bbox(f.geometry)))
  .map((f) => ({ type: 'Feature', properties: { name: f.properties.name, rank: f.properties.scalerank }, geometry: round(f.geometry) }));
const lakes = read('ne_50m_lakes.geojson').features
  .filter((f) => f.geometry && inTheatre(bbox(f.geometry)) && f.properties.scalerank <= 4)
  .map((f) => ({ type: 'Feature', properties: { name: f.properties.name }, geometry: round(f.geometry) }));
writeFileSync(join(out, 'rivers.json'), JSON.stringify({ type: 'FeatureCollection', features: rivers }));
writeFileSync(join(out, 'lakes.json'), JSON.stringify({ type: 'FeatureCollection', features: lakes }));
console.log(`rivers: ${rivers.length}, lakes: ${lakes.length}`);
