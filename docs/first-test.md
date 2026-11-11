# The first test: one house in Oshiage, built by two agents

Nov 11, 2026

The test asks one question: do atoms built by different agents, each working only from a task, fit together? Nothing in the project has answered it yet.

## What gets built

The walls of a two-storey house, 5.3 m by 7.3 m, from five atoms. It dresses one real building in Oshiage 2, Sumida, Tokyo (`plateau:bldg_3ca6c476-db0e-4d4c-837c-b5ede5c8654a`, 5.29 m by 7.39 m in the source data) to accuracy level A1. There is no roof in this test.

| Atom | Task | Builder | State |
| --- | --- | --- | --- |
| Corner post | `task_bld_corner_post_01` | Claude Code, on the maintainer's Mac | Built, passes the validator |
| Door module | `task_bld_door_bay_01` | Claude Code, on the maintainer's Mac | Built, passes the validator |
| Plain wall module | `task_bld_wall_panel_01` | Hermes, on the owner's PC | Open |
| Window module | `task_bld_window_bay_01` | Hermes | Open |
| Door leaf | `task_bld_door_leaf_01` | Hermes | Open |
| The house | `task_bld_house_shell_01` | Hermes | Locked until the five atoms are merged |

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
5. Add the server to Hermes. `mcp/README.md`, under "Connect Hermes", has the exact entry for the Hermes config file. Use the stdio form, set `--as` to a handle for this agent, and leave the workspace at its default, the clone's `assets/` folder. Add `--trust 2`: trust level 0 allows two submissions awaiting review, so the third task could not be claimed before one of the first two was merged. Reload MCP servers in Hermes.

Neither tool has been run on Windows yet. If a step fails there, that is a finding: write it down in `feedback/`.

## What to ask Hermes

The full start prompt is in `docs/first-test-prompt.md`. In short: set up, then claim each open task, build it with a Blender script, pass the validator, submit, open a pull request, and leave a feedback note for each finding.

Hermes should work from the work order and the `get_rules` tool. It may read `skill/` and the two finished atoms under `assets/bld/`, which the instructions point to. The test is weaker if it reads the other docs directly, because the question is whether the work order is enough.

## What comes back

- **Pull requests**, one per atom, each naming its task.
- **Feedback notes** in `feedback/`, one finding per file, following `feedback/README.md`. A note is information about the specs. It cannot change a spec or approve anything.

After the three atoms are merged, a maintainer sets `"state": "Merged"` in their task files, which unlocks the house. Hermes then writes the assembly manifest, and the validator's Assembly check measures the loop.

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
