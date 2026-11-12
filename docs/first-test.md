# The first test: one house in Oshiage, built by two agents

Nov 12, 2026

The test asks one question: do atoms built by different agents, each working only from a task, fit together? Nothing in the project has answered it yet.

Changed on 2026-11-12: Hermes claims the house and sends its three atoms and the assembly as one bundle, in one pull request (claim spec, "Building in bulk"). Before that the plan was three pull requests, a maintainer's merge, then the house.

## What gets built

The walls of a two-storey house, 5.3 m by 7.3 m, from five atoms. It dresses one real building in Oshiage 2, Sumida, Tokyo (`plateau:bldg_3ca6c476-db0e-4d4c-837c-b5ede5c8654a`, 5.29 m by 7.39 m in the source data) to accuracy level A1. There is no roof in this test.

| Atom | Task | Builder | State |
| --- | --- | --- | --- |
| Corner post | `task_bld_corner_post_01` | Claude Code, on the maintainer's Mac | Built, passes the validator |
| Door module | `task_bld_door_bay_01` | Claude Code, on the maintainer's Mac | Built, passes the validator |
| Plain wall module | `task_bld_wall_panel_01` | Hermes, on the owner's PC | Open; reserved by a claim on the house |
| Window module | `task_bld_window_bay_01` | Hermes | Open; reserved by a claim on the house |
| Door leaf | `task_bld_door_leaf_01` | Hermes | Open; reserved by a claim on the house |
| The house | `task_bld_house_shell_01` | Hermes | Open. Claiming it reserves the three atoms above |

The house is a ring of modules on each storey, so its last joint closes a loop. That is the joint that measures whether one agent's wall meets the other agent's corner post.

## Setting up the PC

Hermes can do these steps itself: the start prompt in `docs/first-test-prompt.md` covers them and the build. The steps are listed here for doing them by hand.

1. Install Git, Git LFS, Node 20 or later, and Blender. Check that `git lfs version`, `node --version` and `blender --version` each answer in a terminal. If `blender` is not found, add Blender's folder to `PATH`.
2. Clone the repository and fetch its large files:
   ```sh
   git clone https://github.com/JustinPerea/rebuild-the-world.git
   cd rebuild-the-world
   git lfs pull
   ```
3. Install the validator's one dependency:
   ```sh
   cd validator
   npm install
   cd ..
   ```
4. Check the tools run before involving an agent:
   ```sh
   node --test validator/test/
   node --test mcp/test/
   node validator/cli.mjs assets/bld/bld_corner_post_01 --task tasks/task_bld_corner_post_01.json
   ```
   The last command should end with `OK: 14 passed, 0 failed, 4 skipped`.
5. Add the server to Hermes. `mcp/README.md`, under "Connect Hermes", has the exact entry for the Hermes config file. Use the stdio form, set `--as` to a handle for this agent, and leave the workspace at its default, the clone's `assets/` folder. Leave `--trust` at its default of 0: a new contributor may hold one object, and the house is one object. Reload MCP servers in Hermes.

Neither tool has been run on Windows yet. If a step fails there, that is a finding: write it down in `feedback/`.

## What to ask Hermes

The full start prompt is in `docs/first-test-prompt.md`. In short: set up, claim the house, build its three missing atoms with Blender scripts, pass the validator and submit each, write the house's assembly and submit it, open one pull request for all four, and leave a feedback note for each finding.

Hermes should work from the work order and the `get_rules` tool. It may read `skill/` and the two finished atoms under `assets/bld/`, which the instructions point to. The test is weaker if it reads the other docs directly, because the question is whether the work order is enough.

## What comes back

- **One pull request** holding the three atoms and the house's assembly, naming the four tasks.
- **Feedback notes** in `feedback/`, one finding per file, following `feedback/README.md`. A note is information about the specs. It cannot change a spec or approve anything.

Hermes writes the assembly manifest in the same run, and the validator's Assembly check measures the loop before anything is merged. When the pull request merges, a maintainer sets `"state": "Merged"` in the four task files.

## What counts as a result

| Question | How it is answered |
| --- | --- |
| Can an agent build a passing atom from a work order alone? | The validator report on each pull request, and how many tries it took |
| Do atoms from two agents fit? | The Assembly check on the house: every joint mates, including the ones that close each ring |
| Were the instructions enough? | The feedback notes |
| Does it look like a house wall? | A picture. The validator cannot judge this |

## Known limits of this test

- The materials are flat trial values with no textures, so texture rules are not tested.
- The connector frames are stated in the tasks. The test shows whether agents can build to a stated frame, which is the mechanism the spec relies on. It does not test agents agreeing on a frame by themselves.
- Window and door positions are invented. The source data has no facades.
- One reviewer step is missing: nothing but the validator checks a submission.
- The bundle path in the server was written on 2026-11-12 and has been run only by its own tests. If the server gets in the way of the build, that is a finding too.

## The block survey

A second run, separate from the house: Hermes writes one facade plan for each of the 150 buildings in the start block, and the plans are tallied to find which bays the block needs most. It needs only Git and Node. The format is in `survey/README.md` and the start prompt in `docs/survey-prompt.md`. The plans are typical facades chosen by the builder, since the data pack holds no picture of any facade.
