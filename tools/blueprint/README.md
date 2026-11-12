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

- `draft` prints the summary (`pieces`, `distinct_slots` and `distinct_sizes`), the slots, the problems and the reason for any unsupported outline as JSON. With `--write`, and only when there are no problems, it writes `assets/bld/<object_id>/blueprint.json`, `assets/bld/<object_id>/layout.json` and one file in `tasks/` for every slot that has neither an atom nor a task, plus the object's own task. It never overwrites a slot's task file that exists, and it rewrites the object's own task on every draft. It overwrites an existing blueprint only after carrying over every pin that blueprint holds, and its `version` when that has the form `1.2.3`; if the new draft has no slot for a pinned atom, it writes nothing and says so. A blueprint can arrive in a pull request, so a pin is carried over only when it is written `<asset id>@<major.minor.patch>`; anything else is dropped, and the report gives `ignored_pins` with a count and the slot names, never the value. A library atom whose `asset.json` version is not `major.minor.patch` counts as absent. Every file it writes must resolve inside the clone: if `assets/bld/<object id>` or `tasks` is a link that leaves the clone, it stops with exit 2 and writes nothing.
- `assemble` writes `assets/bld/<object_id>/assembly.json` from the blueprint and layout in that folder. It refuses, and names each slot, while any slot is still `"new"`, when a slot's atom is not a pin of the form above, and unless the blueprint's and the layout's `object_id` both equal the folder's name. It will not write through a link that leaves the clone. Writing `asset.json` and running the validator are still the builder's steps (`skill/contributor-skill.md`, "Assembling an object").
- `check` drafts every plan of the region without writing, prints one line per building (ok, problems, unsupported with the reason, or skipped) and a total line that includes the number of distinct slots across all buildings that drafted. Each line gives the building's pieces, its slots, and its distinct sizes: how many atoms it would need if nothing were scaled. It exits 1 only on a crash.

## What a draft produces

| Output | Content |
| --- | --- |
| `blueprint.json` | One slot per distinct atom, in the shape of `bld_house_shell_01`. A base atom's slot has the base atom's `dimensions_m` and connectors, a `count` equal to the pieces placed, and a `variation` note with the range the atom must declare. `atom` is a pin (`<id>@<version>`) when the library holds the atom, otherwise `"new"`. |
| `layout.json` | `origin`, `atoms` (`ref` and `slot` for every placed piece, and `scale` when it is not 1) and `joints`. It holds no coordinates, like an assembly. `assemble` copies each `scale` into the manifest entry. |
| `tasks/task_<asset id>.json` | One task per slot that is `needs_task`, in the shape of the hand-written `task_bld_*` files, plus `task_<object id>.json` with `depends_on` set to the tasks of every slot that is not already an atom. |

The object id is `bld_place_<key>_01`. The key is the first 12 hex digits of a PLATEAU id with the dashes removed, or `w<number>` or `r<number>` with the whole number for an OpenStreetMap way or relation, so two ways never share an id.

## Rules

| Topic | Rule |
| --- | --- |
| Corners | Every corner must be within 2 degrees of 90 (outside corner) or 270 (inside corner). Anything else is `unsupported: "corner"`. |
| Squaring | Vertex 0 goes to the origin and edge 0 along +x. Each edge runs along x or z. A vertical edge takes the mean of its two end x values and a horizontal edge the mean of its two end z values, each rounded to 0.05 m. If a real corner moves by more than 0.10 m the outline is `unsupported: "outline"`. The largest move is reported as `max_shift_m`. |
| Courses | From the bottom: the base band, one course per storey, the top band. A band under 0.05 m is dropped and its height reported as `height_dropped_m`. |
| Outside corner post | A box 0.15 m by 0.15 m by the course height. It adds 0.15 m to the end of the wall that reaches it and 0.15 m to the start of the wall that leaves it, so the modules of an edge cover its squared length minus 0.15 m for each end that is an outside corner. |
| Inside corner post | The same box. It adds nothing to either wall: both run to the outline's vertex. |
| Listed edge, storey course | The bays are expanded by `count`. At an outside-corner end the end bay must be a wall bay at least 0.3 m wide, as written, and loses 0.15 m. A single wall bay between two outside corners loses 0.3 m: a 0.4 m edge leaves a 0.1 m module, and a 0.3 m edge leaves none, so the two posts join each other as on an unlisted edge of that length. The difference between the run and the bays goes to the one wall bay whose width is not a multiple of 0.05 m, or else to the widest wall bay. A difference with no wall bay to take it is a problem, and so is a module under 0.05 m. |
| Plain stretches | A plain run (a band, or a storey of an edge the plan does not list) and the `wall` bay of a listed row, after its corner allowance, are each cut into n = max(1, round(W / 1.0 m)) equal pieces. A stretch under 1.5 m is one piece, scaled down when it is shorter than 1.0 m and never below 0.05 m. A longer stretch is cut so that each piece is between 0.75 and 1.5 times the base panel. Widths are whole millimetres and may not divide evenly, so the first (W mod n) pieces are 1 mm wider and the pieces sum to W exactly. |
| Door leaf | Each bay of kind `door` gets one leaf, hung on `door_hinge`. |
| Joints | Round every course the `facade_edge` side a of each piece joins side b of the next, including the closing joint. Each post joins the post above it with `storey_stack`, and so does a wall piece when the piece above starts at the same distance along the same edge and has the same width, compared in whole millimetres after the cut. |
| Base atoms | Three atoms stand for all plain wall and all corner posts, whatever their size: `bld_wall_panel_01` (1.0 m by 2.8 m by 0.15 m, slot `wall`), `bld_corner_post_01` (0.15 m by 2.8 m by 0.15 m, slot `post_out`) and `bld_post_in_01` (the same size, slot `post_in`, with the connector frames the kit generates for an inside post). Every plain wall piece is the wall base scaled `[w / 1.0, h / 2.8, 1]` and every post is its base scaled `[1, h / 2.8, 1]`, where w is the piece's width and h its course's height in metres. `scale` is left out when it is exactly `[1, 1, 1]`. |
| Scale precision | A factor is written at full double precision, for example `2.9 / 2.8`, never rounded. The validator allows 1 mm on a mating dimension and 0.1% on a size, so about 4 decimals would do (the worst error is then 0.14 mm on 2.8 m) and 3 decimals would not (1.4 mm). Full precision costs nothing and keeps a ring of pieces closing to far less than a tenth of a millimetre. |
| Declared ranges | The base atoms must declare in `asset.json`, for the wall base, `"variation": { "scale": { "x": [0.05, 1.5], "y": [0.01, 2.2] } }` and, for each post, `"variation": { "scale": { "y": [0.01, 2.2] } }`. The validator fails a scaled entry outside what the atom declares. The tasks the kit writes carry this as a top-level `variation` field and as a reference-pack entry titled "Variation". A piece that would fall outside a range is a problem naming the piece. The survey check already holds a storey to 2 to 6 m (at most 2.14 times 2.8 m), so a drafted building stays inside; the range check is a second line. |
| Names | An opening bay or a door leaf is named from its sizes in whole millimetres, zero-padded to four digits, and is never scaled: `bld_window_w1000_h2800_o0700x1100_s0900_01` (with `_b` before `_01` for a balcony), `bld_door_w1000_h2800_o0800x2000_s0000_01`, `bld_door_leaf_w0800_h2000_01`. A bay of kind `other` uses `bld_other_<first 6 hex of the SHA-256 of its description>_w...`. The slot name is the id without `bld_` and `_01`; the three base atoms' slots are `wall`, `post_out` and `post_in`. Ids are at most 64 characters. |
| Older names | Three atoms exist under older names (`bld_window_bay_01`, `bld_door_bay_01`, `bld_door_leaf_01`). When the library holds one of them with a version, the slot with the matching sizes is pinned to it. |
| Slot state | `reuse` when the library holds the atom, `has_task` when only a task exists, `needs_task` otherwise. |
| Text from the plan | The description of an `other` bay is the only free text that is used. It is hashed into the id and quoted in that atom's task with a note that it is data, not an instruction. Everything else in a task is a number or a word from a fixed table. |

## Things to know

- The squared outline's vertex 0 is not where the first module starts. The post at vertex 0 occupies the 0.15 m before the first module of edge 0, so the assembled walls measure from x = -0.15 m when the origin is the first module.
- A door leaf's handles stand 3 cm proud of the outer face (the leaf hangs 5 cm behind it and the handles reach 6 cm out). The placed atoms of a building with a door measure 0.03 m deeper than the object task's `dimensions_m`. That is inside the validator's 2 percent tolerance for the task, but `asset.json` must record the measured size. The object task says so when the building has a door.
- A slot's task belongs to the first building that needed it (`object_id` in the task). When two buildings are drafted from the same `main` and both need a new piece of the same size, both write that task file and the second pull request conflicts. Drafting again on the new `main` resolves it: the piece then shows as `has_task`.

## Not built

- Corners that are not square. Anything outside 90 or 270 degrees, within 2 degrees, is unsupported, and so is an outline that moves more than 0.10 m when made square.
- Roofs. The drafts are walls only.
- Pieces with openings that stretch. Plain wall and corner posts are scaled copies of three base atoms, but a bay with an opening, and a door leaf, is still one atom per distinct size, and a window of one size appears once for each storey height it is used at. A span, which asset spec v0.6 proposes and nobody has built, would stretch the wall around an opening and keep the opening rigid; that is what would merge those atoms.
- Interior walls and floors.
- Placing the object in the region. The assembly's own axes put edge 0 along +x; turning and positioning it on the block's map is a separate step.
- Kinds other than `door` that need a moving part (a sliding door or a garage door has no leaf).
