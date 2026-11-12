#!/usr/bin/env python3
"""Reference images of real walls, made from openly licensed street-level photos.

For each wall of a building in a region's data pack, this picks the Mapillary photos that
see it, reconstructs where those photos were taken, finds the wall's real plane, and writes
a front-on image of the wall at true scale. A builder matches a texture to that image; the
image itself is never used as a texture.

    python tools/refs/wallrefs.py index --region tokyo-sumida-oshiage-2
    python tools/refs/wallrefs.py plan  --region tokyo-sumida-oshiage-2
    python tools/refs/wallrefs.py build --region tokyo-sumida-oshiage-2 --place bldg_...   (or --all)

Needs MAPILLARY_TOKEN in the environment, Node (for the wall numbering), and the packages
in tools/refs/requirements.txt. See tools/refs/README.md.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
GRAPH = "https://graph.mapillary.com"
USER_AGENT = "wallrefs/0.1"
MARGIN_M = 40          # photos this far outside the region's square still see its walls
MAX_DIST_M = 40        # a photo further than this from a wall is not a candidate
MAX_INCIDENCE = 72     # degrees between the line of sight and the wall's outward direction
MIN_SCORE = 25         # pixels per metre along the wall, estimated before download
MIN_WALL_M = 2.0
VIEWS_PER_WALL = 8
MAX_IMAGES = 40        # per reconstruction
CROP_PX, CROP_FOV = 2048, 90.0   # the pinhole view cut from a panorama towards a wall
CAMERA_HEIGHT_M = 1.5  # assumed height of the cameras above the street
PLANE_SEARCH_M = 4.0   # how far from the outline the real wall may sit
PLANE_TOL_M = 0.12
FUSE_VIEWS = 16        # photos resampled onto one wall, chosen after the cameras are located
FUSE_TOP = 5           # at each spot, the best this many unblocked views are combined
OCCLUDER_MIN_M = 1.5   # a model point this far in front of the wall is something standing in the street, not part of the facade
OCCLUDER_RADIUS_M = 0.3   # how much of the view one such point is taken to block
MAX_GRID_PX = 8e6      # the wall image is kept under this many pixels
MAX_VIEW_SPREAD = 19       # of 255; above this the views disagree about what is on the plane. Set from 11 walls: a weak figure
MAX_PLANE_OFFSET_M = 1.0   # a plane further than this from the outline is something else: a fence, a tree, the neighbour


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)


def metres_per_degree(lat_deg):
    """The same figures as tools/data-pack/plateau_block.py."""
    a, f = 6378137.0, 1 / 298.257223563
    e2 = f * (2 - f)
    s = math.sin(math.radians(lat_deg))
    w = math.sqrt(1 - e2 * s * s)
    return math.radians(1) * a * (1 - e2) / w ** 3, math.radians(1) * a / w * math.cos(math.radians(lat_deg))


class Region:
    def __init__(self, name):
        self.name = name
        self.dir = REPO / "data" / name
        info = json.loads((self.dir / "region.json").read_text(encoding="utf-8"))
        self.lat0, self.lon0 = info["origin"]["lat"], info["origin"]["lon"]
        self.half = info["square_m"] / 2
        self.m_lat, self.m_lon = metres_per_degree(self.lat0)
        self.cache = REPO / "data" / "raw" / "mapillary" / name     # data/raw is ignored by Git
        self.out = self.dir / "refs"

    def local(self, lat, lon):
        return (lon - self.lon0) * self.m_lon, -(lat - self.lat0) * self.m_lat   # x east, z south

    def walls(self):
        """Every building's walls, numbered as the survey numbers them."""
        r = subprocess.run(["node", str(REPO / "tools" / "survey" / "survey.mjs"), "edges", "--region", self.name],
                           capture_output=True, text=True, encoding="utf-8")
        if r.returncode:
            die("could not read the walls: " + r.stderr.strip())
        return json.loads(r.stdout)

    def index(self):
        p = self.cache / "index.json"
        if not p.exists():
            die(f"no photo index for {self.name}; run the index command first")
        return json.loads(p.read_text(encoding="utf-8"))


def token():
    t = os.environ.get("MAPILLARY_TOKEN")
    if not t:
        die("set MAPILLARY_TOKEN to a Mapillary client token (mapillary.com/dashboard/developers)")
    return t


def get(url, params=None, raw=False):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=90) as r:
                data = r.read()
            return data if raw else json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503):
                raise
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(3 * (attempt + 1))
    die(f"no answer from {url.split('?')[0]} after 6 tries")


# ---------------------------------------------------------------- index

def cmd_index(reg, args):
    tok = token()
    span = reg.half + MARGIN_M
    d_lat, d_lon = span / reg.m_lat, span / reg.m_lon
    fields = "id,is_pano,captured_at,computed_geometry,computed_compass_angle,sequence,creator,camera_type,camera_parameters,width,height"
    found, n = {}, 4
    for i in range(n):
        for j in range(n):
            box = (reg.lon0 - d_lon + 2 * d_lon * j / n, reg.lat0 - d_lat + 2 * d_lat * i / n,
                   reg.lon0 - d_lon + 2 * d_lon * (j + 1) / n, reg.lat0 - d_lat + 2 * d_lat * (i + 1) / n)
            data = get(f"{GRAPH}/images", {"access_token": tok, "fields": fields, "bbox": ",".join(f"{v:.7f}" for v in box), "limit": 2000}).get("data", [])
            if len(data) >= 2000:
                print(f"cell {i},{j} returned 2000 photos, the most one request gives; some are missing", file=sys.stderr)
            for im in data:
                found[im["id"]] = im
    out = []
    for im in found.values():
        g = im.get("computed_geometry")
        if not g or im.get("computed_compass_angle") is None or not im.get("width"):
            continue
        x, z = reg.local(g["coordinates"][1], g["coordinates"][0])
        cp = im.get("camera_parameters") or []
        out.append({
            "id": str(im["id"]), "pano": bool(im.get("is_pano")), "x": round(x, 2), "z": round(z, 2),
            "compass": float(im["computed_compass_angle"]), "captured_at": im.get("captured_at"),
            "sequence": im.get("sequence"), "creator": (im.get("creator") or {}).get("username") or str((im.get("creator") or {}).get("id", "")),
            "width": im["width"], "height": im["height"], "focal": float(cp[0]) if cp else None,
        })
    reg.cache.mkdir(parents=True, exist_ok=True)
    (reg.cache / "index.json").write_text(json.dumps(out), encoding="utf-8")
    print(f"{len(out)} photos with a position ({sum(1 for o in out if o['pano'])} panoramas) -> {(reg.cache / 'index.json').relative_to(REPO)}")


# ---------------------------------------------------------------- plan

def crosses(ax, az, bx, bz, segs):
    """Whether the segment a-b crosses any of segs (an N x 4 array of x, z, x, z)."""
    import numpy as np
    cx, cz, dx, dz = segs[:, 0], segs[:, 1], segs[:, 2], segs[:, 3]
    d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
    d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax)
    d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx)
    d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx)
    return bool(np.any((d1 * d2 < 0) & (d3 * d4 < 0)))


def wall_frame(e):
    lx, lz = e["left"]
    rx, rz = e["right"]
    length = math.hypot(rx - lx, rz - lz)
    along = ((rx - lx) / length, (rz - lz) / length)
    return along, (-along[1], along[0]), ((lx + rx) / 2, (lz + rz) / 2), length   # along, outward, midpoint


def plan(reg, start_block_only=True, panoramas=False, per_wall=VIEWS_PER_WALL):
    """For each wall, the photos that see it, best first, at most per_wall of them (None for all)."""
    import numpy as np
    walls, photos = reg.walls(), reg.index()
    segs = np.array([[*e["left"], *e["right"]] for b in walls.values() for e in b["edges"]])
    px = np.array([[p["x"], p["z"]] for p in photos])
    out = {}
    for sid, b in walls.items():
        if start_block_only and not b["in_start_block"]:
            continue
        for e in b["edges"]:
            along, outward, mid, length = wall_frame(e)
            if length < MIN_WALL_M:
                continue
            near = np.nonzero(np.hypot(px[:, 0] - mid[0], px[:, 1] - mid[1]) <= MAX_DIST_M)[0]
            cands = []
            for i in near:
                p = photos[i]
                if p["pano"] and not panoramas:
                    continue
                vx, vz = p["x"] - mid[0], p["z"] - mid[1]
                dist = math.hypot(vx, vz)
                front = vx * outward[0] + vz * outward[1]
                if front < 1.5:
                    continue
                inc = math.degrees(math.acos(max(-1.0, min(1.0, front / dist))))
                if inc > MAX_INCIDENCE:
                    continue
                if p["pano"]:
                    px_per_m = p["width"] / (2 * math.pi) / dist
                else:
                    focal = p["focal"] or 0.85
                    h = math.radians(p["compass"])
                    off = math.degrees(math.acos(max(-1.0, min(1.0, (math.sin(h) * -vx + -math.cos(h) * -vz) / dist))))
                    if off > 0.85 * math.degrees(math.atan(0.5 / focal)):
                        continue
                    px_per_m = focal * max(p["width"], p["height"]) / dist
                score = px_per_m * math.cos(math.radians(inc))
                if score < MIN_SCORE:
                    continue
                # Stop just short of the wall so the wall itself does not count as being in the way.
                tx, tz = mid[0] + outward[0] * 0.3, mid[1] + outward[1] * 0.3
                if crosses(p["x"], p["z"], tx, tz, segs):
                    continue
                cands.append({"id": p["id"], "pano": p["pano"], "dist_m": round(dist, 1), "incidence_deg": round(inc), "px_per_m": round(score)})
            if cands:
                cands.sort(key=lambda c: -c["px_per_m"])
                out.setdefault(sid, {})[e["edge"]] = cands[:per_wall]
    return walls, photos, out


def cmd_plan(reg, args):
    walls, photos, p = plan(reg, not args.whole_region, args.panoramas)
    n_walls = sum(len(v) for v in p.values())
    three = sum(1 for v in p.values() for c in v.values() if len(c) >= 3)
    print(f"{len(p)} buildings have a wall that some photo sees; {n_walls} walls, {three} of them seen by three or more photos")
    for sid, edges in sorted(p.items(), key=lambda kv: -max(c[0]["px_per_m"] for c in kv[1].values())):
        print(f"  {sid}  " + "  ".join(f"edge {e}: {len(c)} views, best ~{c[0]['px_per_m']} px/m" for e, c in sorted(edges.items())))
    reg.cache.mkdir(parents=True, exist_ok=True)
    (reg.cache / "plan.json").write_text(json.dumps(p), encoding="utf-8")


# ---------------------------------------------------------------- build

def fetch_original(reg, tok, pid):
    path = reg.cache / "images" / f"{pid}.jpg"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        url = get(f"{GRAPH}/{pid}", {"fields": "thumb_original_url", "access_token": tok}).get("thumb_original_url")
        if not url:
            return None
        path.write_bytes(get(url, raw=True))
    return path


def pano_crop(src, dst, yaw_deg, pitch_deg=12.0):
    """A pinhole view cut from an equirectangular panorama, turned yaw_deg from its centre column."""
    import cv2
    import numpy as np
    img = cv2.imread(str(src))
    H, W = img.shape[:2]
    f = CROP_PX / 2 / math.tan(math.radians(CROP_FOV / 2))
    u, v = np.meshgrid(np.arange(CROP_PX) - CROP_PX / 2 + 0.5, np.arange(CROP_PX) - CROP_PX / 2 + 0.5)
    d = np.stack([u, v, np.full_like(u, f)], -1)
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    p, y = math.radians(pitch_deg), math.radians(yaw_deg)
    rx = np.array([[1, 0, 0], [0, math.cos(p), -math.sin(p)], [0, math.sin(p), math.cos(p)]])     # look up by pitch (image y is down)
    ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    d = d @ (ry @ rx).T
    lon, lat = np.arctan2(d[..., 0], d[..., 2]), np.arcsin(np.clip(-d[..., 1], -1, 1))
    mx = ((lon / (2 * math.pi) + 0.5) * W).astype(np.float32) % W
    my = ((0.5 - lat / math.pi) * H).astype(np.float32)
    cv2.imwrite(str(dst), cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP), [cv2.IMWRITE_JPEG_QUALITY, 92])
    return f


def project(cam, pts):
    """Camera-space points (N x 3) to pixels, for the camera models COLMAP picks here."""
    import numpy as np
    x, y = pts[:, 0] / pts[:, 2], pts[:, 1] / pts[:, 2]
    m, p = cam.model.name, cam.params
    if m in ("SIMPLE_PINHOLE", "SIMPLE_RADIAL", "RADIAL"):
        fx = fy = p[0]
        cx, cy = p[1], p[2]
        k1 = p[3] if m != "SIMPLE_PINHOLE" else 0.0
        k2 = p[4] if m == "RADIAL" else 0.0
    elif m == "PINHOLE":
        fx, fy, cx, cy = p[:4]
        k1 = k2 = 0.0
    else:
        raise ValueError(f"camera model {m} is not handled")
    r2 = x * x + y * y
    s = 1 + k1 * r2 + k2 * r2 * r2
    return np.stack([fx * x * s + cx, fy * y * s + cy], -1)


def reconstruct(work, photo_names, crop_names, crop_f):
    import pycolmap
    db, sparse = work / "db.db", work / "sparse"
    if db.exists():
        db.unlink()
    sparse.mkdir(exist_ok=True)
    ext = pycolmap.FeatureExtractionOptions()
    ext.max_image_size = 2000
    if photo_names:
        pycolmap.extract_features(str(db), str(work / "img"), image_names=photo_names, camera_mode=pycolmap.CameraMode.AUTO, extraction_options=ext)
    if crop_names:
        ro = pycolmap.ImageReaderOptions()
        ro.camera_model = "SIMPLE_PINHOLE"
        ro.camera_params = f"{crop_f},{CROP_PX / 2},{CROP_PX / 2}"
        pycolmap.extract_features(str(db), str(work / "img"), image_names=crop_names, camera_mode=pycolmap.CameraMode.SINGLE, reader_options=ro, extraction_options=ext)
    pycolmap.match_exhaustive(str(db))
    maps = pycolmap.incremental_mapping(str(db), str(work / "img"), str(sparse))
    return max(maps.values(), key=lambda m: m.num_reg_images()) if maps else None


def similarity_2d(src, dst):
    """The rotation, scale and shift (no mirror) that best carry src onto dst, both N x 2."""
    import numpy as np
    sc, dc = src - src.mean(0), dst - dst.mean(0)
    ang = math.atan2(np.sum(sc[:, 0] * dc[:, 1] - sc[:, 1] * dc[:, 0]), np.sum(sc * dc))
    rot = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
    scale = np.sum((sc @ rot.T) * dc) / np.sum(sc ** 2)
    return scale, rot, dst.mean(0) - scale * (src.mean(0) @ rot.T)


def nearest_on_outlines(pts, heights, segs, tops):
    """For each point, the closest spot on any outline edge of a building tall enough to hold it."""
    import numpy as np
    A, AB = segs[:, :2], segs[:, 2:] - segs[:, :2]
    best_d, best_q = np.full(len(pts), np.inf), np.zeros((len(pts), 2))
    for i in range(0, len(pts), 2000):
        P, h = pts[i:i + 2000], heights[i:i + 2000]
        t = np.clip(np.einsum("nmk,mk->nm", P[:, None] - A, AB) / np.sum(AB ** 2, axis=1), 0, 1)
        Q = A + t[..., None] * AB
        d = np.linalg.norm(P[:, None] - Q, axis=-1)
        d[h[:, None] > tops[None, :] + 1.5] = np.inf
        k = np.argmin(d, axis=1)
        best_d[i:i + 2000], best_q[i:i + 2000] = d[np.arange(len(P)), k], Q[np.arange(len(P)), k]
    return best_d, best_q


def georeference(rec, where, seq, segs, tops):
    """A similarity from the reconstruction's frame to region metres (x east, y up, z south).

    Up comes from the photos (people hold cameras roughly level). Mapillary's positions give a
    first placement, good to a few metres: each photo sequence carries its own GPS error. The
    placement is then refined by sliding the reconstructed points onto the building outlines,
    matching a point only to a building tall enough to hold it. Height comes from an assumed
    camera height. Returns a dict with scale, R, t (world = scale * R @ p + t) and fit figures.
    """
    import numpy as np
    names, centres, ups = [], [], []
    for im in rec.images.values():
        if im.name not in where:
            continue
        names.append(im.name)
        centres.append(im.projection_center())
        if not im.name.startswith("pano/"):
            ups.append(im.cam_from_world().rotation.matrix().T @ np.array([0.0, -1.0, 0.0]))
    if len(names) < 4:
        return None
    centres = np.array(centres)
    if len(ups) >= 4:
        up = np.mean(ups, axis=0)
    else:   # too few ordinary photos: the cameras travel along the street, so up is what they vary least along
        up = np.linalg.svd(centres - centres.mean(0))[2][2]
        if up @ np.mean([im.cam_from_world().rotation.matrix().T @ np.array([0.0, -1.0, 0.0]) for im in rec.images.values()], axis=0) < 0:
            up = -up
    up /= np.linalg.norm(up)
    a = np.cross(up, [1.0, 0, 0])
    a = a / np.linalg.norm(a) if np.linalg.norm(a) > 0.1 else np.array([0, 0, 1.0])
    b = np.cross(a, up)
    R0 = np.stack([a, up, b])               # rows: a horizontal axis, up, the other horizontal axis; a x up = b, so right-handed
    q = centres @ R0.T
    src, dst = q[:, [0, 2]], np.array([where[n] for n in names])
    if np.ptp(dst, axis=0).max() < 4.0:
        return None                          # the photos stand too close together to fix a scale
    _, rot, _ = similarity_2d(src, dst)
    # Scale from the spacing of photos within one sequence: sequences are offset from each
    # other by metres of GPS error, which a fit across all of them reads as a smaller scale.
    ratios = []
    for sq in set(seq.values()):
        k = np.array([seq[n] == sq for n in names])
        if k.sum() < 3:
            continue
        i, j = np.triu_indices(int(k.sum()), 1)
        dm, ds = np.linalg.norm(dst[k][i] - dst[k][j], axis=1), np.linalg.norm(centres[k][i] - centres[k][j], axis=1)
        far = dm > 8
        if far.sum() >= 3:
            ratios.append(float(np.median(dm[far] / ds[far])))
    scale = float(np.median(ratios)) if ratios else similarity_2d(src, dst)[0]
    shift = dst.mean(0) - scale * (src.mean(0) @ rot.T)
    gps_res = np.linalg.norm(scale * src @ rot.T + shift - dst, axis=1)

    def lift(rot2):
        return np.array([[rot2[0, 0], 0, rot2[0, 1]], [0, 1, 0], [rot2[1, 0], 0, rot2[1, 1]]])

    def place(scale, R, shift):
        t = np.array([shift[0], 0.0, shift[1]])
        t[1] = CAMERA_HEIGHT_M - np.median(scale * (centres @ R.T)[:, 1])
        return t

    R = lift(rot) @ R0
    t = place(scale, R, shift)
    pts = np.array([p.xyz for p in rec.points3D.values()])
    if len(pts) > 8000:
        pts = pts[np.random.default_rng(3).choice(len(pts), 8000, replace=False)]
    mid = dst.mean(0)
    near = np.hypot((segs[:, 0] + segs[:, 2]) / 2 - mid[0], (segs[:, 1] + segs[:, 3]) / 2 - mid[1]) < 90
    S, T = segs[near], tops[near]
    fit = {"gps_residual_m": round(float(np.median(gps_res)), 2)}
    scale0, R_first, t_first = scale, R, t
    for tol in (6, 5, 4, 3, 2.5, 2, 1.5, 1.2, 1, 1, 0.8, 0.8):
        w = scale * pts @ R.T + t
        high = (w[:, 1] > 2.0) & (w[:, 1] < 60)        # above cars, fences and people
        d, qn = nearest_on_outlines(w[high][:, [0, 2]], w[high][:, 1], S, T)
        ok = d < tol
        if ok.sum() < 150:
            break
        s2, r2, sh2 = similarity_2d(w[high][ok][:, [0, 2]], qn[ok])
        scale, R = scale * s2, lift(r2) @ R
        shift = s2 * (np.array([t[0], t[2]]) @ r2.T) + sh2
        t = place(scale, R, shift)
    w = scale * pts @ R.T + t
    high = (w[:, 1] > 2.0) & (w[:, 1] < 60)
    d, _ = nearest_on_outlines(w[high][:, [0, 2]], w[high][:, 1], S, T)
    moved = float(np.linalg.norm((scale * centres @ R.T + t - (scale0 * centres @ R_first.T + t_first))[:, [0, 2]], axis=1).mean())
    fit.update({"points_within_half_metre_of_an_outline": round(float((d < 0.5).mean()), 2), "median_distance_to_outline_m": round(float(np.median(d)), 2),
                "moved_from_gps_m": round(moved, 1), "scale_change": round(scale / scale0, 3)})
    if not 0.7 < scale / scale0 < 1.4 or moved > 15:
        return None                          # the refinement ran away; better no image than a wall from the wrong building
    return {"scale": scale, "R": R, "t": t, "fit": fit, "first": {"scale": scale0, "R": R_first, "t": t_first}}


def fit_wall(points, e, top_m):
    """The real wall near an outline edge: a vertical plane through the reconstructed points.

    Returns (origin_xz, along, outward, offset_m, rms_m, inliers) or None. offset_m is how far
    the plane sits outside (+) or inside (-) the outline edge.
    """
    import numpy as np
    along, outward, mid, length = wall_frame(e)
    L = np.array(e["left"])
    rel = points[:, [0, 2]] - L
    s, d, h = rel @ np.array(along), rel @ np.array(outward), points[:, 1]
    sel = (s > -0.5) & (s < length + 0.5) & (np.abs(d) < PLANE_SEARCH_M) & (h > 0.3) & (h < top_m + 1.5)
    if sel.sum() < 60:
        return None
    s, d = s[sel], d[sel]
    rng, best = np.random.default_rng(7), None
    for _ in range(400):
        i, j = rng.choice(len(s), 2, replace=False)
        if abs(s[i] - s[j]) < 1.0:
            continue
        slope = (d[i] - d[j]) / (s[i] - s[j])
        if abs(slope) > math.tan(math.radians(12)):
            continue
        r = np.abs(d - (d[i] + slope * (s - s[i]))) / math.sqrt(1 + slope * slope)
        n = int((r < PLANE_TOL_M).sum())
        if best is None or n > best[0]:
            best = (n, r < PLANE_TOL_M)
    if best is None or best[0] < 60:
        return None
    slope, icpt = np.polyfit(s[best[1]], d[best[1]], 1)
    rms = float(np.sqrt(np.mean((d[best[1]] - (icpt + slope * s[best[1]])) ** 2)) / math.sqrt(1 + slope * slope))
    a2 = np.array(along) + slope * np.array(outward)
    a2 /= np.linalg.norm(a2)
    o2 = np.array([-a2[1], a2[0]])
    origin = L + icpt * np.array(outward)            # the left end, moved onto the plane
    return origin, a2, o2, float(icpt + slope * length / 2), rms, best[0]


def plane_problem(offset_m):
    """Why a fitted plane is not accepted as the wall, or None when it is.

    In the first full run every image whose plane sat more than a metre from the outline was
    smeared or showed something standing in front of the building.
    """
    if abs(offset_m) > MAX_PLANE_OFFSET_M:
        return f"the plane found is {abs(offset_m):.2f} m from the outline, more than {MAX_PLANE_OFFSET_M:g} m: probably not this wall"
    return None


def rectify(rec, im, geo, origin, along, length, height, ppm):
    """One photo resampled onto the wall: returns (image, mask of valid pixels, median source px per m)."""
    import cv2
    import numpy as np
    scale, R, t = geo["scale"], geo["R"], geo["t"]
    W, H = int(round(length * ppm)), int(round(height * ppm))
    ss, hh = np.meshgrid((np.arange(W) + 0.5) / ppm, height - (np.arange(H) + 0.5) / ppm)
    world = np.stack([origin[0] + ss * along[0], hh, origin[1] + ss * along[1]], -1).reshape(-1, 3)
    sfm = ((world - t) @ R) / scale                  # R is a rotation, so its inverse is its transpose
    T = im.cam_from_world()
    cam_pts = sfm @ T.rotation.matrix().T + T.translation
    cam = rec.cameras[im.camera_id]
    ok = cam_pts[:, 2] > 0.05
    pix = np.full((len(cam_pts), 2), -1.0)
    pix[ok] = project(cam, cam_pts[ok])
    ok &= (pix[:, 0] >= 0) & (pix[:, 0] < cam.width - 1) & (pix[:, 1] >= 0) & (pix[:, 1] < cam.height - 1)
    if ok.mean() < 0.05:
        return None
    src = cv2.imread(str(rec_image_path(im)))
    if src is None:
        return None
    if src.shape[1] != cam.width:                    # features were found on the full image; guard anyway
        k = src.shape[1] / cam.width
        pix = pix * k
    mp = pix.reshape(H, W, 2).astype(np.float32)
    out = cv2.remap(src, mp[..., 0], mp[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    mask = ok.reshape(H, W)
    step = np.linalg.norm(np.diff(mp, axis=1), axis=-1)[mask[:, 1:] & mask[:, :-1]]
    return out, mask, float(np.median(step) * ppm) if len(step) else 0.0


_IMG_ROOT = {}


def rec_image_path(im):
    return _IMG_ROOT["dir"] / im.name


def shadow_mask(cam, pts, length, height, ppm):
    """Where on the wall one camera's view is blocked by something standing in front of it.

    cam is the camera and pts are the model's points, both in the wall's frame: metres along the
    wall, metres out from it, metres up. A point further out than OCCLUDER_MIN_M and nearer than
    the camera throws a shadow onto the wall, as a lamp at the camera would. Returns a mask the
    size of the wall image, true where the view is blocked.
    """
    import cv2
    import numpy as np
    W, H = int(round(length * ppm)), int(round(height * ppm))
    g = min(float(ppm), 10.0)                        # ten cells to the metre is enough for a shadow
    w, h = max(1, int(round(length * g))), max(1, int(round(height * g)))
    m = np.zeros((h, w), np.uint16)
    cs, cd, ch = cam
    pts = np.asarray(pts, dtype=float).reshape(-1, 3)
    sel = (pts[:, 1] > OCCLUDER_MIN_M) & (pts[:, 1] < cd - 0.5) & (pts[:, 2] > 0.3)      # not the road surface
    if sel.any():
        q = pts[sel]
        k = cd / (cd - q[:, 1])                      # how much further the wall is than the point
        xs, xh = cs + k * (q[:, 0] - cs), ch + k * (q[:, 2] - ch)
        r = np.minimum(OCCLUDER_RADIUS_M * k, 2.0)
        keep = (xs > -r) & (xs < length + r) & (xh > -r) & (xh < height + r)
        one = np.zeros_like(m)
        for x, y, rad in zip(xs[keep], xh[keep], r[keep]):         # two points must agree: one stray point blocks nothing
            one[:] = 0
            cv2.circle(one, (int(round(x * g)), int(round((height - y) * g))), max(1, int(round(rad * g))), 1, -1)
            m += one
        m = (m >= 2).astype(np.uint8)
        size = int(0.6 * g) | 1
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size)))
    return cv2.resize(m.astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR) > 0.5


def exposure_gain(target, img, both):
    """A smooth gain in brightness that brings img to target's exposure where both are known.

    Photos of one wall differ in exposure, and a tiled wall reflects the sky differently from
    each place, so one number per photo leaves seams. The gain varies slowly across the wall
    and falls back to one number where the two share nothing nearby. It is one gain for all
    three colours: a gain per colour picked up a green cast wherever leaves went unmarked.
    """
    import cv2
    import numpy as np
    H, W = both.shape
    if both.sum() < 500:
        return np.ones((H, W, 1), np.float32)
    f = max(1, int(round(max(H, W) / 256)))
    size = (max(1, W // f), max(1, H // f))
    small = lambda a: cv2.resize(a, size, interpolation=cv2.INTER_AREA)
    blur = lambda a: cv2.GaussianBlur(a, (0, 0), 12)
    w = both.astype(np.float32)
    support = np.clip(blur(small(w)) / 0.3, 0, 1)
    a, b = target.astype(np.float32).mean(2), img.astype(np.float32).mean(2)
    overall = float(np.median(a[both])) / max(1.0, float(np.median(b[both])))
    local = blur(small(a * w)) / np.maximum(blur(small(b * w)), 1e-3)
    gain = np.clip(support * local + (1 - support) * overall, 0.5, 2.0)
    return cv2.resize(gain, (W, H), interpolation=cv2.INTER_LINEAR)[..., None]


def choose_views(cands, limit=FUSE_VIEWS, want=FUSE_TOP):
    """Which photos to resample: indexes into cands, the reference view first.

    cands: per photo, (source pixels per metre, mask of the wall it sees, mask of where it sees
    the wall unblocked). The first pick is the photo that shows most of the wall sharply. Each
    later pick is the one that adds most to the parts of the wall still short of `want` unblocked
    views, so a photo that sees little of the wall is taken when it is the one that sees behind
    a parked truck. The picks after the first are returned sharpest first.
    """
    import numpy as np
    if not cands:
        return []
    first = max(range(len(cands)), key=lambda i: cands[i][0] * cands[i][1].mean())
    picked = [first]
    have = cands[first][2].astype(np.int32)
    left = [i for i in range(len(cands)) if i != first]
    while left and len(picked) < limit:
        short = have < want
        gains = [cands[i][0] * float((cands[i][2] & short).sum()) for i in left]
        k = int(np.argmax(gains))
        if gains[k] <= 0:
            break
        i = left.pop(k)
        picked.append(i)
        have += cands[i][2]
    return [first] + sorted(picked[1:], key=lambda i: -cands[i][0])


def match_exposure(views, clear):
    """The views' images with their exposure evened out, in the same order.

    Each view is matched to what is already shown of the wall, starting from the first view.
    The next one matched is the one that shares most unblocked wall with what is shown, so a
    close-up that overlaps the first view only where a truck stood is matched through the
    views in between, not guessed.
    """
    import numpy as np
    shown, have, matched = views[0][0].astype(np.float32), clear[0].copy(), {0: views[0][0]}
    todo = list(range(1, len(views)))
    while todo:
        k = max(todo, key=lambda i: int((have & clear[i])[::4, ::4].sum()))
        todo.remove(k)
        adj = np.clip(views[k][0].astype(np.float32) * exposure_gain(shown, views[k][0], have & clear[k]), 0, 255)
        new = clear[k] & ~have
        shown[new] = adj[new]
        have |= new
        matched[k] = np.rint(adj).astype(np.uint8)
    return [matched[k] for k in range(len(views))]


def fuse(views, blocked=None):
    """Views best first, each (image, mask). blocked: per view, a mask of where something stands in the way.

    At each spot the unblocked views are used, the best FUSE_TOP of them: the median of three or
    more (which drops what moves between photos), else the best one. A spot blocked in every
    view falls back to all the views that see it.
    Returns (best single view, fused image, views that see each pixel, unblocked views that see it).
    """
    import warnings
    import numpy as np
    ref, ref_mask = views[0]
    masks = np.stack([m for _, m in views])
    clear = masks & ~np.stack(blocked) if blocked is not None else masks.copy()
    count, n_clear = masks.sum(0), clear.sum(0)
    matched = match_exposure(views, clear)
    fused = np.zeros(ref.shape, np.float32)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)      # a spot no view sees is all NaN, and stays black
        for y in range(0, ref.shape[0], 256):
            rows = slice(y, y + 256)
            use = np.where(n_clear[rows] > 0, clear[:, rows], masks[:, rows])
            use &= np.cumsum(use, axis=0) <= FUSE_TOP
            stack = np.stack([np.where(use[k][..., None], matched[k][rows].astype(np.float32), np.nan) for k in range(len(views))])
            n = use.sum(0)
            first = np.take_along_axis(stack, np.argmax(use, axis=0)[None, ..., None], axis=0)[0]
            out = np.where((n >= 3)[..., None], np.nanmedian(stack, axis=0), first)
            out[n == 0] = 0
            fused[rows] = out
    return ref, np.clip(np.nan_to_num(fused), 0, 255).astype(np.uint8), count, n_clear



def view_spread(views):
    """How much the views disagree where three or more see the same spot, on a 0 to 255 scale.

    For each such pixel: the median distance of the views' brightness from their median. The
    figure returned is the 75th percentile over those pixels, or None when too few pixels are
    seen three times. Photos thrown onto the plane they really show agree; on a wrong plane
    they do not.
    """
    import numpy as np
    ref, ref_mask = views[0]
    ref_l = ref.astype(np.float32).mean(2)
    lum, masks = [], []
    for img, mask in views:
        f = img.astype(np.float32).mean(2)
        both = mask & ref_mask
        if both.sum() > 500:
            f = f * min(1.4, max(0.7, float(np.median(ref_l[both])) / max(1.0, float(np.median(f[both])))))
        lum.append(np.where(mask, f, np.nan))
        masks.append(mask)
    many = np.sum(masks, axis=0) >= 3
    if many.sum() < 2000:
        return None
    s = np.stack([l[many] for l in lum])
    mad = np.nanmedian(np.abs(s - np.nanmedian(s, axis=0)), axis=0)
    return round(float(np.percentile(mad, 75)), 1)


def build_place(reg, tok, walls, photos, p, sid, reuse=False):
    import cv2
    import numpy as np
    by_id = {q["id"]: q for q in photos}
    b, edges = walls[sid], p[sid]
    cand_ids = {c["id"] for cs in edges.values() for c in cs}
    mids = [wall_frame(b["edges"][int(e)])[2] for e in edges]
    support = sorted((q for q in photos if not q["pano"] and q["id"] not in cand_ids),
                     key=lambda q: min(math.hypot(q["x"] - m[0], q["z"] - m[1]) for m in mids))
    support = [q["id"] for q in support if min(math.hypot(q["x"] - m[0], q["z"] - m[1]) for m in mids) <= 35][:max(0, MAX_IMAGES - len(cand_ids))]
    work = reg.cache / "work" / sid
    for sub in ("img/photo", "img/pano"):
        (work / sub).mkdir(parents=True, exist_ok=True)
    photo_names, crop_names, where, source, seq, crop_f = [], [], {}, {}, {}, None
    for pid in sorted(cand_ids) + support:          # sorted: a set's order changes from run to run
        q = by_id[pid]
        orig = fetch_original(reg, tok, pid)
        if orig is None:
            continue
        if q["pano"]:
            for e, cs in edges.items():              # one crop per wall this panorama sees
                if not any(c["id"] == pid for c in cs):
                    continue
                mid = wall_frame(b["edges"][int(e)])[2]
                bearing = math.degrees(math.atan2(mid[0] - q["x"], -(mid[1] - q["z"])))
                name = f"pano/{pid}_e{e}.jpg"
                if not (work / "img" / name).exists():
                    crop_f = pano_crop(orig, work / "img" / name, bearing - q["compass"])
                crop_f = crop_f or CROP_PX / 2 / math.tan(math.radians(CROP_FOV / 2))
                crop_names.append(name); where[name] = (q["x"], q["z"]); source[name] = pid; seq[name] = q["sequence"]
        else:
            name = f"photo/{pid}.jpg"
            dst = work / "img" / name
            if not dst.exists():
                dst.write_bytes(orig.read_bytes())
            photo_names.append(name); where[name] = (q["x"], q["z"]); source[name] = pid; seq[name] = q["sequence"]
    if len(photo_names) + len(crop_names) < 4:
        return {"place": sid, "problem": "fewer than four photos could be downloaded"}
    saved = [d for d in (work / "sparse").glob("*") if (d / "images.bin").exists()] if reuse else []
    if saved:
        import pycolmap
        rec = max((pycolmap.Reconstruction(str(d)) for d in saved), key=lambda m: m.num_reg_images())
    else:
        rec = reconstruct(work, photo_names, crop_names, crop_f)
    if rec is None:
        return {"place": sid, "problem": "the photos could not be reconstructed"}
    segs = np.array([[*e["left"], *e["right"]] for w in walls.values() for e in w["edges"]])
    tops = np.array([max(w["top_m"], w["wall_height_m"]) for w in walls.values() for e in w["edges"]])
    geo = georeference(rec, where, seq, segs, tops)
    if geo is None:
        return {"place": sid, "problem": "the reconstruction could not be placed on the map"}
    scale, R, t = geo["scale"], geo["R"], geo["t"]
    pts = np.array([q.xyz for q in rec.points3D.values()])
    world = scale * pts @ R.T + t
    _IMG_ROOT["dir"] = work / "img"
    registered = {im.name: im for im in rec.images.values()}
    out_dir = reg.out / sid
    out_dir.mkdir(parents=True, exist_ok=True)
    report = {"place_id": b["place_id"], "photos_given": len(photo_names) + len(crop_names), "photos_placed": len(registered),
              "placement": geo["fit"], "walls": []}
    credits = {}
    for e, cs in sorted(edges.items(), key=lambda kv: int(kv[0])):
        edge = b["edges"][int(e)]
        height = max(b["top_m"], b["wall_height_m"]) + 0.5
        fit = fit_wall(world, edge, height)
        if fit is None:
            report["walls"].append({"edge": int(e), "problem": "too few reconstructed points on this wall to find its plane"})
            continue
        origin, along, outward, offset, rms, inliers = fit
        if plane_problem(offset):
            report["walls"].append({"edge": int(e), "problem": plane_problem(offset)})
            for old in (out_dir / f"edge{int(e):02d}_best.jpg", out_dir / f"edge{int(e):02d}_fused.jpg"):
                old.unlink(missing_ok=True)
            continue
        length = edge["length_m"]
        # every placed photo is tried, not only the ones the plan picked from GPS: the cameras are located now
        names = [n for n in registered if n.startswith("photo/") or n.endswith(f"_e{e}.jpg")]
        probe = [(n, rectify(rec, registered[n], geo, origin, along, length, height, 20)) for n in names]
        # a photo that sees a twentieth of the wall is kept: it may be the only one that sees that part unblocked
        probe = [(n, r) for n, r in probe if r is not None and r[2] >= MIN_SCORE]
        if not probe:
            report["walls"].append({"edge": int(e), "problem": "no placed photo covers this wall"})
            continue
        rel = world[:, [0, 2]] - np.asarray(origin)
        in_wall_frame = np.stack([rel @ np.asarray(along), rel @ np.asarray(outward), world[:, 1]], 1)

        def camera(n):                               # the camera in the wall's frame: along, out, up
            c = scale * R @ registered[n].projection_center() + t
            return ((c[[0, 2]] - np.asarray(origin)) @ np.asarray(along), (c[[0, 2]] - np.asarray(origin)) @ np.asarray(outward), c[1])

        cands = [(r[2], r[1], r[1] & ~shadow_mask(camera(n), in_wall_frame, length, height, 20)) for n, r in probe]
        order = choose_views(cands)
        ppm = int(max(40, min(200, round(cands[order[0]][0] / 10) * 10)))
        while ppm > 40 and length * height * ppm * ppm > MAX_GRID_PX:
            ppm -= 10
        views, used, blocked = [], [], []
        for n in (probe[i][0] for i in order):
            r = rectify(rec, registered[n], geo, origin, along, length, height, ppm)
            if r is None:
                continue
            views.append((r[0], r[1]))
            blocked.append(shadow_mask(camera(n), in_wall_frame, length, height, ppm))
            q = by_id[source[n]]
            used.append({"image_id": q["id"], "creator": q["creator"], "captured_at": q["captured_at"], "panorama": q["pano"], "source_px_per_m": round(r[2])})
            credits[q["id"]] = q["creator"]
        best, fused, count, n_clear = fuse(views, blocked)
        hidden = (count > 0) & (n_clear == 0)        # something stands in front in every view: shown greyed
        fused[hidden] = (0.55 * fused[hidden] + 0.45 * 128).astype(np.uint8)
        spread = view_spread([(img, mask & ~blk) for (img, mask), blk in zip(views, blocked)])
        stem = out_dir / f"edge{int(e):02d}"
        cv2.imwrite(f"{stem}_best.jpg", best, [cv2.IMWRITE_JPEG_QUALITY, 90])
        cv2.imwrite(f"{stem}_fused.jpg", fused, [cv2.IMWRITE_JPEG_QUALITY, 90])
        report["walls"].append({
            "edge": int(e), "length_m": length, "height_m": round(height, 2), "px_per_m": ppm, "faces": edge["faces"],
            "files": [f"{stem.name}_best.jpg", f"{stem.name}_fused.jpg"],
            "plane": {"offset_from_outline_m": round(offset, 2), "rms_m": round(rms, 3), "points": inliers},
            "seen": {"any_view": round(float((count > 0).mean()), 2), "three_or_more_views": round(float((count >= 3).mean()), 2),
                     "unblocked": round(float((n_clear > 0).mean()), 2), "blocked_in_every_view": round(float(hidden.mean()), 2)},
            "views": used,
            "views_disagree": spread,
            **({"doubt": f"the views disagree ({spread} of 255, over {MAX_VIEW_SPREAD}): the plane may not be this wall. Check the image by eye"} if spread is not None and spread > MAX_VIEW_SPREAD else {}),
        })
    report["assumed_camera_height_m"] = CAMERA_HEIGHT_M
    report["licence"] = "Images derived from Mapillary photos, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Credit the photographers listed under each wall."
    report["note"] = "Reference only. Match a texture to these; do not use their pixels as a texture."
    (out_dir / "refs.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    return report


def cmd_build(reg, args):
    tok = token()
    walls, photos, p = plan(reg, not args.whole_region, args.panoramas)
    todo = sorted(p) if args.all else [args.place]
    if not args.all and args.place not in p:
        die(f"no photo sees a wall of {args.place}; run the plan command to list the buildings that are seen")
    for sid in todo:
        t0 = time.time()
        r = build_place(reg, tok, walls, photos, p, sid, args.reuse)
        if "problem" in r:
            print(f"{sid}: {r['problem']}")
            continue
        done = [w for w in r["walls"] if "files" in w]
        print(f"{sid}: {r['photos_placed']} of {r['photos_given']} photos placed, {len(done)} of {len(r['walls'])} walls written, {time.time() - t0:.0f} s")
        for w in r["walls"]:
            print(f"   edge {w['edge']}: " + (w["problem"] if "problem" in w else f"{w['px_per_m']} px/m, {len(w['views'])} views, plane {w['plane']['offset_from_outline_m']:+.2f} m from the outline (rms {w['plane']['rms_m']} m), {int(w['seen']['any_view'] * 100)}% of the wall seen, {int(w['seen']['unblocked'] * 100)}% unblocked" + (", DOUBTFUL: the views disagree" if "doubt" in w else "")))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="command", required=True)
    for name in ("index", "plan", "build"):
        s = sub.add_parser(name)
        s.add_argument("--region", default="tokyo-sumida-oshiage-2")
        s.add_argument("--whole-region", action="store_true", help="every building, not only the start block")
        s.add_argument("--panoramas", action="store_true", help="also try 360-degree panoramas (unproven: none has been placed yet)")
        if name == "build":
            g = s.add_mutually_exclusive_group(required=True)
            g.add_argument("--place", help="one building's source id, bldg_...")
            g.add_argument("--all", action="store_true")
            s.add_argument("--reuse", action="store_true", help="use the reconstruction saved by an earlier run, if there is one")
    args = ap.parse_args()
    reg = Region(args.region)
    {"index": cmd_index, "plan": cmd_plan, "build": cmd_build}[args.command](reg, args)


if __name__ == "__main__":
    main()
