# Start prompt for the block survey

Nov 11, 2026

Paste the text below into Hermes on the PC. It asks for one facade plan for each of the 150 buildings in the start block of Oshiage 2, checked by `tools/survey/survey.mjs`, and then a tally of the parts the plans use. The format is in `survey/README.md`.

The prompt stands alone. It does its own setup, needs no MCP server, no Blender and no `/reload-mcp`, and can be the first thing a new session sees. It can run before or after the three atoms in `docs/first-test-prompt.md`.

```text
You are surveying one city block for an open project called Rebuild the World: a community-built 3D model of Earth made from small reusable parts ("atoms") that snap together. Before anyone builds parts for this block, the project needs to know which parts the block needs most. You find out by writing one facade plan for each of 150 buildings in Oshiage, Tokyo, and counting what the plans use.

The project has each building's outline, height and roof shape from Japan's open city model, and for about half of them a storey count and a usage. It has no picture of any facade. So each plan is your choice of a typical facade for a building of that size, kind and position in Tokyo. Do not look the real buildings up anywhere, and never use Google Maps or Street View: the project bars it. Nothing you write is a record of the real building.

SET UP

1. Check that git and node (20 or later) are installed. If one is missing, tell me which and stop. Do not install software without asking me.
2. If you already have a clone of https://github.com/JustinPerea/rebuild-the-world, go to it, switch to main and pull. If not, clone it into a folder that is not synced by OneDrive.
3. In the clone, set the commit email for this repository only:
   git config user.email "72950107+JustinPerea@users.noreply.github.com"
   The repository is public, so no other email address may appear in a commit.
4. From the clone's root run:
   node --test tools/survey/test/
   Every test should pass. If one fails, keep the exact output, tell me and stop: the tool is what checks your work.
5. Read survey/README.md from start to end. It defines the plan file and every rule the checker applies.
6. Make a branch from main named survey/oshiage-2-start-block.

THE LOOP

Repeat until "next" says done:

1. Run: node tools/survey/survey.mjs next
   It gives you one building: its file name, heights, roof, and each wall's length, facing and the open space in front of it. It also lists the bays that earlier plans used.
2. Decide the building. Use the storey count and usage when the data gives them. When it does not, estimate them from the height and the floor area and mark them "estimated".
3. Write the plan to the file that "next" named.
4. Run: node tools/survey/survey.mjs check
   Fix what it reports and run it again until it passes. "next" will not move on until it does.

How to choose a facade:
- Think about where a person would enter. The entrance usually goes on the wall with the most open space in front ("clear_m"), which is most often the street.
- A wall with less than about a metre of open space faces a neighbour. It is usually plain, or has a few small windows.
- The usage sets the ground floor: a shop or a workshop opens to the street, an apartment building has one shared entrance and the same row of bays repeated on each floor above.
- Reuse a bay from "used_so_far" whenever one fits. Add a new size only when the building calls for it.
- Choose sizes from what you know of ordinary buildings of that kind in Tokyo. The example in survey/README.md shows the file's shape, and its sizes are placeholders.
- A wall with no openings is left out of "facades". Do not list plain walls.
- If the format cannot describe a building, write a skipped plan with the reason and move on. Do not force it.

Plan each building yourself, one at a time. Do not write a program that generates plans: the survey measures what a builder chooses for each building, and rules come later from the tally. A small script that adds up widths for the building in front of you is fine.

Do not stop to ask me between buildings. Progress is the set of plan files, so if you lose your place, run "next" and carry on.

SAVING YOUR WORK

- After the first 10 passing plans, run "node tools/survey/survey.mjs tally" and read it. If nearly every bay is a size of its own, you are not reusing enough: adjust and carry on.
- Then commit the plans and push the branch with:
   git -c credential.interactive=false push -u origin survey/oshiage-2-start-block
   If the push fails because it needs a sign-in, do not sign in and do not stop. Keep working, commit as below, and tell me at the end.
- Commit after every 25 passing plans, and push if the first push worked. Stage files by path: only files under survey/ and feedback/.

WHEN "NEXT" SAYS DONE

1. Run: node tools/survey/survey.mjs tally --write
2. Write feedback notes in the feedback folder, following feedback/README.md: one file per finding, for each rule that was unclear, each thing the format could not express, each fact you wanted from "next" and did not get, and what worked well.
3. Commit the tally and the notes, push, and open a pull request titled "Survey: Oshiage 2 start block". Use "gh pr create" if gh is installed and signed in. If not, give me the link to open it myself. Never merge a pull request.
4. Give me a short report: how many buildings were planned and how many skipped, with the reasons; the three "atoms needed" rows from the tally; the ten most used bays; the list of feedback notes; and anything you could not do.

RULES FOR THE WHOLE RUN

- Change only files under survey/tokyo-sumida-oshiage-2/ and feedback/. Do not edit the tool, the data, the specs or anything else. If the checker looks wrong, write a feedback note, skip that building with the reason "other", and carry on.
- In every plan's "provenance", "author" is "hermes" and "tools" names Hermes with its version and the model you are running on, as your own system reports it.
- If the tool crashes, keep the exact output, write a feedback note, and stop.
- Report what happened as it is, including what failed. A failure you write down is useful. A workaround that hides it is not.
```

## After the run

A maintainer reads the pull request and `TALLY.md`. The tally's most used bays become the next atom tasks, and its three "atoms needed" rows inform whether the stretch spans in `docs/asset-spec.md` are worth building. The other 200 buildings of the region are surveyed with `next --all` once the first 150 have been read.
