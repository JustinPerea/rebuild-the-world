# Implementation notes

## MCP revision

Built against the specification revision **2026-07-28** (fetched from modelcontextprotocol.io on 2026-11-11: transports, stdio, Streamable HTTP, versioning and compatibility, tools, schema). That revision removed the `initialize` handshake and sessions: every request carries `_meta["io.modelcontextprotocol/protocolVersion"]`, and `server/discover` reports what the server supports. The task asked for `initialize` and `notifications/initialized`, and the Hermes reference says its default (`protocol: auto`) tries the `initialize` handshake first. So the server serves both eras, chosen per request: a request with the modern `_meta` is handled statelessly; anything else is handled as a legacy request. The legacy shape was checked against the 2025-11-25 lifecycle page.

Choices where the spec leaves room:

- No `initialize` ordering is enforced. A client that calls `tools/list` before `initialize` is answered. The 2025-11-25 text says clients "should not" do that; refusing would only break lenient clients.
- `initialize` echoes the client's version when it is one of 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05, and otherwise answers 2025-11-25. A request for 2026-07-28 through `initialize` also gets 2025-11-25.
- A modern request with an unknown version gets -32022 with the supported list; HTTP status 400.
- Over HTTP, a modern request must carry `MCP-Protocol-Version` and `Mcp-Method` (and `Mcp-Name` for `tools/call`) matching the body, else 400 with -32020. A legacy request is not required to carry them. If an `MCP-Protocol-Version` header is present and unknown, 400 with -32022.
- Unknown method: -32601, with HTTP 404 for a modern request (the spec says 404) and 200 for a legacy one.
- Legacy JSON-RPC batches are accepted over both transports. The current spec has none; accepting them is harmless.
- `Mcp-Session-Id`, `Last-Event-ID` and GET streams are ignored or answered 405, as the 2026-07-28 page says for older clients.
- Besides `Origin`, the HTTP server also checks `Host` against loopback names, which blocks DNS rebinding where the client sends no `Origin`. The spec only requires `Origin`.
- Tool results have no `structuredContent`; the envelope is one JSON text block. Sending both would double the tokens for clients that forward both.
- Argument validation failures are returned as tool results with `isError: true` (so the agent can correct itself), not as JSON-RPC errors. Unknown tool names are JSON-RPC -32602.
- Tool calls run one at a time through a queue, because the files have no locking.
- `ttlMs` is 0 on `server/discover` and `tools/list`. Nothing is cached.

## Where the specs were silent or unclear

1. **Task file shape.** `task.example.json` has five fields. The service spec lists work-order contents but no file format. The shape in `README.md` is mine. Fields beyond the task's brief: `region`, `mating_dimensions_m`, `golden_asset`, `depends_on`, `state`, `asset_id`.
2. **How the server learns a task is Merged.** The server does not run git, so it cannot see a merge. A task is Merged only if its task file or claim file says `Merged`; a maintainer or a script sets it. `depends_on` unlocks on that. The README says so.
3. **"Merged atoms under `assets/`".** The default workspace is `assets/` itself, so a half-built atom sits in the same folders as merged ones. `find_atoms` skips any folder whose `asset.json` `task_id` belongs to a claim in state Claimed, In review or Changes requested. Anything else under `assets/` with `asset.glb` and `asset.json` counts as merged. `mat/` and `obj/` are skipped. Molecules (`molecule.json`) are not searched.
4. **Mating dimensions on an atom.** The fit rules compare "mating dimensions", and the registry names them per type, but no spec says where an atom records their values. `find_atoms` reads `mating_dimensions_m` in `asset.json`, top level or on a connector entry, and reports rule 2 as "unchecked" when it is absent. The same applies to the task field of that name.
5. **Rule 4 (description).** Not scriptable; always "unchecked", for the agent to judge.
6. **What counts as a "near match".** Not defined. Mine: at least one rule passed, and one or two rules failed. "fits" means no failed rule and at least one passed rule. Scale uses the validator profile's `scale_tolerance` (2%) per axis in the order width, height, depth; mating uses `mating_tolerance_m` (1 mm). Both are read from `validator/profile-1.json`.
7. **Pinned versions.** The spec says a claim pins the spec, profile and style guide versions. I pin the `contract`, `profile` and `look` layers of `spec.json` with their version strings (`v0.4`). The server holds only the current text of each document, so after a version bump it cannot serve the pinned text; `get_rules` says so. A real service would need old versions stored.
8. **Claim states.** `spec.json` `task_states` has six; a claim file adds `Released`, which is a claim state, not a task state (the task goes back to Open). An expired claim is not rewritten on disk; expiry is computed on every read.
9. **Release from In review.** "A contributor may release a task at any time" is taken literally, so release works in Claimed, In review and Changes requested.
10. **Pausing and extending the clock.** In review ignores `expires_at`. The 72-hour resubmit window and the one extension are not implemented (no tool for an extension exists in the table, and nothing sets "Changes requested"). Warnings at 36 hours and so on are listed in the work order, not sent.
11. **Trust level.** No ledger exists, so `--trust` sets it (default 0). Objects-at-once counts distinct `object_id`s among active claims, or the task id when there is none. "Open pull requests awaiting review" is counted as claims In review. The branch and draft pull request that the spec says claiming creates are not created: the server does not run git, so `claim` returns a suggested branch name and describes the steps.
12. **Region filter.** Tasks without a `region` count as `universal`. The service spec says "filtered by trust level, region and category" without saying how a contributor's region is known; here it is a query argument.
13. **`submit` extra checks.** Before running the validator it refuses an asset whose folder name differs from the task's `asset_id`, or whose `asset.json` `task_id` differs from the claim. Neither is in the spec; both stop one task's asset being filed against another. If `asset.json` has no `task_id`, the validator's Metadata check reports it.
14. **Validator input.** `validate(dir, { task, registry, library })` gets the normalised task object (with `size`, `dimensions_m`, `required_connectors`), the repo's `registry/connectors.json`, and the repo's `assets/` as the library, even when the asset is in another workspace. The registry currently has no types, so a real asset using a connector will fail the Connectors check until types are registered.
15. **Submit result when the validator fails.** Returned as a normal result (`isError: false`) with `instructions.verdict: "FAILED"`. The call worked; the asset did not pass. A skipped check is reported as skipped, never as passed.
16. **Feedback note.** The `<agent>` part of the file name is `agent`, defaulting to the handle lowercased with other characters turned into hyphens. The date is UTC. `Agent and model:` is filled as `<agent>, <model>`. A test compares the note's headings with the template block in `feedback/README.md`, so a change to the template fails the test.
17. **Paths in files.** Claim files hold the asset folder name and the validator summary, never an absolute path. Responses can name the workspace path, since that is the agent's own machine.
18. **`get_rules` document names.** Matched, ignoring case and punctuation, against the layer id, the file name without extension (`asset-spec`), the layer name, and the repo path. Only documents listed in `spec.json` `layers` can be read, which also keeps reads inside `docs/`. Heading match: exact, then prefix, then substring; a section runs to the next heading of the same or a higher level and includes its subsections.
19. **`next_review` and `send_review`** return an error result (`isError: true`) saying "Not available in the local test.", so an agent does not take it for a success.
20. **Skill file.** Read from `skill/contributor-skill.md` on every claim. It does not exist yet, so the work order carries the notice instead, and points the agent at `get_rules`.

## Not verified

- **Windows.** Nothing was run on Windows. Paths use `node:path` throughout, `file://` URLs for the validator import come from `pathToFileURL`, no shell is used, and stdio output uses `\n` line ends as the stdio spec says. Untested there: the symlink check in the tests (skipped when the OS refuses symlinks), `fs.renameSync` over an existing claim file while another process holds it open (antivirus or an editor can make Windows refuse), case-insensitive path comparison inside `submit`, and a Hermes-launched stdio process on Windows. Node on Windows closes the server when Hermes closes stdin; that was not observed.
- **Node 20.** The tests ran on Node 22 only. The `test/index.js` shim follows the validator's, but Node 20's folder scan was not run.
- **Hermes.** The YAML follows the config reference but no Hermes instance connected to this server. Hermes may call `server/discover` first (`protocol: stateless`) or `initialize` first (`auto`); both are covered by tests with a hand-written client, not with Hermes.
- **gltf-validator.** The temp repo in the tests has no `node_modules`, so File validity is SKIP there. One manual run with the validator's `node_modules` linked in gave PASS for it.
- **Real-world use of the work order.** No agent has built an asset from one. The skill file does not exist yet.
- **Concurrent servers.** Two server processes on the same repo can race on a claim file: there is no lock across processes.
