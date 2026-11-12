#!/usr/bin/env python3
"""Measuring sheets for a wall reference: a metre grid over the image, and a plan drawn over it.

A wall reference (tools/refs/wallrefs.py) is front-on and at true scale, so a distance on it is a
distance on the wall. This writes two more images beside it:

    edgeNN_grid.jpg   the reference with a grid every 0.5 m, numbered from the wall's left end and
                      from the ground. Read bay widths, sill heights and storey heights off it.
    edgeNN_plan.jpg   the same reference with the building's survey plan drawn over it: storey
                      lines, bay edges and openings. Written when survey/<region>/plans/<id>.json
                      lists that wall. Where the drawn openings miss the real ones, the plan is off.

    python tools/refs/sheet.py bldg_... [--region R] [--edge N] [--image fused|best]

The plan is drawn only when `node tools/survey/survey.mjs check <building>` accepts it; otherwise the
grid sheet is written alone and the checker's output is printed. The plan sheet uses the image the
facade's "reference" names, unless --image is given. Plans can arrive in pull requests, so nothing in
one is trusted before that check.

Needs numpy and opencv (tools/refs/requirements.txt), and node for the check. Reads only local files.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

REPO = Path(__file__).resolve().parents[2]
MAX_SIDE_PX = 2000     # the longest side of a sheet, so an agent can open it whole
MARGIN_PX = 64         # room for the numbers, left and bottom
GRID_M = 0.5
# The survey's own patterns for a building id and a region name (tools/survey/lib.mjs). They name folders and files.
SOURCE_ID_RE = re.compile(r"^(?:bldg_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|(?:way|relation)_[0-9]{1,15})$")
REGION_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FONT = cv2.FONT_HERSHEY_SIMPLEX

KIND_COLOUR = {        # BGR
    "window": (255, 200, 0), "door": (0, 0, 255), "sliding_door": (255, 120, 0), "garage": (0, 140, 255),
    "shutter": (0, 200, 255), "shopfront": (0, 220, 0), "entrance": (200, 0, 200), "other": (160, 160, 160),
}


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)


class Sheet:
    """A wall image scaled for reading, with the wall's own metres as coordinates."""

    def __init__(self, img, px_per_m):
        h, w = img.shape[:2]
        self.k = min(3.0, (MAX_SIDE_PX - MARGIN_PX) / max(h, w))
        self.ppm = px_per_m * self.k
        self.w, self.h = round(w * self.k), round(h * self.k)
        self.length_m, self.height_m = w / px_per_m, h / px_per_m
        wall = cv2.resize(img, (self.w, self.h), interpolation=cv2.INTER_CUBIC if self.k > 1 else cv2.INTER_AREA)
        self.img = np.full((self.h + MARGIN_PX, self.w + MARGIN_PX, 3), 255, np.uint8)
        self.img[: self.h, MARGIN_PX:] = wall

    def pt(self, x_m, y_m):
        return (MARGIN_PX + round(x_m * self.ppm), self.h - round(y_m * self.ppm))

    def line(self, a, b, colour, width=1):
        cv2.line(self.img, self.pt(*a), self.pt(*b), colour, width, cv2.LINE_AA)

    def text(self, s, at_px, colour=(0, 0, 0), size=0.5, bold=1, backed=False):
        if backed:
            (tw, th), base = cv2.getTextSize(s, FONT, size, bold)
            cv2.rectangle(self.img, (at_px[0] - 2, at_px[1] - th - 3), (at_px[0] + tw + 2, at_px[1] + base), (255, 255, 255), -1)
        cv2.putText(self.img, s, at_px, FONT, size, colour, bold, cv2.LINE_AA)

    def axes(self, caption):
        """Numbers along the bottom (metres from the wall's left end) and the left (metres above the ground),
        and a caption, on a canvas widened to hold it."""
        for i in range(int(self.length_m) + 1):
            x, _ = self.pt(i, 0)
            self.text(str(i), (x - 5, self.h + 22))
        for j in range(int(self.height_m) + 1):
            _, y = self.pt(0, j)
            self.text(str(j), (8, min(self.h, y + 5)))
        (tw, _), _ = cv2.getTextSize(caption, FONT, 0.45, 1)
        short = MARGIN_PX + tw + 12 - self.img.shape[1]
        if short > 0:
            self.img = cv2.copyMakeBorder(self.img, 0, 0, 0, short, cv2.BORDER_CONSTANT, value=(255, 255, 255))
        self.text(caption, (MARGIN_PX, self.h + 48), size=0.45)

    def grid(self):
        """Lines every 0.5 m, drawn half see-through so the wall still reads under them."""
        under = self.img.copy()
        per_m = round(1 / GRID_M)
        for n in range(int(self.length_m / GRID_M + 1e-9) + 1):
            self.line((n * GRID_M, 0), (n * GRID_M, self.height_m), (0, 255, 255), 2 if n % per_m == 0 else 1)
        for n in range(int(self.height_m / GRID_M + 1e-9) + 1):
            self.line((0, n * GRID_M), (self.length_m, n * GRID_M), (0, 255, 255), 2 if n % per_m == 0 else 1)
        self.img = cv2.addWeighted(self.img, 0.55, under, 0.45, 0)


def draw_plan(sheet, plan, facade):
    """Storey lines, bay edges and openings of one wall of a plan, in the wall's metres.

    The plan measures from the wall's own left end. "reference_offset_m" says where that end sits in
    the image, so everything is drawn that far along, and both ends of the wall are marked."""
    off = facade.get("reference_offset_m", 0)
    for end in (off, off + facade["length_m"]):
        if -1e-6 <= end <= sheet.length_m + 1e-6:
            sheet.line((end, 0), (end, sheet.height_m), (0, 0, 0), 3)
    floors = [plan.get("base_m", 0)]
    for h in plan["storey_heights_m"]:
        floors.append(floors[-1] + h)
    for y in floors:
        sheet.line((0, y), (sheet.length_m, y), (255, 0, 255), 2)
    top = floors[-1] + plan.get("top_m", 0)
    sheet.line((0, top), (sheet.length_m, top), (255, 0, 255), 1)
    for row in facade["rows"]:
        for storey in row["storeys"]:
            floor, ceiling = floors[storey - 1], floors[storey]
            x = off
            for bay in row["bays"]:
                for _ in range(bay.get("count", 1)):
                    w = bay["width_m"]
                    sheet.line((x, floor), (x, ceiling), (255, 0, 255), 1)
                    if bay["kind"] != "wall":
                        ow, oh = bay["opening_m"]
                        x0, y0 = x + (w - ow) / 2, floor + bay.get("sill_m", 0)
                        colour = KIND_COLOUR.get(bay["kind"], (160, 160, 160))
                        cv2.rectangle(sheet.img, sheet.pt(x0, y0 + oh), sheet.pt(x0 + ow, y0), colour, 3, cv2.LINE_AA)
                        px, py = sheet.pt(x0, y0 + oh)
                        sheet.text(bay["kind"] + (" +balcony" if bay.get("balcony") else ""), (px + 4, py + 16), colour, 0.45, 1, backed=True)
                    x += w
            sheet.line((x, floor), (x, ceiling), (255, 0, 255), 1)


def check_plan(repo, region, place):
    """The plan of `place`, or (None, why). The survey tool's checker decides; its output says why not."""
    plan_file = repo / "survey" / region / "plans" / f"{place}.json"
    if not plan_file.is_file():
        return None, None
    r = subprocess.run(["node", str(repo / "tools" / "survey" / "survey.mjs"), "check", place, "--region", region, "--repo", str(repo)],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        return None, (r.stdout + r.stderr).strip() or f"the survey checker exited {r.returncode}"
    try:
        plan = json.loads(plan_file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return None, f"the plan could not be read: {e}"
    if not isinstance(plan, dict):
        return None, "the plan is not a JSON object"
    return plan, None


def read_image(path):
    """(image, None), or (None, what went wrong), naming the file."""
    img = cv2.imread(str(path)) if path.is_file() else None
    return (img, None) if img is not None else (None, f"{path.name} is missing or not a readable image")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("place", help="the building's source id, bldg_...")
    ap.add_argument("--region", default="tokyo-sumida-oshiage-2")
    ap.add_argument("--edge", type=int, help="one wall; default every wall that has an image")
    ap.add_argument("--image", choices=("fused", "best"), help="which image to draw on; default fused, or the one the plan's facade names")
    ap.add_argument("--repo", default=str(REPO), help="the clone to work in (default: the one this file is in)")
    args = ap.parse_args()
    if not SOURCE_ID_RE.match(args.place):
        die("the building id is not a PLATEAU id (bldg_...) or an OpenStreetMap way or relation (way_N, relation_N)")
    if not REGION_RE.match(args.region):
        die("the region name is not valid")
    repo = Path(args.repo).resolve()

    folder = repo / "data" / args.region / "refs" / args.place
    if not (folder / "refs.json").is_file():
        die(f"no wall references for {args.place}: {folder.relative_to(repo)}/refs.json is missing (tools/refs/README.md says how to make them)")
    try:
        refs = json.loads((folder / "refs.json").read_text(encoding="utf-8"))
        walls = [w for w in refs["walls"] if "files" in w]
        for w in walls:
            int(w["edge"]), float(w["px_per_m"]), float(w["length_m"])
    except (OSError, ValueError, KeyError, TypeError) as e:
        die(f"{folder.relative_to(repo)}/refs.json is not a wall reference file: {e}")
    plan, why_not = check_plan(repo, args.region, args.place)
    if why_not:
        print(why_not, file=sys.stderr)
        print("The plan was not drawn: the survey checker did not accept it. Only the grid sheets are written.", file=sys.stderr)

    out = []
    for wall in walls:
        if args.edge is not None and wall["edge"] != args.edge:
            continue
        edge = f"edge{int(wall['edge']):02d}"
        rel = folder.relative_to(repo)
        entry = {"edge": wall["edge"], "length_m": wall["length_m"]}
        img, problem = read_image(folder / f"{edge}_{args.image or 'fused'}.jpg")
        if problem:
            entry["problem"] = problem
            out.append(entry)
            continue
        entry["image_height_m"] = round(img.shape[0] / wall["px_per_m"], 2)
        if "doubt" in wall:
            entry["doubt"] = wall["doubt"]

        grid = Sheet(img, wall["px_per_m"])
        grid.grid()
        grid.axes("metres along the image, left to right seen from outside")
        cv2.imwrite(str(folder / f"{edge}_grid.jpg"), grid.img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        entry["grid"] = f"{rel}/{edge}_grid.jpg"

        facade = next((f for f in (plan or {}).get("facades", []) if f.get("edge") == wall["edge"]), None)
        if facade:
            named = Path(facade["reference"]).name if facade.get("reference") else None
            plan_img, problem = (img, None) if args.image or not named else read_image(folder / named)
            if problem:
                entry["plan_not_drawn"] = problem
            else:
                over = Sheet(plan_img, wall["px_per_m"])
                draw_plan(over, plan, facade)
                over.axes("metres along the image; black line: an end of the wall")
                cv2.imwrite(str(folder / f"{edge}_plan.jpg"), over.img, [cv2.IMWRITE_JPEG_QUALITY, 88])
                entry["plan"] = f"{rel}/{edge}_plan.jpg"
                if not args.image and named:
                    entry["plan_drawn_on"] = named
        out.append(entry)
    if not out:
        die("no wall of this building has a reference image" + (f" on edge {args.edge}" if args.edge is not None else ""))
    print(json.dumps({"place": args.place, "sheets": out, **({"plan_not_drawn": why_not} if why_not else {})}, indent=1))


if __name__ == "__main__":
    main()
