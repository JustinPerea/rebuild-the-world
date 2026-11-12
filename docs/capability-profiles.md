# Rebuild the World: Capability Profiles (Draft v0.3)

Nov 11, 2026

A capability profile is the set of limits the validator enforces today, and it is expected to be replaced as tools improve. The asset spec says what an asset is; the profile says how much detail is asked of it right now.

## How profiles work

- One profile is current at a time. Every asset records the profile it was built against.
- A new profile raises limits or tightens rules. It never changes the durable contract in the asset spec.
- Assets built under an older profile stay valid. They are queued for regeneration, using their recipe and description, when a newer profile makes a better version possible.
- A rule that today's tools often fail is kept, with its target profile named, and is not enforced until then.
- Each library names the profile it enforces (asset spec, "Libraries"). Profile 1 is Earth, Again's. Frontier Colony uses flat colours in place of textures, so it allows 8 materials on an atom.

Changed in v0.2, from the first object rebuilt as atoms: two character classes, a smallest feature tied to the atom's size, a mating tolerance of its own, a texture floor, and rigid atoms only.

Changed in v0.3: how the limits apply to an asset that varies (asset spec, "Variation").

## Profile 1 (2026)

Profile 1 asks for Tier 1 Street fidelity: an asset that holds up from 2 m away in a third-person view. Every number is a starting value to tune after the first 100 merged assets.

### Geometry budgets

Contributors submit one mesh at full detail (LOD0), and the pipeline generates the lower levels.

| Asset class | Examples | LOD0 triangle budget |
| --- | --- | --- |
| Small prop | Street light, bench, hydrant | 10,000 |
| Large prop | Tree, bus shelter | 40,000 |
| Vehicle atom | Door, wheel, bonnet | 25,000 |
| Vehicle molecule | Complete car | 200,000 |
| Facade module | Window bay, door bay | 15,000 |
| Blockout | One building as a plain shape | 500 |
| Character atom | Head, torso, limb | 15,000 |
| Character molecule | Complete character or robot | 60,000 |

Classes for terrain features, interior fittings, everyday objects and whole structures are not yet set. The two character classes come from one robot: 44,156 triangles whole, 12,072 in its largest atom.

| Level | Made by | Triangle target |
| --- | --- | --- |
| LOD0 | Contributor | The class budget |
| LOD1 | Pipeline | 50% of LOD0 |
| LOD2 | Pipeline | 15% of LOD0 |
| LOD3 | Pipeline | 2% of LOD0, or a flat impostor |

A contributor may replace any generated level with a hand-made one.

### Mesh rules

| Rule | Profile 1 |
| --- | --- |
| Triangles only, no loose vertices, zero-area faces or duplicate faces | Enforced |
| Normals point outward | Enforced |
| Solid objects are watertight | Enforced, with thin objects exempt if metadata says so |
| No faces hidden inside the mesh | Reported as a warning, enforced from a later profile. Faces hidden between two atoms of a molecule never count |
| Smallest modelled feature | 2 cm, or 2% of the atom's longest side where that is smaller. Smaller detail goes in the normal map |
| Skinning | Rigid only: each atom follows one joint. Skin that bends waits for a later profile |
| UV sets | One, with no overlapping islands unless the surface uses a tiling library material |
| Collision shapes | One to eight convex shapes per atom |
| Scale tolerance | Within 2% of the task's dimensions |
| Mating tolerance | Mating dimensions within 1 mm, whatever the scale tolerance allows |
| Connector tolerance | Position within 1 mm, direction within 0.5° |

### Textures and materials

| Rule | Profile 1 |
| --- | --- |
| Resolution | 512 pixels per metre at LOD0, and at least 128 pixels on a side |
| Maximum size | 4,096 × 4,096 |
| Sides | Powers of two |
| Source format | PNG. The pipeline makes compressed versions |
| Materials per asset | At most 3 on an S asset, 6 on an M or L asset. The limit assumes textured materials |
| Asset folder size | Under 100 MB |

### Assets that vary

An atom may declare a scale range, spans and open material slots (asset spec, "Variation"). The limits above then apply across the whole range.

| Rule | Profile 1 |
| --- | --- |
| Declared ranges | Every rule on this page is checked at both ends of each scale range and each span |
| Triangle budget | Counted at a repeat span's largest count |
| Texture resolution | Measured at the largest scale in the range |
| Stretch spans | Tiling library materials only |
| Width of a range | No cap is set |

## Later profiles

Later profiles are not specified yet. The art style guide's fidelity tiers show the direction.

| Tier | Holds up at | Smallest modelled feature | Texture resolution |
| --- | --- | --- | --- |
| 1 Street | 2 m and beyond | 2 cm | 512 pixels per metre |
| 2 Close | 0.5 m, first-person view | 5 mm | 1,024 pixels per metre |
| 3 Hero | Any distance | 1 mm | 2,048 pixels per metre |

## Open questions

- [ ] Are Profile 1's budgets right for the first demo's target hardware?
- [ ] What triggers a new profile: a date, a tool release, or a measured pass rate?
- [ ] Who runs regeneration of older assets, and who pays for it?
- [ ] Are one to eight collision shapes enough for a car body or a facade with a door opening?
- [ ] What are the budgets for terrain, interiors, objects and structures?
- [ ] Are the two tolerance fixes right? On a 6 cm atom, 2% of scale is 1.2 mm, looser than the 1 mm a connector needs, and a 2 cm smallest feature removes bolts and finger tips from a 0.94 m robot.
- [ ] A vehicle atom at 25,000 triangles is generous beside a whole robot at 44,156. Should the object classes be set lower?
- [ ] Should atoms under 0.25 m use shared materials only, in place of a texture floor?
- [ ] Should Profile 1 cap how wide a scale range or a span may be? A tree scaled to twice its size has half the texture resolution it was checked at.
