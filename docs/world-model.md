# Rebuild the World: World Model (Draft v0.5)

Nov 12, 2026

Earth is broken down into nine levels of scale, from the whole planet to a shared material, and every level is built from the ones below it. Nothing on this page has been tested. Changed in v0.2: a category for characters, three more behaviours, and where invented things go. Changed in v0.3: atoms may vary, and behaviours take settings. Changed in v0.4: a proposed world grid, and how areas built apart from each other join on one globe. Changed in v0.5: a cell's tile level follows its latitude, so cells are 177 to 354 m across everywhere, and data packs are placed on the exact plane that touches the Earth at the cell's centre.

## Levels of scale

| Level | What it is | Example | How it gets built |
| --- | --- | --- | --- |
| 1 Body | A planet or moon | Earth | Reference shape and coordinates, fixed once |
| 2 Terrain | The ground surface and what covers it | Mount Fuji, a coastline | Open elevation data, refined by terrain tasks |
| 3 Region | A city or district, the unit that unlocks | One neighbourhood | A data pack and a look sheet |
| 4 Block | Streets, lots and what stands on them | A city block | Placement rules run on open map data |
| 5 Structure | A building, bridge or tower | An apartment block, the Eiffel Tower | Assembled from atoms and kits |
| 6 Space | A room or interior | A living room | Assembled from atoms and objects |
| 7 Object | A complete thing that can be placed or used | A car, a computer, a skateboard | Assembled from atoms |
| 8 Atom | The smallest piece that is reused or moves on its own | A wheel, a bearing, a door | Built by a contributor |
| 9 Material | A shared surface | Brick, glass, painted metal | Built once, referenced by ID |

Contributors build at levels 6 to 9 and at single items in levels 2 and 5. Levels 3 and 4 are produced by data and rules, never modelled by hand.

## Atoms

An atom is the smallest piece that is reused across objects or moves on its own. Everything above it is assembled from atoms, so the library grows fastest at this level.

- A wheel, a bearing, a door and a window bay are atoms. A skateboard, a car and a building are assembled from them.
- Before anyone builds an atom, they check whether the library already has one that fits (claim system spec, "Building an object").
- An atom is fixed where it meets another atom. Elsewhere it may vary in size, look and motion within ranges it declares, so one atom serves many objects (asset spec, "Variation").
- How deep atoms go rises with the fidelity tier. At Tier 1 an engine is one atom. At a higher tier it becomes an assembly of pistons and valves under the same ID, and nothing built from it has to change.

## Two kinds of asset

Every asset is either a library asset or a unique asset.

| Kind | What it is | Placed | Example |
| --- | --- | --- | --- |
| Library asset | A reusable atom, kit or object | Many times, by placement rules | A street light, a window bay, a sedan |
| Unique asset | One real thing at one real location | Once, at its real coordinates | The Eiffel Tower, Mount Fuji's summit |

- A unique asset carries a real-world anchor: latitude, longitude, height and heading, plus the IDs of the open-data records it corresponds to.
- A unique asset is still built from library atoms and materials where they fit.
- Landmarks and other high-profile unique assets require trust level 2 (claim system spec).
- Invented things, such as a robot with no real counterpart, do not enter Earth's library. They live in a separate library on the same contract (asset spec, "Libraries").

## Accuracy levels

A whole region is blocked out first as plain low-detail shapes from map data, and each real thing then moves up through four accuracy levels as contributors and tools improve. The level is recorded per place, so the map can show what is blocked out and what is true.

| Level | Name | What it means | Example for one building |
| --- | --- | --- | --- |
| A0 | Blockout | A plain low-detail shape generated from map data, with the real footprint and height | A grey box with the right outline and height |
| A1 | Dressed | Placement rules cover the blockout with typical library atoms for that region | Typical windows, doors and roof on the right shape |
| A2 | True exterior | Rebuilt from atoms by a contributor, from references of the real thing | The actual building, recognisable from the street |
| A3 | True inside and out | Interior layout and contents also match | Its real floor plan and rooms |

- A0 and A1 come from map data and placement rules, with nobody modelling by hand. A2 and A3 are unique-asset tasks.
- The blockout makes a region walkable from the first day, before a single building has been modelled.
- Every blockout is an open task. The board's wanted list is the set of places still at A0 or A1.
- The blockout is also the brief: it gives the footprint, height and position the finished structure must fit, within the profile's scale tolerance.
- A blockout uses a small fixed triangle budget, set by the capability profile, so a whole city of them stays cheap to draw.
- A place never moves down a level. A better model replaces the blockout under the same place ID.
- Brands, product designs, people and plates follow `accuracy-and-data.md` at every level.

## Categories

Asset IDs start with a category code. Four codes are new in these drafts, to cover terrain, interiors, everyday objects and characters.

| Code | Category | Status |
| --- | --- | --- |
| `veh` | Vehicles and vehicle atoms | Existing |
| `bld` | Buildings, facade modules, structures | Existing |
| `prop` | Street furniture and outdoor props | Existing |
| `veg` | Vegetation | Existing |
| `gnd` | Ground and street surfaces | Existing |
| `mat` | Shared materials | Existing |
| `ter` | Terrain features | New |
| `int` | Interior fittings and furniture | New |
| `obj` | Everyday objects, tools and devices | New |
| `chr` | Characters, animals and robots | New |

`chr` covers animals, robots and people who are nobody in particular. Real people stay out (accuracy and data policy).

## Things that work

An object that can be used declares a behaviour, and the engine supplies the behaviour's logic. Assets never contain code.

- A behaviour is named from a behaviour registry, in the same way a connector type is.
- Each registered behaviour lists what the asset must provide, such as a hinge axis for `openable` or wheel connectors for `rideable`.
- A behaviour may take settings, such as how fast a door opens or whether it closes itself. The registry lists them and each object states its own, so two objects built from the same atoms may behave differently.
- An asset with no behaviour is still valid. It is scenery until a later version adds one.

First behaviours to define, once the demo slice is chosen: `openable` (doors, lids), `drivable` (cars), `rideable` (skateboards, bicycles), `sittable` (seats), `switchable` (lights, screens), `walks` (characters), `flies` (aircraft, drones), `transformable` (objects that change between named states).

## Coordinates

- Earth uses latitude and longitude on the WGS 84 reference shape, with height in metres.
- Each region has a local origin and works in metres from it, so assets and placement stay in the asset spec's units.
- Another body gets its own reference shape. Nothing else in the model changes.

## How flat areas sit on the globe

This section and the next two are Claude's proposal from 2026-11-12. The owner asked how areas that people build apart from each other connect, and whether to build on a sphere whose terrain updates as people work. He agreed to have the answer written up. He has not confirmed its details.

- An area is built flat. Its buildings, blockout and placement are in metres from the area's origin: +X east, +Y up, +Z south.
- The globe places each flat area. The engine's globe layer (Cesium for Unreal is the likely one) anchors an area's origin at its latitude and longitude and turns it to face up there. Nobody models on a curved surface.
- The flat frame is the plane that touches the Earth at the cell's centre, and the data-pack tools convert latitude and longitude onto that plane exactly. Across one cell the curved surface falls away from the plane by at most 4.9 mm, at the corner of the largest cell. That is more than the 1 mm connector tolerance, so atoms never snap together across a cell edge: a building belongs whole to one cell.
- An earlier shortcut, a fixed number of metres per degree, is off sideways by up to 2 mm in a level-17 cell, 8 mm at level 16 and 38 mm at level 14. Cells no longer use it. The Oshiage 2 pack was cut with it and is left as it is, and the wall-reference tool still places photos with it, which is far inside a photo's position error.
- Two areas need no knowledge of each other to line up. Each is placed by its own coordinates, so a block in Lisbon and a block in Tokyo are already in the right place relative to each other.
- Google's Photorealistic 3D Tiles are not the globe's surface and are not used to fill gaps. The project bars deriving anything from them.

## The world grid

Areas opened by different people must meet without gaps and without two people holding the same building. That needs one fixed set of cells that is decided before anyone opens an area.

The owner agreed on 2026-11-12 ("lets do it") to keep map-tile numbering as the address system and to stop tying a block to one fixed tile level. The target size, the range of levels and the rule below are Claude's.

| Item | Proposed value |
| --- | --- |
| Scheme | Web Mercator map tiles, the numbering web maps use. Tiles form a tree: each splits into four at the next level |
| Cell ID | `c<level>-<x>-<y>`, x counting east from longitude -180, y counting south from the top |
| Target side | 250 m |
| Levels | 17 down to 14. A cell's level is the one whose tiles are nearest the target side at its latitude |
| Coverage | Latitude -85.05 to 85.05. Nothing is built nearer the poles |
| Local origin | The centre of the cell |

A tile's side on the ground shrinks away from the equator, so one level cannot give cells of one size. The level follows latitude instead:

| Latitude, north or south | Level | Cell side | Examples |
| --- | --- | --- | --- |
| 0 to 54.67 | 17 | 306 m at the equator, down to 177 m | Quito 306 m, Tokyo 248 m, London 191 m |
| 54.67 to 73.19 | 16 | 354 m down to 177 m | Edinburgh 343 m, Helsinki 305 m, Tromsø 213 m |
| 73.19 to 81.69 | 15 | 354 m down to 177 m | Longyearbyen 250 m |
| 81.69 to 85.05 | 14 | 354 m down to 211 m | |

- The level is decided for each row of level-14 tiles, from the latitude of the row's middle. A change of level therefore falls on an edge that every level shares, and cells of two levels meet without a gap.
- A building belongs to the cell that holds the centre of its outline, whole. A building that crosses a cell edge is never cut.
- A cell's neighbours follow from its ID, so "the block next door" needs no lookup. Where the level changes, a larger cell has two smaller neighbours on that side.
- The ID carries the level, so an ID stays valid if cells are later split or merged.
- Latitude is the smaller cause of uneven work. Two level-17 cells of nearly the same size held 150 buildings (Lisbon) and 335 (Tokyo). The tree allows a dense cell to be split into its four quarters and near-empty cells to be merged into their parent, by building count. That is not designed or built: it needs the claim service to record which cells were split.
- A cell is the "block" of the claim spec's home blocks. A region is a set of cells.
- `tools/region-kit/grid.py` is the grid as code, and `tools/region-kit/kit.py open` makes a cell's data pack. `docs/open-an-area.md` is the guide.
- The Oshiage 2 pack was cut before the grid existed, as a 300 m square around a hand-picked origin. It is not re-cut yet. The grid cell at its origin is `c17-116439-51599`.

## Terrain and the land between

- Terrain is one shared layer for the whole globe, made from open elevation data. It is not part of any area and nobody claims it cell by cell. No dataset is chosen.
- Until terrain exists, every building stands at height 0 in a pack from OpenStreetMap, and at its surveyed ground level in a pack from PLATEAU.
- An area's buildings are set on the terrain when the area is placed. How a building's base meets sloping ground is not designed.
- Land that nobody has opened is filled by the same generated blockout, cell by cell, from the same open map data. An opened cell replaces the generated one.
- Terrain gets better the way buildings do: a better elevation source or a contributor's correction replaces a tile of it under the same ID. Corrections need their own task type, which does not exist.

## Open questions

- [ ] Are nine levels right, or should Space and Object be one level?
- [ ] Who decides how deep atoms go for a given object at Tier 1: the blueprint's author, or a rule per category?
- [ ] Which open elevation dataset supplies terrain, and what are its licence terms?
- [ ] How is a place ID formed, and does it reuse open-data IDs such as OpenStreetMap's?
- [ ] Who may raise a place from A1 to A2: any contributor with a task, or only level 2 and above?
- [ ] Where map data has a footprint but no height, how is a blockout's height estimated, and how is that marked?
- [ ] Do terrain, roads and trees get blockouts too, or only structures?
- [ ] How are placement rules written and reviewed? They need their own spec.
- [ ] Which behaviours does the first demo need?
- [ ] How do tiles of terrain meet without gaps when different people refine neighbouring tiles?
- [ ] Is 250 m the right target side for a cell, and are four levels enough?
- [ ] By what count is a dense cell split into four or sparse cells merged, and who records it?
- [ ] Is Oshiage 2 re-cut to grid cells, and do its place IDs and survey plans carry over?
- [ ] How does a building's base meet sloping terrain: is the ground cut, or does the building get a plinth?
- [ ] Is unopened land shown as a generated blockout, or left empty until someone opens it?
- [ ] Which characters does the first demo need: player avatars, passers-by, animals?
