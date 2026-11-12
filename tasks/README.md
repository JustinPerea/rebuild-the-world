# Tasks

Task records the coordinator hands out (claim system spec, "Task model"): ID, title, size (S, M, L), region, spec and style versions, dependencies, reference pack, acceptance checklist, minimum trust level.

One task is one file, `tasks/<task_id>.json`. Its fields are listed in the asset spec under "File shapes", and `task.example.json` is a small example. Claims are written to `tasks/claims/` by the MCP server in `mcp/`.

The six `task_bld_*` files are the first test: five atoms and one molecule for the walls of a two-storey house in Oshiage 2, Sumida, Tokyo.
