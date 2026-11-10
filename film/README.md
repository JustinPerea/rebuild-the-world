# Pitch film source

A 30-second motion graphic made to gauge interest: one pull-back from a single bolt, to a wheel, a car, a street, a city, then the turning globe.

These are the modules of a Claude "Motion" artifact, not a standalone web project. They run inside that artifact's player, which supplies the `kit` helper object (`kit.scene`, `kit.h`, `kit.score`, easing functions, `TextFx`). They will not run on their own without it.

- `scenes.json` : scene list, durations, palette, fonts
- `base.css` : colours and type
- `shared.js` : `window.W` helpers (camera, zoom, floor, shadow)
- `scene-*.js` : one file per scene, in film order: bolt, car, street, city, globe
- `score.js` : the music and sound effects

To get a video file, open the film artifact in Claude and use Export (MP4 or GIF). The film has not been reviewed frame by frame, and the end card has no sign-up link yet.
