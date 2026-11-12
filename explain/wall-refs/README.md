# Explainer film: how a wall reference is made

A 112-second film that follows `tools/refs/wallrefs.py` through one real wall in Oshiage 2: find the photos, work out where each was taken, put the model on the map, find the wall's plane, flatten each photo onto it, combine them.

- `SPEC.md` is the brief the film was built from. `STORYLINES.md` holds the three storylines considered. `REVIEW.md` says what was checked and what was not.
- `compositions/wall.html` is the whole film: one scene, drawn as a function of time from `assets/data.js`.
- `make-data.py` exports `assets/data.js` and the images from a real run of the tool.

## Building it

The images and the render are not in the repository: they are made from Mapillary photos (CC BY-SA 4.0), which stay local until the project's licence is chosen (`tools/refs/README.md`, "Licence"). To rebuild them, from the repository root:

```sh
python tools/refs/wallrefs.py index && python tools/refs/wallrefs.py plan   # needs MAPILLARY_TOKEN
python explain/wall-refs/make-data.py /path/to/an/empty/work/folder
cd explain/wall-refs
npx hyperframes@0.9.29 check
npx hyperframes@0.9.29 render -o renders/wall-refs-explainer.mp4
```

The sound files (`assets/audio/`) came from the HyperFrames catalog and are not included either. Without them the film renders silent; `index.html` lists where each one plays.

A new run of the reconstruction gives slightly different numbers. The lines of text in `compositions/wall.html` quote the run the film was made from, so check them against `assets/data.js` after exporting again.
