#!/usr/bin/env python3
"""Validate a UK Atlas dataset against PACK-SPEC.md.

Usage:
    python3 tools/validate_pack.py datasets/<slug>            # production rules
    python3 tools/validate_pack.py datasets/<slug> --draft    # allows unverified rows and missing narratives

Checks the latest round (highest rNN) of pack/<slug>-rNN.csv. Exits 1 on any error.
"""
import csv
import json
import re
import sys
from pathlib import Path

COLUMNS = [
    "candidate_id", "canonical_id", "disposition", "merge_target", "disposition_reason",
    "title", "candidate_description", "kind", "date_start", "date_end", "date_precision",
    "place", "lon", "lat", "geometry", "radius_km", "location_certainty", "certainty",
    "uncertainty_note", "magnitude", "facets", "phase", "importance",
    "primary_locator_1", "primary_locator_2", "secondary_sources", "rights_status", "review_status",
]
ALWAYS = ["candidate_id", "disposition", "disposition_reason", "candidate_description",
          "rights_status", "review_status"]
INCLUDE_REQUIRED = ["canonical_id", "title", "kind", "date_start", "date_precision", "place",
                    "lon", "lat", "geometry", "location_certainty", "certainty", "phase",
                    "importance", "primary_locator_1"]
ENUMS = {
    "disposition": {"include", "merge", "exclude"},
    "date_precision": {"day", "month", "season", "year", "circa", "range"},
    "geometry": {"city", "site", "area"},
    "location_certainty": {"exact", "approximate", "uncertain"},
    "certainty": {"high", "medium", "low"},
    "importance": {"1", "2", "3"},
    "review_status": {"unverified", "checked", "reconciled"},
}
DATE = re.compile(r"^(-?\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$")  # 43, 1066, 1884-04-22; negative = BC
KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SECTIONS = ["Summary", "Detail", "Significance"]


def year_of(s):
    m = DATE.match(s)
    if not m:
        return None
    y, mo, d = int(m[1]), int(m[2] or 1), int(m[3] or 1)
    return y + (mo - 1) / 12 + (d - 1) / 365


def latest_round(pack_dir, slug):
    rounds = sorted(pack_dir.glob(f"{slug}-r[0-9][0-9].csv"))
    return rounds[-1] if rounds else None


def narrative_sections(path):
    text = re.sub(r"<!--.*?-->", "", path.read_text(encoding="utf-8"), flags=re.S)
    found = {}
    for part in re.split(r"^##\s+", text, flags=re.M)[1:]:
        head, _, body = part.partition("\n")
        found[head.strip()] = body.strip()
    return found


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    draft = "--draft" in sys.argv
    if len(args) != 1:
        print(__doc__)
        return 2
    root = Path(args[0])
    errors, warnings = [], []

    def err(row, msg):
        errors.append(f"[{row}] {msg}")

    def warn(row, msg):
        warnings.append(f"[{row}] {msg}")

    try:
        cfg = json.loads((root / "dataset.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"ERROR: cannot read {root / 'dataset.json'}: {e}")
        return 1
    slug = cfg.get("slug", root.name)
    kinds = {k["id"] for k in cfg.get("kinds", [])}
    phases = {p["id"]: p for p in cfg.get("phases", [])}
    facet_labels = set(cfg.get("facetLabels", []))
    b = cfg.get("bounds", {})
    for p in phases.values():
        if p.get("story", "").startswith("TODO"):
            (warn if draft else err)(f"phase:{p['id']}", "phase story is still TODO")

    pack = latest_round(root / "pack", slug)
    if not pack:
        print(f"ERROR: no pack/{slug}-rNN.csv found in {root}")
        return 1
    with pack.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        missing_cols = [c for c in COLUMNS if c not in (reader.fieldnames or [])]
        if missing_cols:
            print(f"ERROR: {pack.name} is missing columns: {', '.join(missing_cols)}")
            return 1
        rows = [{k: (v or "").strip() for k, v in r.items() if k} for r in reader]

    seen_cand, included = set(), {}
    for i, r in enumerate(rows, start=2):
        rid = r["candidate_id"] or f"line {i}"
        for c in ALWAYS:
            if not r[c]:
                err(rid, f"missing {c}")
        if r["candidate_id"] in seen_cand:
            err(rid, "duplicate candidate_id")
        seen_cand.add(r["candidate_id"])
        for c, allowed in ENUMS.items():
            if r[c] and r[c] not in allowed:
                err(rid, f"{c} '{r[c]}' is not one of {sorted(allowed)}")
        if r["review_status"] == "unverified":
            (warn if draft else err)(rid, "review_status is unverified")

        if r["disposition"] != "include":
            continue
        cid = r["canonical_id"]
        for c in INCLUDE_REQUIRED:
            if not r[c]:
                err(rid, f"include row missing {c}")
        if cid:
            if not KEBAB.match(cid):
                err(rid, f"canonical_id '{cid}' must be kebab-case")
            if cid in included:
                err(rid, f"canonical_id '{cid}' already used by {included[cid]['candidate_id']}")
            included[cid] = r
        if "TO LOCATE" in r["primary_locator_1"].upper():
            (warn if draft else err)(rid, "primary_locator_1 is still a placeholder")

        # geometry and coordinates
        if r["geometry"] == "area":
            try:
                if float(r["radius_km"]) <= 0:
                    raise ValueError
            except ValueError:
                err(rid, "area geometry needs a positive radius_km")
        elif r["radius_km"]:
            err(rid, f"radius_km must be blank for {r['geometry']} geometry")
        try:
            lon, lat = float(r["lon"]), float(r["lat"])
            if b and not (b["minLon"] <= lon <= b["maxLon"] and b["minLat"] <= lat <= b["maxLat"]):
                err(rid, f"coordinates ({lon}, {lat}) fall outside the dataset bounds")
        except ValueError:
            err(rid, "lon/lat must be numbers")

        # uncertainty
        if (r["certainty"] != "high" or r["location_certainty"] != "exact") and not r["uncertainty_note"]:
            err(rid, "uncertainty_note is required when certainty is not high or location is not exact")

        # dates and phase
        t0 = year_of(r["date_start"])
        if t0 is None:
            err(rid, f"date_start '{r['date_start']}' must be a year (e.g. 43, 1066, -55 for 55 BC), YYYY-MM or YYYY-MM-DD")
        if r["date_precision"] == "range" and not r["date_end"]:
            err(rid, "date_precision 'range' needs a date_end (the event happened somewhere between start and end)")
        if r["date_end"]:
            t1 = year_of(r["date_end"])
            if t1 is None:
                err(rid, f"date_end '{r['date_end']}' has a bad format")
            elif t0 is not None and t1 < t0:
                err(rid, "date_end is before date_start")
        if r["kind"] and r["kind"] not in kinds:
            err(rid, f"kind '{r['kind']}' is not in dataset.json")
        ph = phases.get(r["phase"])
        if r["phase"] and not ph:
            err(rid, f"phase '{r['phase']}' is not in dataset.json")
        elif ph and t0 is not None and not (ph["from"] <= int(t0) <= ph["to"]):
            err(rid, f"date {r['date_start']} lies outside phase '{ph['id']}' ({ph['from']}–{ph['to']})")

        # magnitude and facets
        if r["magnitude"]:
            try:
                float(r["magnitude"])
            except ValueError:
                err(rid, "magnitude must be a number")
            if not cfg.get("magnitudeLabel"):
                err(rid, "magnitude given but dataset.json has no magnitudeLabel")
        for facet in filter(None, (x.strip() for x in r["facets"].split("|"))):
            label, sep, value = facet.partition("=")
            if not sep or not value.strip():
                err(rid, f"facet '{facet}' must be Label=value")
            elif label.strip() not in facet_labels:
                err(rid, f"facet label '{label.strip()}' is not in dataset.json facetLabels")

        # narrative
        if cid:
            npath = root / "narratives" / f"{cid}.md"
            if not npath.exists():
                (warn if draft else err)(rid, f"no narrative file narratives/{cid}.md")
            else:
                secs = narrative_sections(npath)
                for s in SECTIONS:
                    if not secs.get(s):
                        err(rid, f"narrative is missing or has an empty '## {s}' section")
                    elif "PLACEHOLDER" in secs[s]:
                        (warn if draft else err)(rid, f"narrative '## {s}' is still a placeholder")

    # merges point at included rows
    for r in rows:
        if r["disposition"] == "merge":
            if not r["merge_target"]:
                err(r["candidate_id"], "merge row needs a merge_target")
            elif r["merge_target"] not in included:
                err(r["candidate_id"], f"merge_target '{r['merge_target']}' is not an included canonical_id")

    counts = {d: sum(r["disposition"] == d for r in rows) for d in ("include", "merge", "exclude")}
    mode = "draft" if draft else "production"
    print(f"{pack.name} ({mode} mode): {len(rows)} rows, "
          f"{counts['include']} include, {counts['merge']} merge, {counts['exclude']} exclude")
    for w in warnings:
        print(f"  warning {w}")
    for e in errors:
        print(f"  ERROR   {e}")
    print("FAILED" if errors else "OK")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
