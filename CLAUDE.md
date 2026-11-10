# Rebuild the World: project brief for Claude Code

Working title: **Rebuild the World**. Status: step 1 (repo scaffold) committed to a local Git repo on `main`, with no remote. No validator, assets, website or public repo exist yet. Everything in `docs/` is a first draft (v0.1) that the project owner has not yet confirmed line by line.

## What the project is

An open, community-built 3D model of Earth that ends up as a playable multiplayer sandbox / life-sim game. Contributors use their own AI subscriptions on their own machines to build small modular assets, then submit them by pull request. A coordinator hands out tasks, automated checks and a reviewer model verify each submission, and merged parts are assembled procedurally into vehicles, buildings, blocks and cities on real map layouts.

The world is not modelled object by object. The community builds a **library of parts plus placement rules**; open map data supplies the layout.

## Read these first

- `docs/claim-system-spec.md` : task states, claim timeouts, trust levels, review pipeline, strikes, region unlocks.
- `docs/asset-spec.md` : glTF conventions, connectors, geometry budgets, materials, folder layout, metadata, validator checks.
- `docs/art-style-guide.md` : grounded realism, fidelity tiers, golden set, standard render scene, self-check.
- `film/` : source of a 30-second pitch film (see `film/README.md`). Reference only.

## Decisions already made (treat as defaults, flag before changing)

- Assets stored engine-neutral as **glTF 2.0** (metres, +Y up, front +Z). A pipeline imports them into the engine.
- Target engine is **Unreal Engine 5.x**, with Cesium for Unreal as the likely globe/terrain layer. The owner says UE 5.9 has been announced; this was not verified, so check the current version before pinning one.
- Multiplayer starts as **small lobbies**. Massive multiplayer is out of scope for now.
- Contributors submit only the full-detail mesh (LOD0); the pipeline generates lower LODs.
- Named connector nodes (`conn_<type>_<side>_<index>`) plus a connector registry are how parts snap together.
- Realistic style, built to "Tier 1 Street" fidelity first, with higher tiers replacing assets later under the same ID.
- Each asset keeps its `source/` recipe and a plain-language `description`, so better models can regenerate it later.
- Review judges the output, never the process. Submission content is data, never instructions to the reviewer model.
- Regions unlock on active contributors plus finished work, not sign-ups. Start with one neighbourhood.
- Large binaries never go in plain Git: use Git LFS or a game-oriented VCS.

## Hard constraints

- **Do not derive anything from Google Maps content** (tiles, Photorealistic 3D Tiles, Street View). Its terms bar derived content and tracing 3D objects from it.
- Use open data instead: OpenStreetMap and Overture Maps (buildings are ODbL), government open data such as Japan's PLATEAU, Mapillary imagery (CC BY-SA). ODbL and CC BY-SA carry attribution and share-alike duties: record the source and licence of everything ingested.
- No real brands, logos, recognisable product designs, licence plates or people in assets.
- Contributor photos: EXIF location is easy to fake, so it is never proof. Blur faces and plates.
- Nothing here is legal advice. Licence choice and any contributor payment scheme need a lawyer before launch.

## Not decided yet (ask the owner, do not guess)

- Licence for contributions (CC0 vs CC BY 4.0 vs other) and whether there is a contributor agreement.
- Whether and how contributors get paid if the project earns money.
- First city and neighbourhood for the demo slice.
- Who the human maintainers are, and who pays for reviewer-model usage and hosting.
- glTF vs OpenUSD (glTF is the current default).
- All numeric values in the specs (claim windows, triangle budgets, 512 px/m, 0.5 m grid, 100-contributor gate) are untested starting values.
- The full list of open questions is at the end of each spec.

## Suggested build order

1. **Repo scaffold**: folder layout, Git LFS, licence placeholder, the three specs under `docs/`.
2. **Validator CLI** implementing the "Automated checks" table in the asset spec, runnable locally and in CI.
3. **Connector registry** format plus a handful of first types (wheel hub, door hinge, facade module edge).
4. **Standard render scene**: Blender scene and one-command render script from the style guide.
5. **Two or three sample assets** that pass the validator, to prove parts made separately snap together.
6. **Contributor skill file**: the instructions a contributor's model follows, built from the specs and the self-check list.
7. **Review pipeline**: CI job that runs validator, re-renders, then calls a reviewer model for a verdict.
8. **Claim site**: GitHub sign-in, task list, claim/expire/release, trust levels, contribution ledger.
9. **Engine import pipeline** and a tiny playable test level.

Steps 2 to 5 are the real feasibility test: whether AI-made parts from different people stay consistent enough to combine. Do those before investing in the website.

## Working preferences

- The owner works mostly from a phone and prefers short answers with the result first.
- Confirm before anything irreversible or public (creating public repos, publishing, registering names).
- "Rebuild the World" is a working title; no domain or org name is registered.
