# Research pack specification

A research pack is the evidence ledger behind an atlas dataset. Each row is one **candidate** event: something someone found and proposed for the map. The row records what was decided about it and why. The atlas draws only what the pack allows.

This file is for anyone building a pack, whether that is me, a colleague or a student group.

## Files in a dataset

```
datasets/<slug>/
  dataset.json              title, time range, camera, kinds, phases, facet labels
  pack/<slug>-r01.csv       round 1 of the pack
  pack/<slug>-r02.csv       round 2 (each round is a complete new copy, never an edit)
  narratives/<canonical_id>.md   prose for each included event
```

## Rounds

A pack is never edited in place. To change anything, copy the latest round to the next number (r01 to r02), make the changes there, and add a line to the change log at the top of `pack/CHANGES.md`. This means you can always see what changed between rounds and why. The atlas uses the highest-numbered round.

## Columns

| Column | Required | What it holds |
|---|---|---|
| `candidate_id` | always | A stable ID for the candidate, e.g. `ukq:1580-dover-straits`. It never changes, even if the row is excluded. |
| `canonical_id` | include | The event's ID on the map, in kebab-case, e.g. `dover-straits-1580`. Its narrative file has the same name. |
| `disposition` | always | `include`, `merge` or `exclude`. |
| `merge_target` | merge | The `canonical_id` of the included event this row is folded into. |
| `disposition_reason` | always | One or two sentences explaining the decision. It is shown to readers. |
| `title` | include | A short title for the pin. |
| `candidate_description` | always | What the candidate claims, in your own words. |
| `kind` | include | One of the kinds listed in `dataset.json`. |
| `date_start` | include | A year (`43`, `410`, `1066`; negative for BC, e.g. `-55`), or `YYYY-MM` or `YYYY-MM-DD` when the evidence is that precise. |
| `date_end` | range, optional otherwise | The same format. Required for `range`. For other precisions it marks an event that lasted over time. |
| `date_precision` | include | `day`, `month`, `season`, `year`, `circa` or `range`. Use `range` when the evidence dates something to a window (e.g. "built at some point between 70 and 80"): the event happened within the window, it did not last for all of it. |
| `place` | include | A place name as a reader would recognise it. |
| `lon`, `lat` | include | Decimal degrees (WGS84). For `area`, this is the centre of the halo. |
| `geometry` | include | `city` or `site` gives a pin. `area` gives a halo, for use when the sources support a region but not a point. |
| `radius_km` | area | The halo radius. It must be blank for `city` and `site`. |
| `location_certainty` | include | `exact`, `approximate` or `uncertain`. |
| `certainty` | include | `high`, `medium` or `low`: how sure we are the event happened as described. |
| `uncertainty_note` | if not high/exact | Required whenever `certainty` is not `high` or `location_certainty` is not `exact`. Say what is uncertain and why. |
| `magnitude` | optional | A number, if the dataset declares a `magnitudeLabel`. |
| `facets` | optional | Extra labelled facts in the form `Label=value`, separated by a vertical bar (`\|`). Labels must be listed in `dataset.json`. |
| `phase` | include | One of the phase IDs in `dataset.json`, and the event's date must fall within that phase. |
| `importance` | include | `1` (major), `2` or `3` (minor). |
| `primary_locator_1` | include | The most direct source, precise enough for someone else to find it (catalogue entry, page, archive reference). |
| `primary_locator_2` | optional | A second independent source. |
| `secondary_sources` | optional | Other supporting sources, separated by a vertical bar (`\|`). |
| `rights_status` | always | Whether text may be quoted, e.g. `citation-only`, `open (OGL v3)` or `to check`. The atlas never quotes a source marked `citation-only`. |
| `review_status` | always | `unverified`, `checked` (locators confirmed by one person) or `reconciled` (checked by two, with conflicts resolved). |

## Rules the validator enforces

1. Every `candidate_id` is unique, and every `canonical_id` is unique among included rows.
2. An `include` row has every field marked "include" in the table above, including at least one primary locator.
3. A `merge` row names a `merge_target` that is an included `canonical_id`. Merging into an excluded or missing row is an error.
4. `area` needs `radius_km`. `city` and `site` must not have it.
5. If `certainty` is not `high` or `location_certainty` is not `exact`, an `uncertainty_note` is required.
6. Coordinates are real numbers and fall inside the bounds set in `dataset.json`.
7. `kind`, `phase` and facet labels exist in `dataset.json`, and the event's date lies within its phase.
8. Every included row has a narrative file with the headings `Summary`, `Detail` and `Significance`, and none of the three is empty.
9. In production mode, no included row may be `unverified`.

## Standards the validator cannot check

- **Do not invent geometry.** If the sources place an event only within a region, use `area`, not a point in the middle of it. Do not draw routes or lines the sources do not support.
- **Merge rather than duplicate.** If two candidates describe the same event (e.g. a site and the modern excavation that discovered it), include one and merge the other into it, then mention the merged details in the narrative.
- **Keep evidence and interpretation apart.** Record what was found in the row and narrative, and put what it is taken to mean (e.g. "possibly Rædwald") in an `Interpretation` facet and the uncertainty note.
- **Keep legend out of the evidence.** If a place has later legends attached, exclude the legend with a reason and include the archaeology as its own row.
- **Write the narrative yourself.** Paraphrase your sources and cite them. Do not paste in source text.
- **Exclude with a reason.** An excluded row stays in the pack with its reason. Being able to see what was left out is part of the evidence.
