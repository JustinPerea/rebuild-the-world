# Standard render scene

One command renders any atom or molecule in the fixed scene from `docs/art-style-guide.md` ("Standard render scene"), so any two assets can be compared and a reviewer sees every submission the same way.

```sh
node tools/render/render.mjs assets/bld/bld_door_bay_01
node tools/render/render.mjs assets/bld/bld_door_bay_01 --light sun --views three_quarter
```

It writes PNG files to the asset's `preview/` folder (or `--out DIR`) and prints what it wrote, with the size it measured. The sun variant's files are named `sun_<view>.png`.

| Option | Meaning | Default |
| --- | --- | --- |
| `--light` | `overcast`, an even sky, or `sun`, a dimmer sky with one sun from the front left, 45 degrees up | `overcast` |
| `--views` | Any of `front`, `back`, `left`, `right`, `three_quarter`, `close`, separated by commas | All six |
| `--size` | Pixels on a side, 64 to 2048 | 1024 |
| `--out` | The folder for the pictures | `<asset>/preview` |
| `--library` | The library in which a molecule's atoms are found | `assets/` |
| `--blender` | The Blender to run | `$BLENDER`, then `blender` on the PATH |

## What is in the picture

- The asset, standing on a flat mid-grey ground with its lowest point on the ground. Connector nodes and collision shapes are left out.
- To the asset's right, on its front plane: a 1.8 m figure, a 1 m ruler in 0.1 m bands, and a chart of six greys and six colours on a post.
- `front` looks at the +Z face, which the asset spec defines as the front. `close` frames a patch of the front at most 3 m across, at eye height on a tall asset.

A molecule is drawn with every atom where the validator's analysis places it, through nested molecules, with each entry's scale and mirror. The tool decides no position itself, and a molecule that does not assemble is not rendered.

## What is pinned

- Blender 5.0. The tool warns when it runs another series, because the pictures may then differ from a reviewer's.
- Cycles on the CPU, 48 samples, no denoising, a fixed seed, the Standard view transform. `SETTINGS_VERSION` in `scene.py` changes whenever any of these or the scene's contents change, and each run prints it.
- The scene is built by `scene.py` on every run. There is no `.blend` file to keep in step.

## Limits

- Pictures from two machines have not been compared, so "the same picture everywhere" is the intent and is not yet measured.
- From `left` the references stand behind the asset and are mostly hidden.
- A molecule's moving joints are drawn at rest. Animation clips are not rendered.
- The figure, ruler and chart are flat cut-outs. The chart is this project's own twelve patches and matches no commercial chart.
- Nothing here compares a render with a golden asset or a reference photo. That is the reviewer's job, and the review pipeline is not built.

## Tests

`node --test tools/render/test/` checks, without Blender, that a molecule's meshes land where the validator places them (the two bounding boxes agree) and that a molecule which does not assemble is refused. The Blender step has been run on macOS only and has no automated test.
