# The block survey

One plan per building: how many storeys it has and what stands along each wall. The plans are counted to find out which parts the block needs most, before anyone builds them.

The outline, the heights, and the storey count and usage where the source records them, come from the region's data pack. The data pack holds no picture of any facade, so by default a wall in a plan is a typical facade chosen by whoever writes it, and it must not be presented as observed. A wall that has a wall reference (`tools/refs/README.md`) can be drawn from that image instead, and the plan says so with `"basis": "reference"`. `skill/blueprint-skill.md` is the guide for drafting one building that way.

## The loop

```sh
node tools/survey/survey.mjs next       # the next building, and the bays used so far
# write the plan to the file that "next" names
node tools/survey/survey.mjs check      # fix what it reports, then run "next" again
node tools/survey/survey.mjs tally --write
```

`next` returns the same building until its plan passes. `show <building>` prints the same facts for one building you name by its source id (`bldg_…`). It covers the region's start block; `--all` covers every building. Progress is the set of plan files, so the loop can stop and resume at any point.

## What `next` tells you

| Field | Meaning |
| --- | --- |
| `file` | Where the plan goes |
| `height_m`, `storeys`, `usage` | From the source. `storeys` and `usage` are `null` for about half the buildings |
| `roof.shape` | `flat`, `pitched` or `mixed`, from the source's roof model |
| `roof.lowest_eave_m`, `roof.main_eave_m`, `roof.top_m` | Heights above the building's ground. `main_eave_m` is the eave of the roof level that covers the most floor area |
| `roof.levels` | Each roof level's eave, top and share of the floor area. More than one level means a stepped building |
| `edges[].edge` | The edge's number, starting at 0. Use it in the plan exactly as printed. Edge `i + 1` is the wall around the right-hand corner of edge `i` |
| `edges[].length_m` | The wall's length |
| `edges[].faces` | The compass direction the wall looks towards |
| `edges[].clear_m` | The distance from the wall to the nearest other building in front of it, up to 30. `0` means another building touches it |
| `edges[].corner_left_deg`, `corner_right_deg` | The building's inside angle at each end: 90 is a square corner, 270 a corner that points inwards |
| `used_so_far` | The bays and storey heights that earlier plans used, most used first |
| `remaining` | How many buildings still have no passing plan, this one included |

Every edge runs left to right for someone standing outside and looking at the wall.

## The plan file

```json
{
  "survey_version": 1,
  "place_id": "plateau:bldg_91a8dddd-eaa4-4daf-b637-a346b195e780",
  "usage": "house with shop",
  "usage_from": "data",
  "storeys": 3,
  "storeys_from": "data",
  "wall_height_m": 10.09,
  "base_m": 0.2,
  "storey_heights_m": [3.4, 3.1, 3.1],
  "top_m": 0.29,
  "roof": "flat",
  "facades": [
    {
      "edge": 0,
      "length_m": 6.236,
      "rows": [
        { "storeys": [1], "bays": [
          { "kind": "wall", "width_m": 0.3 },
          { "kind": "shopfront", "width_m": 3.6, "opening_m": [3.4, 2.6], "sill_m": 0.2 },
          { "kind": "door", "width_m": 1.1, "opening_m": [0.85, 2.05], "sill_m": 0 },
          { "kind": "wall", "width_m": 1.236 }
        ] },
        { "storeys": [2, 3], "bays": [
          { "kind": "wall", "width_m": 0.3 },
          { "kind": "window", "width_m": 1.4, "opening_m": [1.25, 1.3], "sill_m": 0.85, "count": 4 },
          { "kind": "wall", "width_m": 0.336 }
        ] }
      ]
    }
  ],
  "notes": "",
  "provenance": { "author": "hermes", "tools": ["Hermes Agent 0.23", "the model's own name"], "created": "2026-11-12" }
}
```

The example shows the shape of the file. Its sizes are placeholders: do not copy them. Choose sizes from what you know of buildings of that kind.

| Field | Rule |
| --- | --- |
| `usage`, `usage_from` | One of the usages `next` lists. `"data"` when the source gives it, and then it must match. `"estimated"` when you chose it. `outbuilding` is for a shed, a garage or an annex |
| `storeys`, `storeys_from` | The same. If the source's count cannot be right for the height, estimate your own and say why in `notes` |
| `wall_height_m` | The height of the walls you are planning, from the ground to the eave. Between `roof.lowest_eave_m` and `roof.top_m`; `roof.main_eave_m` unless you have a reason |
| `base_m`, `storey_heights_m`, `top_m` | A band below the ground floor, each storey's height from the ground floor up, and a band above the top storey. They add up to `wall_height_m` within 3 cm. Storey heights are multiples of 0.05 m from 2.0 to 6.0; the bands take the remainder |
| `roof` | `flat`, `gable`, `hip`, `shed` or `other` |
| `facades` | The walls that have openings. A wall that is not listed is a plain wall on every storey |
| `facades[].length_m` | The edge's length as `next` gave it. It guards against a plan landing on the wrong edge |
| `facades[].basis`, `reference` | Optional. `"typical"` (the default) for a facade you chose. `"reference"` for one drawn from a wall reference, with `"reference"` naming the image: `edge00_fused.jpg` or `edge00_best.jpg` for edge 0 |
| `facades[].reference_offset_m` | Optional, with `"basis": "reference"`. Where the wall's own left end sits in the image, in metres from the image's left edge (negative when it lies off the image). Bays are always measured from the wall's left end; `tools/refs/sheet.py` uses this number to draw them in the right place |
| `rows` | Each row covers one or more storeys with the same bays. Every storey is covered by exactly one row. On a listed wall, a storey with no opening is a row with one `wall` bay as long as the wall |
| `bays` | Left to right, seen from outside. Their widths, times `count`, add up to the wall's length within 1 cm. Where the wall ends at an outside corner (an inside angle under 180 degrees), the row's end bay is a plain `wall` bay at least 0.2 m wide: a corner post stands there |
| `notes` | Up to 600 characters |
| `provenance` | `author`, `tools` (the agent and the model it ran on) and `created` |

To split the wall height: choose the storey heights first, then give what is left to `base_m` and `top_m`. For a wall 8.46 m high with three storeys of 2.7 m, 0.36 m is left, which can be a 0.3 m base and a 0.06 m top band.

When the source's usage or storey count looks wrong for the building's size, plan the building anyway if a sensible plan exists: keep a usage from the data as given, estimate the storeys yourself, and say what you did in `notes`. Skip with `data_inconsistent` only when no sensible plan exists. A low outbuilding may need a door shorter than the common one. That is a finding the tally should show, so plan it as it is.

A building the format cannot describe is recorded and passed over:

```json
{ "survey_version": 1, "place_id": "plateau:bldg_…", "skipped": "too_small", "notes": "A lean-to 1.2 m tall against the next house.", "provenance": { … } }
```

`skipped` is one of `too_small`, `not_a_building`, `shape_too_complex`, `data_inconsistent`, `other`.

## Bays

A bay is a strip of wall one storey high: the unit that would become one atom. It holds one opening or none.

| Kind | What it is |
| --- | --- |
| `wall` | No opening |
| `window` | A window with a sill above the floor |
| `door` | A single entrance door |
| `sliding_door` | A glazed door to a balcony, a terrace or a garden |
| `garage` | An opening a car drives through, with or without a door |
| `shutter` | A roll-up shutter over a workshop, a store room or a shop |
| `shopfront` | A glazed shop front |
| `entrance` | The shared entrance of an apartment or office building |
| `other` | Anything else, with a `description` of 3 to 120 characters |

- `width_m` is the bay's width. `opening_m` is `[width, height]` of the opening, and `sill_m` is the height of its bottom above that storey's floor (0 for a door). The opening fits inside the bay and under the storey's height.
- Every size is a multiple of 0.05 m, except that one `wall` bay in each row may take whatever remainder the wall's length leaves.
- `count` repeats a bay side by side. `"balcony": true` is allowed on a `window` or a `sliding_door`.
- Reuse a bay from `used_so_far` wherever it fits. The survey measures how few distinct bays the block needs, and a new size that differs from an old one by 5 cm for no reason hides the answer.

## The tally

`tally --write` writes `survey/<region>/TALLY.md` and `tally.json`. It counts every bay once per storey it stands on, ranks the bays, and reports how many distinct atoms the block needs under three rules: nothing stretches; walls stretch in width; walls stretch in width and every bay stretches in height. Wall bays are counted like any other bay, and a wall that is not listed in a plan counts as one wall bay per storey. Under the first rule every remainder width is an atom of its own, which is why that count is high. The difference between the three is the case for or against the stretch spans proposed in `docs/asset-spec.md` ("Variation").

## Trust

A plan is written by a contributor's agent and can arrive in a pull request. `next` shows the following builder only numbers and words from the fixed lists above. `notes` and `description` are never passed on by `next`; the tally quotes descriptions as data.
