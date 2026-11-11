# Validator notes

Decisions made while building the validator, and the places where the specs were silent or unclear. The gaps are for the specs' maintainer; the validator does not edit the specs.

## Spec gaps

Each item says what the spec leaves open and what the validator does until it is settled.

### Metadata and files

1. **`asset.json` field shapes.** The spec lists field names and prose only. The validator reads: `dimensions_m` as `[width, height, depth]` (x, y, z) in metres; `tier` as 1, 2 or 3; `materials` as `{ "library": [ids], "custom": [names] }`; `sources` as an array; `provenance` as an object with `author`, `created`, `tools` (array) and `dimension_source` (`measured`, `estimated` or `designed`). `class` is matched to the profile's class names after lowercasing and replacing punctuation with underscores ("Small prop" becomes `small_prop`).
2. **Connector entries in `asset.json`.** Spec: "name, type and side, and for a moving connector its limits and rest position". The validator reads `{ "name", "type", "side", "limits", "rest", "mating" }`. `limits` is `[min, max]` (degrees for hinge and spin, metres for slide); for a `ball` connector any value is accepted, because the spec gives no shape. `rest` is a number inside the limits. `mating` is `{ dimension_name: metres }` and is read only by the Blueprint check.
3. **Which connectors need limits.** The spec says a "moving connector" states limits. The validator takes that to mean any connector whose registered type has a `motion` other than `fixed`.
4. **How a library material is referenced inside a GLB.** The spec says "referenced by ID" and gives no mechanism. The validator treats a glTF material whose `name` starts with `mat_` as a reference to the library material of that ID, and every other material as custom.
5. **Open material slots in a GLB.** The spec does not say how an open slot appears in the file. The validator treats a glTF material named like a declared `open_slots[].slot` as a placeholder that needs no textures.
6. **`thin` flag.** Profile 1 exempts thin objects from the watertight rule "if metadata says so". The field name is not given. The validator uses `"thin": true`.
7. **Asset size (S, M, L) for the material limit.** The profile limits materials by S or M/L, and the asset spec has no `size` field. The validator reads `size` from the task file, then from `asset.json`, and defaults to S.
8. **Required optional folders.** The spec's folder layout lists `preview/`, `source/` and `refs/` without saying which are required. The validator requires none of them and reports a note when `preview/` or `source/` is absent.
9. **Licence notes for `refs/`.** The spec says each reference needs a licence note and not where it lives. The validator expects `refs/<file>.licence.txt` (or `.license.txt`) beside each reference file, non-empty. A placeholder licence value (`TBD`, `TODO`, `unknown`, `none`) counts as unfilled.
10. **Where `considered` lives.** The Reuse check needs the list of library atoms a new atom considered. The spec says "its metadata lists" them without a field name. The validator reads `asset.json` `considered: [{ "asset": "<id>@<version>", "reason": "..." }]`. An empty array is valid; a missing field fails.
11. **Recorded versus measured dimensions.** The spec says dimensions are "recomputed" and does not give a tolerance. The validator allows 1 mm (`dimension_record_tolerance_m`).
12. **100 MB.** Read as 100,000,000 bytes.
13. **Task file shape.** The spec defers it. The validator reads `{ task_id, asset_id, size, dimensions_m: [w, h, d], required_connectors: [{ type, side, count }] }`. Only `dimensions_m`, `required_connectors` and `size` are used. See `tasks/task.example.json`.
14. **Ground contact.** The scale table says assets that stand on the ground rest on Y = 0. Which assets stand is not in the metadata, so the validator does not check it.

### Assemblies

15. **A single-joint chain mates by construction.** The spec says to check that joined connectors coincide, face each other and agree on up. An assembly has no coordinates, so the validator places each atom by snapping it to its neighbour through the joint, and then every tree joint matches exactly. Only a joint that closes a loop (two atoms tied by more than one joint, or a ring) measures anything. A connector 5 mm off on an atom joined once is not detectable from the files. The validator still checks type, opposite sides, symmetry and turn for every joint, and reports how many joints were measured. The fix is probably for the spec to say so, or for atoms to record connector positions in a way a manifest can be compared with.
16. **Which connector's Z a `turn_deg` turns about.** The spec says "a rotation about the connector's Z". The validator uses the Z of the connector named in the joint's `a` field, and requires `turn_deg` to be a multiple of 360 / n for a symmetry of n, and 0 for `none`.
17. **Joint ends and sides.** The spec's example puts side `a` first. The validator accepts either order and requires one side `a` and one side `b`.
18. **`exposes` shape.** The spec says "each a name for one connector of one atom inside it". The validator reads an object `{ "name": "<atom ref>:<connector name>" }`.
19. **Origin offset sign.** `origin.offset_m` is read as where the assembly's origin sits relative to the root atom, so the root atom is placed at minus that offset. Nothing else depends on it.
20. **Library lookup and "merged version".** An atom is "merged" if `<library>/<category>/<asset_id>/` exists, its `asset.json` `version` equals the pinned version, and it has `asset.glb` or `assembly.json`. Only one version of an asset can be held in a folder, so older pinned versions cannot be resolved. The service's `status` field is not read.
21. **Mirroring a nested assembly.** The spec says mirroring mirrors every atom inside. The validator requires `mirror_safe: true` on the nested assembly's own `asset.json` and does not look at its atoms.
22. **`states`** are not defined enough to check (the spec lists it as an open question). The validator notes their presence and skips them.

### Variation

23. **Motion overrides.** The spec's Variation check says every motion a manifest chooses is "within what was declared", but a joint's `motion` may widen limits or add movement beyond the atom. The validator therefore checks only that a `motion` object is well formed: keys `locked`, `limits_deg`, `limits_m`, `also` (each entry has one of `turn` or `slide` naming `x`, `y` or `z`, and `limits_deg` or `limits_m` as `[min, max]`). The key names `limits_deg` and `limits_m` at the top level of `motion` are the validator's; the spec shows only `locked` and `also`.
24. **Scale range.** The validator does not require the range to contain 1, though the file is authored at scale 1.
25. **"Passes the other checks at both of its ends."** The spec says every declared range is checked at both ends. The validator does not build the scaled or stretched asset, so it does not do this. Spans are proposed and unbuilt, so the validator checks only their shape and that no connector sits inside a stretch span.

### Blueprints

26. **Slot `connectors` and `dimensions_m` shapes.** Read as `[{ "type", "side" }]` and `{ name: metres }`. A name of `width`, `height` or `depth` is compared with the atom's `dimensions_m` within the scale tolerance. Any other name is a mating dimension, compared with the `mating` value of an atom connector of a required type within the mating tolerance.
27. **"Description matches"** is not scripted (already an open question in the spec).

### Not specified at all

28. **Clips.** No file format, name or location is given for a clip asset, so the Clip check is skipped always.
29. **Smallest modelled feature, UV overlap, hidden faces, pixels per metre.** Profile 1 lists them as rules. They need information the files do not hold in a form a script can read (feature size needs a definition of a "feature"; pixels per metre needs a texel density measure per surface). They are not checked.
30. **Texture colour space.** A PNG carries no colour space marker that glTF uses. The validator checks that each custom material has the required maps (base colour, normal, and one occlusion-roughness-metallic texture used as both `occlusionTexture` and `metallicRoughnessTexture`), and relies on glTF slot semantics for the rest.
31. **Collision shape convexity** is not in the spec's check text ("Convex shapes are present"). The validator tests it: every vertex must lie on one side of each face's plane, within 1 micrometre.
32. **Normals point outward** is a Profile 1 rule. The validator tests it from the winding of each closed shell, not from stored normals.

## Other decisions

- Profile numbers that the specs give live in `profile-1.json`, each with a `_source_` field. Triangle budgets are read from `spec/spec.json` unless a profile file supplies `budgets`.
- The mesh checks (dimensions, triangles, health) ignore `col_` nodes, which are invisible collision shapes.
- Mesh health welds vertices within 1 micrometre before matching faces and edges, so a box stored with 24 vertices (split for normals) is still watertight.
- `node --test validator/test/` works on Node 20 (it scans the folder) and on Node 21 and later (they load `test/index.js`, which imports the three test files). `npm test` in `validator/` does the same.
