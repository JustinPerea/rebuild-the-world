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

Needs numpy and opencv (tools/refs/requirements.txt). Reads only local files.
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

REPO = Path(__file__).resolve().parents[2]
MAX_SIDE_PX = 2000     # the longest side of a sheet, so an agent can open it whole
MARGIN_PX = 64         # room for the numbers, left and bottom
GRID_M = 0.5
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

    def axes(self):
        """Numbers along the bottom (metres from the wall's left end) and the left (metres above the ground)."""
        for i in range(int(self.length_m) + 1):
            x, _ = self.pt(i, 0)
            self.text(str(i), (x - 5, self.h + 22))
        for j in range(int(self.height_m) + 1):
            _, y = self.pt(0, j)
            self.text(str(j), (8, min(self.h, y + 5)))
        self.text("metres along the image, left to right seen from outside; a black line marks an end of the wall", (MARGIN_PX, self.h + 48), size=0.45)

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


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("place", help="the building's source id, bldg_...")
    ap.add_argument("--region", default="tokyo-sumida-oshiage-2")
    ap.add_argument("--edge", type=int, help="one wall; default every wall that has an image")
    ap.add_argument("--image", choices=("fused", "best"), default="fused")
    args = ap.parse_args()

    folder = REPO / "data" / args.region / "refs" / args.place
    if not (folder / "refs.json").is_file():
        die(f"no wall references for {args.place}: {folder.relative_to(REPO)}/refs.json is missing (tools/refs/README.md says how to make them)")
    refs = json.loads((folder / "refs.json").read_text())
    plan_file = REPO / "survey" / args.region / "plans" / f"{args.place}.json"
    plan = json.loads(plan_file.read_text()) if plan_file.is_file() else None

    out = []
    for wall in refs["walls"]:
        if "files" not in wall or (args.edge is not None and wall["edge"] != args.edge):
            continue
        name = f"edge{wall['edge']:02d}_{args.image}.jpg"
        img = cv2.imread(str(folder / name))
        if img is None:
            die(f"cannot read {name}")
        entry = {"edge": wall["edge"], "length_m": wall["length_m"], "image_height_m": round(img.shape[0] / wall["px_per_m"], 2)}
        if "doubt" in wall:
            entry["doubt"] = wall["doubt"]

        grid = Sheet(img, wall["px_per_m"])
        grid.grid()
        grid.axes()
        cv2.imwrite(str(folder / f"edge{wall['edge']:02d}_grid.jpg"), grid.img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        entry["grid"] = f"{folder.relative_to(REPO)}/edge{wall['edge']:02d}_grid.jpg"

        facade = next((f for f in (plan or {}).get("facades", []) if f.get("edge") == wall["edge"]), None)
        if facade:
            over = Sheet(img, wall["px_per_m"])
            draw_plan(over, plan, facade)
            over.axes()
            cv2.imwrite(str(folder / f"edge{wall['edge']:02d}_plan.jpg"), over.img, [cv2.IMWRITE_JPEG_QUALITY, 88])
            entry["plan"] = f"{folder.relative_to(REPO)}/edge{wall['edge']:02d}_plan.jpg"
        out.append(entry)
    if not out:
        die("no wall of this building has a reference image" + (f" on edge {args.edge}" if args.edge is not None else ""))
    print(json.dumps({"place": args.place, "sheets": out}, indent=1))


if __name__ == "__main__":
    main()
