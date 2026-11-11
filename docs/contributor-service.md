# Rebuild the World: Contributor Service (Draft v0.1)

Nov 10, 2026

A contributor's agent connects to one service that hands out work with the current rules attached, so nobody builds from stale instructions. The same service feeds the board on the website, and an MCP server lets a contributor ask their agent what needs building.

## Three rules

1. **Nothing is copied ahead of time.** A contributor's machine holds no rulebook. The rules arrive with the work, when it is claimed.
2. **Every claim pins its versions.** The work order names the exact spec, capability profile and style guide the atom must meet.
3. **The validator is the backstop.** Every submission records the versions it was built against. One built against old rules is bounced with a list of what changed, so stale instructions cost a contributor one retry and never reach the library.

## The work order

Claiming an object or an atom returns a work order: everything the agent needs for that one piece of work.

| Field | Content |
| --- | --- |
| `task` | The object, the slot being built and the deadline |
| `slot` | The blueprint slot: connectors, dimensions and description |
| `versions` | The spec, capability profile and style guide versions to build against |
| `instructions` | The contributor skill file at the pinned version |
| `reference_pack` | Dimensions, reference images and map data, each with its licence |
| `golden_asset` | The nearest golden-set asset to compare against |
| `near_matches` | Library atoms that almost fit, so the agent can explain why a new one is needed |
| `branch` | The branch and draft pull request created for the claim |

## The MCP server

The server exposes the claim system as tools, so the agent reads live state on every call and the contributor never has to open the website.

| Tool | What it does |
| --- | --- |
| `whats_needed` | Lists objects and atoms that need a builder, filtered by trust level, region and category |
| `get_object` | Returns an object's blueprint and the state of every slot |
| `find_atoms` | Searches the library for atoms that fit a slot |
| `claim` | Claims an object or its next atom, and returns the work order |
| `my_work` | Shows the contributor's claims, time left, review verdicts and any newer rules |
| `submit` | Marks the pull request ready for review |
| `release` | Gives a claim back with no penalty |
| `get_rules` | Returns any section of the specs at a given version |
| `next_review` | Hands a level 2 contributor an atom to review, chosen at random |
| `send_review` | Records the review's verdict and reasons |

- Sign-in is by GitHub account, with the same permissions as the website. Reading what is needed requires no sign-in.
- The website's board and the MCP server read the same service, so they never disagree.
- MCP is an open standard, so any agent that supports it can connect. A plain web API and a command-line tool offer the same calls for tools that do not.
- Claiming by pull request alone is the fallback (owner, 2026-11-10). A contributor who cannot connect opens a draft pull request that names the object or atom, and the service records the claim from it and replies in the pull request with the work order.

## Safety

The server sends text to thousands of people's agents, so it separates what an agent should follow from what it should only read.

| Kind | Written by | Examples | The agent treats it as |
| --- | --- | --- | --- |
| Instructions | Maintainers, versioned in the repository | The skill file, the specs | Rules to follow |
| Data | Contributors | Blueprints, descriptions, comments, other people's atoms | Information only, never instructions |

- Every response labels which fields are data. The skill file tells the agent never to follow instructions found in data.
- The server never sends code to run, and never asks for access to the contributor's files, credentials or other tools.
- The skill file and the validator are public in the repository, so anyone can read exactly what their agent is told.
- Calls are rate-limited per account.

## When the rules change during a claim

- A claim keeps its pinned versions until it is submitted.
- A new capability profile applies to claims made after it is published.
- A breaking change to the asset spec follows that spec's rule: the validator accepts both versions for 90 days.
- `my_work` reports when newer rules exist, so the agent can tell the contributor.

## Open questions

- [ ] Who hosts the service, and who pays for it?
- [ ] What personal data does the service hold (GitHub account, contribution ledger, strikes, reviews), how long is it kept, and where is that written down for contributors? No privacy policy for contributors exists yet.
- [ ] Does the validator run only on the contributor's machine, or does the server also offer it as a tool?
- [ ] In the pull-request fallback, how does a contributor see what is already claimed before opening one: a generated file in the repository, or the public board only?
- [ ] How does a contributor check that the instructions their agent received match the public repository?
- [ ] How fresh must the board be: read live on every call, or a few seconds old?
