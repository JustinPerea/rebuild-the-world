# Review: draft 2 (2026-11-10)

Draft 1 ("The missing piece", one slow pull-back) was rejected as boring. Draft 2 follows Justin's direction:
a hyper-fast montage of the world being built, how contributions work, and one part built up to look realistic.
SPEC.md and STORYLINES.md describe draft 1 and are out of date.

Structure (28.6 s, silent by request)
- 0-2.8 s      Montage: street, blocks, skyline, city, globe; "Let's rebuild the world", one word per cut.
- 2.8-15.4 s   Studio (`compositions/studio.html`): Claim a part -> Build it with your own AI
               (mesh, clay, materials, light, close-up) -> Automated checks review it -> It snaps onto other parts.
- 15.4-18.4 s  Montage: Streets, Blocks, Cities.
- 18.4-28.6 s  Globe, "Nobody can build the Earth", "Anyone can build one part", end card.

Calls made
- The part is a car wheel; it snaps onto a hub with a brake disc. The check names (Scale, Triangle budget,
  Connectors, Materials) are rows of the asset spec's automated checks table.
- The film shows how contributing is planned to work. The claim site and validator do not exist yet.
- End card call to action is a placeholder box and must be replaced before posting.

Checked: `check` passes with 0 errors; a 2 fps strip of the rendered MP4 was looked at. Not watched at speed.
Kept warnings: film_silent (requested), composition_file_too_large, timeline_track_too_dense.

Weakest parts
- 18.4-25 s: the globe section is slow next to the rest.
- City buildings are still plain boxes with window grids.
- The wheel has no environment beyond a plain studio; tread is a bump map, not geometry.

## Draft 3 (2026-11-10): Clawd crews

- Justin asked for Clawd, the Claude Code mascot, as the builders, and supplied two reference images.
  Clawd is built as a 3D block figure from the 12 x 8 pixel grid of the front view, colour #cc7d5f sampled from that image
  (`makeClawdGeo` in both scene files).
- Studio: 7 Clawds walk round the wheel, hop on each check, carry the axle in and jump on the snap.
  City: one rides up on the roof of about half the built buildings; about 140 walk two streets.
- Clawd is Anthropic's mascot. Whether it may appear in a public promo is Justin's call; nothing is posted.
- Checked: `check` 0 errors; a 1.5 fps strip of the render was looked at. Not watched at speed.
- Open: Clawds wash out to pale peach once the studio lights come up; none on the globe or end card;
  "Build it with your own AI" does not name Claude Fable 5.2.

## Draft 4 (2026-11-10): spec and trust levels, 33.6 s

- Justin approved the direction ("looks much better"), asked for the spec and "contribute more, unlock more",
  and lifted the 30 s limit.
- New studio beats: "One spec, so every part fits" (rows from the asset spec: glTF 2.0 in metres, named connectors,
  triangle budgets, shared materials; a 0.68 m dimension line on the wheel, which is its real modelled diameter)
  and "Contribute more, unlock more" (Clawds climb three steps: New / Contributor, 3 merged tasks / Trusted, 15 merged tasks).
- The level numbers are the claim spec's untested starting values, and "Trusted" also needs 70% approved on first review,
  which the film leaves out.
- Globe ending shortened from 7 s to about 5 s before the end card.
- Checked: `check` 0 errors; stills at 13, 15.9, 16.6, 16.8, 17.9, 18.6-22.2, 23.5, 25.2, 27.6, 31.5 s of the pre-retime cut.
  The final render was not watched.

## Draft 5 (2026-11-10): planet teaser, 39.4 s

- After the end card (30.5-33.6 s): four 0.7 s cuts (The Moon, Mars, Jupiter, Saturn), then all four in a row
  under "Next", each tagged "Open task" with a Clawd on top, held 3 s. The film now ends on the teaser, not on the call to action.
- Planets are procedural (drawn textures), stylised, not to scale. No imagery was used.
- Checked: `check` 0 errors; a 3 fps strip of the last 6 s of the render. The rest of this render was not re-watched.
- Open: the planet row sits left of centre; Mars and the Moon read as flat blotches up close.

## Draft 6 (2026-11-10): six-screen grid and cosmic zoom, 55.8 s

Timeline now (global seconds)
- 0-2.8 montage; 2.8-28.8 studio; 28.8-31.8 montage; 31.8-36.9 globe and two lines; 36.9-40 end card;
  40-50 "eventually...?" and cosmic zoom; 50-52.8 four planet cuts; 52.8-55.8 "Next" row.
- Studio (local): claim 0, build 1.8, close-up 5.3, grid 7.6-14.2, checks 14.2, snap 16.8, spec 19, levels 21.4-26.

New
- Grid, "Everyone builds something different": the wheel shot shrinks into the top-left screen, then six screens
  build at once with three Clawds each: Car (wheels, chassis, body), Mount Fuji (rises in steps),
  Eiffel Tower (bottom-up), House interior, Computer, Skateboard (assembled, then a Clawd rides it).
  One renderer draws six viewports; each mini scene is shown at the origin in turn (`renderGrid` in studio.html).
- Cosmos (`renderCosmos` in world.html): black, "eventually...?", the Sun and eight planets, then a log zoom through
  four nested point layers: Solar System, Milky Way, Local Group, the universe. Stylised, not to scale, all procedural.
- Planet teaser now sits on the same near-black background.

Checked: `check` 0 errors; a 1.4 fps strip of the whole render. Not watched at speed.
Weak spots: the six models are simple block models (the car is the weakest); between the Solar System and the galaxy
there is about half a second of almost empty black; Local Group galaxies are small smudges.
Mount Fuji and the Eiffel Tower are real landmarks, drawn generically from memory, not from any map or photo source.

## Draft 7 (2026-11-10): photoreal end results, Maintainer level, 58.4 s

- Grid is now 8.2 s: block builds for 3.7 s ("Everyone builds something different"), then each screen fades to a
  photoreal image ("This is what we're aiming for", with a "Concept images" chip).
- The six images are in `assets/gen/*.jpg`, generated with gpt-image-2 through Justin's Codex subscription (codex-image skill)
  on 2026-11-10. They are AI-generated, not photographs and not project output. Prompts asked for no logos, text or plate text;
  the sheet was looked at once and showed none, but the car and PC were not inspected at full size.
- Trust levels now have a fourth step: Maintainer, "By invitation", "Review work, shape the specs" (one Clawd reaches it).
  `docs/claim-system-spec.md` gained one line to match.
- Times after the studio moved +2.6 s: studio 2.8-31.4, montage 31.4-34.4, globe 34.4, end card 39.5,
  cosmos 42.6, planets 52.6, row 55.4-58.4.
- Checked: `check` 0 errors; stills at 13.6-17.5 and 27.4-30.8 s; a strip of 10-19 s from the render. Not watched at speed.

## Draft 8 (2026-11-10)

- The six concept images were regenerated with gpt-image-2 (Codex), each conditioned on a clean frame of its own block model at 14.05 s (Clawds and label chips hidden for the capture). Camera angle, placement and framing now match, so the fade reads as the same object becoming real.
- Car and skateboard mini scenes recentred so both sit fully inside their screens.
- `check`: 0 errors; same kept warnings as draft 7.
- Open: the generated sedan resembles current production saloons (grille and lamps). Fine as a concept image, but worth a look against the "no recognisable product designs" rule before anything public.

## Draft 9 (2026-11-10)

- End card now carries the chosen name and the call to action, agreed with the brand session: "Earth, Again." / "An accurate 3D Earth, built in the open" / button "Join the waitlist" / goodmachines.ai/earth-again. The sub-line was shortened from the page's lede because 12 words could not be read in the 2.5 s it is on screen.
- The final planets frame also shows "Join the waitlist" and the URL, top right, so the film ends on the call to action.
- The page at that URL is not deployed yet.
- Not changed: the opening hook "Let's rebuild the world", and the titles that still say "part" ("Claim a part", "It snaps onto other parts", "One spec, so every part fits") although the specs now say "atom".
- The waitlist page's build (`site/build.mjs`) shows the newest `.mp4` in `announce/film/renders/`. Render full-size and test files somewhere else (for example `.hyperframes/out/`) and move only the finished, compressed draft into `renders/`.

## After draft 9 (2026-11-10)

- The waitlist page at goodmachines.ai/earth-again is live (checked: it loads and shows the hero and the button; the signup form was not tested from here).
- The social session reports draft 9 was posted on X at @goodmachinesai with Justin's approval, and that he OK'd Clawd, the 16:9 cut and the red concept car.
- A 9:16 cut was made for Reels, TikTok and Shorts in `../film-vertical/` (see its README). Content changes now have to be made in both folders.

