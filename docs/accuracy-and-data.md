# Rebuild the World: Accuracy and Data Policy (Draft v0.2)

Nov 10, 2026

Real places are modelled as they are, from open data. Brands and specific product designs wait on legal review, and real people and readable plates stay out. Nothing here is legal advice.

This policy governs the Earth, Again library. A library of invented things has nothing real to match, and its assets record `dimension_source: designed` (asset spec, "Libraries").

## What may match the real world

| Subject | Rule | Reason |
| --- | --- | --- |
| Terrain, coastlines, street layouts | Accurate | Facts about the world, taken from open data |
| Buildings, bridges, landmarks | Accurate, outside first and inside later | The point of the project |
| Signs, shopfronts, brand names, logos | Held for legal review | Trademark risk |
| Specific product designs, such as one real car model or phone | Held for legal review | Design-right and trademark risk |
| Real people | Never | Privacy |
| Readable licence plates and personal data | Never | Privacy |

Owner direction, 2026-11-10: the earlier rule "no recognisable designs" was wrong for places. The project is rebuilding Earth and wants it accurate.

## While a subject is held

Held subjects are built so they can be swapped in one pass once a lawyer clears them.

- A held object is modelled true to its type and size: a mid-size sedan with correct proportions, with no badge and no maker-specific styling.
- A held sign or shopfront keeps its real position and size, with a neutral placeholder face.
- The asset's metadata marks it as a stand-in and names what it stands in for, so the replacement task can be generated automatically.

## Before launch, a lawyer answers

- [ ] Can real brand names and logos appear on signs and shopfronts, and does it differ by country?
- [ ] Can specific vehicle and product designs be modelled, with or without badges?
- [ ] Which buildings are protected as architectural works, and where does that restrict a 3D model of the exterior or interior?
- [ ] Do the answers change if the project earns money?

## Data sources

Every file that enters the project records its source, licence and retrieval date.

| Source | Use | Duties |
| --- | --- | --- |
| OpenStreetMap | Streets, footprints, land use | ODbL: attribution and share-alike |
| Overture Maps | Buildings, places | ODbL for buildings |
| Government open data, such as Japan's PLATEAU | City models, footprints, heights | Per dataset. PLATEAU's city models are under Japan's Public Data License 1.0, which its site policy says is compatible with CC BY 4.0: name the source, and say when the data was edited (checked 2026-11-11) |
| Mapillary imagery | Street-level reference | CC BY-SA: attribution and share-alike |
| Open elevation data | Terrain | Dataset not yet chosen |
| Contributor photos | Reference for unique assets | Contributor's licence, faces and plates blurred |
| Fonts on signs and decals | Lettering | An open-licence font, recorded like any other source |

- **Never Google Maps content.** Tiles, Photorealistic 3D Tiles and Street View may not be used or traced. Their terms bar derived content.
- EXIF location is easy to fake, so a photo's metadata is never proof of where it was taken.
- Share-alike sources may constrain the licence of anything derived from them. This is part of the licence decision.

## Open questions

- [ ] Which licence do contributions use, and is there a contributor agreement?
- [ ] Does share-alike map data force a share-alike licence on placed city blocks?
- [ ] Who checks reference photos for faces and plates before they enter a data pack?
