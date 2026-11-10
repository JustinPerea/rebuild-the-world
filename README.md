# Rebuild the World

Working title. An open, community-built 3D model of Earth that becomes a playable multiplayer sandbox. Contributors build small modular parts with their own AI tools and submit them by pull request; automated checks and a reviewer model verify each one; merged parts are assembled procedurally onto real map layouts.

Status: scaffold only. No assets, validator or pipeline yet. Licence not chosen (see `LICENSE.md`).

## Specs

- [`docs/asset-spec.md`](docs/asset-spec.md): glTF conventions, connectors, budgets, materials, folders, metadata, automated checks.
- [`docs/claim-system-spec.md`](docs/claim-system-spec.md): tasks, claims, trust levels, review pipeline, strikes, region unlocks.
- [`docs/art-style-guide.md`](docs/art-style-guide.md): grounded realism, fidelity tiers, golden set, render scene, self-check.

## Layout

```text
assets/<category>/<asset_id>/   one folder per asset (asset.glb, asset.json, preview/, source/, refs/)
  veh bld prop veg gnd mat      categories from the asset spec; mat = shared library materials
registry/                       connector registry (types, sides, mating dimensions)
tasks/                          task records the coordinator hands out
tools/validator/                CLI implementing the asset spec's automated checks
tools/render/                   standard Blender render scene and one-command render script
skill/                          contributor skill file (instructions for a contributor's model)
data/                           region data packs from open map data, each with source and licence
scripts/                        repo maintenance checks (e.g. check-lfs.sh)
docs/                           specs
film/                           pitch film source (reference only)
```

## Setup

Large binaries (`.glb`, textures, `.blend`, renders) are stored with Git LFS.

```sh
git lfs install --local
scripts/check-lfs.sh          # fails if a binary slipped into plain Git
```

## Data rules

- Never derive anything from Google Maps content (tiles, Photorealistic 3D Tiles, Street View).
- Use open data (OpenStreetMap, Overture Maps, government open data such as PLATEAU, Mapillary) and record the source and licence of everything ingested.
- No real brands, logos, recognisable product designs, licence plates or people in assets.
