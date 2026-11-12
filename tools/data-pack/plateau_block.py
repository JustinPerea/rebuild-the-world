#!/usr/bin/env python3
"""Cuts a region data pack out of a PLATEAU CityGML archive.

Reads the building tiles that cover a square, keeps the buildings whose footprint
centre is inside it, and writes footprints, heights and roof shapes in local metres.

    python3 -I tools/data-pack/plateau_block.py \
        --zip data/raw/plateau-13107-sumida-2023/13107_sumida-ku_city_2023_citygml_1_op.zip \
        --region data/tokyo-sumida-oshiage-2/region.json

The region file names the square. Everything else in the folder is output.
Local axes follow the asset spec: +X east, +Y up, +Z south, metres from the region origin.
The archive is data, never code: nothing in it is executed, and XML entities are not expanded
beyond what the standard library parser allows.
"""
import argparse, json, math, sys, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    "bldg": "http://www.opengis.net/citygml/building/2.0",
    "gml": "http://www.opengis.net/gml",
}
BUILDING = "{%s}Building" % NS["bldg"]
POSLIST = ".//{%s}posList" % NS["gml"]
GML_ID = "{%s}id" % NS["gml"]
USAGE = {
    "401": "office", "402": "retail", "403": "lodging", "404": "commercial complex",
    "411": "house", "412": "apartment building", "413": "house with shop",
    "414": "apartments with shop", "415": "house with workshop",
    "421": "public office", "422": "education and welfare", "431": "transport and warehouse",
    "441": "factory", "451": "farm or fishery", "452": "utility", "453": "defence",
    "454": "other", "461": "unknown",
}


def metres_per_degree(lat_deg):
    """Length of one degree of latitude and longitude on WGS 84 at this latitude."""
    a, f = 6378137.0, 1 / 298.257223563
    e2 = f * (2 - f)
    s = math.sin(math.radians(lat_deg))
    w = math.sqrt(1 - e2 * s * s)
    m = a * (1 - e2) / w ** 3          # meridional radius
    n = a / w                          # prime vertical radius
    return math.radians(1) * m, math.radians(1) * n * math.cos(math.radians(lat_deg))


def mesh3(lat, lon):
    """Japan's third-level grid square code (about 1 km), which names PLATEAU building tiles."""
    p = int(lat * 1.5); u = int(lon - 100)
    a = (lat * 1.5 - p) * 8; b = (lon - 100 - u) * 8
    q, v = int(a), int(b)
    r, w = int((a - q) * 10), int((b - v) * 10)
    return f"{p}{u}{q}{v}{r}{w}"


def ring(text):
    v = text.split()
    pts = [(float(v[i]), float(v[i + 1]), float(v[i + 2])) for i in range(0, len(v) - 2, 3)]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts.pop()
    return pts  # (lat, lon, height)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", required=True)
    ap.add_argument("--region", required=True)
    args = ap.parse_args()

    region_path = Path(args.region)
    region = json.loads(region_path.read_text(encoding="utf-8"))
    o_lat, o_lon = region["origin"]["lat"], region["origin"]["lon"]
    half = region["square_m"] / 2
    m_lat, m_lon = metres_per_degree(o_lat)

    def local(lat, lon):
        return ((lon - o_lon) * m_lon, -(lat - o_lat) * m_lat)  # x east, z south

    bounds = region.get("bounds")       # a cell of the world grid is kept by its edges in degrees
    corners = [(o_lat + sy * half / m_lat, o_lon + sx * half / m_lon) for sx in (-1, 1) for sy in (-1, 1)]
    tiles = sorted({mesh3(la, lo) for la, lo in corners})
    z = zipfile.ZipFile(args.zip)
    names = {n.split("/")[-1][:8]: n for n in z.namelist() if n.startswith("udx/bldg/") and n.endswith(".gml")}

    start = region.get("start_block")
    buildings = []
    for tile in tiles:
        if tile not in names:
            print(f"tile {tile} is not in the archive", file=sys.stderr)
            continue
        with z.open(names[tile]) as f:
            for _, el in ET.iterparse(f, events=("end",)):
                if el.tag != BUILDING:
                    continue
                fp = el.find("bldg:lod0FootPrint", NS)
                src = "footprint"
                if fp is None:
                    fp = el.find("bldg:lod0RoofEdge", NS)
                    src = "roof edge"
                p = fp.find(POSLIST) if fp is not None else None
                if p is None or not p.text:
                    el.clear(); continue
                pts = ring(p.text)
                c_lat = sum(q[0] for q in pts) / len(pts); c_lon = sum(q[1] for q in pts) / len(pts)
                cx, cz = local(c_lat, c_lon)
                if (not (bounds["south"] <= c_lat < bounds["north"] and bounds["west"] <= c_lon < bounds["east"])) if bounds else (abs(cx) > half or abs(cz) > half):
                    el.clear(); continue

                def txt(tag):
                    e = el.find(tag, NS)
                    return e.text if e is not None and e.text else None

                h = txt("bldg:measuredHeight"); st = txt("bldg:storeysAboveGround"); u = txt("bldg:usage")
                surfaces = []
                for kind in ("RoofSurface", "WallSurface", "GroundSurface"):
                    for s in el.iter("{%s}%s" % (NS["bldg"], kind)):
                        for pl in s.iter("{%s}posList" % NS["gml"]):
                            r = ring(pl.text)
                            surfaces.append({"kind": kind[:-7].lower(), "ring": [[round(local(a, b)[0], 3), round(c, 3), round(local(a, b)[1], 3)] for a, b, c in r]})
                b = {
                    "place_id": "plateau:" + el.get(GML_ID),
                    "source_id": el.get(GML_ID),
                    "tile": tile,
                    "centre": {"lat": round(c_lat, 7), "lon": round(c_lon, 7)},
                    "ground_m": None,
                    "height_m": float(h) if h else None,
                    "height_from": "measured" if h else None,
                    "storeys": int(st) if st and st.isdigit() else None,
                    "usage": USAGE.get(u, u) if u else None,
                    "outline_from": src,
                    "has_roof_shape": bool(surfaces),
                    "footprint_wgs84": [[round(q[1], 7), round(q[0], 7)] for q in pts],
                    "footprint_m": [[round(local(q[0], q[1])[0], 3), round(local(q[0], q[1])[1], 3)] for q in pts],
                    "surfaces": surfaces,
                }
                # The source's flat outline sits at height 0. The real ground level and, where no
                # height was measured, the height come from the roof-shape model.
                if surfaces:
                    ys = [pt[1] for sf in surfaces for pt in sf["ring"]]
                    b["ground_m"] = round(min(ys), 2)
                    if b["height_m"] is None:
                        b["height_m"] = round(max(ys) - min(ys), 2)
                        b["height_from"] = "roof shape"
                if start:
                    b["in_start_block"] = start["x_m"][0] <= cx <= start["x_m"][1] and start["z_m"][0] <= cz <= start["z_m"][1]
                buildings.append(b)
                el.clear()

    buildings.sort(key=lambda b: b["source_id"])
    grounds = [b["ground_m"] for b in buildings if b["ground_m"] is not None]
    datum = round(min(grounds), 2) if grounds else 0.0
    out = region_path.parent

    geo = {"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [b["footprint_wgs84"] + [b["footprint_wgs84"][0]]]},
        "properties": {k: b[k] for k in ("place_id", "height_m", "storeys", "usage", "ground_m", "has_roof_shape") } | ({"in_start_block": b["in_start_block"]} if start else {}),
    } for b in buildings]}
    (out / "buildings.geojson").write_text(json.dumps(geo, separators=(",", ":")) + "\n", encoding="utf-8")

    places = [{k: v for k, v in b.items() if k not in ("surfaces", "footprint_wgs84")} for b in buildings]
    (out / "places.json").write_text(json.dumps({"region": region["id"], "ground_datum_m": datum, "axes": "+X east, +Y up, +Z south, metres from the region origin", "places": places}, indent=1) + "\n", encoding="utf-8")

    shapes = {b["place_id"]: b["surfaces"] for b in buildings if b["surfaces"]}
    (out / "roof-shapes.json").write_text(json.dumps({"region": region["id"], "ground_datum_m": datum, "note": "Roof, wall and ground polygons from the source's LOD2 model, as [x, height above sea level, z] in metres.", "shapes": shapes}, separators=(",", ":")) + "\n", encoding="utf-8")

    hs = sorted(b["height_m"] for b in buildings if b["height_m"])
    print(json.dumps({
        "buildings": len(buildings), "with_height": len(hs), "with_roof_shape": len(shapes),
        "in_start_block": sum(1 for b in buildings if b.get("in_start_block")),
        "median_height_m": hs[len(hs) // 2] if hs else None, "ground_datum_m": datum, "tiles": tiles,
    }))


if __name__ == "__main__":
    main()
