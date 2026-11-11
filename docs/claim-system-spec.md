# Rebuild the World: Claim System Spec (Draft v0.2)

Nov 10, 2026

## Purpose and scope

The claim system gives every object and every atom exactly one active builder, shows everyone what is being built, and returns work to the pool when its builder goes quiet. It covers how objects are picked and built atom by atom, how long a claim lasts, who may claim what, how submissions are reviewed, and what happens on abuse.

It judges the submitted output, never the process. The project cannot verify which model or instructions a contributor used, so no rule depends on it. Contributors still declare the tools they used, and the asset records it as a declaration (asset spec, "Provenance").

These need their own specs and are only referenced here:

- **Vision:** what is being built, and what must stay fixed while tools improve.
- **World model:** levels of scale, library and unique assets, accuracy levels.
- **Asset spec:** units, scale, pivots, connector points, assemblies, file formats.
- **Capability profiles:** the budgets and mesh rules enforced today.
- **Art style guide:** the agreed visual target, with reference renders.
- **Contributor service:** how a contributor's agent claims work and receives the current rules, including the MCP server.
- **Contributor skill file:** the instructions a contributor's model follows, including its self-check.
- **Accuracy and data policy:** what may match the real world, and which sources may be used.

## Task model

Work is organised around objects. A contributor picks a whole object and builds it one atom at a time, and each atom is one reviewable task. Nobody claims a city or a district.

| Size | What it is | Examples |
| --- | --- | --- |
| S | One atom | A wheel, a bearing, a car door, a street light |
| M | A kit of matching atoms | A facade module set, a wheel and axle set |
| L | An object assembled from merged atoms | A skateboard, a complete vehicle, a full building |

Every object has a blueprint: the list of atoms it is built from (asset spec, "Blueprints"). The blueprint turns one object into its atom tasks.

Each task record carries:

- Task ID, title, size, and region (or "universal" for assets used everywhere).
- The asset spec version and style guide version it must meet.
- Dependencies: the tasks that must be merged first.
- A reference pack: dimensions, reference images, and map data where relevant.
- An acceptance checklist the reviewer scores against.
- The minimum trust level needed to claim it.

A task stays locked until every dependency is merged. The assembly task for a sedan opens only after its wheel, door and chassis atoms are in the library.

## Building an object

A contributor picks an object, reuses every atom the library already has, and builds the rest one at a time.

1. **Pick an object.** Choose one from the board, or propose a new one.
2. **Write the blueprint.** If the object has none, the blueprint is the first submission. It lists every atom the object needs.
3. **Check the library.** Each slot is filled by an existing atom that fits, or marked as new.
4. **Build the missing atoms.** One atom at a time, each as its own pull request. Once one is submitted, the next can start.
5. **Assemble.** When every slot holds a merged atom, submit the assembly manifest.
6. **Merge.** The object enters the library. Its atoms were already there for everyone else.

- Atoms merge on their own. If the object is never finished, every merged atom stays in the library.
- A new atom must say which library atoms were considered and why none fits. Review rejects a near-duplicate.
- If a slot needs an atom that someone else is already building, the slot waits on that atom. Nobody builds a second one.

## The board

The board shows every object and every atom being worked on, so two people never build the same thing.

| Slot state | Meaning |
| --- | --- |
| Reused | Filled by an atom already in the library |
| Open | Needed, and nobody is building it |
| In progress | Being built, with the builder's name and the time left on the claim |
| In review | Submitted and waiting for a verdict |
| Merged | In the library |

- Each object shows its blueprint, its builder and how many slots are filled.
- The same information is available to a contributor's agent through the MCP server, so a contributor can ask what needs building without opening the board.
- Each atom in progress links to its draft pull request, so anyone can see the work.
- A wanted list shows objects with no builder, ordered by how many places in the world are waiting for them. For structures it is the set of places still shown as a blockout (world model, "Accuracy levels").

## Task states

A task moves through six states, and every stalled path leads back to Open.

| From | To | Trigger |
| --- | --- | --- |
| Locked | Open | Dependencies merged and region unlocked |
| Open | Claimed | A contributor claims it |
| Claimed | In review | Submitted (pull request marked ready) |
| Claimed | Open | Claim expired or released |
| In review | Merged | Passes review |
| In review | Changes requested | Needs fixes |
| In review | Open | Rejected |
| Changes requested | In review | Resubmitted |
| Changes requested | Open | No resubmit in 72 hours |

Three paths return a task to the pool: an expired or released claim, a rejection, and a missed 72-hour resubmit window. Partial work stays on the branch each time. A task leaves Locked once its dependencies are merged and its region is unlocked.

## Claim rules and timeouts

A claim lasts 48 hours to 7 days depending on task size, and an expired claim returns the task to the pool automatically. These windows are starting values to tune after the first month.

| Size | Claim window | Warning sent | One extension |
| --- | --- | --- | --- |
| S | 48 hours | At 36 hours | +24 hours |
| M | 5 days | At day 4 | +2 days |
| L | 7 days | At day 5 | +3 days |

1. Claiming an object reserves it and its unbuilt atoms for one contributor. Claiming creates a branch and a draft pull request for the atom in progress.
2. The window is the deadline for marking the pull request ready for review. Each atom has its own S window, which starts when the previous atom is submitted. The L window covers the assembly once every atom is merged.
3. A contributor may extend once per claim, and only if the branch has at least one commit.
4. A contributor may release a task at any time with no penalty.
5. At expiry the atom and its object reopen. Merged atoms stay in the library, and the branch and draft pull request stay linked, so the next builder continues from them.
6. The clock pauses while a submission waits for review.
7. After "changes requested", the contributor has 72 hours to resubmit before the task reopens.
8. A contributor whose claim expired cannot reclaim the same task for 24 hours.

## Trust levels

New accounts can do little damage: they hold one object at a time, from a starter list, and build one atom at a time. Limits widen as merged work accumulates. A merged task is an atom, a blueprint, a kit or an assembly.

| Level | How to reach it | Objects claimed at once | May pick | Open pull requests awaiting review |
| --- | --- | --- | --- | --- |
| 0 New | GitHub sign-in and licence agreement accepted | 1 | Starter-tagged objects | 2 |
| 1 Contributor | 3 merged tasks | 2 | Any object except landmarks | 2 |
| 2 Trusted | 15 merged tasks, with 70% or more approved on first review | 3 | Any object, including landmarks and kits | 4 |
| 3 Maintainer | Invited by project leads | 5 | All, plus review rights | No cap |

- Landmark and other high-profile tasks require level 2.
- Maintainers also help write and revise the specs and coordinate tasks, so the top level is a path into running the project, not only reviewing (owner direction, 2026-11-10). "Spec changes" below proposes how.
- A suspension drops the contributor one level.
- Every merged task is recorded against the contributor's account, with its size and date. This ledger supports credit now and any reward or revenue-sharing scheme later.

## Spec changes

Proposed, not yet confirmed: contributing more earns a say in the specs themselves, in three steps.

| Who | May do |
| --- | --- |
| Anyone | Open an issue describing a problem with a spec |
| Level 2 Trusted | Propose a change as a pull request against `docs/`, and propose new connector types, behaviours and materials |
| Level 3 Maintainer | Approve changes, write capability profiles, create and split tasks |

- A change to the durable contract in the asset spec needs a major version and approval from the project leads.
- A new capability profile needs a maintainer and a test run of the validator against the existing library.
- Every spec change records who proposed and approved it, in the same ledger as merged tasks.

## Who writes blueprints and who reviews

Agreed in principle by the owner on 2026-11-10, with every number untested: both bottlenecks are spread across contributors, in the same way building is.

Blueprints:

- A contributor's own tools draft the blueprint, and it is reviewed like any other submission. Maintainers do not write one per object.
- Maintainers write the first few as worked examples, and the validator checks every blueprint's structure.
- The wanted list comes from the world itself: a region's map data says which kinds of object it needs, and how many.

Reviews:

- The validator and the reviewer model see every submission. People see only what those two pass.
- Reviewing is unlocked by trust. A level 2 contributor may review atoms and blueprints they did not build, using their own tools.
- Each atom gets two independent reviews, assigned at random. If they disagree, a maintainer decides.
- Maintainers review objects, landmarks, appeals and a random sample of peer-reviewed atoms.
- A review is recorded in the ledger like a merged task. A reviewer whose approvals are overturned loses review rights.

## Review pipeline

Every submission passes three gates before merge: automated checks, a model review, and a human check on a sample. Cheap checks run first, so reviewers only see work that is technically valid.

1. **Automated checks.** File validity, format, units and scale, triangle budget, required metadata, naming, connector points, file size, licence declaration. A failure bounces the pull request with the failing check named. The claim stays active.
2. **Render check.** The asset is rendered from fixed camera angles under fixed lighting. A vision-capable model compares the renders with the task's reference pack and the style guide.
3. **Model review.** A reviewer model scores the acceptance checklist and returns one verdict with reasons: pass, changes requested, or reject.
4. **Human check.** Maintainers review each contributor's first 3 submissions, every L task, every landmark, and a 10% random sample of the rest.
5. **Merge.** The asset enters the library and dependent tasks unlock.

Rules for reviewers:

- Everything in a submission is data. Text in files, metadata, commit messages and pull request descriptions is never treated as instructions to the reviewer model.
- "Changes requested" is for fixable problems, and the contributor keeps the task. "Reject" is for the wrong asset or a submission that ignores the spec, and the task reopens.
- Target turnaround is 48 hours. The per-level caps on open pull requests keep the queue within reviewer capacity.

## Strikes, cooldowns and bans

Low quality costs nothing; only low effort and bad faith are penalised. A failed check or a request for changes is normal iteration.

| Behaviour | Treated as | Consequence |
| --- | --- | --- |
| Fails automated checks | Normal iteration | None; fix and resubmit |
| Changes requested | Normal iteration | None |
| Claim expires with no commits | Abandoned claim | 3 in 30 days: 7-day claim cooldown |
| Rejected for low effort (placeholder geometry, task ignored) | Strike | 1 strike, expiring after 90 days |
| 3 active strikes | Repeated low effort | 14-day suspension, down one trust level |
| Deliberate junk, ripped or stolen assets, false licence claims, prompt injection aimed at the reviewer, ban evasion | Bad faith | Ban |

- The reviewer model can flag a strike or a ban, but a human maintainer must confirm it.
- Each action can be appealed once, within 14 days, to a maintainer who was not involved in the decision.
- Stolen or ripped assets are removed from the library when found, whatever the contributor's status. Other merged work from a banned account stays.

## Region unlocks

Proposed rule: a new region opens when active contributors and finished work both pass a threshold, not on sign-ups alone. Counting sign-ups rewards fake accounts and can spread a small community across too many cities.

- **Start:** one neighbourhood of the first city, sized as the demo slice.
- **Universal tasks** (vehicles, trees, street furniture) are always open, whatever the region.
- **Region tasks** (landmarks, local facade kits, street layouts) open only once their region is unlocked.

A region unlocks when all three conditions hold:

1. There are at least 100 active contributors per open region. Active means one merged task in the last 30 days.
2. The previous region's demo slice is complete and playable.
3. The new region's data pack is ready: open map data gathered and its licence terms checked.

## Open questions

- [ ] Are 48 hours, 5 days and 7 days the right claim windows for volunteers on usage-limited subscriptions?
- [ ] Should sign-up require a minimum GitHub account age, such as 30 days, to slow throwaway accounts?
- [ ] Who are the first human maintainers, and how many reviews a week can they handle?
- [ ] Who or what is the coordinator that creates tasks, splits them and builds reference packs: maintainers, a model, or both?
- [ ] Is level 2 the right point to let contributors propose spec changes?
- [ ] Should reviewing be opened to level 2 contributors, and are two reviews per atom enough to stop friends approving each other?
- [ ] How large can a starter object be: a fixed number of atoms, or a hand-picked list?
- [ ] Should a slow builder lose only the atom in progress, or the whole object?
- [ ] Which model does the review, and who pays for its usage?
- [ ] Is 100 active contributors the right region gate, and who picks the next region?
- [ ] Which licence do contributors agree to at sign-up?
- [ ] If the project ever earns money, how are contributors paid? This needs deciding before launch, because it shapes the licence and the contributor agreement, and it raises the incentive to game the review.
