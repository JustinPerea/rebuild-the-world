# Web hero: the film's globe, live

The end card of the announcement film, rebuilt for the web. Justin picked this frame as the waitlist page's hero and asked for the rest of the page to be redesigned around its style (2026-11-10).

```bash
cd announce/web-hero && python3 -m http.server 8731    # then open http://127.0.0.1:8731/demo.html
```

- `earth-globe.js`: the dot globe as one ES module, plain WebGL, no dependencies (about 10 KB). `mountEarthGlobe(canvas, land)` returns `{ destroy(), settle(rotation), rotation, time }`.
- `land.js`: the land dots, a copy of `announce/film/assets/land.js` (Natural Earth 1:110m, public domain). It sets `window.RTW_LAND`.
- `demo.html`: the hero laid out as in the film, at desktop, tablet and phone widths. `demo.html?still` draws one settled frame.

Behaviour: the globe turns slowly, and clusters of dots light up over the first six seconds. Dragging turns it and it eases back to its spin. The canvas is transparent, pauses when off screen or in a hidden tab, caps at 2× pixel density, and draws a single still frame under `prefers-reduced-motion`. On touch screens a vertical swipe still scrolls the page.

## Style, taken from the film

| Token | Value | Used for |
| --- | --- | --- |
| Night gradient | `#0d1530` at the top, `#1c2850` at 55%, `#3a4674` at the bottom | Page and hero background |
| Cream | `#f4f1ea` | Headings, body text, button fill |
| Mist | `#c9cfdf` | Secondary text |
| Ink | `#0b1020` | Text on a cream button |
| Dot | `#8fa6d6` | Unlit land dots, quiet lines and borders |
| Lit | `#ffb056` | Lit dots: the one warm accent, for "being built" and active states |
| Clawd | `#cc7d5f` | The mascot only, if Justin clears its use |

- Type: Inter. Headline weight 700, letter-spacing -0.04em, line-height 1, about 7.8% of the viewport width (150 px at 1920). Body 400. Button 700.
- Button: cream fill, ink text, 12 px radius, no border.
- Layout: text on the left starting about 6.9% in, the globe large on the right and allowed to run off the edge.
- Studio scenes in the film use a second, light palette (warm paper `#ece8e1`, near-black text). It suits "how it works" sections if the page needs a lighter break.

## Not checked

Only headless Chrome with software rendering. Not yet run on a real phone or in Safari.

## These files are a build input

`site/build.mjs` reads `earth-globe.js` and `land.js` from this folder and inlines them into the waitlist page. The build stops if `earth-globe.js` gains an `import`, stops exporting `mountEarthGlobe(canvas, land)`, or contains the text `</script`. `land.js` must keep setting `window.RTW_LAND`. Tell the session that owns `site/` before changing any of that.
