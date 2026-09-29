# UK Atlas: intent brief

This is the brief for building the UK Atlas. Read it in full, and read PACK-SPEC.md, before writing any code. If anything below conflicts with the code you inherit, this brief wins. If anything here is unclear, or a file it names is missing, **stop and ask me**. Do not work around a missing file by writing your own data.

## What we are making, and why

The UK Atlas is an interactive 3D globe for teaching and research in UK higher education. It shows dated, sourced events and changing regions over time, with a draggable timeline, a play button, and clickable pins that open the evidence behind each event.

It is a general-purpose version of Entry A from https://github.com/henders23/waratlas (folder `a-claude/`, MIT licence). That entry is an atlas of the Mongol conquests. We keep its engine and its standard of evidence, and remove everything specific to war.

The feature that matters most is the **evidence discipline**. Every point on the map comes from a row in a research pack. Each row records whether it is included, why, the primary sources behind it, and how precisely it may be drawn. The atlas never shows more certainty than the pack allows. This discipline is also why the tool works for assessment: students can build and defend a pack, and the atlas renders their judgements.

The first dataset is **Roman and early medieval Britain, AD 43–1066**. It suits the tool because so much of the evidence is uncertain: sites dated only to a window of years, interpretations that are debated, and later legends that must be kept apart from the archaeology. It needs no territory layer in this first round.

## Starting point

1. Create a new repo from `a-claude/` in henders23/waratlas. Keep the Git history if that is practical, and keep the MIT licence.
2. Copy this hand-off folder into the repo root. It contains `INTENT.md`, `PACK-SPEC.md`, `tools/` and `datasets/`.
3. Delete the Mongol data from `src/data/mongol/`, the `data/mongol/` folder and `scripts/region-spec.mjs`. **Only do this after** the generic loader works, so that you can compare against the old behaviour.

## Required changes

### 1. Generalise the schema (`src/data/schema.ts`)

- Replace the war-specific event fields `sides`, `commanders`, `strength`, `casualties` and `outcome` with `facets?: { label: string; value: string }[]`.
- Make `kind` and `phase` strings, validated against the dataset's `dataset.json` rather than hard-coded unions.
- Add `magnitude?: number`. When a dataset declares `magnitudeLabel`, pin size scales with magnitude. When it does not, pin size follows `importance` as it does now.
- Keep these fields exactly as they are: `geometry` (`city`, `site` or `area`), `radiusKm`, `datePrecision`, `locationCertainty`, `certainty`, `uncertaintyNote`, `sources` and `importance`.
- Remove `Campaign` and `Waypoint`. Routes are out of scope (see "Not in scope" below).

### 2. Load datasets from their packs, not from hand-written JSON

- A dataset is a folder: `datasets/<slug>/` containing `dataset.json`, `pack/<slug>-rNN.csv` and `narratives/<canonical_id>.md`.
- At build time, a script converts the **latest round** of the pack into events. It uses only `include` rows, and takes each event's prose from its narrative file. The CSV is the single source of truth for dates, places, geometry and sources. Do not copy that information into a second file.
- The loader chooses which dataset to show by slug, via a URL parameter (`?d=early-britain`) with a default. A dataset picker in the UI is welcome but optional.
- The territory layer stays in the code but becomes optional for each dataset. When a dataset's `territory` is `null`, the atlas draws no regions and shows no territory legend.

### 3. Rewrite the event panel

- Show the title, date (formatted according to its precision), place, kind and certainty. Formats: `year` gives "AD 122"; `circa` gives "c. AD 410"; `range` gives "between AD 610 and 640"; negative years are BC ("55 BC"). Use "AD" for years before 1000 and drop it from 1000 onwards.
- Show facets as a simple label and value list.
- Show the summary, detail and significance from the narrative file.
- Show the sources, primary locators first, followed by the pack's `disposition_reason` in small type. This lets a reader see why the event is on the map.
- If `certainty` is not `high` or `locationCertainty` is not `exact`, show the `uncertaintyNote` clearly. It must not be hidden behind a click.

### 4. Show date windows honestly

The pack's new `range` precision means the event happened **at some point** between `date_start` and `date_end`. It does not mean it lasted that long. On the timeline and globe, draw a `range` event faintly across its whole window and at full strength only when the playhead is inside it, so a reader can see that the date is a window, not a duration. Years can have one to four digits (`43`, `410`, `1066`); negative years are BC. Check that `src/data/time.ts` handles both.

### 5. Configure the camera for the UK

- The camera and phase cameras come from `dataset.json`. The UK view sits at about zoom 5.3, centred near [-2.5, 54.5].
- Check that terrain relief, labels and pins all read well at UK zoom on desktop and mobile. Declutter labels if they collide.

### 6. Validation is part of the build

- `npm run validate` runs `python3 tools/validate_pack.py datasets/<slug>`.
- `npm run build` fails if validation fails.
- The validator in `tools/` is the reference implementation. You may port it to Node if you prefer one toolchain, but its rules must not become weaker.
- Draft mode (`--draft`) allows rows whose `review_status` is `unverified`. The dev server uses draft mode. The production build does not.

### 7. Label the text

Anywhere the atlas shows text the pack does not support directly, such as phase stories or the "About" panel, label it as the atlas's own synthesis. The Mongol atlas did this for its territory layer.

## The first dataset: Roman and early medieval Britain

The template pack at `datasets/early-britain/pack/early-britain-r01.csv` contains **example rows only**. Every one is marked `unverified`, and none has a checked primary locator. The rows are chosen to exercise the rules: sites dated by windows (Vindolanda, Fishbourne, Bath), an interpretation kept apart from the evidence (Sutton Hoo and Rædwald), a discovery merged into the event it evidences (the 1939 excavation), and a later legend excluded while the genuine archaeology at the same place is included (Tintagel). Your job for this dataset is:

1. Build the atlas so that it renders those example rows in draft mode.
2. **Do not research or add further sites or events yourself** unless I ask you to. Filling the pack is my job, or my students' job. That is the point of the tool.
3. If you notice that an example row is factually wrong, do not edit r01. Tell me what is wrong and suggest a correction for the next round (see PACK-SPEC.md, "Rounds").
4. **Linear monuments are a known gap.** Hadrian's Wall, the Antonine Wall, Offa's Dyke and the Roman roads are lines, and the engine can only draw points and halos. Do not represent them by a pin or halo, and do not build lines in this round. Instead, when you finish, give me a short written proposal for a `line` geometry drawn only from coordinates listed in the pack, including how the validator would check it.

## Acceptance criteria

- With `?d=early-britain` in draft mode, every `include` row in the latest round appears exactly once. `city` and `site` events appear as pins. `area` events appear as halos with the correct `radiusKm`.
- `merge` and `exclude` rows are not drawn.
- A production build fails while any include row is `unverified`, and the error message says which rows.
- `range` events show as faint windows on the timeline, as described above, and dates display as "AD 43", "c. AD 410", "between AD 610 and 640".
- The timeline covers the time range in `dataset.json`. Play moves through the phases and the camera follows them.
- Clicking any event shows its sources and `disposition_reason`.
- No text anywhere in the UI mentions war or the Mongols.
- It works at 375px mobile width and on desktop, in both light and dark themes.
- The README explains how to add a new dataset, in a way that a non-developer can follow.

## Not in scope

- **Routes, arcs and flows.** The engine has no arcs. Adding them is a separate project.
- **Live data feeds.** This atlas is for curated, sourced history.
- **Deployment.** Build and run it locally. Ask me before deploying anything, and I will give you a target.
- **Video recording.** Do not produce a promotional video.

## How to work

- Check in with me at three points: after the schema and loader work (show me the example rows rendering), after the panel is rewritten, and before you delete the Mongol code.
- Use subagents only if they help. Keep the work focused. The pack is the data; the job is the engine.
