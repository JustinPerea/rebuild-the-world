# Asset validator

Checks one asset folder against the "Automated checks" table in `docs/asset-spec.md` and the numbers in Profile 1 (`docs/capability-profiles.md`). It needs Node 20 or later. It runs the same way on macOS, Linux and Windows.

## Setup

```sh
cd validator
npm install        # installs gltf-validator 2.0.0-dev.3.10, the only dependency
```

Without `npm install` the validator still runs. File validity is then reported as SKIP.

## Run

```sh
node validator/cli.mjs <asset-folder> [--json] [--registry <path>] [--library <dir>] [--task <task.json>] [--profile <path>]
```

| Option | Meaning |
| --- | --- |
| `--json` | Print the report as JSON: `{ asset, kind, spec_version, profile, checks: [{ name, status, source, messages }], summary }`. |
| `--registry` | Connector registry. Default `registry/connectors.json`. |
| `--library` | Where an assembly's atoms, a blueprint's atoms and library materials are looked up, laid out as `<dir>/<category>/<asset_id>/`. Default `assets/`. |
| `--task` | Task file with the dimensions and required connectors. Without it, Scale is skipped and required connectors are not checked. See `tasks/task.example.json`. |
| `--profile` | A profile file in place of `validator/profile-1.json`. It may carry its own `budgets` object. |

Exit code 0 means no check failed. 1 means at least one failed. 2 means a usage error, such as a missing folder.

The asset kind comes from the folder: `asset.glb` is an atom, `assembly.json` an assembly, `blueprint.json` an object. A folder with both `assembly.json` and `blueprint.json` is an assembly whose blueprint is checked as well.

Every report lists all 18 checks in the order of the spec's table.

## Statuses

| Status | Meaning |
| --- | --- |
| PASS | The check ran and found nothing wrong. Notes may follow. |
| FAIL | The check found a problem. Each message names the node, field or file, the measured value and the allowed value. |
| SKIP | The check does not apply to this kind of asset, needs input that was not given (a task file), or is not implemented. The reason is printed. A SKIP is never a pass. |

## Checks

| Check | Status of the implementation |
| --- | --- |
| File validity | Implemented, for atoms. Uses the Khronos `gltf-validator`; errors fail, warnings are counted. SKIP when the package is not installed. |
| Folder and naming | Implemented. |
| Metadata | Implemented. Required fields per kind; `dimensions_m`, `triangles`, connectors and materials recomputed from the GLB; an assembly's `triangles` against the sum of its atoms. |
| Scale | Implemented. An atom is compared with the `dimensions_m` of `--task`. An assembly is measured from its atoms as the joints place them, each scaled per axis as its entry says (nested assemblies included), and that size is compared with its own `asset.json` and with `--task`. An assembly that fails the Assembly check is not measured. |
| Transforms | Implemented. |
| Triangle budget | Implemented for atoms and assemblies. Objects are skipped. |
| Mesh health | Implemented: triangle lists, loose vertices, zero-area and duplicate faces, watertight, outward normals. `"thin": true` in `asset.json` exempts watertight and normals. "No faces hidden inside the mesh" is a warning-only rule in Profile 1 and is not checked. |
| Connectors | Implemented, for atoms: name pattern, registered type, +Y not parallel to +Z, limits and rest for moving types, and required connectors from `--task`. |
| Assembly | Implemented: pinned and merged atoms, origin, joints, types, sides, symmetry and `turn_deg`, the two sides' mating dimensions after scaling (a side that states no value for a dimension is not compared, and a note says so), mirroring, nesting through `exposes`, unjoined atoms, same library. Positions are measured only where a joint closes a loop (NOTES.md, gap 15). `states` are not checked. |
| Variation | Partial. Declared scale (`[min, max]`, or a range per axis, with every connector axis-parallel when the axes can differ), open slots and spans are checked for shape; chosen scales (one number or three, held to the declared form and range, and through a joint to the type's `mating_axes`), materials and joint motions are checked against what the atom declares (motion only for shape). Not done: re-running the other checks at both ends of a range. Spans are proposed and unbuilt, so only their shape is checked. |
| Blueprint | Implemented, except that "its description matches" is not scripted. Where `blueprint.json` sits beside `assembly.json`, every slot must be pinned and the manifest must place each slot's atom exactly `count` times and no other atom. Which entry fills which slot is not recorded, so two slots that name the same atom are counted together. |
| Reuse | Partial. Requires the `considered` list, resolves each entry, and fails when a considered atom has all this atom's connectors and the same size within 2%. Description matching is not scripted. |
| Clip | Not implemented. Always SKIP: the spec gives no clip file format. |
| Collision | Implemented, for atoms: `col_<index>` nodes, count 1 to 8, each convex. |
| Textures | Implemented, for atoms: PNG, power-of-two sides, 128 to 4,096 pixels, and the required maps on custom materials. Pixels per metre and colour space are not measured. |
| Materials | Implemented, for atoms: count by size, library IDs exist under `<library>/mat/`. |
| File size | Implemented. |
| Licence | Implemented. |

Where the specs were silent, the validator chose a reading and wrote it down in `NOTES.md`, under "Spec gaps".

## Tests

```sh
node --test validator/test/
```

Fixtures are generated into a temporary folder at test time and deleted afterwards. No binary fixtures are committed.
