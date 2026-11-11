# Earth, Again: vertical cut (9:16)

A copy of `../film/` (draft 9) re-laid out for 1080x1920: Reels, TikTok, Shorts. Same cut, timings and content; only layout and cameras differ. The 16:9 film in `../film/` is the source of truth for content: a change there has to be repeated here by hand.

- Requested by the Good Machines social session on 2026-11-10 (it reported Justin's "Yes post on the rest").
- Safe zone it gave: readable text between y 240 and 1260, x 120 and 900. All text is inside it.
- Cameras use a 50 degree lens and a lens shift (`setViewOffset`) to place each subject; see `CAM` in `compositions/studio.html`.
- Six-screen grid is 2 x 3; trust levels are a list under the staircase; the end card and the "Next" frame are centred stacks.
- Render: `npx --yes hyperframes@0.9.29 render -o .hyperframes/out/vertical-full.mp4`. `renders/` holds the under-10 MB copy.
- Delivered files: `~/Developer/good-machines-social/requests/2026-11-10-earth-again-vertical/`.
