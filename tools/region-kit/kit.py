#!/usr/bin/env python3
"""Opens an area of the world for building: its cell of the world grid, its data pack and blockout,
the open street photos around it, and a map of all three.

    python3 tools/region-kit/kit.py cell   --lat 38.7118 --lon -9.13
    python3 tools/region-kit/kit.py open   --lat 38.7118 --lon -9.13 --name "Alfama, Lisbon"
    python3 tools/region-kit/kit.py photos c17-62211-50227
    python3 tools/region-kit/kit.py map    c17-62211-50227

docs/open-an-area.md is the guide. `cell` and `open` need only Python and Node. `photos` and `map`
also need numpy (pinned in tools/refs/requirements.txt) and a Mapillary token in MAPILLARY_TOKEN.
Everything fetched is data, never code.
"""
import argparse, datetime, json, os, subprocess, sys, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import grid  # noqa: E402

THUMBS_PER_BUILDING = 4     # the map stores this many photos of each building, sharpest first
THUMBS_DEFAULT = 400        # and this many in all, unless --photos says otherwise


def die(msg):
    sys.exit(msg)


def run(cmd):
    r = subprocess.run(cmd, cwd=REPO)
    if r.returncode:
        die(f"stopped: {' '.join(str(c) for c in cmd)} failed")


def region_dir(rid):
    d = REPO / "data" / rid
    if not (d / "region.json").exists():
        die(f"data/{rid}/region.json does not exist; open the area first")
    return d


def wallrefs():
    sys.path.insert(0, str(REPO / "tools" / "refs"))
    try:
        import numpy  # noqa: F401
    except ImportError:
        die("this step needs numpy, at the version pinned in tools/refs/requirements.txt (see docs/open-an-area.md)")
    import wallrefs as w
    return w


# ---------------------------------------------------------------- cell

def cmd_cell(args):
    x, y = grid.parse_id(args.id) if args.id else grid.cell_of(args.lat, args.lon)
    print(json.dumps(grid.describe(x, y), indent=1))


# ---------------------------------------------------------------- open

def region_record(x, y, name, source):
    c = grid.describe(x, y)
    w, h = c["size_m"]["east_west"], c["size_m"]["north_south"]
    return {
        "id": c["id"], "name": name, "body": "earth",
        "cell": {"grid": "web-mercator", "zoom": c["zoom"], "x": x, "y": y},
        "bounds": c["bounds"],
        "origin": {"lat": c["centre"]["lat"], "lon": c["centre"]["lon"], "note": "Centre of the cell. Local metres are measured from here: +X east, +Z south."},
        "size_m": c["size_m"],
        "square_m": int(max(w, h)) + 1,
        "start_block": {"x_m": [round(-w / 2 - 1, 1), round(w / 2 + 1, 1)], "z_m": [round(-h / 2 - 1, 1), round(h / 2 + 1, 1)], "note": "The whole cell."},
        "accuracy_level": "A0",
        "sources": [source],
    }


SOURCES = {
    "openstreetmap": """# Sources for this data pack

| File | Made from | Licence and duties |
| --- | --- | --- |
| `places.json`, `buildings.geojson`, `blockout/` | OpenStreetMap building outlines, fetched {date} | Open Database License 1.0. Credit "(c) OpenStreetMap contributors". A database made from it stays under ODbL |

Source: https://www.openstreetmap.org/copyright

Edited by this project: the buildings whose outline centre lies in cell {id} were cut out, coordinates were converted to local metres, and plain box models were generated from outlines and heights.

## What the data is

- {buildings} buildings. {tagged} have a tagged height, {storeys} have a height worked out from a storey count at 3 m a storey, and {assumed} have neither and were given 6 m. `height_from` says which.
- Outlines were drawn by volunteers, mostly from aerial imagery. Nobody here measured how far they sit from the real walls.
- There are no roof shapes and no ground levels. Every building stands at height 0.

## Rebuilding it

```sh
python3 tools/region-kit/kit.py open --cell {id} --again
```

OpenStreetMap changes daily, so a later run can give different buildings.
""",
    "plateau": """# Sources for this data pack

| File | Made from | Licence and duties |
| --- | --- | --- |
| `places.json`, `buildings.geojson`, `roof-shapes.json`, `blockout/` | 3D City Model (Project PLATEAU), archive `{zip}` | Public Data License 1.0. Name the source, and say that the data was edited |

Site policy: https://www.mlit.go.jp/plateau/site-policy/. Add the dataset's own page and title here before submitting.

Edited by this project: the buildings whose outline centre lies in cell {id} were cut out, coordinates were converted to local metres, and plain box models were generated from outlines and heights.

## Rebuilding it

```sh
python3 tools/region-kit/kit.py open --cell {id} --again --plateau-zip path/to/{zip}
```
""",
}


def cmd_open(args):
    x, y = grid.parse_id(args.cell) if args.cell else grid.cell_of(args.lat, args.lon)
    rid = grid.cell_id(x, y)
    d = REPO / "data" / rid
    had = (d / "region.json").exists()
    if had and not args.again:
        die(f"data/{rid} is already open; pass --again to cut its pack afresh")
    if had and not args.name:
        args.name = json.loads((d / "region.json").read_text(encoding="utf-8")).get("name")
    if not args.name:
        die('give the place a name: --name "Alfama, Lisbon"')
    source = "plateau" if args.plateau_zip else "openstreetmap"
    d.mkdir(parents=True, exist_ok=True)
    before = (d / "region.json").read_bytes() if had else None
    rec = region_record(x, y, args.name, source)
    (d / "region.json").write_text(json.dumps(rec, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    def undo():     # a failed run leaves the folder as it found it, so the same command can be run again
        if had:
            (d / "region.json").write_bytes(before)
        else:
            (d / "region.json").unlink()
            if not any(d.iterdir()):
                d.rmdir()
    if args.plateau_zip:
        cmd = [sys.executable, "-I", "tools/data-pack/plateau_block.py", "--zip", args.plateau_zip, "--region", str(d / "region.json")]
    else:
        cmd = [sys.executable, "-I", "tools/data-pack/osm_block.py", "--region", str(d / "region.json")]
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
    if r.returncode:
        undo()
        die((r.stderr or r.stdout).strip().splitlines()[-1] if (r.stderr or r.stdout).strip() else "the data pack could not be cut")
    summary = json.loads(r.stdout.strip().splitlines()[-1])
    run(["node", "tools/blockout/build.mjs", str(d)])
    text = SOURCES[source].format(date=datetime.date.today().isoformat(), id=rid, name=args.name, zip=Path(args.plateau_zip).name if args.plateau_zip else "",
                                  buildings=summary.get("buildings"), tagged=summary.get("height_tagged"), storeys=summary.get("height_from_storeys"), assumed=summary.get("height_assumed"))
    (d / "SOURCES.md").write_text(text, encoding="utf-8")
    c = grid.describe(x, y)
    print(f"opened data/{rid}: {args.name}, {c['size_m']['east_west']} m by {c['size_m']['north_south']} m, {summary['buildings']} buildings")
    if source == "openstreetmap":
        print(f"heights: {summary['height_tagged']} tagged, {summary['height_from_storeys']} from storeys, {summary['height_assumed']} assumed at 6 m")
    else:
        print(f"heights: {summary['with_height']} measured; {summary['with_roof_shape']} buildings have a roof shape")
    print("neighbours: " + ", ".join(f"{k} {v}" for k, v in c["neighbours"].items()))


# ---------------------------------------------------------------- photos

def cmd_photos(args):
    region_dir(args.region)
    w = wallrefs()
    reg = w.Region(args.region)
    w.cmd_index(reg, None)
    walls, photos, p = w.plan(reg, False, True, None)
    seen = {c["id"] for b in p.values() for cs in b.values() for c in cs}
    print(f"{len(p)} of {len(walls)} buildings are shown by some photo; {len(seen)} of {len(photos)} photos show a building")


# ---------------------------------------------------------------- map

def map_data(w, reg, region, thumbs):
    """The page's data: photo dots, building outlines, and which photos show which building."""
    index = reg.cache / "index.json"
    photos = json.loads(index.read_text(encoding="utf-8")) if index.exists() else []
    walls = reg.walls()
    seqs = {}
    for q in photos:
        seqs.setdefault(q["sequence"], []).append(q)
    order = sorted(seqs, key=lambda s: min(q["captured_at"] or 0 for q in seqs[s]))
    day = lambda ms: datetime.datetime.fromtimestamp((ms or 0) / 1000, datetime.timezone.utc).strftime("%Y-%m-%d")
    rows = []
    for si, s in enumerate(order):
        for q in sorted(seqs[s], key=lambda q: q["captured_at"] or 0):
            has = (thumbs / f"{q['id']}.jpg").exists()
            rows.append([q["id"], round(q["x"], 1), round(q["z"], 1), round(q["compass"]), si, int(bool(q["pano"])), int(has), round(q["width"] / q["height"], 3) if has else 0])
    meta = [{"creator": seqs[s][0]["creator"], "date": day(min(q["captured_at"] or 0 for q in seqs[s])), "n": len(seqs[s])} for s in order]
    p = w.plan(reg, False, True, None)[2] if photos else {}
    row_of = {r[0]: i for i, r in enumerate(rows)}
    places = {q["source_id"]: q for q in json.loads((reg.dir / "places.json").read_text(encoding="utf-8"))["places"]}
    blds, sees, info = [], [], []
    for sid, x in walls.items():
        blds.append([int(bool(x.get("in_start_block"))), [[round(e["left"][0], 1), round(e["left"][1], 1)] for e in x["edges"]]])
        best = {}
        for cs in p.get(sid, {}).values():
            for c in cs:
                i = row_of[c["id"]]
                best[i] = max(best.get(i, 0), round(c["px_per_m"]))
        # photos stored on the page first, ordinary photos before panoramas, then the sharpest
        sees.append(sorted(([i, v] for i, v in best.items()), key=lambda iv: (-rows[iv[0]][6], rows[iv[0]][5], -iv[1])))
        ok = doubt = 0
        f = reg.out / sid / "refs.json"
        if f.exists():
            for wl in json.loads(f.read_text(encoding="utf-8")).get("walls", []):
                if "files" in wl:
                    doubt += "doubt" in wl
                    ok += "doubt" not in wl
        name = sid.replace("bldg_", "")[:8] if sid.startswith("bldg_") else sid
        info.append([name, round(max(x["top_m"], x["wall_height_m"]), 1), ok, doubt, places.get(sid, {}).get("height_from") or ""])
    outlines = {"openstreetmap": "(c) OpenStreetMap contributors, ODbL"}.get((region.get("sources") or [""])[0], "PLATEAU, MLIT Japan")
    return {"photos": rows, "seqs": meta, "buildings": blds, "sees": sees, "info": info, "outlines": outlines, "refsRun": reg.out.exists()}


def wanted_thumbs(data, limit):
    """Which photos to store on the page: for each building its sharpest ordinary photos, taken in turns until the limit."""
    per = []
    for s in data["sees"]:
        plain = sorted((iv for iv in s if not data["photos"][iv[0]][5]), key=lambda iv: -iv[1])
        per.append([i for i, _ in (plain or sorted(s, key=lambda iv: -iv[1]))[:THUMBS_PER_BUILDING]])
    out, turn = [], 0
    while len(out) < limit and any(len(q) > turn for q in per):
        for q in per:
            if len(q) > turn and q[turn] not in out and len(out) < limit:
                out.append(q[turn])
        turn += 1
    return [data["photos"][i][0] for i in out]


def cmd_map(args):
    d = region_dir(args.region)
    region = json.loads((d / "region.json").read_text(encoding="utf-8"))
    w = wallrefs()
    reg = w.Region(args.region)
    thumbs = reg.cache / "thumbs"
    thumbs.mkdir(parents=True, exist_ok=True)
    data = map_data(w, reg, region, thumbs)
    if args.photos and data["photos"]:
        tok = w.token()
        todo = [pid for pid in wanted_thumbs(data, args.photos) if not (thumbs / f"{pid}.jpg").exists()]
        for n, pid in enumerate(todo):
            url = w.get(f"{w.GRAPH}/{pid}", {"fields": "thumb_1024_url", "access_token": tok}).get("thumb_1024_url")
            if url:
                (thumbs / f"{pid}.jpg").write_bytes(w.get(url, raw=True))
            if n % 50 == 49:
                print(f"  {n + 1} of {len(todo)} photos fetched")
            time.sleep(0.05)
        data = map_data(w, reg, region, thumbs)
    out = d / "map"
    (out / "img").mkdir(parents=True, exist_ok=True)
    for r in data["photos"]:
        if r[6]:
            dst = out / "img" / f"{r[0]}.jpg"
            if not dst.exists():
                dst.write_bytes((thumbs / f"{r[0]}.jpg").read_bytes())
    title = region["name"].split(",")[0].strip() + " Photo Map"
    page = (HERE / "map" / "page.html").read_text(encoding="utf-8").replace("{{TITLE}}", title).replace("{{PLACE}}", region["name"])
    body = page + "<script>window.PHOTOMAP = " + json.dumps(data, separators=(",", ":")) + ";</script>\n<script>\n" + (HERE / "map" / "page.js").read_text(encoding="utf-8") + "</script>\n"
    (out / "fragment.html").write_text(body, encoding="utf-8")       # the page without a document around it, for hosts that add their own
    (out / "index.html").write_text('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                                    "<style>html{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n" + body + "</body>\n</html>\n", encoding="utf-8")
    shown = sum(1 for s in data["sees"] if s)
    print(f"wrote data/{args.region}/map/index.html: {len(data['buildings'])} buildings, {shown} shown by a photo, {len(data['photos'])} photos, {sum(r[6] for r in data['photos'])} stored on the page")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="command", required=True)
    s = sub.add_parser("cell", help="which cell of the world grid holds a point")
    s.add_argument("--lat", type=float); s.add_argument("--lon", type=float); s.add_argument("--id")
    s = sub.add_parser("open", help="make the cell's region folder, data pack and blockout")
    s.add_argument("--lat", type=float); s.add_argument("--lon", type=float); s.add_argument("--cell")
    s.add_argument("--name", help='what people call the place, such as "Alfama, Lisbon"; with --again the name already recorded is kept')
    s.add_argument("--plateau-zip", help="a PLATEAU CityGML archive that covers the cell; without it the pack comes from OpenStreetMap")
    s.add_argument("--again", action="store_true", help="cut the pack afresh for a cell that is already open")
    s = sub.add_parser("photos", help="index the open street photos around the area")
    s.add_argument("region")
    s = sub.add_parser("map", help="build the area's map page")
    s.add_argument("region")
    s.add_argument("--photos", type=int, default=THUMBS_DEFAULT, help="how many photos to store on the page (0 to fetch none)")
    args = ap.parse_args()
    if args.command in ("cell", "open") and not (getattr(args, "id", None) or getattr(args, "cell", None)) and (args.lat is None or args.lon is None):
        die("give --lat and --lon, or a cell ID")
    try:
        {"cell": cmd_cell, "open": cmd_open, "photos": cmd_photos, "map": cmd_map}[args.command](args)
    except ValueError as e:
        die(str(e))


if __name__ == "__main__":
    main()
