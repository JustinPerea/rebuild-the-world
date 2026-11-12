# SPEC: "Nobody took this photo"

Storyline A from `STORYLINES.md`, with B's idea of throwing each photo onto the wall plane. Built without a stop because the owner asked for the film ("Create how you think would be best").

GOAL:    A stranger can say how a front-on, true-scale picture of a wall is made from street photos
         nobody took front-on: find, match, place, plane, flatten, combine.
OUTPUT:  HyperFrames, 1920x1080, 30 fps.
TIME:    112 s = 3,360 frames. One continuous scene; the map is one diagram that grows.
LOOK:    Medium: a survey drawing. Ground #eceff1, flat. Buildings #d7dbe0 with #b3bac3 edges, the
         building worked on #c3c9d1. Ink #14181d, second ink #56606c. One accent, orange #f04e16:
         only the wall being worked on and what is computed for it (its outline in a photo, its
         fitted plane, the middle value). Drive colours appear only on camera dots: 2023 ink,
         2018 #2f6fde, #0f9d8a, #8b52d6. The photos are the only photographic colour.
         Type: Inter. Opening line 124 px / 700 / -3%. Step lines 64 px / 700 / -2% (60 px in the
         map column). Body 42 px / 400 (40 px in the column). Labels 28 px, never smaller.
         No shadows, no glow, no grain.
OBJECTS: Wall plate: the flattened wall, 8.89 m by 17 m, with a metre ruler on its left and base.
         Street photo: the real frame, uncropped, the wall's outline drawn on it in orange.
         Map: PLATEAU building outlines, turned so the wall runs left to right and the street is below it.
         Photo position: a dot. Model point: a 1.2 px ink dot.
MOTION:  Everything is a function of timeline time (one clock tween, no timers).
         Text: blur 8 px to 0 and opacity in 0.22 s, out in 0.16 s, then dead still.
         Map pushes: 1.2 to 1.6 s, ease in-out cubic, scale interpolated in log space.
         The flattening warp: 1.6 s in-out cubic, a homography from the wall's outline in the
         photo to the plate; the first one slow, the other five 0.8 s, 0.45 s apart.
SHOTS (seconds):
  0-6      The finished plate with rulers. "Nobody took this photo."
  6-14     The plate folds back into the photo it came from; six photos; the wall outlined in each.
  14-27    Map. 2,216 photo dots; 40 m circle, 106; sight lines, 8.
  27-45    GPS dots by drive; two photos with 793 matched spots; cameras shift to where the
           matches put them; rays; 11,471 points.
  45-57    The model misses the outlines; it slides 2 m onto them; GPS ghosts show the 6 m error.
  57-66    Push in to the wall edge: 1,633 points on a line, flat to 5 cm. Tree and truck in front.
  66-81    The line stands up as a grid. Photo 1 warps onto it, slowly. Then the other five.
  81-99.5  The six views stack: wall sharp, truck ghosted. One window: six patches, six values,
           sorted, the middle kept. Combined view.
  99.5-110 Both outputs. "A reference to match. Not a texture to copy." Coverage and credits.
BANNED:  dark void; glow; glass cards; gradients; serif display; numbered step labels; pill chips;
         corner brackets; titles that drift; every element fading and sliding up; made-up numbers;
         any Google imagery; a claim the run's own figures do not carry.
QA:      f0 plate and line readable; f240 photo with orange outline; f600 circle and count;
         f1050 match lines join the same features; f1500 points sit on outlines after the slide;
         f1860 inliers on a line; f2140 warp lands on the plate without a jump; f2800 swatches sorted;
         f3200 end card legible at 360 px.

Every number on screen comes from `assets/data.js`, exported from one run of `tools/refs/wallrefs.py`
on `plateau:bldg_5b434eb5-e19c-4ccb-858a-3b2d1f6024f2`, edge 2.
