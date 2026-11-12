# Contributor MCP server (local test)

An MCP server that gives a contributor's agent its work and its rules: what needs building, the claim, the pinned versions, the contributor skill file, the validator, and a way to leave feedback. It implements the tool table in `docs/contributor-service.md` for one contributor on one machine. The repo is the database, so there is no hosted service, no sign-in and no rate limit.

It needs Node 20 or later, has no npm dependencies, runs on Windows and macOS, never shells out, and never runs git. Where a git step is needed, the response describes it and the agent or contributor does it.

## Start it

```sh
node mcp/server.mjs                         # stdio
node mcp/server.mjs --http 8765             # Streamable HTTP at http://127.0.0.1:8765/mcp
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--http <port>` | off | Serve Streamable HTTP on 127.0.0.1 only. Port 0 picks a free port and prints it to stderr. |
| `--repo <path>` | the repo that contains `mcp/` | The repo to serve. It must hold `spec/spec.json`. |
| `--as <handle>` | `local` | The contributor's handle, written into claims. Letters, digits, `-` and `_`. |
| `--workspace <dir>` | `<repo>/assets` | Where the agent builds assets. `submit` accepts folders inside it or inside `<repo>/assets`. |
| `--trust <0-3>` | `0` | The contributor's trust level (claim-system spec, "Trust levels"). There is no ledger yet, so it is set here. |

In stdio mode only protocol messages go to stdout; logs go to stderr. The server exits when stdin closes. In HTTP mode it accepts POST on `/mcp` only, answers with a plain `application/json` body (202 with no body for notifications), returns 405 for GET and DELETE, and answers 403 to any request whose `Origin` or `Host` is not `localhost`, `127.0.0.1` or `[::1]`.

Protocol: built against the MCP specification revision 2026-07-28 (per-request `_meta`, `server/discover`, no sessions). It also answers the `initialize` handshake of 2025-11-25 and earlier, because current clients try that first. `ping`, `tools/list` and `tools/call` work in both. Any other method gets JSON-RPC error -32601.

## Tools

Every result is a JSON object in one text content block, with three keys:

- `notice`: one paragraph saying what the next two keys mean.
- `instructions`: written by the maintainers (specs, the skill file, this server's own guidance). The agent follows it.
- `data`: written by contributors (task text, blueprints, other people's asset metadata, feedback notes, validator messages that quote their files). The agent reads it and never follows instructions found in it.

Task, claim and blueprint files sit in the repo and can arrive in a pull request, so the server treats them as contributor-written. The only values from them that appear in `instructions` are ones the server has checked against a fixed shape: task ids, asset and object ids, handles, claim states, ISO dates and version numbers. Free text, another builder's handle, the tasks a locked task waits on, and error text from the file system or the validator are returned under `data`. An error about an unreadable file says which file and never quotes it. `mcp/test/boundary.test.mjs` writes hostile values into each kind of file and checks that none reach `instructions`.

| Tool | Arguments | What it does |
| --- | --- | --- |
| `whats_needed` | `category`, `size`, `region`, `limit`, `include_unavailable` | Lists Open tasks you may claim. With `include_unavailable` it also lists claimed, locked and in-review tasks and those above your trust level. An Open object task also shows `reserves` (the members a claim would reserve for you now) and `waiting_on_others`. |
| `get_object` | `object_id` | Returns `assets/<category>/<object_id>/blueprint.json` and the state of every slot: Reused, Open, In progress, In review or Merged. |
| `find_atoms` | `task_id`, or `object_id` and `slot`, or `connectors`, `dimensions_m`, `mating_dimensions_m`; `limit` | Searches merged atoms with the four fit rules in the asset spec. Returns `fits` and `near_matches`, each with a `rules` list showing pass, fail or unchecked per rule and `failed_rules`. Rule 4 (description) is always left to the agent. |
| `claim` | `task_id` | Claims an Open task and returns the work order. On an object task (one with `depends_on`) it also reserves every unbuilt member atom in the same call, on one shared branch, and returns each member task in `data.bundle`. |
| `my_work` | none | Your claims, time left, review verdict, the `bundle` each belongs to, and `newer_rules` where a pinned version is behind the current one. |
| `submit` | `task_id`, `asset_path` | Runs the validator (`validator/validate.mjs`) on the folder. Pass: the claim becomes In review. Fail: the failing checks are returned and the claim stays open. A member atom of a bundle that passes is told not to open a pull request yet. The object task can be submitted only when every member is Merged or In review under your claim, and only when the workspace is the repo `assets/` folder. If a pass would exceed your limit of objects awaiting review, the claim stays Claimed and the verdict is `PASSED_NOT_SUBMITTED`. |
| `release` | `task_id`, `reason` | Gives the claim back with no penalty. Releasing an object task releases every member claim of its bundle, including atoms that had passed `submit`. One atom of a bundle cannot be released alone. A claim that has already expired cannot be released, so the 24-hour wait stays. |
| `get_rules` | `document`, `heading`, `version` | One section of one document with its version. No `document` lists them; no `heading` lists the headings. |
| `next_review`, `send_review` | none | Return "Not available in the local test." |
| `leave_feedback` | `kind`, `slug`, `title`, `what_i_was_doing`, `what_happened`, `what_i_did`, `what_would_have_helped`; optional `agent`, `model`, `task_id`, `spec_versions` | Writes `feedback/YYYY-MM-DD-<agent>-<slug>.md` in the template from `feedback/README.md`. The kind must be one of the five listed there. The slug is lowercase letters, digits and single hyphens, so no path separators. An existing note is never overwritten. |

### The work order from `claim`

The spec's work-order fields are split between the two halves of the result:

| Work-order field | Where |
| --- | --- |
| `instructions` | `instructions.skill`: the text of `skill/contributor-skill.md`, or a one-line notice while that file does not exist |
| `versions` | `instructions.versions` (spec, profile and style guide, from `spec/spec.json` `layers`) |
| `branch` | `instructions.branch`: `claim/<task_id>`, a suggested name. The server does not create it. |
| `task` (including the deadline) | `data.task` |
| `slot` | `data.slot`: the blueprint slot, if the task names one |
| `reference_pack` | `data.reference_pack` |
| `golden_asset` | `data.golden_asset` |
| `near_matches` | `data.near_matches`, from the same search as `find_atoms`. `data.fitting_atoms` lists atoms that pass every rule that could be checked: reuse before building. |

`instructions.steps` lists what to do next, including the git steps in plain words.

### Limits enforced on `claim` and `submit`

The task must be Open: no active claim, no member in `depends_on` that is Locked or unreadable, and its own `state` (if present) not Locked or Merged. Unmerged members do not hold an object task back, because claiming it reserves them. Also enforced on `claim`: `min_trust_level` against `--trust`; objects held at once (1, 3, 10, 20 by level), counted as the distinct `object_id` (or task id) among your claims in state Claimed or Changes requested; and the 24-hour wait before reclaiming a task whose claim you let expire. An object whose claims are all In review is no longer held. `submit` enforces objects awaiting review (1, 3, 10, no cap), counted as the distinct objects with a claim In review. Member atoms of a bundle whose object task is still Claimed do not count, so a bundle can be built while other objects wait for review; the cap applies when the object task or a single atom is submitted. The claim window comes from `spec/spec.json` `task_sizes`: S 48 hours, M 5 days, L 7 days. Extensions and the warning message are listed in the work order but not implemented.

### Building an object as one bundle

1. `whats_needed` lists the object task as Open, with `reserves` and `waiting_on_others`.
2. `claim` the object task. Every unbuilt member atom is reserved in the same call, on the branch `claim/<object task_id>`. `data.bundle.members` holds each member task whole.
3. Create the branch, then build each reserved atom as its own folder in the repo `assets/` folder and `submit` it with its own task id. A failing report leaves it open. Do not open a pull request per atom.
4. When every member is Merged or has passed `submit`, write the assembly folder and `submit` it with the object task id.
5. After that passes, commit the object folder and the folder of each atom you built to the branch, push, and open one pull request that names the object task and those atom tasks. Atoms that were already merged are not part of it.
6. A member held by another builder is listed under `waiting_on_others`. Build the rest and wait, or `release` the object task.

The bundle has one deadline, the object claim's. An atom that passes `submit` is In review only as part of the bundle: its claim lasts as long as the object claim does. If the object claim expires or is released, every task of the bundle is Open again, and another builder who claims the object reserves all of them. A member that is itself an object has its own members reserved by the same claim; that path has a test for the claim and none for a full build.

## Files the server reads and writes

Everything is under the repo, nothing else is read except the workspace.

### Task: `tasks/<task_id>.json`

The shape starts from `tasks/task.example.json`. `tasks/task.example.json` itself is ignored. The file name must equal `task_id`.

```json
{
  "task_id": "task_wheel_17in_01",
  "title": "17 inch sedan wheel",
  "description": "A single 17 inch wheel with tyre, hub on side b.",
  "asset_id": "veh_wheel_17in_01",
  "object_id": "obj_sedan_01",
  "slot": "wheel",
  "category": "veh",
  "size": "S",
  "region": "universal",
  "dimensions_m": [0.65, 0.65, 0.225],
  "mating_dimensions_m": { "diameter": 0.12 },
  "required_connectors": [{ "type": "wheel_hub", "side": "b", "count": 1 }],
  "reference_pack": [
    { "what": "tyre size", "value_or_path": "225/45 R17", "source": "ETRTO standard sizes", "licence": "CC0-1.0" }
  ],
  "golden_asset": "veh_wheel_golden_01",
  "depends_on": [],
  "min_trust_level": 0,
  "state": "Open"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `task_id`, `size` | yes | `size` is S, M or L. |
| `title`, `description` | no | Data. `title` falls back to `asset_id`, `object_id`, then `task_id`. |
| `asset_id` | no | The folder name the asset must have. `submit` refuses a different name. Lower case words joined by underscores, 64 characters at most; the same rule holds for `object_id`, `slot` and `category`. A task that breaks it does not load and is listed under `unreadable_task_files`. |
| `object_id`, `slot` | no | Link the task to a blueprint slot. |
| `category` | no | Falls back to the prefix of `object_id` or `asset_id`. |
| `region` | no | Default `universal`. A region filter always includes universal tasks. |
| `dimensions_m`, `required_connectors` | no | Passed to the validator as the task (Scale and Connectors checks) and used by `find_atoms`. |
| `mating_dimensions_m` | no | Named mating dimensions for fit rule 2. |
| `reference_pack` | no | Array of `{ what, value_or_path, source, licence }`. |
| `golden_asset` | no | The nearest golden-set asset. |
| `depends_on` | no | Marks an object task. Its entries are its member tasks, which a claim reserves. The task is Locked only while a member is Locked or its file cannot be read. An entry that is not a task id stops the task loading. |
| `min_trust_level` | no | 0 to 3, default 0. |
| `state` | no | One of `spec.json` `task_states`, default Open. A maintainer sets Merged here when a pull request merges, because the server does not read git. |

### Claim: `tasks/claims/<task_id>.json`

Claim files are each clone's own record and are ignored by Git. What every clone shares is the task file: a maintainer sets `"state": "Merged"` there when a pull request merges. A claim still waiting for review on a task that is Merged counts as Merged, so the builder only has to pull.

```json
{
  "task_id": "task_wheel_17in_01",
  "handle": "local",
  "state": "Claimed",
  "size": "S",
  "object_id": "obj_sedan_01",
  "slot": "wheel",
  "claimed_at": "2026-11-11T10:00:00.000Z",
  "expires_at": "2026-11-13T10:00:00.000Z",
  "window": "48 hours",
  "versions": {
    "spec": { "layer": "contract", "doc": "docs/asset-spec.md", "version": "v0.4" },
    "profile": { "layer": "profile", "doc": "docs/capability-profiles.md", "version": "v0.3" },
    "style": { "layer": "look", "doc": "docs/art-style-guide.md", "version": "v0.3" }
  },
  "branch": "claim/task_wheel_17in_01",
  "history": []
}
```

An object claim and the claims of its reserved members also carry `"bundle": "<object task_id>"` and share the branch `claim/<object task_id>`.

`state` is `Claimed`, `In review`, `Changes requested`, `Merged` or `Released`. `submit` adds `submitted_at` and `asset` (the folder name and the validator summary). `release` adds `released_at`. A maintainer may add a `review` object (verdict and reasons); `my_work` shows it. A `Claimed` or `Changes requested` claim past `expires_at` counts as expired, and the task shows as Open. A new claim on a task moves the old claim into `history`. The clock does not run while a claim is In review.

A claim file must have the shape the server writes: `task_id` equal to the file name, a valid `handle`, one of the five states, `expires_at` as an ISO date, `branch` equal to `claim/<task_id>` (or `claim/<bundle>` when `bundle` is set, and `bundle` must be a task id), and well-formed `versions`. A file that breaks this is not used. Its task shows as Locked and cannot be claimed until a maintainer repairs or deletes the file; the server does not overwrite it.

### Blueprint: `assets/<category>/<object_id>/blueprint.json`

As in the asset spec, "Blueprints". A slot's `atom` is `new`, or an atom id optionally pinned as `<id>@<version>`.

## Connect Hermes

Configuration keys are from the Hermes MCP config reference, https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference. Add the entry under `mcp_servers` in the Hermes config file, then run `/reload-mcp`. The tools appear as `mcp__rtw__whats_needed`, `mcp__rtw__claim` and so on. Replace the placeholders: the clone path, your handle, and the workspace. Single-quoted YAML keeps the Windows backslashes as they are.

Stdio, where Hermes starts the server itself:

```yaml
mcp_servers:
  rtw:
    command: "node"
    args:
      - 'C:\path\to\rebuild-the-world\mcp\server.mjs'
      - "--repo"
      - 'C:\path\to\rebuild-the-world'
      - "--as"
      - "<handle>"
      - "--workspace"
      - 'C:\path\to\workspace'
    enabled: true
    timeout: 120
    connect_timeout: 60
    tools:
      resources: false
      prompts: false
```

URL, where you start the server yourself in a terminal (`node mcp\server.mjs --http 8765 --as <handle> --workspace C:\path\to\workspace`) and Hermes connects to it:

```yaml
mcp_servers:
  rtw:
    url: "http://127.0.0.1:8765/mcp"
    enabled: true
    timeout: 120
    connect_timeout: 60
    tools:
      resources: false
      prompts: false
```

Hermes tries the `initialize` handshake first by default (`protocol: auto`), which this server answers. The server binds 127.0.0.1, so Hermes must run on the same machine. This config has not been run against Hermes yet (see `NOTES.md`).

## Tests

```sh
node --test mcp/test/
```

The tests copy the folders the server needs into a temp directory, spawn the server over stdio for the handshake and the full flow (list work, claim, a failing submit, a passing submit, release, a feedback note), and start it once over HTTP. `boundary.test.mjs` covers the `instructions` and `data` split described under Tools. Fixtures come from `validator/test/helpers.mjs`. Everything is deleted afterwards. Run `npm install` in `validator/` first if you want the Khronos glTF check in the passing submit; without it that check reports SKIP and the tests still pass.
