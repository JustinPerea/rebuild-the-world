# Wall references

`wallrefs.py` makes a front-on image of a real wall, at true scale, from openly licensed street-level photos. A builder looks at it to place windows and doors and to make a texture that matches. The image is a reference: its pixels are never used as a texture.

Status: first version, run once over the Oshiage 2 start block (2026-11-11). Photos could see 48 walls of 30 buildings; the tool accepts images of 9 walls of 7 buildings and writes 4 more that it marks as doubtful. "What the first full run gave" has the breakdown.

## What it does

1. `index` lists the Mapillary photos in and around the region, with each photo's position and heading.
2. `plan` works out which photos see which wall of which building. A photo counts when it stands in front of the wall within 40 m, looks towards it, sees it at less than 72 degrees off front-on, has no other building in the way, and would give at least 25 pixels per metre. Ordinary photos only, unless `--panoramas` is given.
3. `build` does the rest for one building or for all of them:
   - downloads the photos at full size (with `--panoramas`, it also cuts a pinhole view towards the wall out of each panorama);
   - reconstructs where every photo was taken (structure-from-motion, with pycolmap);
   - places the reconstruction on the map. Mapillary's positions give a first placement, good to a few metres because each photo sequence carries its own GPS error. The reconstructed points are then slid onto the building outlines, matching a point only to a building tall enough to hold it;
   - finds the wall's real plane from the reconstructed points near its outline edge, and gives the wall up when that plane sits more than 1 m from the outline;
   - tries every placed photo against the wall, not only the ones the plan picked from GPS, and resamples up to 16 onto the plane. The first is the photo that shows most of the wall sharply. Each one after it is the photo that adds most to the parts still short of five unblocked views, so a photo that sees little of the wall is taken when it sees behind a parked truck;
   - works out which part of the wall each photo sees blocked. The reconstruction has points on whatever stands in the street. A point more than 1.5 m out from the wall and nearer than the camera hides the wall behind it, as a shadow thrown from the camera's position; two such points must overlap before a spot counts as blocked;
   - writes the sharpest single view and a combined view. Each spot of the combined view comes from the photos that see it unblocked, the sharpest five of them: the middle value where three or more do, which drops what only one of them saw, and the sharpest one otherwise. Brightness is evened out between photos first. A spot blocked in every photo is filled from all of them and greyed, so it reads as unknown.

## Running it

```sh
python -m venv .venv && .venv/bin/pip install -r tools/refs/requirements.txt
export MAPILLARY_TOKEN='MLY|...'        # a client token from mapillary.com/dashboard/developers
python tools/refs/wallrefs.py index
python tools/refs/wallrefs.py plan
python tools/refs/wallrefs.py build --place bldg_5b434eb5-e19c-4ccb-858a-3b2d1f6024f2
python tools/refs/wallrefs.py build --all --reuse
```

Node must be on the path: the tool asks `tools/survey/survey.mjs` for the walls, so edge numbers here are the survey's edge numbers. `--whole-region` covers every building; the default is the start block. `--reuse` skips the reconstruction when an earlier run saved one. One building takes a few minutes.

## What it writes

Downloads and working files go to `data/raw/mapillary/<region>/`, which Git ignores.

Results go to `data/<region>/refs/<building>/`:

| File | Content |
| --- | --- |
| `edgeNN_best.jpg` | The sharpest single photo of wall NN, front-on. Left of the image is the left end of the wall seen from outside; the bottom row is the ground |
| `edgeNN_fused.jpg` | Up to 16 photos combined, each spot from the photos that see it unblocked. Grey-veiled parts were blocked in every photo; black parts no photo saw |
| `refs.json` | For each wall: pixels per metre, the photos used with their Mapillary IDs and photographers, how much of the wall is seen and how much of it unblocked, where the wall's plane sits against the outline, how much the views disagree, a `doubt` line when they disagree too much, and how well the reconstruction fits the map. A wall with no image has a `problem` line saying why |

`data/*/refs/` is ignored by Git for now. See "Licence".

## Measuring from an image

```sh
python tools/refs/sheet.py bldg_e4639cfe-aa87-42b0-afb1-618c2e74eb92
```

`sheet.py` writes two more images beside each wall reference. It reads local files only and needs numpy and opencv.

| File | Content |
| --- | --- |
| `edgeNN_grid.jpg` | The reference under a grid with a line every 0.5 m, numbered in metres from the wall's left end and from the ground. Bay widths, sill heights and storey heights are read off it |
| `edgeNN_plan.jpg` | The reference with the building's survey plan drawn over it: storey lines, bay edges and each opening as a coloured box. Written when `survey/<region>/plans/<building>.json` lists that wall. An opening drawn where the image shows wall means the plan is off there |

`--edge N` does one wall and `--image best` uses the sharpest single photo, which is the one to look at where the combined image is smeared. Both sheets are ignored by Git with the rest of `refs/`.

## How far to trust an image

`refs.json` carries the figures to judge it by.

- `placement.points_within_half_metre_of_an_outline` and `median_distance_to_outline_m` say how well the reconstruction sits on the map. On `bldg_5b434eb5…`, the building the explainer film follows, 47% of points above 2 m are within half a metre of an outline, with a median of 0.64 m. Trees, balconies and signs keep this well under 100%.
- `plane.rms_m` is how flat the wall's points are (0.06 m on that building's street wall) and `plane.offset_from_outline_m` is how far the real wall sits from the outline edge (0.05 m there).
- `views_disagree` is how far apart the photos are, on a 0 to 255 scale, where three or more see the same spot unblocked. The accepted walls of the first run range from 6.6 to 18.5, and the doubtful ones start at 20.7. A wall marked `doubt` needs a look before anyone builds from it.
- Along the street the placement is the weakest: nothing but building heights and side walls pins it. Expect an error of about a metre, so an image may start or end with a strip of the neighbour.
- Height is set from an assumed camera height of 1.5 m. Rows can be off by a few decimetres.
- What stands in front of a wall is left out only where the reconstruction has points on it and some photo sees behind it. On the film's wall a parked truck and a tree hid 20% of the wall from the six photos the plan picked. With ten closer photos added, 5% is still blocked in every photo and comes out greyed. `seen.unblocked` and `seen.blocked_in_every_view` give the shares for each wall.
- The blocked parts are found from sparse points, so they are rough. Leaves, wires and poles have few points and can stay in the image unmarked, and a plain surface such as a truck's side can have a hole in its mark.

## What the first full run gave

One run over the start block. The 22 buildings that reconstructed took 85 minutes between them on a laptop. The counts below are from building those 22 again from their saved reconstructions with the tool as it is now (2026-11-12):

| Outcome | Walls |
| --- | --- |
| Image accepted | 9 |
| Image written but marked doubtful: the views disagree | 4 |
| Plane found more than 1 m from the outline, rejected | 7 |
| Too few reconstructed points on the wall to find its plane | 17 |
| Building's photos could not be reconstructed (6 buildings) or the reconstruction could not be placed on the map (2 buildings) | 11 |

Both checks come from this run. Before they existed it wrote 16 images, and by eye about half were smeared or showed a tree, a fence or the neighbour. Every image whose plane sat more than a metre from the outline was one of those, so such a plane is now rejected. One smeared image sat 0.98 m away and passed, so the tool also measures how much the views disagree on the plane (`views_disagree` in `refs.json`) and marks a wall `doubt` above 19 of 255. That threshold separates the good and bad images of this one run and nothing more: 13 walls is too few to trust it, and the gap it sits in is narrow (18.5 to 20.7), which is why a doubtful image is kept and marked, not deleted.

Of the 9 accepted, the planes sit between 0.05 and 0.73 m from the outline, at 80 to 190 pixels per metre.

Trying every placed photo and leaving out blocked views (added 2026-11-12) changed three walls. A wall that had no usable photo now has eight, and they disagree: doubtful. A shop front that had passed on two photos, too few to measure agreement, now has ten that disagree: doubtful, and by eye its plane is the stall's awning, not the wall. A wall that had been marked doubtful at 24.2 now measures 18.5 with its blocked parts left out, and by eye its balconies line up. On the accepted walls the change removes a parked truck, part of two trees and a fence, and greys what it could not see behind.

Most failures have one cause: the photos were taken from a car driving along one street, so a wall is seen at a slant, from one side, by one or two drives. Walls that face the street squarely from across it do best.

## Limits

- It needs photos. In the Oshiage 2 start block, ordinary photos see 48 walls of 30 buildings (38 of those walls from three or more photos), all along one street.
- Panoramas are unproven. With `--panoramas` the tool cuts views out of them, but on the one building tried none of seven was placed by the reconstruction, so they are off by default. A panorama's recorded position and heading were also seen to be wrong by many metres.
- A reconstruction is made per building from at most 40 photos, so neighbours repeat work.
- Roofs, and walls seen only from the air, are not covered.
- No test compares an output with a measured wall. The two automatic checks catch a wrong plane; whether an accepted image is true to the wall is still judged by eye.

## Licence

Mapillary photos are CC BY-SA 4.0, and an image made from them is an adaptation: it must credit the photographers (listed in `refs.json`) and carry the same licence. The project has not chosen its own licence, and whether a texture made to match such an image counts as derived from it is a question for a lawyer. Until both are settled the images stay on the machine that made them and out of the repository.

Google Street View, Google Earth and Google's 3D tiles are not a source. Google's terms bar downloading the imagery, analysing it and making data from it.
