# Review: "Nobody took this photo"

126 s, 1920x1080, 30 fps. Render: `renders/wall-refs-explainer.mp4` (local, not committed).

## Creative calls

- Storyline A of `STORYLINES.md` (the result first, then one worked example), with B's idea used for the flattening step. B and C were not built.
- One wall carries the whole film: edge 2 of `plateau:bldg_5b434eb5-e19c-4ccb-858a-3b2d1f6024f2`, 8.89 m wide, 17 m of its height shown.
- The map is turned so the wall runs left to right with the street below it. North is not marked.
- The film runs 126 s, about twice the 45 to 60 s the storylines assumed. Each of the six steps needs a line of text long enough to read, and cutting a step would leave a gap in the explanation.
- The opening plate is the sharpest single view, not the combined one. The combined view arrives at the end, after the film has shown what combining does.
- The combine step was rebuilt on 2026-11-12, after the tool changed: it now leaves out the views that see a spot blocked, and tries every placed photo. Two scenes were added (87.4 to 100.8 s) and everything after them moved 13.6 s later. The film still follows six photos up to that point, then brings in the ten the tool adds.
- The "middle value" step uses one spot 9 m up the wall, above a window. Five views see it unblocked: four see tiles (brightness 145 to 153) and one has something dark crossing close to the camera (9). The values are the tool's, after it evens out brightness between views, a step the film does not show.
- Body text was raised to 40 to 46 px after the phone sheet: the owner watches on a phone.

## Where each number comes from

All from `assets/data.js`, which `make-data.py` exports from one run of `tools/refs/wallrefs.py`:
2,216 ordinary photos indexed; 106 within 40 m of the wall; 8 pass the plan's test; 40 given to the
reconstruction, 38 placed; 11,471 points; the pair shares 793 points; GPS residual 6.27 m; the
outline fit moved the model 2.0 m; 1,633 points on the wall's plane, 0.052 m rms; 80 px/m;
16 of the 38 placed photos see the wall sharply enough and all 16 are combined (the six followed
so far and ten taken closer); 19.5% of the wall shown is blocked in all six, 5.1% in all 16.
"48 walls" is the plan's count for the start block (photos that could see a wall). "9 come out
well enough to use" is the number of images the tool accepts after the full run
(`tools/refs/README.md`, "What the first full run gave"); 4 more are written and marked doubtful.

## Measured, looked at, not checked

- Measured: `hyperframes check` passes with no errors. Contrast 9 of 9. No layout findings.
- Looked at: contact sheets at 60 instants, including the middle of each warp, and the phone-width sheet. For the rebuilt combine step: 16 instants from 86.5 s to the end, and four frames pulled from the render itself.
- Sound: measured, not heard. The delivered file is -15.8 LUFS with a peak of -1.3 dB and no silent stretch; the shutter burst lands at 9.2 s and the latch at 50.55 s, where the picture has them, and the pop was moved to 107.3 s with the middle-value step. The render itself came out at -20.6 LUFS, so the delivered file's sound was raised with ffmpeg `loudnorm` (picture untouched); the volumes in `index.html` are still the quieter ones. The music bed is 91 s long, so a second
  copy fades in at 81 s under the first one's fade-out. Nobody has listened to that join.
- Not checked: playback at full speed by a person; the film on an actual phone.

## Weakest shot

27 to 33 s: four drives' GPS dots sit on one line while a 15-word sentence is read, and little moves.
With more time: draw each photo's GPS error circle so the "few metres" is visible before the match step.

Second: the six small photos at 74 to 81 s are 267 px wide, small on a phone. The ten closer views at 95 to 101 s are 104 px wide: the orange and the shrinking area on the left carry that step, not the photos.

## Warnings kept on purpose

- `dead_stretch` (17): the check counts text changes; most of these stretches have the map, the warp or
  the flip-book moving. Four are true holds for reading: 1.5 to 5.8 s, 28 to 32 s, 53 to 57 s, 106 to 109 s.
- `composition_file_too_large`: one scene, one clock, one file. Splitting it would mean passing the
  shared map state between files.
- `duplicate_media_discovery_risk`: the flattened views are shown twice on purpose (plates and flip-book).

## For the owner to decide

- A delivery truck's company name is readable in the photos, most clearly in the flip-book at 82 to 87 s and, smaller, in the rows of views at 88 to 101 s. The project holds brand
  names for legal review in assets; this is a street photo in an explainer, and the truck is the
  film's example of something standing in front of the wall. Blur it before any public post if you prefer.
- The film's images are made from Mapillary photos (CC BY-SA 4.0), credited on the end card by
  contributor name. `assets/` and `renders/` are ignored by Git, like `data/*/refs/`.
- Nothing has been posted.
