# SPEC: "The missing piece"

GOAL:    The viewer thinks "I could build one of those" and wants to claim a part.
OUTPUT:  HyperFrames, 1920x1080, 30 fps, silent (Justin asked for no sound).
TIME:    30 s = 900 frames. One continuous take, one cloud pass at 20.1 s.
LOOK:    Medium: a real-scale 3D street at dusk (metres, Three.js). Sky from peach #f2a071 at the
         horizon to blue #26355e overhead; fog #3a4668. Ink #f4f1ea. One accent: street-light
         orange #ffb056, only on lit lamps, lit windows, the "Claimed/Merged" status and lit globe dots.
         What is missing is always a white dashed outline (3 px, dash 0.18 m / gap 0.12 m up close).
         Type: Inter 700, -3% tracking. Titles 96 px (8.9% of height), opening line 64 px,
         tag 36 px, wordmark 132 px. Camera 40 degree lens, ACES tone mapping. No bloom.
OBJECTS: Street light: plinth, tapered pole 5.4 m, curved arm over the road, flat head with a lit lens,
         a pool of light on the ground. Buildings: boxes 3 to 13 storeys with a window grid, some lit.
         Car: side-profile body with four wheels. Tree: trunk and faceted canopy.
         Globe: dark ocean, land as a dot grid (Natural Earth), lit dots in orange.
MOTION:  Parts land on a spring, damping about 0.7, 15 frames each, 15 frames apart.
         Camera: 0-10 s dolly in 0.6 m; 10-20.1 s log-zoom pull-back 9 m to 1,100 m on power2.inOut,
         elevation -8 to 78 degrees, 35 degree arc. Globe: pull-back 1.6 to 5.3 radii on expo-like out.
         Titles: whole line blurs in 8 px to 0 over 6 frames, then dead still; out in 5 frames.
SHOTS:
  0-135     Street corner, one dashed street light. Tag "Street light: Open task".
            Line: "This street is missing one part" (frames 30-132).
  135-186   Status flips to "Claimed"; an orange connector ring lands at the foot.
  186-258   Plinth, pole, arm, head drop in. Status "Building".
  258-300   "Merged". Frame 270: lamp flickers twice and warms up; its pool lights the pavement.
  300-603   Pull-back. Block, district, city; dashed buildings rise solid in a wave from the lamp,
            many stay dashed. Line: "Nobody can build the Earth" (372-486).
  585-624   Cloud pass (colour flood #51628a), cut inside it at 603.
  603-768   Globe, mostly unlit dots; orange clusters light up. Line: "Anyone can build one part" (648-756).
  768-900   End card: "Rebuild the World", "An open, community-built 3D model of Earth",
            dashed placeholder box for the call to action. Hold 2.5 s.
BANNED:  dark void with small floating things; bloom, lens flares, particles, stars; glass cards;
         purple gradients; titles that drift after landing; every line entering by slide-up;
         logo in a corner; made-up numbers; any real city, brand or place name.
QA:      f0 street reads as a street, outline is the brightest thing; f150 status Claimed;
         f290 lamp on, pavement visibly lit; f400 block with outlines; f540 city, wave visible;
         f602/f603 cut hidden by cloud; f700 globe dots read as continents; f860 end card legible at 360 px.
