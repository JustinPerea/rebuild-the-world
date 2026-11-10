# Assets

One folder per asset at `assets/<category>/<asset_id>/`, named `<category>_<name>_<variant>` in lowercase ASCII with underscores. Categories: `veh`, `bld`, `prop`, `veg`, `gnd`, `mat` (shared library materials).

```text
veh_sedan_door_fl_01/
  asset.glb      the model, glTF 2.0 binary (Git LFS)
  asset.json     metadata
  preview/       renders from the standard scene
  source/        generation script, parameters, prompts
  refs/          reference images, with a licence note for each
```

Full rules: `docs/asset-spec.md`.
