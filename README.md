# UK Atlas

An interactive 3D globe for teaching and research. It shows dated, sourced events over time, with a draggable timeline, a play button, and pins you can click to see the evidence behind each event.

Every point on the map comes from a row in a **research pack**: a spreadsheet that records each candidate event, whether it was included, why, the sources behind it, and how precisely it may be drawn. The atlas never shows more certainty than the pack allows. The rules for packs are in [PACK-SPEC.md](PACK-SPEC.md), and the brief for the atlas is in [INTENT.md](INTENT.md).

The first dataset is **Roman and early medieval Britain, AD 43–1066** (`datasets/early-britain/`). Its pack holds example rows only, all unverified.

## What you see

- **Pins** mark events the sources place at a named place or site. The symbol shows the kind of event, and bigger pins are more important (importance 1 in the pack).
- **Dashed rings** mark events the sources place only within a region. The ring's size is the pack's `radius_km`.
- **Dotted rings** (on the map) and **faint bars** (on the timeline) mark events dated only to a window of years, such as "between AD 610 and 640". The event happened at some point in the window, not throughout it. They are at full strength only while the playhead is inside the window.
- **Small dots** are earlier events.
- Click any marker for its card: the date, the place, how certain it is, the narrative, the sources (primary first), and the pack's reason for including it.
- Chapter stories and the About panel are the atlas's own writing, and are labelled "Atlas synthesis".

## Running it on your computer

You need [Node.js](https://nodejs.org/) (version 22 or later) and Python 3.

```sh
npm ci              # once, to install
npm run dev         # open http://localhost:5173
```

The development view (`npm run dev`) is in **draft mode**: it shows rows that no one has checked yet, marked "Unverified". Use it while you build a pack.

Other commands:

```sh
npm run validate:draft   # check every pack, allowing unverified rows
npm run validate         # check every pack as a production build would
npm run build            # validate, then build the site into dist/
npm test                 # check the date formatting
```

`npm run build` **stops with an error** while any row is still unverified, or anything else in the pack breaks the rules. The message lists the rows that need attention.

`npm run build:draft` builds a **draft site** instead: it allows unverified rows and placeholder text, as the development view does, and every page is marked Draft. The Vercel deployment uses it for now (see `vercel.json`). When the pack passes `npm run validate`, change `buildCommand` in `vercel.json` to `npm run build`, so the published site can only be built from a checked pack.

To show a particular dataset, add `?d=<name>` to the address, for example `http://localhost:5173/?d=early-britain`. Without it the atlas shows `early-britain`. If there is more than one dataset, you can also switch with the menu under the title.

## Adding a new dataset

You do not need to write any code. A dataset is a folder of plain files.

### 1. Make the folder

Copy `datasets/early-britain` and rename the copy. Use a short name in lower case with hyphens, for example `datasets/tudor-london`. This name is the dataset's **slug**.

Inside it you will have:

```
datasets/tudor-london/
  dataset.json              settings: title, dates, map view, kinds, phases
  pack/tudor-london-r01.csv round 1 of the research pack
  pack/CHANGES.md           what changed in each round, and why
  narratives/               one text file for each included event
  journeys/                 optional guided routes through the events
```

Delete the example narrative files, and rename the pack file so it starts with your slug (`tudor-london-r01.csv`).

### 2. Edit `dataset.json`

Open it in any text editor. Change:

- `slug`: the folder name.
- `title` and `subtitle`: shown at the top of the atlas.
- `timeRange`: the first and last year of the timeline. Use negative numbers for BC (`-55` is 55 BC).
- `bounds`: a box around your area, in degrees of longitude and latitude. The validator rejects any point outside it.
- `camera`: where the map looks at first. `center` is `[longitude, latitude]`; `zoom` is about 5.3 for all of Britain, about 9 for a city.
- `magnitudeLabel`: leave it `null`, or name a number your pack records for every event (for example `"Estimated population"`). When it is set, pin size follows that number instead of importance.
- `territory`: leave it `null`. (Shaded territories need extra map files; ask a developer.)
- `kinds`: the types of event your pack may use, each with an `id` (used in the pack) and a `label` (shown to readers). These ids get their own symbol: `town`, `settlement`, `villa`, `fort`, `religious`, `burial`, `hoard`, `text`, `political`, `battle`, `treaty`, `death`, `naval`, `flag`. Any other id is drawn as a dot, or you can add `"icon": "town"` (for example) to borrow a symbol.
- `facetLabels`: the extra labels your pack may use in its `facets` column, such as `"Evidence type"`.
- `phases`: the chapters of your timeline, in order. Each has an `id`, a `title`, `from` and `to` years (`to` is the phase's last year, so the next phase starts the year after: 43–121, then 122–284), a short `story` (your own synthesis, 2–3 sentences), and a `camera` for where the map moves to when playback reaches it.

Keep the punctuation exactly as it is: quotation marks around text, commas between items, no comma after the last item. If the atlas will not load, a missing or extra comma is the usual cause.

### 3. Fill in the pack

Open the CSV in a spreadsheet program (Excel, LibreOffice, Google Sheets) and save it back as CSV. Each row is one candidate event. [PACK-SPEC.md](PACK-SPEC.md) explains every column. In short:

- `disposition` is `include`, `merge` or `exclude`. Only `include` rows appear on the map. Excluded and merged rows stay in the pack with their reasons, and are listed in the atlas's About panel.
- `geometry` is `city` or `site` for a pin, or `area` for a region (then fill in `radius_km`).
- `date_precision` is `year`, `circa`, `range` (a window: give `date_start` and `date_end`), `season`, `month` or `day`.
- Whenever you are not sure (`certainty` is not `high`, or `location_certainty` is not `exact`), write an `uncertainty_note`. It is shown on the event's card.
- New rows start as `review_status` = `unverified`. When someone has checked the sources, set it to `checked`; when two people have, `reconciled`.

**Never edit a round once it is shared.** To change anything, copy `tudor-london-r01.csv` to `tudor-london-r02.csv`, make the changes there, and add a line to `pack/CHANGES.md` saying what changed and why. The atlas always uses the highest-numbered round.

### 4. Write the narratives

For each included row, create `narratives/<canonical_id>.md`, where `<canonical_id>` is that row's `canonical_id` (for example `narratives/globe-theatre-1599.md`). Start from `datasets/early-britain/narratives/_TEMPLATE.md`. It needs three headings, each with text under it:

```
## Summary
## Detail
## Significance
```

Write in your own words and cite your sources; do not paste source text.

### 5. Add journeys (optional)

A journey is a guided route through events that are already on the map, such as a revolt followed from town to town, or a question like "How do we know when?". Readers open it from **Journeys**. The timeline and camera move to each stop in turn, and the event's card opens beside the journey's own text.

Copy `datasets/early-britain/journeys/_TEMPLATE.md` to `journeys/<journey-name>.md` (lower case, hyphens) and fill it in:

```
# How do we know when?
By: Group 3
Order: chronological

An introduction: the question the journey asks, and what to look for.

## Stop: vindolanda-tablets
Why we stop here, what the evidence shows, and how it leads on.

## Stop: sutton-hoo-mound1
...
```

- Each `## Stop:` names the `canonical_id` of an **included** row in the latest round. A journey cannot add places or dates of its own, or stop at a merged or excluded row.
- Stops go in date order. To order them some other way, for example by theme, write `Order: thematic`.
- Nothing is drawn between stops: the camera moves, but the atlas does not claim a route. Say in the text what is known about how people or things moved.
- The journey's text is shown as its author's interpretation. The evidence stays in each event's card.
- A journey needs a title, an introduction and at least two stops, each with text. `npm run validate:draft` checks all of this.

Share a journey by copying the address while it is open; the link opens at the same stop.

### 6. Check it

Run `npm run validate:draft`. It reports every problem, naming the row (by `candidate_id`) and what is wrong. Fix them in the next round and run it again. Then run `npm run dev` and open `http://localhost:5173/?d=tudor-london`.

Before the dataset can be published, `npm run validate` must pass. That means every row has been checked, every primary locator is real (no `TO LOCATE` placeholders), every narrative and journey is written, and every phase story is filled in.

## How it works (for developers)

- `tools/validate_pack.py` is the reference validator. `scripts/validate.mjs` runs it for each dataset. `npm run build` runs it in production mode first, and so does the Vite plugin, so `vite build` alone cannot skip it.
- `scripts/pack.mjs` reads a dataset folder: the latest pack round, include rows only, with prose from the narrative files. `scripts/vite-datasets.mjs` serves each dataset as a virtual module (`virtual:atlas-datasets`), so the CSV stays the only copy of the data. The dev server validates in draft mode and reloads when a dataset file changes.
- `src/data/schema.ts` defines the event shape; `src/data/dataset.ts` turns a dataset into what the map needs. `src/data/time.ts` parses and formats dates (BC, AD, and date windows).
- `src/map/AtlasMap.ts` draws the globe with MapLibre GL. Its animation timings scale with the length of the timeline.
- An optional territory layer: set `territory` in `dataset.json` to a JSON file in the dataset folder holding `note`, `focusLabel`, `polities` (`id`, `name`, `color`, `focus`), `regions` (region id → `[[date, polity, status], …]`), and `regionsFile` and `bordersFile` naming GeoJSON files beside it. Territory is labelled as the atlas's synthesis.
- `VITE_TERRAIN_TILES` can point the relief at a mirror of the Terrarium tiles. `ATLAS_BASE` serves the build under a path, and `ATLAS_DEFAULT` changes the default dataset.

Relief comes from AWS Terrain Tiles (Mapzen, SRTM, ETOPO1, GMTED), and rivers and lakes from Natural Earth. The map is rendered with MapLibre GL.

## Licence

MIT (see [LICENSE](LICENSE)). The engine began as entry A of `henders23/waratlas`.
