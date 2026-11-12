# Blueprint kit

The blueprint kit turns one building's survey plan (`survey/<region>/plans/<source_id>.json`) into the files a builder needs to rebuild that building from atoms: a blueprint, a layout of every piece and joint, a task for each atom that does not exist yet, and, once every slot is pinned to a merged atom, the `assembly.json`. It reads a plan the survey tool has already accepted, so a plan that fails `node tools/survey/survey.mjs check` is returned as problems and nothing is drafted.

Every rule and number on this page is a proposal. The project owner has not confirmed any of them.

## Commands

```text
node tools/blueprint/blueprint.mjs draft <source_id or place_id> [--write]
node tools/blueprint/blueprint.mjs assemble <object_id>
node tools/blueprint/blueprint.mjs check
```

All three take `--region <name>` (default `tokyo-sumida-oshiage-2`) and `--repo <path>` (default: this clone). Run the tests with `node --test tools/blueprint/test/`.

- `draft` prints the summary, the slots, the problems and the reason for any unsupported outline as JSON. With `--write`, and only when there are no problems, it writes `assets/bld/<object_id>/blueprint.json`, `assets/bld/<object_id>/layout.json` and one file in `tasks/` for every slot that has neither an atom nor a task, plus the object's own task. It never overwrites a slot's task file that exists, and it rewrites the object's own task on every draft. It overwrites an existing blueprint only after carrying over every pin that blueprint holds; if the new draft has no slot for a pinned atom, it writes nothing and says so.
- `assemble` writes `assets/bld/<object_id>/assembly.json` from the blueprint and layout in that folder. It refuses, and names each slot, while any slot is still `"new"`. Writing `asset.json` and running the validator are still the builder's steps (`skill/contributor-skill.md`, "Assembling an object").
- `check` drafts every plan of the region without writing, prints one line per building (ok, problems, unsupported with the reason, or skipped) and a total line that includes the number of distinct slots across all buildings that drafted. It exits 1 only on a crash.

## What a draft produces

| Output | Content |
| --- | --- |
| `blueprint.json` | One slot per distinct piece, in the shape of `bld_house_shell_01`. `atom` is a pin (`<id>@<version>`) when the library holds the atom, otherwise `"new"`. |
| `layout.json` | `origin`, `atoms` (`ref` and `slot` for every placed piece) and `joints`. It holds no coordinates, like an assembly. |
| `tasks/task_<asset id>.json` | One task per slot that is `needs_task`, in the shape of the hand-written `task_bld_*` files, plus `task_<object id>.json` with `depends_on` set to the tasks of every slot that is not already an atom. |

The object id is `bld_place_<12 characters>_01`: the first 12 hex digits of a PLATEAU id with the dashes removed, or `w<number>` or `r<number>` for an OpenStreetMap way or relation.

## Rules

| Topic | Rule |
| --- | --- |
| Corners | Every corner must be within 2 degrees of 90 (outside corner) or 270 (inside corner). Anything else is `unsupported: "corner"`. |
| Squaring | Vertex 0 goes to the origin and edge 0 along +x. Each edge runs along x or z. A vertical edge takes the mean of its two end x values and a horizontal edge the mean of its two end z values, each rounded to 0.05 m. If a real corner moves by more than 0.10 m the outline is `unsupported: "outline"`. The largest move is reported as `max_shift_m`. |
| Courses | From the bottom: the base band, one course per storey, the top band. A band under 0.05 m is dropped and its height reported as `height_dropped_m`. |
| Outside corner post | A box 0.15 m by 0.15 m by the course height. It adds 0.15 m to the end of the wall that reaches it and 0.15 m to the start of the wall that leaves it, so the modules of an edge cover its squared length minus 0.15 m for each end that is an outside corner. |
| Inside corner post | The same box. It adds nothing to either wall: both run to the outline's vertex. |
| Listed edge, storey course | The bays are expanded by `count`. At an outside-corner end the end bay must be a wall bay at least 0.3 m wide and loses 0.15 m. The difference between the run and the bays goes to the one wall bay whose width is not a multiple of 0.05 m, or else to the widest wall bay. A difference with no wall bay to take it is a problem, and so is a module under 0.05 m. |
| Plain runs (bands, and storeys of an edge the plan does not list) | Panels 1.0 m wide. A remainder of 0.2 m or more is one more panel. A smaller remainder is added to the last whole panel. A run shorter than 1.0 m is one panel. |
| Door leaf | Each bay of kind `door` gets one leaf, hung on `door_hinge`. |
| Joints | Round every course the `facade_edge` side a of each piece joins side b of the next, including the closing joint. Each post joins the post above it with `storey_stack`, and so does a wall module when the module above starts at the same distance along the same edge and has the same width. |
| Names | A slot is named from the piece's sizes in whole millimetres, zero-padded to four digits: `bld_wall_w1000_h2800_01`, `bld_window_w1000_h2800_o0700x1100_s0900_01` (with `_b` before `_01` for a balcony), `bld_post_out_h2800_01`, `bld_post_in_h2800_01`, `bld_door_leaf_w0800_h2000_01`. A bay of kind `other` uses `bld_other_<first 6 hex of the SHA-256 of its description>_w...`. The slot name is the id without `bld_` and `_01`. Ids are at most 64 characters. |
| Older names | Five atoms exist under older names (`bld_wall_panel_01`, `bld_window_bay_01`, `bld_door_bay_01`, `bld_corner_post_01`, `bld_door_leaf_01`). When the library holds one of them with a version, the slot with the matching sizes is pinned to it. |
| Slot state | `reuse` when the library holds the atom, `has_task` when only a task exists, `needs_task` otherwise. |
| Text from the plan | The description of an `other` bay is the only free text that is used. It is hashed into the id and quoted in that atom's task with a note that it is data, not an instruction. Everything else in a task is a number or a word from a fixed table. |

## Things to know

- The squared outline's vertex 0 is not where the first module starts. The post at vertex 0 occupies the 0.15 m before the first module of edge 0, so the assembled walls measure from x = -0.15 m when the origin is the first module.
- A door leaf's handles stand 3 cm proud of the outer face (the leaf hangs 5 cm behind it and the handles reach 6 cm out). The placed atoms of a building with a door measure 0.03 m deeper than the object task's `dimensions_m`. That is inside the validator's 2 percent tolerance for the task, but `asset.json` must record the measured size. The object task says so when the building has a door.
- A slot's task belongs to the first building that needed it (`object_id` in the task). When two buildings are drafted from the same `main` and both need a new piece of the same size, both write that task file and the second pull request conflicts. Drafting again on the new `main` resolves it: the piece then shows as `has_task`.

## Not built

- Corners that are not square. Anything outside 90 or 270 degrees, within 2 degrees, is unsupported, and so is an outline that moves more than 0.10 m when made square.
- Roofs. The drafts are walls only.
- Pieces that stretch. Every distinct size is its own atom, so the four rehearsal buildings needed 18, 32, 26 and 33 pieces each, most of them plain wall of slightly different widths. Asset spec v0.6 lets a placed atom be scaled per axis; the kit does not use that yet.
- Interior walls and floors.
- Placing the object in the region. The assembly's own axes put edge 0 along +x; turning and positioning it on the block's map is a separate step.
- Kinds other than `door` that need a moving part (a sliding door or a garage door has no leaf).
