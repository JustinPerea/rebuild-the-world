# Wall references

`wallrefs.py` makes a front-on image of a real wall, at true scale, from openly licensed street-level photos. A builder looks at it to place windows and doors and to make a texture that matches. The image is a reference: its pixels are never used as a texture.

Status: first version, run on two buildings of the Oshiage 2 start block. The numbers below come from those runs.

## What it does

1. `index` lists the Mapillary photos in and around the region, with each photo's position and heading.
2. `plan` works out which photos see which wall of which building. A photo counts when it stands in front of the wall within 40 m, looks towards it, sees it at less than 72 degrees off front-on, has no other building in the way, and would give at least 25 pixels per metre. Ordinary photos only, unless `--panoramas` is given.
3. `build` does the rest for one building or for all of them:
   - downloads the photos at full size (with `--panoramas`, it also cuts a pinhole view towards the wall out of each panorama);
   - reconstructs where every photo was taken (structure-from-motion, with pycolmap);
   - places the reconstruction on the map. Mapillary's positions give a first placement, good to a few metres because each photo sequence carries its own GPS error. The reconstructed points are then slid onto the building outlines, matching a point only to a building tall enough to hold it;
   - finds the wall's real plane from the reconstructed points near its outline edge;
   - resamples each photo onto that plane, and writes the sharpest single view and a view combined from up to six photos. Where three or more photos see a spot, the combined view takes the median, which removes what moves between photos.

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
| `edgeNN_fused.jpg` | Up to six photos combined |
| `refs.json` | For each wall: pixels per metre, the photos used with their Mapillary IDs and photographers, how much of the wall is seen, where the wall's plane sits against the outline, and how well the reconstruction fits the map |

`data/*/refs/` is ignored by Git for now. See "Licence".

## How far to trust an image

`refs.json` carries the figures to judge it by.

- `placement.points_within_half_metre_of_an_outline` and `median_distance_to_outline_m` say how well the reconstruction sits on the map. On the first building 41% of points above 2 m were within half a metre of an outline, with a median of 0.95 m. Trees, balconies and signs keep this well under 100%.
- `plane.rms_m` is how flat the wall's points are (0.05 m on the first wall) and `plane.offset_from_outline_m` is how far the real wall sits from the outline edge (0.04 m).
- Along the street the placement is the weakest: nothing but building heights and side walls pins it. Expect an error of about a metre, so an image may start or end with a strip of the neighbour.
- Height is set from an assumed camera height of 1.5 m. Rows can be off by a few decimetres.
- A photo sees only what stood in front of it. A parked truck that is in every photo of one sequence stays in the combined view, and so does a tree. Parts no photo sees are black.

## Limits

- It needs photos. In the Oshiage 2 start block, ordinary photos see 48 walls of 30 buildings (38 of those walls from three or more photos), all along one street.
- Panoramas are unproven. With `--panoramas` the tool cuts views out of them, but on the one building tried none of seven was placed by the reconstruction, so they are off by default. A panorama's recorded position and heading were also seen to be wrong by many metres.
- A reconstruction is made per building from at most 40 photos, so neighbours repeat work.
- Roofs, and walls seen only from the air, are not covered.
- The checks are by eye. No test compares an output with a measured wall.

## Licence

Mapillary photos are CC BY-SA 4.0, and an image made from them is an adaptation: it must credit the photographers (listed in `refs.json`) and carry the same licence. The project has not chosen its own licence, and whether a texture made to match such an image counts as derived from it is a question for a lawyer. Until both are settled the images stay on the machine that made them and out of the repository.

Google Street View, Google Earth and Google's 3D tiles are not a source. Google's terms bar downloading the imagery, analysing it and making data from it.
