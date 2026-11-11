# Rebuild the World: Asset Spec (Draft v0.5)

Nov 11, 2026

Every asset is a glTF 2.0 file in metres with named connector points, so atoms made by different people, years apart, snap together without manual fixing. This spec is the durable contract: it is meant to stay fixed while tools improve.

## Scope

This spec fixes what must stay true of every asset: coordinates, connectors, assemblies, material layout, files and metadata. Three other documents cover the rest.

| Question | Document |
| --- | --- |
| How much detail is asked today (budgets, mesh rules, texture sizes)? | `capability-profiles.md` |
| What should an asset look like? | `art-style-guide.md` |
| Which real-world things may it copy, and from which sources? | `accuracy-and-data.md` |

Three rules shape every choice below:

- **Engine-neutral.** The library is stored in open formats and imported into a game engine by a pipeline, so it survives an engine change.
- **Machine-checkable.** Every requirement can be tested by a script, so contributors get the same answer the reviewer does.
- **Regenerable.** Each asset keeps the inputs used to make it, so better tools can rebuild it later at higher quality.

Changed in v0.2: numeric limits moved to the capability profile, connectors gained an up direction and a symmetry setting, assemblies became manifests, objects gained blueprints, "part" was renamed "atom", and the metadata gained fields for unique assets, stand-ins and behaviours.

Changed in v0.3, after the first object was rebuilt as atoms under this contract (a robot of 21 atoms in the Frontier Colony library): the contract now serves more than one library; connectors gained ball and slide motion, a motion axis and limits; assemblies gained an origin, mirrored atoms, recorded orientations and named states; and the spec gained sections on moving assemblies, animation clips, and effect and light markers.

Changed in v0.4 (owner, 2026-11-11): an atom may vary where it does not meet another atom. A placed atom or assembly may be scaled, an atom may stretch or repeat along a marked span, a joint may state its own motion, a material slot may be left open, and an assembly may expose named connectors so that it is placed as one piece. See "Variation".

Changed in v0.5, from building the validator and the first two atoms: the registry states where each side of a connector sits, a task may fix each connector's frame, the shapes of `asset.json` and the task file are written down, and the spec says what an assembly check can and cannot measure. See "File shapes".

## Libraries

A library is a set of assets that share one look, one policy on copying the real world and one capability profile. This contract is shared by every library, so the same connectors, manifests and checks work in all of them (owner, 2026-11-10).

| Shared by every library | Set by each library |
| --- | --- |
| Units, axes, pivots and named nodes | Its look: a style guide |
| Connector rules and the registry format | What it may copy from the real world: an accuracy policy |
| Blueprints and assembly manifests | Budgets and mesh rules: a capability profile |
| Folder layout, metadata and provenance | |

- **Earth, Again** is the first library: real places in grounded realism, governed by `art-style-guide.md`, `accuracy-and-data.md` and Profile 1.
- **Frontier Colony** is the second: an invented world with a cel look and its own material limit. Its robot was the first object rebuilt as atoms.
- An asset records its library in its metadata. An assembly uses atoms from its own library only, until sharing between libraries is decided.

## How assets build up

The library has five levels, and each is built only from the one below. They are levels 5 to 9 of the world model.

| Level | What it is | Built from the level below by |
| --- | --- | --- |
| City block | Assemblies and props placed on real street layouts from open map data | Placement by procedural rules |
| Assembly (L task) | A complete car, room or building, made only from merged atoms and kits | Snapping together at connectors |
| Kit (M task) | A matching set, such as facade modules or a wheel and axle set | Design as a matching set |
| Atom (S task) | The smallest piece that is reused or moves on its own: a door, a wheel, a bearing, a window | Reference to shared materials by ID |
| Shared material | Brick, concrete, glass, painted metal, used by every atom | |

City blocks are never modelled by hand: rules place assemblies on real street layouts.

## Coordinates, units and scale

All files follow glTF 2.0 conventions at true real-world size. A contributor's tool may work differently inside, but the exported file must match this table.

| Property | Requirement |
| --- | --- |
| Unit | 1 unit = 1 metre |
| Up axis | +Y |
| Front of the asset | Faces +Z |
| Handedness | Right-handed |
| Root transform | Position 0, rotation 0, scale 1, with transforms applied before export |
| Size | Matches the task's reference pack, within the profile's scale tolerance. An atom that varies is measured at scale 1, with its spans at rest |
| Ground contact | Assets that stand on the ground rest on Y = 0 |

A file is authored at one size, with scale 1. A manifest or a placement rule may scale it when it is placed (see "Variation"), and an animation clip may scale a joint while it plays (see "Animation clips").

The engine import pipeline converts to the engine's own units and axes. A unique asset also records where it sits on Earth (see "Files, naming and metadata").

## Pivots

The pivot is the asset's origin.

| Asset class | Origin sits at |
| --- | --- |
| Ground-standing props, trees, vehicles, furniture | Centre of the footprint, at ground level |
| Facade and wall modules | Bottom-left corner of the outer face, seen from outside |
| Hinged atoms such as doors and lids | On the hinge axis |
| Rotating atoms such as wheels and fans | On the rotation axis, at the atom's centre |
| Unique structures and terrain features | At the real-world anchor point, at ground level |

## Connectors

Connectors are named attachment points, and two atoms fit when their connectors share a type, face each other and agree on which way is up. They are what makes the library modular.

- A connector is an empty node named `conn_<type>_<side>_<index>`, for example `conn_wheel_hub_a_01`.
- Its position is the attachment point.
- Its +Z axis points out of the atom, towards the mating atom.
- Its +Y axis is the connector's up direction. It fixes how the mating atom is turned about the Z axis.
- Each type has two sides, `a` and `b`, such as the axle side and the wheel side. An `a` connector mates only with a `b` connector of the same type.

Two connectors are mated when all three hold, within the profile's connector tolerance:

1. Their positions coincide.
2. Their +Z axes point in opposite directions.
3. Their +Y axes point the same way, unless the type's symmetry allows otherwise.

Each type is defined once in the connector registry:

| Registry field | Content |
| --- | --- |
| `type` | The name used in connector node names |
| `sides` | What `a` and `b` each attach to |
| `mating_dimensions` | The sizes both sides must share, such as hub diameter or opening width and height |
| `symmetry` | `none` (one valid rotation), a count such as `4` (four valid rotations), or `free` (any rotation, as on a wheel hub) |
| `motion` | `fixed`, `hinge`, `spin`, `ball` or `slide`: how the mated atom may move about the connector |
| `axis` | For a moving type, the connector axis the motion uses: `x`, `y` or `z`. A hinge or a spin turns about it, and a slide moves along it |
| `frame` | For each side, where the connector sits on its atom and which way its +Z and +Y point, in words |

- A `ball` connector turns about its position on all three axes and names no axis.
- A moving connector records its limits (the smallest and largest angle or travel) and its rest position in the atom's metadata. Without limits an engine cannot tell an elbow from a door.
- The type's motion and the atom's limits are defaults. A joint in a manifest may state its own (see "Variation").

A new type is added to the registry by pull request and approved by a maintainer before any asset uses it.

A type and a side do not say where on an atom a connector goes, and two builders will choose differently. So the registry's `frame` says it in words, and a task states it in numbers as `connector_frames`: each connector's position and the directions of its +Z and +Y, in the atom's own axes. The validator checks the file against them, within the connector tolerance.

Building grid: facade modules are sized in multiples of 0.5 m horizontally. Storey height is set per building kit and recorded in its metadata.

## Assemblies

An assembly is a manifest, not a mesh: a list of merged atoms and the connector pairs that join them. The pipeline places the atoms and builds the combined model.

```json
{
  "asset_id": "veh_sedan_01",
  "origin": { "ref": "body", "offset_m": [0, 0.31, 0] },
  "atoms": [
    { "ref": "body", "asset": "veh_sedan_body_01@1.0.0" },
    { "ref": "door_fl", "asset": "veh_sedan_door_01@1.0.0" },
    { "ref": "door_fr", "asset": "veh_sedan_door_01@1.0.0", "mirror": true },
    { "ref": "wheel_fl", "asset": "veh_wheel_17in_01@1.2.0" }
  ],
  "joints": [
    { "a": "body:conn_door_hinge_a_01", "b": "door_fl:conn_door_hinge_b_01" },
    { "a": "body:conn_door_hinge_a_02", "b": "door_fr:conn_door_hinge_b_01" },
    { "a": "body:conn_wheel_hub_a_01", "b": "wheel_fl:conn_wheel_hub_b_01", "turn_deg": 0 }
  ]
}
```

- Every atom is pinned to an exact version of a merged asset.
- Every atom is joined to the rest by at least one joint. No atom is placed by hand-typed coordinates.
- A manifest states every joint that is physically there, including the one that closes a ring. A joint that only places an atom cannot be measured, because the atom is put where the joint says. Positions are measured only where joints close a loop.
- The manifest names an `origin`: the root atom, and where the assembly's own origin sits relative to it. Joints fix the atoms relative to each other, and the origin fixes the whole.
- `"mirror": true` reflects an atom in its own X before it is placed, so one door or one arm serves both sides. It is allowed only when the atom's metadata marks it `mirror_safe`, and an atom that carries text or a handed detail is not.
- Where a connector type's symmetry allows more than one orientation, the joint records the one chosen as `turn_deg`, a rotation about the connector's Z. A manifest must rebuild the same way every time. A generator that picks each atom's orientation alone can seat it turned away from its own children.
- An assembly's triangle count is the sum of its atoms and must fit the profile's budget for its class.
- An assembly may itself be used inside a larger assembly, such as a furnished room inside a building or an arm on a robot. It lists the connectors it `exposes`, each a name for one connector of one atom inside it, and a joint in the larger manifest reaches it only through those names, as `arm_r:shoulder`.
- Mirroring a placed assembly mirrors every atom in it. An atom inside is addressed as `<entry ref>/<ref inside>`, for example `arm_l/forearm`, and clip tracks use those names. Frontier Colony saves an arm, a leg, a tire-rotor and a mast this way.
- Replacing an atom with a newer version is a new version of the assembly, checked again by the validator.
- An assembly may list named `states`, each replacing some of the joints, for an object that reconfigures, such as a folding roof. A state may use a connector that no other state uses, and a connector on a scaled atom moves with the scale. One state change has been checked this way, over one clip, to 0.0005 mm.

## Variation

An atom is fixed where it meets another atom and may vary anywhere else, within a range it declares (owner, 2026-11-11). Asset IDs, connectors and mating dimensions never vary. Size, motion, look and behaviour settings may.

| What varies | Declared by | Chosen by | Example |
| --- | --- | --- | --- |
| Scale | The atom or assembly, as a range | A manifest entry or a placement rule | One tree placed at 0.8 to 1.3 times its size |
| Span | The atom, as a marked span that stretches or repeats | A manifest entry or a placement rule | A beam from 2 m to 7 m, a stair of 3 to 20 steps |
| Motion | The connector type and the atom's limits, as defaults | The joint in a manifest | A hinged ankle that also rolls 12 degrees |
| Look | The atom, as an open material slot | A manifest entry or a placement rule | One sedan in twelve paint colours |
| Behaviour settings | The behaviour registry | The object's metadata | A door that closes itself |

An atom lists the kinds it allows under `variation` in its metadata. A tree that may be scaled and may change its leaves:

```json
"variation": {
  "scale": [0.8, 1.3],
  "open_slots": [
    { "slot": "leaves", "materials": ["mat_leaf_broad_01", "mat_leaf_broad_autumn_01"] }
  ]
}
```

A manifest entry or a placement rule picks values inside those ranges:

```json
{ "ref": "tree_04", "asset": "veg_plane_tree_01@1.0.0", "scale": 1.15,
  "materials": { "leaves": "mat_leaf_broad_autumn_01" } }
```

Every choice is written into the manifest or the placement record, so the same input rebuilds the same world.

### Scale

- Scale is one number, applied equally on all three axes. A change along one axis is a span.
- Scale applies to a whole placed thing: an atom with no mating dimensions, or an assembly at its origin. Every atom in a scaled assembly scales together, so the fits inside it hold.
- A scaled thing joins nothing through a connector that has mating dimensions.
- Connectors and mating dimensions are always measured at scale 1.

### Spans

Spans are proposed, and no library has built one.

A span is the part of an atom between two planes across one axis. The pipeline changes the span and leaves the rest of the atom rigid, so the ends keep their shape and their connectors move with them.

```json
"variation": {
  "spans": [
    { "name": "length", "mode": "stretch", "axis": "z", "between_m": [0.4, 2.6], "range_m": [2, 7] },
    { "name": "steps", "mode": "repeat", "axis": "z", "between_m": [0.3, 0.58], "count": [3, 20] }
  ]
}
```

- `stretch` lengthens the span, and `range_m` gives the smallest and largest overall size along the axis.
- `repeat` copies the span a whole number of times, as for stair steps, fence panels or a row of windows.
- The pipeline does the work. There is no script in an atom, because assets never contain code (world model, "Things that work").
- A stretched span uses a tiling library material, so its texture repeats and does not smear.
- No connector sits inside a stretch span. A connector inside a repeat span is copied with each repeat.
- A shape that stretching and repeating cannot make is published as a family of sizes: separate atoms, each recording `derived_from`.

### Motion on a joint

- The connector type decides whether two atoms fit, and gives a default motion. The atom's connector gives default limits and a rest position.
- A joint in a manifest may state its own `motion` for that one object. It may narrow or widen the limits, lock the joint, or add a movement the type does not have, with its axis and limits.
- An override never changes fit, and it applies to that manifest only. The atom is unchanged for every other object that uses it.
- A clip is checked against the joint's motion where the manifest states one, and against the connector's otherwise.

```json
{ "a": "shin_l:conn_pin_a_01", "b": "foot_l:conn_pin_b_01",
  "motion": { "also": [ { "turn": "z", "limits_deg": [-12, 12] } ] } },
{ "a": "pelvis:conn_wheel_hub_a_01", "b": "tire:conn_wheel_hub_b_01",
  "motion": { "also": [ { "slide": "z", "limits_m": [0, 0.07] } ] } },
{ "a": "body:conn_door_hinge_a_03", "b": "hatch:conn_door_hinge_b_01",
  "motion": { "locked": true } }
```

The first two show how the first robot's ankle roll of 12 degrees and its tire slide of 70 mm would be written, with example axes. Frontier Colony changed those connectors' types to ball joints and a `spin_slide` hub. Under this rule the atoms keep a hinge and a hub, and the manifest grants the extra movement.

### Look

- An atom may leave a material slot open and list the library materials that may fill it. A manifest entry or a placement rule picks one.
- An open slot may also allow a tint: a colour multiplied into the base colour, stored as the glTF material's base colour factor.
- The mesh and its UVs are the same for every choice.

### Behaviour settings

- An object's `behaviours` entry may carry settings, such as how fast a door opens or whether it closes itself. The behaviour registry lists the settings each behaviour takes.
- Two objects built from the same atoms may behave differently.

### What does not vary

- Asset IDs, units and axes, connector names and sides, and mating dimensions at scale 1.
- A merged file. An atom reshaped beyond its declared variation is a new asset that records `derived_from`.

## Moving assemblies

An assembly whose joints move needs no separate skeleton file. The pipeline derives the skeleton from the manifest: one bone for each moving joint, named by the atom's `ref`.

- Every atom is rigid: all of it follows one joint. Skin that bends, such as a creature's body, cloth or a hose, waits for a later capability profile.
- A joint may state a `scale_range`, the range a clip may scale it within. Connectors and mating dimensions are always measured at scale 1.
- The first object rebuilt this way had 40 atom instances and 39 joints. Reassembled from its files alone, it matched the original mesh triangle for triangle, within 0.04 mm.

## Animation clips

A clip is its own asset, bound to one blueprint version and never stored inside an atom, so it survives an atom being regenerated. The Frontier Colony library has built six clips against this section. Posed from the files, the atoms sit within 0.0011 mm of the original in every key.

| Clip field | Content |
| --- | --- |
| `object` | The blueprint version the clip is bound to |
| `name` | A registered clip name, such as `idle`, `walk` or `run` |
| `loop` | Whether the clip loops or plays once |
| `ground_speed_m_s`, `cycle_distance_m` | How far the object travels, so an engine can play the clip without the feet sliding |

- A clip targets joints by `ref`. Each track is written in the frame of the joint's `a` connector, relative to the mated position.
- A clip moves each joint only in the way its motion allows, within its limits: the joint's own motion where the manifest states one, and the connector's otherwise. Seven of the first robot's 39 joints broke this rule as first authored. A manifest can now grant those movements joint by joint (see "Variation"). Frontier Colony changed the connectors' types to follow its clips.
- A clip may scale a joint within that joint's `scale_range` (owner, 2026-11-10). A scale track states the axes it scales along as `scale_axes`, because they need not be the connector's axes. Without them, two clips of the first robot were 98 mm wrong.
- Clip names are registered once, in the same way connector types are.

## Effects and lights

An asset marks where an effect or a light goes, and the engine supplies it. Assets carry no particle systems, animated materials or light sources.

| Node | Marks |
| --- | --- |
| `fx_<type>_<index>` | Where an engine effect attaches, such as a flame, a spray or a blur disc |
| `light_<index>` | A light, with its colour and range in metadata, switched by the `switchable` behaviour |

## Blueprints

A blueprint lists the atoms an object is built from, and it is written before any of them is built. It is how a contributor and the library agree on what "a skateboard" needs.

```json
{
  "object_id": "obj_skateboard_01",
  "description": "A standard street skateboard, 0.81 m long",
  "slots": [
    { "slot": "deck", "count": 1, "atom": "new" },
    { "slot": "grip_tape", "count": 1, "atom": "new" },
    { "slot": "truck", "count": 2, "atom": "new" },
    { "slot": "wheel", "count": 4, "atom": "new" },
    { "slot": "bearing", "count": 8, "atom": "new" }
  ]
}
```

| Slot field | Content |
| --- | --- |
| `slot` | The slot's name within this object |
| `count` | How many of this atom the object uses |
| `connectors` | The connector types and sides the atom must carry |
| `dimensions_m` | The sizes that decide whether an atom fits, such as wheel diameter |
| `description` | What the atom is, in plain words |
| `atom` | The library asset that fills the slot (an atom, a kit or an assembly), pinned to a version, or `new` if none fits |

An existing atom fits a slot when all four hold:

1. It carries every connector the slot requires, with the same type and side.
2. Its mating dimensions match the slot's, within the profile's mating tolerance.
3. Its size is within the profile's scale tolerance of the slot's dimensions.
4. Its description matches what the slot asks for.

- A slot marked `new` becomes an atom task. Its metadata lists the library atoms that were considered and why none fits.
- When every slot is filled by a merged atom, the blueprint is complete and the assembly manifest can be written from it.
- A blueprint is versioned like an asset. A higher tier may split one slot into several under a new version.

## Materials and textures

Assets use the standard glTF metallic-roughness material and reference a shared library material wherever one fits. Shared materials keep brick, concrete and glass looking the same across thousands of contributors.

- **Library first.** Common surfaces come from the shared material library and are referenced by ID. An asset makes its own textures only for surfaces the library lacks.
- **Proposing a material.** A new library material is its own task, reviewed like an asset.
- **Open slots.** An atom may leave a material slot open for a manifest or a placement rule to fill (see "Variation").
- No lighting, shadows or ambient occlusion painted into base colour.
- A font used on a sign or decal is a source like any other: it needs a licence note in `refs/`.

| Map | Channels | Colour space | Required for custom materials |
| --- | --- | --- | --- |
| Base colour | RGB, optional alpha | sRGB | Yes |
| Normal | Tangent space, +Y up | Linear | Yes |
| Occlusion, roughness, metallic | R, G and B of one texture | Linear | Yes |
| Emissive | RGB | sRGB | Only for surfaces that emit light, such as lamps, screens and lit signs |

Resolution, maximum size and the number of materials per asset are set by the capability profile.

## Collision

Each atom includes simple convex shapes named `col_<index>`. They are invisible in the game and used for physics. The profile sets how many are allowed.

## Files, naming and metadata

One asset is one folder, holding the model, a metadata file, its previews, and everything needed to rebuild it. Binary files are stored with Git LFS or an equivalent, never as plain Git files.

```text
veh_sedan_door_fl_01/
  asset.glb        the model, glTF 2.0 binary (atoms and materials)
  assembly.json    the manifest (assemblies only, in place of asset.glb)
  blueprint.json   the list of atom slots (objects only)
  asset.json       metadata
  preview/         renders from the standard scene
  source/          generation script, parameters, prompts
  refs/            reference images, with a licence note for each
```

Names are lowercase ASCII with underscores, as `<category>_<name>_<variant>`. Categories are `veh`, `bld`, `prop`, `veg`, `gnd`, `mat`, `ter`, `int`, `obj` and `chr` (world model, "Categories").

| Metadata field | Content |
| --- | --- |
| `asset_id`, `version`, `task_id` | The folder name, the asset's version and the task it fulfils |
| `spec_version`, `profile`, `style_version` | The contract, capability profile and style guide it was built against |
| `library` | The library the asset belongs to |
| `kind` | `library` or `unique` |
| `class`, `tier` | Asset class for budgets, and fidelity tier from the style guide |
| `dimensions_m` | Bounding box width, height and depth in metres, measured from vertices that belong to faces |
| `triangles` | Triangle count of LOD0 |
| `connectors` | Each connector's name, type and side, and for a moving connector its limits and rest position |
| `mirror_safe` | Whether an assembly may mirror the atom |
| `variation` | The scale range, spans and open material slots the asset allows, if any |
| `materials` | Library material IDs used, plus any custom materials |
| `behaviours` | Registered behaviours the asset supports, each with its settings, if any |
| `description` | What the object is, in plain words and structured tags |
| `licence` | The agreed licence |
| `sources` | Attribution for any map data or reference imagery used |
| `provenance` | Who and what made the asset, and when (see "Provenance") |

Unique assets add:

| Metadata field | Content |
| --- | --- |
| `anchor` | Latitude, longitude, height in metres and heading of the asset's origin |
| `place_id` | The place this asset models, with the open-data record IDs it corresponds to |
| `accuracy_level` | A2 or A3, from the world model |

Stand-ins for held subjects add `stands_in_for`: what real thing the asset replaces until it is cleared (accuracy and data policy).

## File shapes

These are the shapes the validator reads. They were chosen while building it, where earlier versions of this spec gave only field names. `skill/contributor-skill.md` has a complete `asset.json`.

| Field or file | Shape |
| --- | --- |
| `dimensions_m` | `[width, height, depth]` along X, Y and Z, in metres |
| `connectors` | One entry per connector node: `{ "name", "type", "side", "mating" }`, plus `"limits": [min, max]` and `"rest"` for a moving type, in degrees or metres. `mating` is `{ dimension: metres }` for the mating dimensions the type lists |
| `materials` | `{ "library": [ids], "custom": [names] }` |
| `size` | `S`, `M` or `L`, the task's size |
| `thin` | `true` for a sheet that cannot be a closed shell |
| `considered` | `[{ "asset": "<id>@<version>", "reason": "why it does not fit" }]`, or `[]` |
| `provenance.tools` | `[{ "name", "used_for" }]` |
| A library material in a model | A glTF material whose name is the library material's ID |
| A reference's licence note | `refs/<file>.licence.txt` beside the file |
| Blueprint slot | `connectors` as `[{ "type", "side" }]`, and `dimensions_m` as `{ name: metres }`, where `width`, `height` and `depth` are the atom's size and any other name is a mating dimension |
| `exposes` in an assembly | `{ "name": "<atom ref>:<connector name>" }` |

A task is one file, `tasks/<task_id>.json`:

| Task field | Content |
| --- | --- |
| `task_id`, `asset_id`, `title`, `description` | What to build |
| `object_id`, `slot` | The object and blueprint slot it fills, if any |
| `category`, `class`, `size`, `min_trust_level` | Where it is filed, its budget class, its size and who may claim it |
| `dimensions_m` | The bounding box the atom must match |
| `required_connectors` | `[{ "type", "side", "count" }]` |
| `connector_frames` | `[{ "name", "position_m", "z_axis", "y_axis" }]`, and `limits_deg` and `rest_deg` for a moving type |
| `mating_m` | `{ dimension: metres }` for every mating dimension the atom's connectors use |
| `reference_pack` | `[{ "what", "value_or_path", "source", "licence" }]` |
| `depends_on` | Tasks that must be merged first |

## Provenance

Every asset at every level, from a material to a structure, records who and what made it and when. Half is declared by the contributor and half is stamped by the service, because only the second half can be trusted.

Declared by the contributor:

| Field | Content |
| --- | --- |
| `author` | GitHub handle of the contributor who built it |
| `co_authors` | Anyone else who worked on it |
| `tools` | Each model and program used, with its version and what it was used for (geometry, textures, planning) |
| `created` | The date the asset was built |
| `as_of` | For unique assets, the date the real thing looked like this. Buildings change |
| `dimension_source` | Whether sizes were measured from data, estimated, or designed for an invented object |
| `derived_from` | Any asset this one was adapted or regenerated from |

Stamped by the service:

| Field | Content |
| --- | --- |
| `merged` | The date it entered the library |
| `reviewed_by` | The reviewers and the date of each verdict |
| `validator` | The validator version that passed it |
| `content_hash` | A fingerprint of the files, so later changes are detectable |
| `supersedes` | The previous version of this asset, if any |
| `status` | `current`, `superseded` or `withdrawn` |

- The `tools` field cannot be verified, so no rule and no review verdict depends on it. It is kept because it shows which tools produce good assets and tells a later tool what it is replacing.
- Where an asset is used (which objects contain this atom) is worked out by the service from blueprints, not stored in the asset.

The `source/` folder and the `description` field make an asset regenerable. A future tool can rebuild the object from them at a higher fidelity tier, keeping the same ID and connectors.

## Automated checks

The validator runs on every pull request and names each failing check. Contributors run the same script locally before submitting. Checks marked "profile" take their numbers from the current capability profile.

| Check | Passes when | Numbers from |
| --- | --- | --- |
| File validity | The official glTF validator reports no errors | Contract |
| Folder and naming | Required files exist and names match the pattern | Contract |
| Metadata | Every required field is present and matches the file's contents | Contract |
| Scale | The bounding box matches the task's dimensions | Profile |
| Transforms | The root node has no translation, rotation or scale | Contract |
| Triangle budget | LOD0 is within the class budget | Profile |
| Mesh health | No zero-area or duplicate faces, and solid meshes are watertight | Profile |
| Connectors | Every connector the task requires is present, with a registered type and a valid up direction, every moving connector states its limits, and every connector whose frame the task fixes sits in that frame | Contract |
| Assembly | Every atom is a merged version, an origin is named, every joint mates in its recorded orientation, no atom is unjoined, and every connector reached on a placed assembly is one it exposes | Contract |
| Variation | Every declared range passes the other checks at both of its ends, and every scale, span, motion and material a manifest chooses is within what was declared | Contract |
| Blueprint | Every slot names its connectors and dimensions, and is filled by a fitting atom or marked `new` | Contract |
| Reuse | A new atom lists the library atoms it considered, and none of them fits its slot | Contract |
| Clip | Every joint a clip moves exists in its blueprint version, and every motion stays within the joint's limits and scale range | Contract |
| Collision | Convex shapes are present, within the allowed count | Profile |
| Textures | Sizes, limits and colour spaces are correct | Profile |
| Materials | Library IDs exist, and the material count is within the limit | Profile |
| File size | The folder is under the size limit | Profile |
| Licence | The licence field and every reference's licence note are filled in | Contract |

These checks cannot judge appearance. The render check and model review in the claim system spec do that, against the art style guide.

## Versioning

The spec uses three-part version numbers, and every asset records the version it was built against.

- **Patch (0.1.x):** clarifications only. No asset changes.
- **Minor (0.x.0):** new optional features, classes or connector types. Existing assets stay valid.
- **Major (x.0.0):** a breaking change. It ships with a migration script, and the validator accepts both versions for 90 days.

Capability profiles are versioned separately, because they change far more often than the contract.

A merged asset is never edited in place. A fix or upgrade is published as a new version of the same asset ID, so anything built from it can be rebuilt predictably. An atom reshaped beyond its declared variation is a new asset with its own ID.

## Open questions

- [ ] glTF 2.0 or OpenUSD as the stored format? glTF is simpler to validate, and USD handles large assemblies better.
- [ ] Is 0.5 m the right building grid, or should it follow each region's real construction modules? A window bay with a stretch span could fit a real facade width that is off the grid.
- [ ] Which connector types go in the first registry? The first demo slice decides this.
- [ ] Is a connector's up direction enough, or do some types need a keyed shape so they cannot be mated upside down?
- [ ] Should provenance also record effort, such as time or model usage spent, so the project can see what an asset costs to make?
- [ ] How is "its description matches" tested by a script: shared tags, or a model's judgement?
- [ ] Should an assembly manifest allow an atom with no joint, placed by coordinates, for things like loose objects on a table? Frontier Colony places rocks and plants from a separate scene file that gives each a position, heading and scale. Scale at placement is now defined (see "Variation"), and placing an atom at a position with no joint is still undefined.
- [ ] How are behaviours specified? The world model names the first eight, and none is defined.
- [ ] Do unique structures such as landmarks need their own connector types, or are they single assets?
- [ ] Do libraries share one connector registry, and may an assembly use atoms from another library?
- [ ] Does a named state replace some joints, or list all of them? One state change has been built and checked.
- [ ] Does fit go by a size code? Since 2026-11-11 Frontier Colony gives every connector a size code such as `d128` with the dimensions behind it. Two connectors fit when type, side and every registered dimension agree within 0.5 mm, and no connector names the atom it was made for. Profile 1 here says 1 mm.
- [ ] How is a clip named and filed, and who registers clip names?
- [ ] May an effect be a mesh atom of its own, or only a marker the engine fills? One library built three effect atoms.
- [ ] Mirrored copies in the first build differed from a true mirror by up to 0.039 mm. What tolerance does a vertex-exact comparison use?
- [ ] Does an object's folder hold `blueprint.json` and `assembly.json` together, or is the assembly a second asset?
- [ ] What is a library material's own file layout? The first test uses `assets/mat/<id>/material.json` with flat values and no textures.
- [ ] A clip has no file format or location yet, so the Clip check cannot run.
- [ ] Several profile rules cannot be read from the files by a script: smallest feature, UV overlap, hidden faces, pixels per metre and ground contact. Do they move to review, or get a definition a script can test?
- [ ] Spans are proposed and unbuilt. Which object tests them first: a beam, a stair or a window bay?
- [ ] How does a stretch span treat a surface that does not tile, such as a decal or a panel line?
- [ ] May a joint widen an atom's limits with no check that the atoms do not pass through each other?
- [ ] Is a tint any colour, or one of a listed set?
- [ ] Does the capability profile cap how wide a scale range or a span may be?
- [ ] Where do a behaviour's settings live until the behaviour registry exists?
- [ ] Frontier Colony's library changed connector types to follow its clips, before joints could state their own motion. Does it move to joint overrides?
