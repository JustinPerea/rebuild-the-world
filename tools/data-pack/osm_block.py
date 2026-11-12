#!/usr/bin/env python3
"""Cuts a region data pack out of OpenStreetMap, for places with no city model like PLATEAU.

Asks an Overpass server for the buildings in a square, keeps those whose outline centre is
inside it, and writes the same places.json and buildings.geojson that plateau_block.py writes,
so tools/blockout/build.mjs can block the region out.

    python3 -I tools/data-pack/osm_block.py --region data/<region>/region.json
    python3 -I tools/data-pack/osm_block.py --region data/<region>/region.json --from saved.json

The region file names the square (see data/tokyo-sumida-oshiage-2/region.json). The Overpass
answer is kept in data/raw/osm/<region id>.json, which Git ignores; --from reads such a file
and asks nobody.

What OpenStreetMap gives, and what it does not:
- An outline per building, drawn by a volunteer from aerial imagery. No roof shape.
- A height only where someone tagged one. This script takes `height`, else `building:levels`
  times 3 m, else ASSUMED_HEIGHT_M, and records which in `height_from`.
- No ground level. Every building stands at 0.
- Buildings mapped as `building:part` only, and courtyards, are left out.

OpenStreetMap data is (c) OpenStreetMap contributors, under the Open Database License 1.0.
A pack made from it is a derived database: it must credit them and stay under ODbL.
The answer is data, never code: nothing in it is executed.
"""
import argparse, json, math, re, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

OVERPASS = "https://overpass-api.de/api/interpreter"
USER_AGENT = "osm-block/0.1"
STOREY_M = 3.0             # height taken for one storey when only a storey count is tagged
ASSUMED_HEIGHT_M = 6.0     # height given to a building with no height and no storey count
REPO = Path(__file__).resolve().parents[2]


def metres_per_degree(lat_deg):
    """Length of one degree of latitude and longitude on WGS 84 at this latitude."""
    a, f = 6378137.0, 1 / 298.257223563
    e2 = f * (2 - f)
    s = math.sin(math.radians(lat_deg))
    w = math.sqrt(1 - e2 * s * s)
    return math.radians(1) * a * (1 - e2) / w ** 3, math.radians(1) * a / w * math.cos(math.radians(lat_deg))


def metres(text):
    """A tagged height in metres, or None. Reads "12", "12.5 m" and "40 ft"; anything else is None."""
    m = re.fullmatch(r"\s*(\d+(?:[.,]\d+)?)\s*(m|metres?|meters?|ft|feet|')?\s*", text or "", re.I)
    if not m:
        return None
    v = float(m.group(1).replace(",", "."))
    if m.group(2) and m.group(2).lower() in ("ft", "feet", "'"):
        v *= 0.3048
    return v if 1.0 <= v <= 1000 else None


def storeys(text):
    m = re.fullmatch(r"\s*(\d+)(?:\.\d+)?\s*", text or "")
    return int(m.group(1)) if m and 1 <= int(m.group(1)) <= 200 else None


def height_of(tags):
    """(height in metres, where it came from, storeys or None)."""
    st = storeys(tags.get("building:levels"))
    h = metres(tags.get("height"))
    if h is not None:
        return round(h, 1), "tag", st
    if st is not None:
        return round(st * STOREY_M, 1), "storeys", st
    return ASSUMED_HEIGHT_M, "assumed", None


def outline(el):
    """The outer ring of a way or multipolygon as [(lat, lon)], or None when it is not one closed ring."""
    if el["type"] == "way":
        g = el.get("geometry") or []
    else:
        outers = [m.get("geometry") or [] for m in el.get("members", []) if m.get("type") == "way" and m.get("role") in ("outer", "")]
        if len(outers) != 1:        # an outline in several pieces is skipped, and counted
            return None
        g = outers[0]
    pts = [(p["lat"], p["lon"]) for p in g]
    if len(pts) < 4 or pts[0] != pts[-1]:
        return None
    return pts[:-1]


def fetch(lat, lon, half_m, m_lat, m_lon):
    pad = half_m + 60           # buildings are kept by their centre, so ask a little wider
    s, n = lat - pad / m_lat, lat + pad / m_lat
    w, e = lon - pad / m_lon, lon + pad / m_lon
    q = f'[out:json][timeout:60];(way["building"]({s:.6f},{w:.6f},{n:.6f},{e:.6f});relation["building"]["type"="multipolygon"]({s:.6f},{w:.6f},{n:.6f},{e:.6f}););out tags geom;'
    req = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": USER_AGENT})
    for attempt in range(4):        # the public server is often busy: wait and ask again
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504) or attempt == 3:
                sys.exit(f"the Overpass server answered {e.code}; try again later, or pass --from with a saved answer")
            time.sleep(15 * (attempt + 1))


def build(region, answer):
    """The pack's buildings and a summary, from a region record and an Overpass answer."""
    o_lat, o_lon = region["origin"]["lat"], region["origin"]["lon"]
    half = region["square_m"] / 2
    m_lat, m_lon = metres_per_degree(o_lat)
    local = lambda lat, lon: ((lon - o_lon) * m_lon, -(lat - o_lat) * m_lat)     # x east, z south
    start = region.get("start_block")
    out, skipped = [], 0
    for el in answer.get("elements", []):
        tags = el.get("tags") or {}
        if "building" not in tags or tags["building"] == "no":
            continue
        pts = outline(el)
        if pts is None:
            skipped += 1
            continue
        c_lat = sum(p[0] for p in pts) / len(pts); c_lon = sum(p[1] for p in pts) / len(pts)
        cx, cz = local(c_lat, c_lon)
        if abs(cx) > half or abs(cz) > half:
            continue
        h, h_from, st = height_of(tags)
        sid = f"{el['type']}/{el['id']}"
        b = {
            "place_id": "osm:" + sid, "source_id": sid, "tile": None,
            "centre": {"lat": round(c_lat, 7), "lon": round(c_lon, 7)},
            "ground_m": 0.0, "height_m": h, "height_from": h_from, "storeys": st,
            "usage": tags["building"] if tags["building"] != "yes" else None,
            "outline_from": "openstreetmap", "has_roof_shape": False,
            "footprint_wgs84": [[round(p[1], 7), round(p[0], 7)] for p in pts],
            "footprint_m": [[round(local(*p)[0], 3), round(local(*p)[1], 3)] for p in pts],
        }
        if start:
            b["in_start_block"] = start["x_m"][0] <= cx <= start["x_m"][1] and start["z_m"][0] <= cz <= start["z_m"][1]
        out.append(b)
    out.sort(key=lambda b: b["source_id"])
    by = lambda k: sum(1 for b in out if b["height_from"] == k)
    hs = sorted(b["height_m"] for b in out if b["height_from"] != "assumed")
    return out, {
        "buildings": len(out), "height_tagged": by("tag"), "height_from_storeys": by("storeys"), "height_assumed": by("assumed"),
        "median_known_height_m": hs[len(hs) // 2] if hs else None, "outlines_skipped": skipped,
        "in_start_block": sum(1 for b in out if b.get("in_start_block")),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--region", required=True)
    ap.add_argument("--from", dest="saved", help="a saved Overpass answer; nothing is downloaded")
    args = ap.parse_args()
    region_path = Path(args.region)
    region = json.loads(region_path.read_text(encoding="utf-8"))
    if args.saved:
        answer = json.loads(Path(args.saved).read_text(encoding="utf-8"))
    else:
        m_lat, m_lon = metres_per_degree(region["origin"]["lat"])
        answer = fetch(region["origin"]["lat"], region["origin"]["lon"], region["square_m"] / 2, m_lat, m_lon)
        raw = REPO / "data" / "raw" / "osm"
        raw.mkdir(parents=True, exist_ok=True)
        (raw / f"{region['id']}.json").write_text(json.dumps(answer), encoding="utf-8")
    buildings, summary = build(region, answer)
    if not buildings:
        sys.exit("OpenStreetMap has no building in this square")
    out = region_path.parent
    geo = {"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [b["footprint_wgs84"] + [b["footprint_wgs84"][0]]]},
        "properties": {k: b[k] for k in ("place_id", "height_m", "height_from", "storeys", "usage", "ground_m", "has_roof_shape")} | ({"in_start_block": b["in_start_block"]} if "in_start_block" in b else {}),
    } for b in buildings]}
    (out / "buildings.geojson").write_text(json.dumps(geo, separators=(",", ":")) + "\n", encoding="utf-8")
    places = [{k: v for k, v in b.items() if k != "footprint_wgs84"} for b in buildings]
    (out / "places.json").write_text(json.dumps({"region": region["id"], "ground_datum_m": 0.0, "axes": "+X east, +Y up, +Z south, metres from the region origin",
                                                 "licence": "(c) OpenStreetMap contributors, Open Database License 1.0", "places": places}, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
