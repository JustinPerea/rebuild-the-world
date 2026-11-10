# Rebuild the World: Art Style Guide (Draft v0.1)

Nov 10, 2026

The target is grounded realism: each asset looks like the real object under neutral light, at true scale, with physically based materials. Style lives in lighting and rendering, never in the asset.

## Principles

Six rules decide whether an asset fits, and reviewers cite them by number.

1. **Measure, don't guess.** Dimensions come from the task's reference pack or published standards, never from memory.
2. **Physically based materials.** Surfaces use real-world values. A surface is either metal or not, and its roughness varies.
3. **Neutral assets.** No lighting, shadows, weather, season or time of day is built into an asset. Those belong to the scene.
4. **Motivated wear.** The default is a maintained object about five years old. Dirt and damage appear where water, hands and tyres would cause them.
5. **Generic, not branded.** No real logos, brand names, product designs, licence plates or people. Signs use invented names.
6. **Detail matches size.** Small objects are not over-modelled and large ones are not left bare. The fidelity tier sets the threshold.

## Fidelity tiers

Assets are built to Tier 1 today, and the tiers above it let the library improve without being redone. A higher-tier version replaces a lower one under the same asset ID and connectors.

| Tier | Holds up at | Smallest modelled feature | Texture resolution | Status |
| --- | --- | --- | --- | --- |
| 1 Street | 2 m and beyond, third-person view | 2 cm | 512 pixels per metre | Required now |
| 2 Close | 0.5 m, first-person view | 5 mm | 1,024 pixels per metre | Opens when tools allow |
| 3 Hero | Any distance, including cinematics | 1 mm | 2,048 pixels per metre | Future |

Every tier follows the same six principles. Only the amount of detail changes.

## Materials and colour

Real surfaces are duller and less saturated than they look in photographs, and most style drift starts here. Use the shared material library first, because it holds the reference values.

| Property | Rule |
| --- | --- |
| Base colour, non-metals | sRGB values between 30 and 240. Nothing is pure black or pure white. |
| Base colour, metals | Bright, sRGB 180 to 255, carrying the metal's own tint |
| Metallic | 0 or 1. In-between values only where paint or dirt meets bare metal. |
| Roughness | Never one flat value. It varies with wear, polish and dirt. |
| Saturation | Restrained. Compare with the golden set, not with a photograph. |
| Glass | Clear and slightly tinted. At Tier 1, interiors behind it are suggested, not modelled. |

The numeric ranges are common physically based rendering practice and are starting values. Colour references should come from photos taken in overcast light, since strong sun adds shadows and a colour cast.

## Golden set

The golden set is 20 approved assets that define the look in practice. When this guide and the golden set disagree, the golden set wins and the guide is corrected.

| Group | Count | Examples |
| --- | --- | --- |
| Facade modules | 5 | Brick, concrete, glass curtain wall, stone, painted render |
| Ground and street surfaces | 3 | Asphalt road, concrete pavement, kerb |
| Street props | 4 | Street light, bench, bin, traffic signal |
| Vegetation | 2 | Street tree, shrub |
| Vehicles | 3 | Car body, wheel, door |
| Library materials | 3 | Brick, painted metal, glass |

- Maintainers build or commission the set before public tasks open, and freeze it with each style guide version.
- Every task's reference pack names the nearest golden asset to compare against.
- An outstanding merged asset can be promoted into the set at the next version.

## Standard render scene

Every preview is rendered in one fixed scene, so any two assets can be compared fairly. The scene file and a one-command render script live in the repository, built in Blender so anyone can run them.

| Element | Setting |
| --- | --- |
| Lighting | One neutral overcast sky, plus one clear-sun variant |
| Ground | Flat mid-grey plane |
| Scale references | A 1.8 m human silhouette and a 1 m ruler beside the asset |
| Colour reference | A standard colour chart in frame |
| Cameras | Front, back, left, right, three-quarter from above, and one close-up |
| Output | 1,024 × 1,024 pixels, saved to the asset's `preview/` folder |

Renderer version and settings are pinned in the repository. The review pipeline re-renders every submission itself, so a contributor's previews are for self-checking only.

## Self-check

Before submitting, the contributor's model renders the asset and compares it with the golden set. These steps go into the contributor skill file as written.

1. Run the validator and fix every failure.
2. Render the asset in the standard scene.
3. Place the renders beside the golden asset named in the task. Compare proportions, colour, roughness and amount of detail.
4. Check scale against the human silhouette and the ruler.
5. Go through the six principles and note any that the asset bends.
6. Look for brands, readable real-world text, licence plates and faces, and remove them.
7. View the asset from 2 m, 10 m and 50 m. The silhouette should read correctly at each distance.
8. Write a short self-assessment in the pull request: what matches, what deviates, and why.

The self-check helps honest contributors pass first time. It is not evidence for the reviewer, who repeats the comparison independently.

## Common rejections

Most rejected assets fail in one of seven ways. Reviewers name the failure and the principle it breaks.

| Failure | What it looks like | Principle |
| --- | --- | --- |
| Stylised look | Exaggerated proportions, flat saturated colour, toy-like bevels | 1, 2 |
| Wrong scale | Doors, steps or kerbs that don't fit the human silhouette | 1 |
| Painted-in lighting | Shadows or highlights in the base colour | 3 |
| Plastic surfaces | One flat roughness value everywhere | 2 |
| Random wear | Even scratches or dirt with no cause | 4 |
| Real brands | Logos, recognisable product designs, readable real signage | 5 |
| Mismatched detail | Tiny modelled screws on an otherwise bare object | 6 |

## Region look sheets

This guide is global, and a one-page look sheet per region captures what makes that city recognisable. It is written before the region unlocks, as part of its data pack.

Each look sheet lists:

- The region's common building materials and their library IDs.
- Typical storey heights, window proportions and roof types.
- Local street furniture: lights, signs, bins, kerbs and road markings.
- Common street trees and planting.
- Reference photos, each with a licence note.

A look sheet adds local facts. It never overrides the six principles.

## Open questions

- [ ] Who builds the golden set, and how is that work funded?
- [ ] Is overcast the right default light, or should the clear-sun variant lead?
- [ ] Is "maintained, about five years old" the right default wear, or should it vary by region?
- [ ] How are signs and shopfronts written: invented names in the local language, or left blank?
- [ ] Does the first demo need seasonal vegetation variants?
- [ ] Should a stylised render mode be offered later as an option, built on the same assets?
