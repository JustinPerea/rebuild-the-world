# Rebuild the World

Working title; the public name is Earth, Again. An open, community-built 3D model of Earth that becomes a playable multiplayer sandbox. Contributors build small modular atoms with their own AI tools and submit them by pull request; automated checks and a reviewer model verify each one; merged atoms are assembled procedurally onto real map layouts.

Status: specs drafted (v0.1 to v0.5), announcement film posted, waitlist page live. A validator, a contributor MCP server and a first data pack (Oshiage 2, Sumida, Tokyo) exist, and the first test of the system is set up in [`docs/first-test.md`](docs/first-test.md). No pipeline or review service yet. Licence not chosen (see `LICENSE.md`).

## Specs

- [`docs/vision.md`](docs/vision.md): the goal, what must stay fixed, how the specs fit together. Start here.
- [`docs/world-model.md`](docs/world-model.md): levels of scale, library and unique assets, accuracy levels, categories, behaviours.
- [`docs/asset-spec.md`](docs/asset-spec.md): the durable contract, shared by every library: glTF conventions, connectors and their motion, blueprints, assembly manifests, moving assemblies, animation clips, materials, folders, metadata, automated checks.
- [`docs/capability-profiles.md`](docs/capability-profiles.md): the budgets, tolerances and mesh rules enforced today.
- [`docs/contributor-service.md`](docs/contributor-service.md): work orders with pinned versions, and the MCP server contributors' agents connect to.
- [`docs/accuracy-and-data.md`](docs/accuracy-and-data.md): what may match the real world, and allowed data sources.
- [`docs/claim-system-spec.md`](docs/claim-system-spec.md): tasks, claims, trust levels, review pipeline, strikes, region unlocks.
- [`docs/art-style-guide.md`](docs/art-style-guide.md): grounded realism, fidelity tiers, golden set, render scene, self-check.

## Layout

```text
assets/<category>/<asset_id>/   one folder per asset (asset.glb, asset.json, preview/, source/, refs/)
  veh bld prop veg gnd mat      categories from the world model; mat = shared library materials
  ter int obj chr               terrain, interiors, everyday objects, characters (added in the drafts)
registry/                       connector registry (types, sides, mating dimensions)
tasks/                          task records the coordinator hands out
tools/validator/                CLI implementing the asset spec's automated checks
tools/render/                   standard Blender render scene and one-command render script
skill/                          contributor skill file (instructions for a contributor's model)
data/                           region data packs from open map data, each with source and licence
survey/                         one facade plan per building, and the tally of the bays they use (survey/README.md)
tools/survey/                   hands out the next building, checks plans, writes the tally
tools/refs/                     front-on reference images of real walls, from openly licensed street photos
spec/spec.json                  the specs' tables as data, read by the visualizer (and later the validator)
tools/spec-visualizer/          interactive map of the specs, built from spec/spec.json
scripts/                        repo maintenance checks (check-lfs.sh, check-spec-sync.mjs)
docs/                           specs
film/                           pitch film source (reference only)
announce/film/                  announcement film, 16:9 (HyperFrames)
announce/film-vertical/         the same film re-laid out for 9:16
announce/web-hero/              the live globe used on the waitlist page
explain/wall-refs/              explainer film: how tools/refs makes a wall reference (source only; its images stay local)
brand/, site/                   brand work and the waitlist page
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
- Real places, terrain, buildings and landmarks are modelled accurately. Logos, brand names and specific product designs are held for legal review. No real people or readable licence plates. See `docs/accuracy-and-data.md`.
