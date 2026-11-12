"""Exports the data and images the explainer film shows, from one real run of tools/refs/wallrefs.py.

    python explain/wall-refs/make-data.py <work-dir>

Run it from the repository root, in the environment tools/refs/README.md describes, after
`wallrefs.py index` and `wallrefs.py plan` (MAPILLARY_TOKEN is needed only for photos not yet
downloaded). <work-dir> is any empty folder; the reconstruction is saved there and reused.
It writes explain/wall-refs/assets/data.js and the JPEGs beside it. Those are made from Mapillary
photos (CC BY-SA 4.0) and are not committed: see tools/refs/README.md, "Licence".
"""
import sys, json, math, shutil, os
from pathlib import Path
import numpy as np, cv2
REPO = Path(__file__).resolve().parents[2]; ASSETS = Path(__file__).resolve().parent / "assets"
sys.path.insert(0, str(REPO / "tools" / "refs")); import wallrefs as w
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True); ASSETS.mkdir(exist_ok=True); SID = "bldg_5b434eb5-e19c-4ccb-858a-3b2d1f6024f2"; EDGE = 2
reg = w.Region("tokyo-sumida-oshiage-2")
walls, photos, p = w.plan(reg); by = {q["id"]: q for q in photos}
b, edges = walls[SID], p[SID]
cand = {c["id"] for cs in edges.values() for c in cs}
mids = [w.wall_frame(b["edges"][int(e)])[2] for e in edges]
dist = lambda q: min(math.hypot(q["x"] - m[0], q["z"] - m[1]) for m in mids)
support = [q["id"] for q in sorted((q for q in photos if not q["pano"] and q["id"] not in cand), key=dist) if dist(q) <= 35][:max(0, w.MAX_IMAGES - len(cand))]
work = OUT / "work"; (work / "img" / "photo").mkdir(parents=True, exist_ok=True)
names, where, seq = [], {}, {}
for pid in list(cand) + support:
    src = reg.cache / "images" / f"{pid}.jpg"
    if not src.exists(): continue
    n = f"photo/{pid}.jpg"
    if not (work / "img" / n).exists(): shutil.copy(src, work / "img" / n)
    names.append(n); where[n] = (by[pid]["x"], by[pid]["z"]); seq[n] = by[pid]["sequence"]
saved = [d for d in (work / "sparse").glob("*") if (d / "images.bin").exists()] if (work / "sparse").exists() else []
import pycolmap
rec = max((pycolmap.Reconstruction(str(d)) for d in saved), key=lambda m: m.num_reg_images()) if saved else w.reconstruct(work, names, [], None)
segs = np.array([[*e["left"], *e["right"]] for x in walls.values() for e in x["edges"]])
tops = np.array([max(x["top_m"], x["wall_height_m"]) for x in walls.values() for e in x["edges"]])
geo = w.georeference(rec, where, seq, segs, tops)
f0 = geo["first"]
pts = np.array([q.xyz for q in rec.points3D.values()])
rng = np.random.default_rng(5); pick = rng.choice(len(pts), min(3500, len(pts)), replace=False)
W1 = geo["scale"] * pts[pick] @ geo["R"].T + geo["t"]; W0 = f0["scale"] * pts[pick] @ f0["R"].T + f0["t"]
cams = []
seq_ids = sorted(set(seq.values()))
for im in rec.images.values():
    c = im.projection_center(); pid = im.name.split("/")[1][:-4]
    a = geo["scale"] * geo["R"] @ c + geo["t"]; a0 = f0["scale"] * f0["R"] @ c + f0["t"]
    cams.append({"id": pid, "seq": seq_ids.index(seq[im.name]), "gps": [by[pid]["x"], by[pid]["z"]], "first": [round(a0[0], 2), round(a0[2], 2)], "final": [round(a[0], 2), round(a[2], 2)], "compass": by[pid]["compass"]})
edge = b["edges"][EDGE]; height = max(b["top_m"], b["wall_height_m"]) + 0.5
world = geo["scale"] * pts @ geo["R"].T + geo["t"]
origin, along, outward, offset, rms, inl = w.fit_wall(world, edge, height)
w._IMG_ROOT["dir"] = work / "img"
reg_by = {im.name: im for im in rec.images.values()}
cs = edges[EDGE]; length = edge["length_m"]
probe = []
for n, im in reg_by.items():
    if n.split("/")[1][:-4] not in {c["id"] for c in cs}: continue
    r = w.rectify(rec, im, geo, origin, along, length, height, 20)
    if r is not None and r[1].mean() > 0.15: probe.append((n, r))
probe.sort(key=lambda nr: -nr[1][2] * nr[1][1].mean())
ppm = int(max(40, min(200, round(probe[0][1][2] / 10) * 10)))
views, vmeta = [], []
VIS_H = 17.0   # metres of wall the film shows
SPOT = (164, 644)   # the window the film uses for the middle value, when the run still offers it
for k, (n, _) in enumerate(probe[:6]):
    im = reg_by[n]; r = w.rectify(rec, im, geo, origin, along, length, height, ppm)
    views.append((r[0], r[1]))
    # where the wall's corners fall in the source photo
    cam = rec.cameras[im.camera_id]; T = im.cam_from_world()
    corners = []
    for s_, h_ in ((0, VIS_H), (length, VIS_H), (length, 0), (0, 0)):
        Pw = np.array([origin[0] + s_ * along[0], h_, origin[1] + s_ * along[1]])
        pc = ((Pw - geo["t"]) @ geo["R"]) / geo["scale"]; pc = T.rotation.matrix() @ pc + T.translation
        px = w.project(cam, pc[None])[0]; corners.append([round(float(px[0]) / cam.width, 4), round(float(px[1]) / cam.height, 4)])
    src = cv2.imread(str(work / "img" / n)); k_ = 1280 / src.shape[1]
    cv2.imwrite(str(OUT / f"src{k}.jpg"), cv2.resize(src, None, fx=k_, fy=k_, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 86])
    crop = r[0][int((height - VIS_H) * ppm):, :]; cv2.imwrite(str(OUT / f"flat{k}.jpg"), crop, [cv2.IMWRITE_JPEG_QUALITY, 88])
    pid = n.split("/")[1][:-4]
    vmeta.append({"id": pid, "creator": by[pid]["creator"], "seq": seq_ids.index(seq[n]), "captured_at": by[pid]["captured_at"], "aspect": round(src.shape[1] / src.shape[0], 4), "corners": corners, "px_per_m": round(r[2])})
top = int((height - VIS_H) * ppm)
cv2.imwrite(str(OUT / "best.jpg"), views[0][0][top:], [cv2.IMWRITE_JPEG_QUALITY, 90])
# ---- the combine step as the tool does it: every placed photo is tried, and blocked views are left out ----
rel = world[:, [0, 2]] - np.asarray(origin); frame = np.stack([rel @ np.asarray(along), rel @ np.asarray(outward), world[:, 1]], 1)
def camera(n):
    c = geo["scale"] * geo["R"] @ reg_by[n].projection_center() + geo["t"]; q = c[[0, 2]] - np.asarray(origin)
    return (float(q @ np.asarray(along)), float(q @ np.asarray(outward)), float(c[1]))
tried = [(n, w.rectify(rec, reg_by[n], geo, origin, along, length, height, 20)) for n in sorted(reg_by)]
tried = [(n, r) for n, r in tried if r is not None and r[2] >= w.MIN_SCORE]
order = w.choose_views([(r[2], r[1], r[1] & ~w.shadow_mask(camera(n), frame, length, height, 20)) for n, r in tried])
chosen = [tried[i][0] for i in order]; six = [n for n, _ in probe[:6]]
cviews, cblocked, cmeta = [], [], []
orange = lambda m: np.dstack([np.full(m.shape, 22, np.uint8), np.full(m.shape, 78, np.uint8), np.full(m.shape, 240, np.uint8), (m * 150).astype(np.uint8)])   # BGRA of #f04e16
for j, n in enumerate(chosen):
    r = w.rectify(rec, reg_by[n], geo, origin, along, length, height, ppm); blk = w.shadow_mask(camera(n), frame, length, height, ppm)
    cviews.append((r[0], r[1])); cblocked.append(blk)
    cv2.imwrite(str(OUT / f"v{j}.jpg"), r[0][top:], [cv2.IMWRITE_JPEG_QUALITY, 86]); cv2.imwrite(str(OUT / f"vb{j}.png"), orange(blk & r[1])[top:])
    pid = n.split("/")[1][:-4]; cam_ = camera(n)
    cmeta.append({"id": pid, "creator": by[pid]["creator"], "six": six.index(n) if n in six else -1, "cam": [round(v, 2) for v in cam_], "px_per_m": round(r[2]),
                  "sees": round(float(r[1][top:].mean()), 3), "blocked": round(float((blk & r[1])[top:].sum() / max(1, r[1][top:].sum())), 3)})
_, fused, count, n_clear = w.fuse(cviews, cblocked)
hidden = (count > 0) & (n_clear == 0); fused[hidden] = (0.55 * fused[hidden] + 0.45 * 128).astype(np.uint8)
cv2.imwrite(str(OUT / "fused.jpg"), fused[top:], [cv2.IMWRITE_JPEG_QUALITY, 90])
plain = w.fuse(views)[1]; cv2.imwrite(str(OUT / "plain.jpg"), plain[top:], [cv2.IMWRITE_JPEG_QUALITY, 90])     # the six, with no view left out: what the tool used to write
far = [chosen.index(n) for n in six]                      # the six the film has followed, as indexes into the chosen views
seen6 = np.any([cviews[j][1] for j in far], 0); clear6 = np.any([cviews[j][1] & ~cblocked[j] for j in far], 0); hidden6 = seen6 & ~clear6
cv2.imwrite(str(OUT / "hid6.png"), orange(hidden6)[top:]); cv2.imwrite(str(OUT / "hid16.png"), orange(hidden)[top:])
combine = {"hidden6": round(float(hidden6[top:].mean()), 3), "views": cmeta, "tried": len(tried), "placed": len(reg_by), "top": w.FUSE_TOP,
           "seen": round(float((count[top:] > 0).mean()), 3), "clear": round(float((n_clear[top:] > 0).mean()), 3), "hidden": round(float(hidden[top:].mean()), 3)}
print(json.dumps(combine, indent=0))
start = [x for x in walls.values() if x["in_start_block"]]
data = {
  "wall": {"left": edge["left"], "right": edge["right"], "length_m": round(length, 2), "faces": edge["faces"], "shown_height_m": VIS_H, "px_per_m": ppm, "plane_offset_m": round(offset, 3), "plane_rms_m": round(rms, 3), "plane_points": int(inl),
           "origin": [round(float(origin[0]), 2), round(float(origin[1]), 2)], "along": [round(float(along[0]), 4), round(float(along[1]), 4)]},
  "counts": {"photos_indexed": len(photos), "ordinary": sum(1 for q in photos if not q["pano"]), "given": len(names), "placed": rec.num_reg_images(), "points": len(pts), "sequences": len(seq_ids), "views_combined": len(views),
             "photographers": len({by[n.split('/')[1][:-4]]["creator"] for n in reg_by})},
  "fit": geo["fit"], "views": vmeta, "cams": cams,
  "points_first": [[round(float(a), 2), round(float(c), 2)] for a, _, c in W0], "points_final": [[round(float(a), 2), round(float(c), 2), round(float(h), 1)] for a, h, c in W1],
  "outlines": [[[round(e["left"][0], 2), round(e["left"][1], 2)] for e in x["edges"]] for x in walls.values()],
  "target_outline": [[round(e["left"][0], 2), round(e["left"][1], 2)] for e in b["edges"]],
  "all_photos": [[q["x"], q["z"]] for q in photos if not q["pano"]],
}
(OUT / "data.json").write_text(json.dumps(data))
print(json.dumps({k: data[k] for k in ("wall", "counts", "fit")}, default=float, indent=1)); print([ (v["creator"], v["seq"], v["px_per_m"], v["corners"]) for v in vmeta])

# ---- extras for the film ----
import itertools, datetime
X = {}
X["creators"] = sorted({by[n.split('/')[1][:-4]]["creator"] for n in reg_by})
X["dates"] = sorted({datetime.datetime.fromtimestamp(by[n.split('/')[1][:-4]]["captured_at"] / 1000, datetime.timezone.utc).strftime("%Y-%m") for n in reg_by})
X["seq_creator"] = {seq_ids.index(seq[n]): by[n.split('/')[1][:-4]]["creator"] for n in reg_by}
X["seq_dates"] = {seq_ids.index(seq[n]): datetime.datetime.fromtimestamp(by[n.split('/')[1][:-4]]["captured_at"] / 1000, datetime.timezone.utc).strftime("%Y-%m-%d") for n in reg_by}
X["building"] = {"top_m": b["top_m"], "wall_height_m": b["wall_height_m"], "edges": len(b["edges"])}
X["candidates"] = [c["id"] for c in cs]
X["within_40m"] = sum(1 for q in photos if not q["pano"] and math.hypot(q["x"] - w.wall_frame(edge)[2][0], q["z"] - w.wall_frame(edge)[2][1]) <= 40)
# full-resolution crops of the wall's part of each photo
for k, (n, _) in enumerate(probe[:6]):
    src = cv2.imread(str(work / "img" / n)); H_, W_ = src.shape[:2]
    c = np.array(vmeta[k]["corners"])
    x0, x1 = max(0, c[:, 0].min() - 0.02), min(1, c[:, 0].max() + 0.02); y0, y1 = max(0, c[:, 1].min() - 0.02), min(1, c[:, 1].max() + 0.02)
    crop = src[int(y0 * H_):int(y1 * H_), int(x0 * W_):int(x1 * W_)]
    k_ = min(1.0, 1700 / max(crop.shape[:2]))
    if k_ < 1: crop = cv2.resize(crop, None, fx=k_, fy=k_, interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(OUT / f"crop{k}.jpg"), crop, [cv2.IMWRITE_JPEG_QUALITY, 88])
    vmeta[k]["crop"] = [round(float(v), 4) for v in (x0, y0, x1, y1)]; vmeta[k]["crop_px"] = [crop.shape[1], crop.shape[0]]; vmeta[k]["full_px"] = [W_, H_]
# matched points between two photos
def obs(im): return {p.point3D_id: p.xy for p in im.points2D if p.has_point3D()}
cand_names = [n for n in reg_by if n.split('/')[1][:-4] in {c["id"] for c in cs}]
rel_all = world[:, [0, 2]] - np.array(edge["left"]); a_, o_ = np.array(w.wall_frame(edge)[0]), np.array(w.wall_frame(edge)[1])
pid_list = list(rec.points3D.keys()); idx_of = {p: i for i, p in enumerate(pid_list)}
best_pair = None
for na, nb in itertools.combinations(cand_names, 2):
    oa, ob = obs(reg_by[na]), obs(reg_by[nb]); sh = [p for p in oa if p in ob]
    onwall = [p for p in sh if abs(rel_all[idx_of[p]] @ o_) < 0.4 and -0.5 < rel_all[idx_of[p]] @ a_ < length + 0.5]
    ca, cb = reg_by[na].projection_center(), reg_by[nb].projection_center(); base = float(np.linalg.norm(ca - cb)) * geo["scale"]
    score = min(len(onwall), 60) * base * (1.6 if seq[na] != seq[nb] else 1.0)
    if len(onwall) >= 25 and (best_pair is None or score > best_pair[0]): best_pair = (score, na, nb, sh, onwall, base)
if best_pair:
    _, na, nb, sh, onwall, base = best_pair; oa, ob = obs(reg_by[na]), obs(reg_by[nb])
    rng2 = np.random.default_rng(3); keep = list(onwall); rng2.shuffle(keep); keep = keep[:70]
    other = [p for p in sh if p not in set(onwall)]; rng2.shuffle(other); keep += other[:50]
    pair = {"a": na.split('/')[1][:-4], "b": nb.split('/')[1][:-4], "baseline_m": round(base, 1), "shared": len(sh), "shared_on_wall": len(onwall), "same_drive": seq[na] == seq[nb], "pts": []}
    for tag, n in (("A", na), ("B", nb)):
        src = cv2.imread(str(work / "img" / n)); k_ = 1280 / src.shape[1]
        cv2.imwrite(str(OUT / f"pair{tag}.jpg"), cv2.resize(src, None, fx=k_, fy=k_, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 86])
        pair["size" + tag] = [src.shape[1], src.shape[0]]
        pid = n.split('/')[1][:-4]; pair["creator" + tag] = by[pid]["creator"]; pair["seq" + tag] = seq_ids.index(seq[n])
    for p in keep:
        i = idx_of[p]; wa, ha = pair["sizeA"]; wb, hb = pair["sizeB"]
        pair["pts"].append([round(float(oa[p][0]) / wa, 4), round(float(oa[p][1]) / ha, 4), round(float(ob[p][0]) / wb, 4), round(float(ob[p][1]) / hb, 4), round(float(world[i, 0]), 2), round(float(world[i, 2]), 2), round(float(world[i, 1]), 1), int(p in set(onwall))])
    X["pair"] = pair
X["n_obs"] = {"mean_track": round(float(np.mean([len(q.track.elements) for q in rec.points3D.values()])), 1)}
# points near the wall, in the wall's own frame (s along, d outward from the outline, h up)
L_ = np.array(edge["left"]); s_all, d_all, h_all = rel_all @ a_, rel_all @ o_, world[:, 1]
near = (s_all > -1.5) & (s_all < length + 1.5) & (d_all > -2.0) & (d_all < 7.0) & (h_all > 0.2) & (h_all < height)
X["near"] = [[round(float(a), 2), round(float(c), 3), round(float(h), 1)] for a, c, h in zip(s_all[near], d_all[near], h_all[near])]
X["outline_along"] = [round(float(a_[0]), 4), round(float(a_[1]), 4)]; X["outline_outward"] = [round(float(o_[0]), 4), round(float(o_[1]), 4)]
# one spot where the views used there disagree: for the middle-value demonstration.
# At each cell the tool uses the first FUSE_TOP views, best first, that see it unblocked.
clear = np.stack([m & ~k_ for (_, m), k_ in zip(cviews, cblocked)])[:, top:]
okc = np.stack([cv2.blur(c.astype(np.float32), (9, 9)) > 0.99 for c in clear])
matched = w.match_exposure(cviews, np.stack([m & ~k_ for (_, m), k_ in zip(cviews, cblocked)]))     # what the tool takes the middle value of
colc = [cv2.blur(v[top:], (9, 9)) for v in matched]; lumc = np.stack([cv2.cvtColor(c, cv2.COLOR_BGR2GRAY).astype(np.float32) for c in colc])
fblur = cv2.blur(fused[top:], (9, 9))
spots = []
for y in range(20, lumc.shape[1] - 20, 8):
    for x in range(20, lumc.shape[2] - 20, 8):
        use = np.flatnonzero(okc[:, y, x])[:w.FUSE_TOP]
        if len(use) < w.FUSE_TOP: continue
        v = np.sort(lumc[use, y, x]); mid = v[1:-1]
        if mid.max() - mid.min() < 9 and (v[-1] - v[-2] > 45 or v[1] - v[0] > 45): spots.append((float(max(v[-1] - v[-2], v[1] - v[0])), x, y, [int(u) for u in use]))
spots.sort(reverse=True)
X["spots"] = [{"x": x, "y": y, "gap": round(g), "use": use, "cols": [[int(c) for c in colc[u][y, x][::-1]] for u in use], "fused": [int(c) for c in fblur[y, x][::-1]]} for g, x, y, use in spots[:40]]
data["views"] = vmeta; data["extra"] = X
(OUT / "data.json").write_text(json.dumps(data))
print(json.dumps({k: X[k] for k in X if k not in ("near", "pair", "spots")}, default=str)); print(len(X["near"]), {k: v for k, v in X.get("pair", {}).items() if k != "pts"}); print([(s["x"], s["y"], s["gap"], s["use"]) for s in X["spots"]])
print([(v["crop"], v["crop_px"], v["full_px"]) for v in vmeta])

if os.environ.get("SPOT_SHEET"):   # a sheet of candidate spots, to choose SPOT by eye
    rows = []
    for s_ in X["spots"][:24]:
        x, y = s_["x"], s_["y"]; cut = lambda im: cv2.resize(im[y - 60:y + 60, x - 60:x + 60], (150, 150))
        tiles = [cut(matched[u][top:]) for u in s_["use"]] + [cut(fused[top:])]
        row = np.hstack([np.pad(t, ((0, 0), (0, 6), (0, 0))) for t in tiles])
        cv2.putText(row, f"{x},{y} " + " ".join(str(round(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])) for c in s_["cols"]) + f" use {s_['use']}", (4, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        rows.append(row)
    half = (len(rows) + 1) // 2
    cv2.imwrite(os.environ["SPOT_SHEET"], np.hstack([np.vstack(rows[:half]), np.vstack(rows[half:] + [np.zeros_like(rows[0])] * (half - len(rows[half:])))]))
# ---- what the film reads ----
seq_of = {by[c["id"]]["sequence"]: c["seq"] for c in data["cams"]}
given = [{"id": n.split("/")[1][:-4], "gps": [by[n.split("/")[1][:-4]]["x"], by[n.split("/")[1][:-4]]["z"]], "seq": seq_of.get(seq[n], -1), "cand": n.split("/")[1][:-4] in X["candidates"]} for n in names]
film = {
    "wall": data["wall"], "counts": data["counts"], "fit": data["fit"], "views": data["views"], "cams": data["cams"], "given": given,
    "pf": data["points_first"], "pl": data["points_final"], "outlines": data["outlines"], "target": data["target_outline"],
    "photos": [[round(x, 1), round(z, 1)] for x, z in data["all_photos"]],
    "along": X["outline_along"], "outward": X["outline_outward"], "near": X["near"], "pair": X["pair"],
    "spot": next((s for s in X["spots"] if s["x"] == SPOT[0] and s["y"] == SPOT[1]), None) or sys.exit(f"the spot {SPOT} is not among this run's candidates: run with SPOT_SHEET=<file.jpg> and choose another"), "within40": X["within_40m"], "combine": combine,
    "creators": X["creators"], "building": X["building"],
}
film["pair"]["baseline_m"] = float(film["pair"]["baseline_m"])
for i_, u in enumerate(film["spot"]["use"]):
    cv2.imwrite(str(ASSETS / f"use{i_}.jpg"), matched[u][top:], [cv2.IMWRITE_JPEG_QUALITY, 88])
(ASSETS / "data.js").write_text("window.WALLREFS = " + json.dumps(film, separators=(",", ":")) + ";\n")
for n in [f"src{k}.jpg" for k in range(6)] + [f"crop{k}.jpg" for k in range(6)] + [f"flat{k}.jpg" for k in range(6)] + ["best.jpg", "fused.jpg", "plain.jpg", "pairA.jpg", "pairB.jpg"] \
        + ["hid6.png", "hid16.png"] + [f"v{j}.jpg" for j in range(len(chosen))] + [f"vb{j}.png" for j in range(len(chosen))]:
    shutil.copy(OUT / n, ASSETS / n)
print("wrote", ASSETS / "data.js")
