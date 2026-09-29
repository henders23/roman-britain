# Proposal: a `line` geometry for linear monuments

Status: proposal only. Nothing here is built. The atlas draws no lines in this round.

## The problem

Hadrian's Wall, the Antonine Wall, Offa's Dyke and the Roman roads are lines. The engine can draw only pins (`city`, `site`) and halos (`area`). A pin at one point of Hadrian's Wall would suggest the wall was a place; a halo would suggest a vague region. Both misrepresent the evidence, so the brief keeps them off the map for now.

## The rule

A line is drawn **only through coordinates written in the pack**, joined in the order given, with straight segments. The atlas never smooths, snaps to terrain, routes along roads, or fills gaps. If the pack lists five points, the reader sees exactly five points and four segments. The line's accuracy is then the pack's claim, and the pack can be checked.

## Pack changes

1. `geometry` gains a fourth value, `line`.
2. One new column, **`line_vertices`**: the points of the line, in order, separated by `|`. Each point is `lon lat`, optionally with a name: `Name@lon lat`.
3. A segment whose course between two points is **not known** from the sources is marked with `~` instead of `|`. The atlas draws it dashed. A `|` segment claims the sources support the course between those two points (for example, a surveyed stretch of wall); a `~` segment claims only that both ends are known.

Example (illustrative only, not checked coordinates):

```
line_vertices = Wallsend@-1.533 54.988 | Newcastle@-1.611 54.969 | Heddon@-1.790 54.998 ~ Bowness-on-Solway@-3.215 54.954
```

4. `lon`/`lat` must equal one of the vertices. It is where the line's label sits and where the playhead's "flash" appears, so it is a real point too.
5. `radius_km` stays blank. Dates, phase, certainty, sources, narrative and the rest work as for any other event. A construction dated to a window (for example `range` 122–130) behaves exactly like other window events: faint on the timeline, full strength on the map only while the playhead is inside it.

Long routes (the Roman road network) should be split into one row per documented stretch, each with its own primary locator (for example a Margary number and survey report), rather than one row for a whole road. Rows can share a `Name` facet so the reader can see they belong together.

## What the validator would check

Added to `tools/validate_pack.py` (none of the existing rules is weakened):

1. `line` needs `line_vertices`; `city`, `site` and `area` must leave it blank.
2. At least two vertices; every vertex parses as two real numbers, `lon lat`.
3. Every vertex lies inside the dataset `bounds`.
4. No two consecutive vertices are identical; vertex names, where given, are unique within the row.
5. `lon`/`lat` equals one of the vertices (to 4 decimal places).
6. `radius_km` is blank.
7. If any segment is `~`, then `location_certainty` must not be `exact`, and so an `uncertainty_note` is required (the existing rule 5 then applies).
8. A cap on vertices per row (say 200), set in `dataset.json` as `maxLineVertices`, to keep rows reviewable.
9. A **warning** (an error in production) for any `|` segment longer than `maxLineSegmentKm` in `dataset.json` (say 15 km for Britain). A long "known course" segment is usually a gap that should be `~` or more vertices. The author can raise the limit for a dataset, but has to do it on purpose.

What it cannot check, and PACK-SPEC should say: every vertex must come from the row's sources (a survey, a gazetteer entry, an excavation grid reference), not from a modern map traced by eye. The primary locator should say where the coordinates come from.

## What the atlas would do

- Draw `|` segments as a solid line and `~` segments dashed, in the accent colour, with small dots at named vertices. Width follows importance, like pins.
- Treat the line as one event: one timeline tick or window, one card, one label.
- Show on the card how many points and segments the pack gives and how many are dashed ("11 points; 3 of 10 segments have no known course"), so the reader sees the evidence's density.
- The legend gains "Line: drawn only through points in the pack; dashed where the course between them is unknown."

## Rough size of the work

- Validator: about 40 lines of Python, plus tests.
- Loader: parse `line_vertices` into coordinates and segment flags.
- Map: one GeoJSON source and two line layers (solid and dashed), hit-testing for clicks, and time-driven opacity using the existing event states.
- Panel, legend, README and PACK-SPEC updates.

About one to two days, including tests on a fixture pack.
