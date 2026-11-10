# Rebuild the World: Asset Spec (Draft v0.1)

Nov 10, 2026

Every asset is a glTF 2.0 file in metres with named connector points, so parts made by different people snap together without manual fixing.

## Scope

This spec fixes the technical contract: coordinates, connectors, geometry, materials, files, and the checks that enforce them. How an asset should look belongs to the art style guide, and who may submit it belongs to the claim system spec.

Three rules shape every choice below:

- **Engine-neutral.** The library is stored in open formats and imported into a game engine by a pipeline, so it survives an engine change.
- **Machine-checkable.** Every requirement can be tested by a script, so contributors get the same answer the reviewer does.
- **Regenerable.** Each asset keeps the inputs used to make it, so better tools can rebuild it later at higher quality.

## How assets build up

The library has five levels, and each is built only from the one below.

| Level | What it is | Built from the level below by |
| --- | --- | --- |
| City block | Assemblies and props placed on real street layouts from open map data | Placement by procedural rules |
| Assembly (L task) | A complete car or building, made only from merged parts and kits | Snapping together at connectors |
| Kit (M task) | A matching set, such as facade modules or a wheel and axle set | Design as a matching set |
| Part (S task) | One asset with connectors: a door, a wheel, a window, a street light | Reference to shared materials by ID |
| Shared material | Brick, concrete, glass, painted metal, used by every part | |

Materials are shared, parts carry connectors, kits group matching parts, and assemblies snap them together. City blocks are never modelled by hand: rules place assemblies on real street layouts.

## Coordinates, units and scale

All files follow glTF 2.0 conventions at true real-world size. A contributor's tool may work differently inside, but the exported file must match this table.

| Property | Requirement |
| --- | --- |
| Unit | 1 unit = 1 metre |
| Up axis | +Y |
| Front of the asset | Faces +Z |
| Handedness | Right-handed |
| Root transform | Position 0, rotation 0, scale 1, with transforms applied before export |
| Size | Within 2% of the dimensions in the task's reference pack |
| Ground contact | Assets that stand on the ground rest on Y = 0 |

The engine import pipeline converts to the engine's own units and axes. Contributors never export in engine units.

## Pivots and connectors

Connectors are named attachment points, and two parts fit when their connectors share a type and face each other. They are what makes the library modular.

The pivot is the asset's origin:

| Asset class | Origin sits at |
| --- | --- |
| Ground-standing props, trees, vehicles | Centre of the footprint, at ground level |
| Facade and wall modules | Bottom-left corner of the outer face, seen from outside |
| Hinged parts such as doors and lids | On the hinge axis |
| Rotating parts such as wheels and fans | On the rotation axis, at the part's centre |

Connector rules:

- A connector is an empty node named `conn_<type>_<side>_<index>`, for example `conn_wheel_hub_a_01`.
- Its position is the attachment point. Its +Z axis points out of the part, towards the mating part.
- Each type has two sides, `a` and `b`, such as the axle side and the wheel side. An `a` connector mates only with a `b` connector of the same type.
- Types come from a connector registry in the repository. Each entry fixes the mating dimensions, such as hub diameter or opening width and height.
- A new type is added to the registry by pull request and approved by a maintainer before any asset uses it.

Building grid: facade modules are sized in multiples of 0.5 m horizontally. Storey height is set per building kit and recorded in its metadata.

## Geometry

Contributors submit one mesh at full detail (LOD0) plus simple collision shapes, and the build pipeline generates the lower levels of detail. All budgets are starting values to tune after the first 100 merged assets.

| Asset class | Examples | LOD0 triangle budget |
| --- | --- | --- |
| Small prop | Street light, bench, hydrant | 10,000 |
| Large prop | Tree, bus shelter | 40,000 |
| Vehicle part | Door, wheel, bonnet | 25,000 |
| Vehicle assembly | Complete car | 200,000 |
| Facade module | Window bay, door bay | 15,000 |

Mesh rules:

- Triangles only in the exported file. No loose vertices, zero-area faces or duplicate faces.
- Solid objects are watertight. Thin objects such as leaves and fences may be single-sided, and say so in metadata.
- Normals point outward, and no faces are hidden inside the mesh.
- Features of 2 cm or larger are modelled. Smaller detail goes in the normal map.
- One UV set, with no overlapping islands unless the surface uses a tiling library material.

| Level | Made by | Triangle target |
| --- | --- | --- |
| LOD0 | Contributor | The class budget |
| LOD1 | Pipeline | 50% of LOD0 |
| LOD2 | Pipeline | 15% of LOD0 |
| LOD3 | Pipeline | 2% of LOD0, or a flat impostor |

A contributor may replace any generated level with a hand-made one.

Collision: each asset includes one to eight convex shapes named `col_<index>`. They are invisible in the game and used for physics.

## Materials and textures

Assets use the standard glTF metallic-roughness material and reference a shared library material wherever one fits. Shared materials keep brick, concrete and glass looking the same across thousands of contributors.

- **Library first.** Common surfaces come from the shared material library and are referenced by ID. An asset makes its own textures only for surfaces the library lacks.
- **Proposing a material.** A new library material is its own task, reviewed like an asset.

| Map | Channels | Colour space | Required |
| --- | --- | --- | --- |
| Base colour | RGB, optional alpha | sRGB | Yes |
| Normal | Tangent space, +Y up | Linear | Yes |
| Occlusion, roughness, metallic | R, G and B of one texture | Linear | Yes |
| Emissive | RGB | sRGB | Only for lights and screens |

Texture rules, also starting values:

- Resolution follows surface size: 512 pixels per metre at LOD0, up to a maximum of 4,096 × 4,096.
- Sides are powers of two. Source files are PNG, and the pipeline makes compressed versions.
- No lighting, shadows or ambient occlusion painted into base colour.
- At most 3 materials on an S asset and 6 on an M or L asset.

## Files, naming and metadata

One asset is one folder, holding the model, a metadata file, its previews, and everything needed to rebuild it. Binary files are stored with Git LFS or an equivalent, never as plain Git files.

```text
veh_sedan_door_fl_01/
  asset.glb      the model, glTF 2.0 binary
  asset.json     metadata
  preview/       renders from the standard scene
  source/        generation script, parameters, prompts
  refs/          reference images, with a licence note for each
```

Names are lowercase ASCII with underscores, as `<category>_<name>_<variant>`. Categories are `veh`, `bld`, `prop`, `veg`, `gnd` and `mat`.

| Metadata field | Content |
| --- | --- |
| `asset_id`, `task_id` | The folder name and the task it fulfils |
| `spec_version`, `style_version` | The versions the asset was built against |
| `class`, `tier` | Asset class for budgets, and fidelity tier from the style guide |
| `dimensions_m` | Bounding box width, height and depth in metres |
| `triangles` | Triangle count of LOD0 |
| `connectors` | Each connector's name, type and side |
| `materials` | Library material IDs used, plus any custom materials |
| `description` | What the object is, in plain words and structured tags |
| `author`, `licence` | GitHub handle and the agreed licence |
| `sources` | Attribution for any map data or reference imagery used |

The `source/` folder and the `description` field make an asset regenerable. A future tool can rebuild the object from them at a higher fidelity tier, keeping the same ID and connectors.

## Automated checks

The validator runs on every pull request and names each failing check. Contributors run the same script locally before submitting.

| Check | Passes when |
| --- | --- |
| File validity | The official glTF validator reports no errors |
| Folder and naming | Required files exist and names match the pattern |
| Metadata | Every required field is present and matches the file's contents |
| Scale | The bounding box is within 2% of the task's dimensions |
| Transforms | The root node has no translation, rotation or scale |
| Triangle budget | LOD0 is within the class budget |
| Mesh health | No zero-area or duplicate faces, and solid meshes are watertight |
| Connectors | Every connector the task requires is present, with a registered type |
| Collision | One to eight convex shapes are present |
| Textures | Power-of-two sizes, 4,096 maximum, correct colour spaces |
| Materials | Library IDs exist, and the material count is within the limit |
| File size | The folder is under 100 MB |
| Licence | The licence field and every reference's licence note are filled in |

These checks cannot judge appearance. The render check and model review in the claim system spec do that, against the art style guide.

## Versioning

The spec uses three-part version numbers, and every asset records the version it was built against.

- **Patch (0.1.x):** clarifications only. No asset changes.
- **Minor (0.x.0):** new optional features, classes or connector types. Existing assets stay valid.
- **Major (x.0.0):** a breaking change. It ships with a migration script, and the validator accepts both versions for 90 days.

A merged asset is never edited in place. A fix or upgrade is published as a new version of the same asset ID, so anything built from it can be rebuilt predictably.

## Open questions

- [ ] glTF 2.0 or OpenUSD as the stored format? glTF is simpler to validate, and USD handles large assemblies better.
- [ ] Are the triangle budgets and 512 pixels per metre right for the first demo's target hardware?
- [ ] Is 0.5 m the right building grid, or should it follow each region's real construction modules?
- [ ] Should L assemblies require hand-made lower levels of detail?
- [ ] Which connector types go in the first registry? The first demo slice decides this.
- [ ] Are building interiors out of scope for v0.1, or a separate asset class?
- [ ] Do moving parts, such as doors that open and wheels that turn, need rigging rules in this spec or a later one?
