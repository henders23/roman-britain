// Reads a dataset folder (datasets/<slug>/) and turns the latest round of its research
// pack into atlas events. The CSV is the single source of truth for dates, places,
// geometry and sources; prose comes from narratives/<canonical_id>.md. Nothing is
// written to disk: the Vite plugin serves the result as a virtual module.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row); }
  const [head = [], ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** Dataset folders under root: any directory holding a dataset.json. */
export function listDatasets(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((d) => !d.startsWith('.') && !d.startsWith('_') && statSync(join(root, d)).isDirectory() && existsSync(join(root, d, 'dataset.json')))
    .sort();
}

export function latestRound(packDir, slug) {
  if (!existsSync(packDir)) return null;
  const re = new RegExp(`^${slug}-r(\\d{2})\\.csv$`);
  const rounds = readdirSync(packDir).filter((f) => re.test(f)).sort();
  if (!rounds.length) return null;
  const file = rounds[rounds.length - 1];
  return { file, path: join(packDir, file), round: `r${file.match(re)[1]}` };
}

/** Sections of a narrative file, keyed by heading, with HTML comments removed. */
export function narrativeSections(text) {
  const clean = text.replace(/<!--[\s\S]*?-->/g, '');
  const found = {};
  for (const part of clean.split(/^##\s+/m).slice(1)) {
    const nl = part.indexOf('\n');
    const head = (nl < 0 ? part : part.slice(0, nl)).trim();
    found[head] = (nl < 0 ? '' : part.slice(nl + 1)).trim();
  }
  return found;
}

/** A journey file: '# Title', optional 'By:' and 'Order:' lines, an introduction, then
 *  '## Stop: <canonical_id>' sections. Mirrors parse_journey in tools/validate_pack.py. */
export function parseJourney(text) {
  const parts = text.replace(/<!--[\s\S]*?-->/g, '').split(/^##\s+/m);
  const stops = parts.slice(1).map((part) => {
    const nl = part.indexOf('\n');
    const line = (nl < 0 ? part : part.slice(0, nl)).trim();
    const m = /^Stop:\s*(\S+)\s*$/i.exec(line);
    return { event: m ? m[1] : '', text: (nl < 0 ? '' : part.slice(nl + 1)).trim() };
  });
  let title = '', by = '', order = 'chronological';
  const intro = [];
  for (const line of parts[0].split('\n')) {
    if (!title && line.startsWith('# ')) title = line.slice(2).trim();
    else if (/^By:/i.test(line)) by = line.slice(line.indexOf(':') + 1).trim();
    else if (/^Order:/i.test(line)) order = line.slice(line.indexOf(':') + 1).trim().toLowerCase();
    else intro.push(line);
  }
  return { title, by, order, intro: intro.join('\n').trim(), stops };
}

const splitBar = (s) => (s ?? '').split('|').map((x) => x.trim()).filter(Boolean);

function facetsOf(s) {
  return splitBar(s).map((f) => {
    const i = f.indexOf('=');
    return { label: f.slice(0, i).trim(), value: f.slice(i + 1).trim() };
  });
}

const num = (s) => (s === '' || s === undefined ? undefined : Number(s));

export function loadDataset(dir, slug) {
  const config = JSON.parse(readFileSync(join(dir, 'dataset.json'), 'utf8'));
  slug = config.slug ?? slug;
  const pack = latestRound(join(dir, 'pack'), slug);
  if (!pack) throw new Error(`${dir}: no pack/${slug}-rNN.csv`);
  const rows = parseCsv(readFileSync(pack.path, 'utf8'));
  const merges = rows.filter((r) => r.disposition === 'merge');

  const events = rows
    .filter((r) => r.disposition === 'include')
    .map((r) => {
      const id = r.canonical_id;
      const npath = join(dir, 'narratives', `${id}.md`);
      let narrative = 'missing';
      let secs = {};
      if (existsSync(npath)) {
        secs = narrativeSections(readFileSync(npath, 'utf8'));
        narrative = ['Summary', 'Detail', 'Significance'].some((s) => (secs[s] ?? '').includes('PLACEHOLDER')) ? 'placeholder' : 'ok';
      }
      const primary = [r.primary_locator_1, r.primary_locator_2].filter(Boolean);
      return {
        id,
        sourceRow: r.candidate_id,
        title: r.title,
        kind: r.kind,
        start: r.date_start,
        ...(r.date_end ? { end: r.date_end } : {}),
        datePrecision: r.date_precision,
        place: r.place,
        lon: Number(r.lon),
        lat: Number(r.lat),
        geometry: r.geometry,
        ...(r.geometry === 'area' ? { radiusKm: Number(r.radius_km) } : {}),
        locationCertainty: r.location_certainty,
        certainty: r.certainty,
        ...(r.uncertainty_note ? { uncertaintyNote: r.uncertainty_note } : {}),
        ...(num(r.magnitude) !== undefined ? { magnitude: num(r.magnitude) } : {}),
        facets: facetsOf(r.facets),
        phase: r.phase,
        importance: Number(r.importance),
        sources: [...primary, ...splitBar(r.secondary_sources)],
        primaryCount: primary.length,
        dispositionReason: r.disposition_reason,
        candidateDescription: r.candidate_description,
        rightsStatus: r.rights_status,
        reviewStatus: r.review_status,
        merged: merges
          .filter((m) => m.merge_target === id)
          .map((m) => ({ candidateId: m.candidate_id, description: m.candidate_description, reason: m.disposition_reason })),
        narrative,
        summary: secs.Summary ?? '',
        detail: secs.Detail ?? '',
        significance: secs.Significance ?? '',
      };
    });

  // Pictures for event cards: datasets/<slug>/images.json, keyed by canonical_id.
  const ipath = join(dir, 'images.json');
  const images = existsSync(ipath) ? JSON.parse(readFileSync(ipath, 'utf8')) : {};
  for (const e of events) if (images[e.id]) e.image = images[e.id];

  const jdir = join(dir, 'journeys');
  const journeys = existsSync(jdir)
    ? readdirSync(jdir)
        .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
        .sort()
        .map((f) => {
          const j = parseJourney(readFileSync(join(jdir, f), 'utf8'));
          const placeholder = [j.intro, ...j.stops.map((s) => s.text)].some((t) => t.includes('PLACEHOLDER'));
          return { id: f.replace(/\.md$/, ''), ...j, placeholder };
        })
    : [];

  const set = (d) => rows.filter((r) => r.disposition === d).map((r) => ({ candidateId: r.candidate_id, description: r.candidate_description, reason: r.disposition_reason, ...(r.merge_target ? { target: r.merge_target } : {}) }));
  return {
    config: { ...config, slug },
    pack: {
      file: pack.file,
      round: pack.round,
      rows: rows.length,
      include: events.length,
      merged: set('merge'),
      excluded: set('exclude'),
      unverified: rows.filter((r) => r.review_status === 'unverified').map((r) => ({ candidateId: r.candidate_id, disposition: r.disposition })),
    },
    events,
    journeys,
  };
}
