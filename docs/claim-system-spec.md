# Rebuild the World: Claim System Spec (Draft v0.1)

Nov 10, 2026

## Purpose and scope

The claim system gives every task exactly one active owner and returns it to the pool when that owner goes quiet. It covers how tasks are claimed, how long a claim lasts, who may claim what, how submissions are reviewed, and what happens on abuse.

It judges the submitted output, never the process. The project cannot verify which model or instructions a contributor used, so no rule depends on it.

These need their own specs and are only referenced here:

- **Asset spec:** units, scale, pivots, connector points, level-of-detail tiers, file formats.
- **Art style guide:** the agreed visual target, with reference renders.
- **Contributor skill file:** the instructions a contributor's model follows, including its self-check.
- **Licensing and data-source policy:** what contributors and the project may legally use.

## Task model

A task is one reviewable unit of work, small enough to finish inside a single claim. The coordinator creates tasks and splits anything larger than size L, so nobody claims a city or a district.

| Size | What it is | Examples |
| --- | --- | --- |
| S | One asset | A tree variant, a car door, a street light |
| M | A kit of related assets | A facade module set, a wheel and axle set |
| L | An assembly built from merged parts | A complete vehicle, a full building |

Each task record carries:

- Task ID, title, size, and region (or "universal" for assets used everywhere).
- The asset spec version and style guide version it must meet.
- Dependencies: the tasks that must be merged first.
- A reference pack: dimensions, reference images, and map data where relevant.
- An acceptance checklist the reviewer scores against.
- The minimum trust level needed to claim it.

A task stays locked until every dependency is merged. An L task for a sedan opens only after its wheel, door and chassis tasks are in the library.

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

1. Claiming creates a branch and a draft pull request automatically.
2. The window is the deadline for marking the pull request ready for review.
3. A contributor may extend once per claim, and only if the branch has at least one commit.
4. A contributor may release a task at any time with no penalty.
5. At expiry the task reopens. The branch and draft pull request stay linked to the task, so the next claimant can continue from them.
6. The clock pauses while a submission waits for review.
7. After "changes requested", the contributor has 72 hours to resubmit before the task reopens.
8. A contributor whose claim expired cannot reclaim the same task for 24 hours.

## Trust levels

New accounts can do little damage: they hold one claim at a time, on small starter tasks only. Limits widen as merged work accumulates.

| Level | How to reach it | Concurrent claims | Task sizes | Open pull requests awaiting review |
| --- | --- | --- | --- | --- |
| 0 New | GitHub sign-in and licence agreement accepted | 1 | S, starter-tagged only | 1 |
| 1 Contributor | 3 merged tasks | 2 | S and M | 2 |
| 2 Trusted | 15 merged tasks, with 70% or more approved on first review | 3 | S, M and L | 4 |
| 3 Maintainer | Invited by project leads | 5 | All, plus review rights | No cap |

- Landmark and other high-profile tasks require level 2.
- A suspension drops the contributor one level.
- Every merged task is recorded against the contributor's account, with its size and date. This ledger supports credit now and any reward or revenue-sharing scheme later.

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
- [ ] Which model does the review, and who pays for its usage?
- [ ] Is 100 active contributors the right region gate, and who picks the next region?
- [ ] Which licence do contributors agree to at sign-up?
- [ ] If the project ever earns money, how are contributors paid? This needs deciding before launch, because it shapes the licence and the contributor agreement, and it raises the incentive to game the review.
