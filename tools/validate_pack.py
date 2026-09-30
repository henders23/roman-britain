#!/usr/bin/env python3
"""Validate a UK Atlas dataset against PACK-SPEC.md.

Usage:
    python3 tools/validate_pack.py datasets/<slug>            # production rules
    python3 tools/validate_pack.py datasets/<slug> --draft    # allows unverified rows and missing narratives

Checks the latest round (highest rNN) of pack/<slug>-rNN.csv, any journeys in
journeys/*.md, and images.json. Exits 1 on any error.
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


def parse_journey(text):
    """A journey file: '# Title', optional 'By:' and 'Order:' lines, an introduction,
    then '## Stop: <canonical_id>' sections with the text for each stop."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    parts = re.split(r"^##\s+", text, flags=re.M)
    head, stops = parts[0], []
    for part in parts[1:]:
        line, _, body = part.partition("\n")
        m = re.match(r"Stop:\s*(\S+)\s*$", line.strip(), flags=re.I)
        stops.append(((m[1] if m else ""), body.strip()))
    title, by, order, intro = "", "", "chronological", []
    for line in head.splitlines():
        if not title and line.startswith("# "):
            title = line[2:].strip()
        elif re.match(r"^By:", line, flags=re.I):
            by = line.split(":", 1)[1].strip()
        elif re.match(r"^Order:", line, flags=re.I):
            order = line.split(":", 1)[1].strip().lower()
        else:
            intro.append(line)
    return {"title": title, "by": by, "order": order, "intro": "\n".join(intro).strip(), "stops": stops}


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
    # Phase years are inclusive at both ends ("to" is the last year), so no year may
    # belong to two phases.
    ordered = sorted(phases.values(), key=lambda p: p["from"])
    for p in ordered:
        if p["from"] > p["to"]:
            err(f"phase:{p['id']}", f"phase starts after it ends ({p['from']}–{p['to']})")
    for a, nxt in zip(ordered, ordered[1:]):
        if nxt["from"] <= a["to"]:
            err(f"phase:{nxt['id']}", f"phase overlaps '{a['id']}': {a['id']} runs {a['from']}–{a['to']} "
                f"and {nxt['id']} starts in {nxt['from']} (a phase's 'to' is its last year)")
        elif nxt["from"] > a["to"] + 1:
            err(f"phase:{nxt['id']}", f"gap before this phase: '{a['id']}' ends in {a['to']} and "
                f"'{nxt['id']}' starts in {nxt['from']}, so {a['to'] + 1}–{nxt['from'] - 1} belong to no phase")
    # Together the phases must cover the whole timeline.
    tr = cfg.get("timeRange", {})
    if ordered and "from" in tr and ordered[0]["from"] > tr["from"]:
        err(f"phase:{ordered[0]['id']}", f"the first phase starts in {ordered[0]['from']}, after the timeline starts ({tr['from']})")
    if ordered and "to" in tr and ordered[-1]["to"] < tr["to"]:
        err(f"phase:{ordered[-1]['id']}", f"the last phase ends in {ordered[-1]['to']}, before the timeline ends ({tr['to']})")

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

    # images: public-domain or openly licensed pictures for event cards, from Wikimedia Commons
    ipath = root / "images.json"
    if ipath.exists():
        try:
            images = json.loads(ipath.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            images = {}
            err("images.json", f"is not valid JSON: {e}")
        for cid, img in images.items():
            where = f"image:{cid}"
            if cid not in included:
                err(where, "no included event has this canonical_id")
            if not isinstance(img, dict):
                err(where, "must be an object with file, caption, author and licence")
                continue
            f = img.get("file", "")
            if not f or f.startswith("File:") or "%" in f or "/" in f:
                err(where, "file must be a plain Wikimedia Commons file name, without 'File:'")
            for key in ("caption", "licence"):
                if not str(img.get(key, "")).strip():
                    err(where, f"missing {key}")
            lic = str(img.get("licence", "")).lower()
            if lic and not (lic.startswith("public domain") or lic == "cc0") and not str(img.get("author", "")).strip():
                err(where, "an image that is not public domain needs its author for attribution")

    # journeys: guided routes through included events
    jdir = root / "journeys"
    for jpath in sorted(jdir.glob("*.md")) if jdir.is_dir() else []:
        if jpath.name.startswith("_"):
            continue
        jid = f"journey:{jpath.stem}"
        if not KEBAB.match(jpath.stem):
            err(jid, "journey file name must be kebab-case")
        j = parse_journey(jpath.read_text(encoding="utf-8"))
        if not j["title"]:
            err(jid, "journey needs a '# Title' line")
        if not j["intro"]:
            err(jid, "journey needs an introduction under its title")
        elif "PLACEHOLDER" in j["intro"]:
            (warn if draft else err)(jid, "journey introduction is still a placeholder")
        if j["order"] not in ("chronological", "thematic"):
            err(jid, f"Order: '{j['order']}' must be chronological or thematic")
        if len(j["stops"]) < 2:
            err(jid, "journey needs at least two '## Stop: <canonical_id>' sections")
        seen_stops, prev_t = set(), None
        for sid, text in j["stops"]:
            where = f"{jid} stop {sid or '?'}"
            if sid in seen_stops:
                err(where, "stop appears twice in this journey")
            seen_stops.add(sid)
            if sid not in included:
                other = next((r for r in rows if r["canonical_id"] == sid or r["candidate_id"] == sid), None)
                why = {"merge": "is a merge row", "exclude": "is an exclude row"}.get(other["disposition"], "is not included") if other else "is not in the pack"
                err(where, f"'{sid}' {why}; a journey may only stop at included events")
                continue
            if not text:
                err(where, "stop has no text")
            elif "PLACEHOLDER" in text:
                (warn if draft else err)(where, "stop text is still a placeholder")
            t = year_of(included[sid]["date_start"])
            if j["order"] == "chronological" and t is not None and prev_t is not None and t < prev_t:
                err(where, "stop is earlier than the one before it; reorder the stops or add 'Order: thematic'")
            if t is not None:
                prev_t = t

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
