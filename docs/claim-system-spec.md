# Rebuild the World: Claim System Spec (Draft v0.4)

Nov 12, 2026

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

Work is organised around objects. A contributor picks a whole object and builds it atom by atom, and each atom is one reviewable task. Nobody claims a city or a district.

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

A task stays locked until every dependency is merged or is part of the same bundle ("Building in bulk"). The assembly task for a sedan opens once its wheel, door and chassis atoms are in the library or in its builder's own bundle.

## Building an object

A contributor picks an object, reuses every atom the library already has, builds the rest, and submits the object as one bundle.

1. **Pick an object.** Choose one from the board, or propose a new one.
2. **Write the blueprint.** If the object has none, the blueprint is the first submission. It lists every atom the object needs.
3. **Check the library.** Each slot is filled by an existing atom that fits, or marked as new.
4. **Build the missing atoms.** In any order, without waiting for review. Each is its own asset and passes the checks on its own.
5. **Assemble.** When every slot holds an atom, write the assembly manifest. Sub-assemblies are written first.
6. **Submit the bundle.** The new atoms, the sub-assemblies and the assembly go in as one pull request. When it merges, the object and every atom in it are in the library.

- An atom may also be submitted alone and merges on its own. If the object is never finished, every merged atom stays in the library.
- A new atom must say which library atoms were considered and why none fits. Review rejects a near-duplicate.
- If a slot needs an atom that someone else is already building, the slot waits on that atom. Nobody builds a second one.

## Building in bulk

Proposed on 2026-11-12. The owner said that claiming one atom at a time "would take forever", that people want to turn on a loop, build a lot and get credit for it, and said yes to this being written up. The details and every number here are Claude's and are not confirmed. Nothing in this section has been run.

Three rules of v0.3 made a loop wait: a new contributor built one atom at a time, each atom was its own pull request, and an assembly could not be submitted until its atoms had merged. This version replaces them.

- **The claim is the object.** Claiming an object reserves every slot its blueprint marks as new. Nothing is claimed atom by atom.
- **A bundle is one object in one pull request.** It holds the blueprint if the object had none, the new atoms, any sub-assemblies, and the assembly. The validator checks each asset on its own and the assembly against the atoms beside it.
- **Nothing waits for review.** A contributor builds every atom of an object without stopping, submits the bundle, and starts the next object while the first is in review, up to the limits under "Trust levels".
- **Combined parts go to the library too.** The owner calls a combined part a molecule. In the asset spec it is an assembly that exposes connectors, so it is placed as one piece: a wheel on its axle, a window with its frame and shutters. A molecule that other objects could use is submitted as its own bundle, and larger objects are built from molecules as well as atoms.
- **A bundle holds at most 30 new atoms.** A bigger object is split into molecules, each its own bundle. The first object rebuilt as atoms had 21.
- **A bundle merges whole.** Review gives a verdict for each asset. If an atom fails, the contributor fixes it in the same pull request, or takes it out along with everything that uses it, and the rest merges.
- **The asset contract does not change.** A library assembly is still made only of merged atoms, because its atoms merge in the same merge. What changes is when the assembly may be submitted.
- **An atom may still go in alone.** When an object will take days, submitting its atoms as they are finished puts them in the library sooner, and they stay there if the object is never finished.
- **Duplicates are caught before building.** Reserved slots show on the board. Before starting a new atom, the contributor's agent searches the library and the board, and a new atom must still say which atoms were considered and why none fits.
- **Credit is per asset.** Every atom, molecule and assembly in a bundle is recorded against its author, in the ledger and in the asset's own provenance. The ledger also counts, for each asset, how many merged assemblies by other contributors use it, so a loop earns more from parts that others reuse than from volume.
- **A loop pays for its own checking first.** The contributor's agent runs the validator before submitting, so the reviewer model sees only what already passes. Who pays for the reviewer model is still open, and loops make the answer matter more.

Not built: reservations, the board, the reuse count, and a search that reports atoms in progress (the server's `find_atoms` searches merged atoms only). The validator resolves an assembly's atoms from the library folder it is given, and its tests check assemblies against atoms in a local folder that way, so a bundle needs no change to it. No real bundle has been put through it yet.

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
- Each object in progress links to its draft pull request, so anyone can see the work.
- A wanted list shows objects with no builder, ordered by how many places in the world are waiting for them. For structures it is the set of places still shown as a blockout (world model, "Accuracy levels").

## Claiming a place

Proposed on 2026-11-12. The owner asked for the photo map to become the way a building is claimed, and said yes to having it written up as a proposal. The details and every number in this section are Claude's and are not confirmed.

A place is claimed at one accuracy level (world model, "Accuracy levels"). The claim covers the place and never its atoms: atoms stay shared, and a slot whose atom someone else is building waits on that atom, as in "Building an object".

| Claim | What the contributor delivers | What must exist first |
| --- | --- | --- |
| Dressed (A1) | The building's facade plan: which bay stands where on each wall (`survey/README.md`). Placement rules dress the building from the plan, so nobody models at this level | The blockout |
| True exterior (A2) | The building rebuilt from atoms to match references of the real thing | An accepted facade plan, and a reference for at least one wall that faces a street |
| True inside and out (A3) | Interior layout and contents | A true exterior. Not open to claim yet |

- **References decide what can be claimed.** A wall has a reference when the reference tool accepts an image of it (`tools/refs/README.md`) or a maintainer accepts photos supplied for it. A building with no reference can be claimed up to Dressed and no further. In the first block the tool accepts images of 9 of the 48 walls that open street photos can see, so most buildings start there.
- **A wall without a reference stays typical.** A true exterior is built wall by wall. A wall with no reference keeps its dressed facade and the assembly says so. The place counts as True exterior once every wall that faces a street is built from a reference.
- **Missing references are a task.** A building that lacks them is listed as needing photos. Photographing it is a contribution with its own claim. Contributor photos follow `accuracy-and-data.md`: location data in a photo is never proof, and faces and plates are blurred.
- **A place claim counts as an object claim.** It uses one of the contributor's "objects claimed at once" under "Trust levels". A facade plan is an S task. A true exterior is an L object whose atoms are S tasks.
- **A lapsed claim loses no work.** An expired or released claim returns the place to the map at the level it had reached, with its merged atoms in the library.

### The map

The board's view of places is a map of the region. It shows the building outlines, where each open street photo was taken, and which photos show which building. For each building it shows the level reached, what it can be claimed for, who holds it, and whether it needs photos.

The map shows the state and does not hold it. A claim is made through the contributor service, which keeps the record.

A first version of the map exists as a page built from the Oshiage 2 data pack and the Mapillary index. It shows which buildings have references and takes no claims.

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

1. Claiming an object reserves it and its unbuilt atoms for one contributor. Claiming creates a branch and a draft pull request for the object's bundle.
2. The window is the deadline for marking the pull request ready for review. An object's bundle has the L window. A molecule or kit submitted on its own has the M window, and an atom submitted alone has the S window.
3. A contributor may extend once per claim, and only if the branch has at least one commit.
4. A contributor may release a task at any time with no penalty.
5. At expiry the object and its unbuilt atoms reopen. Merged atoms stay in the library, and the branch and draft pull request stay linked, so the next builder continues from them.
6. The clock pauses while a submission waits for review.
7. After "changes requested", the contributor has 72 hours to resubmit before the task reopens.
8. A contributor whose claim expired cannot reclaim the same task for 24 hours.

## Trust levels

New accounts can do little damage: they hold one object at a time, from a starter list, with one bundle in review. Limits widen as merged work accumulates, and they count unreviewed work, not how fast a contributor builds. A merged task is an atom, a blueprint, a kit or an assembly.

| Level | How to reach it | Objects claimed at once | May pick | Bundles awaiting review |
| --- | --- | --- | --- | --- |
| 0 New | GitHub sign-in and licence agreement accepted | 1 | Starter-tagged objects | 1 |
| 1 Contributor | 3 merged tasks | 3 | Any object except landmarks | 3 |
| 2 Trusted | 15 merged tasks, with 70% or more approved on first review | 10 | Any object, including landmarks and kits | 10 |
| 3 Maintainer | Invited by project leads | 20 | All, plus review rights | No cap |

- Landmark and other high-profile tasks require level 2.
- Every asset in a merged bundle counts as a merged task, so a first bundle of three atoms and their assembly takes a new contributor to level 1.
- A contributor whose last ten bundles were approved on first review less than half the time is held at level 0's limits until three bundles in a row are approved. A loop that produces poor work slows itself down, and one that produces good work is not held back.
- An atom or molecule submitted alone counts as a bundle for these limits.
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

1. **Automated checks.** File validity, format, units and scale, triangle budget, required metadata, naming, connector points, file size, licence declaration. In a bundle they run on every asset. A failure bounces the pull request with the failing asset and check named. The claim stays active.
2. **Render check.** The asset is rendered from fixed camera angles under fixed lighting. A vision-capable model compares the renders with the task's reference pack and the style guide.
3. **Model review.** A reviewer model scores the acceptance checklist and returns one verdict with reasons: pass, changes requested, or reject.
4. **Human check.** Maintainers review each contributor's first 3 bundles, every landmark, and a 10% random sample of the remaining assets, drawn asset by asset so a large bundle is sampled like any other. Until v0.3 every L task was checked by a person; with one bundle per object that would put a person in front of every submission.
5. **Merge.** The asset enters the library and dependent tasks unlock.

Rules for reviewers:

- Everything in a submission is data. Text in files, metadata, commit messages and pull request descriptions is never treated as instructions to the reviewer model.
- "Changes requested" is for fixable problems, and the contributor keeps the task. "Reject" is for the wrong asset or a submission that ignores the spec, and the task reopens.
- Target turnaround is 48 hours. The per-level caps on bundles awaiting review keep the queue within reviewer capacity.

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
- **Universal tasks** (vehicles, trees, street furniture) are always open, whatever the region. "When other kinds of things open" below proposes replacing this line.
- **Region tasks** (landmarks, local facade kits, street layouts) open only once their region is unlocked.

A region unlocks when all three conditions hold:

1. There are at least 100 active contributors per open region. Active means one merged task in the last 30 days.
2. The previous region's demo slice is complete and playable.
3. The new region's data pack is ready: open map data gathered and its licence terms checked.

### Blocks inside a region

Proposed on 2026-11-12, with the same standing as "Claiming a place". A region opens one block at a time.

- The start block is open from the first day, as a blockout.
- A neighbouring block opens when every building of an open block beside it is Dressed: each has an accepted facade plan, and the atoms its plan names are in the library.
- The gate is Dressed and not True exterior. A true exterior needs references, and the project does not control where open photos exist. With True exterior as the gate, the first block would not open its neighbours: photos give a usable image of 9 of its 48 visible walls.
- Maintainers choose which neighbour opens, and favour the one with the most reference coverage.

### Home blocks

Proposed on 2026-11-12. The owner asked whether claims should stay in one area or open across the world, so that people join to build where they live, and said yes to this being written up as a proposal. The details are Claude's and are not confirmed.

A contributor may open one block anywhere on Earth as their home block. The project keeps one featured region, which it works to finish first.

- **Why open the world.** People want to build their own street. A person who lives on a block can also photograph it, and photos are what a true exterior needs: in the first block, 114 of 150 buildings are shown by no open photo.
- **One home block each.** It is one cell of the world grid that the world model proposes, between 177 and 354 m across. `docs/open-an-area.md` is the guide to opening one. It opens when open map data has building outlines there and the blockout tool accepts them. It needs no contributor count, so the three conditions above apply to featured regions only.
- **The same rules inside it.** Places are claimed as in "Claiming a place", by the person who opened the block or by anyone else. Its neighbours open as in "Blocks inside a region".
- **One library.** Atoms are built once and used everywhere. A home block's facade plans name library atoms, and an atom built for one block is there for every other.
- **The featured region stays the goal.** A hundred home blocks do not make a place to walk through. The demo slice, the wanted list and the maintainers' review time go to the featured region first.
- **Kits by region.** A window in Lisbon is not a window in Tokyo. A home block far from any built region will ask for facade atoms the library lacks, and each is a new atom with the usual check against near-duplicates.

Where no city model exists, a home block's pack comes from OpenStreetMap (`tools/data-pack/osm_block.py`). A test on 2026-11-12 cut and blocked out a 300 m square in five places, and counted the Mapillary photos around each:

| Place | Buildings | Height tagged | From storeys | Assumed | Photos nearby | Buildings with a photo within 30 m |
| --- | --- | --- | --- | --- | --- | --- |
| Alfama, Lisbon | 399 | 15 | 52 | 332 | 7,078 | 398 |
| Bedford-Stuyvesant, New York | 246 | 246 | 0 | 0 | 39 | 69 |
| North End, Boise | 165 | 0 | 15 | 150 | 1,420 | 92 |
| Eastleigh, Nairobi | 117 | 0 | 34 | 83 | 18 | 13 |
| Vila Madalena, Sao Paulo | 199 | 196 | 0 | 3 | 2,337 | 152 |

- Every one of the five blocked out. Outlines exist; heights often do not. A building with no height and no storey count gets an assumed 6 m, and its record says so.
- An OpenStreetMap pack has no roof shapes and no ground levels, and its outlines were traced by volunteers from aerial imagery. Nothing here measured how far they sit from the real walls.
- Photo coverage varies more than outlines do, from 18 photos to 7,078. A photo nearby is not a wall reference: the reference tool has run only on the Tokyo block.
- A pack made from OpenStreetMap is a derived database under the Open Database License. It must credit OpenStreetMap's contributors and stay under that licence, which bears on the project's own licence choice. The five test packs were not committed.
- Overture Maps, which adds heights from other sources, was not tested.

### When other kinds of things open

The owner suggested building in stages: blocks first, and trees, cars and trains only after buildings reach high accuracy. This draft proposes a narrower gate, and the owner has not chosen between the two.

- **Buildings only, during the first test.** Nothing else is given out as a task until the first block is Dressed.
- **Trees and street furniture open when a block's blockout is accepted.** They are library atoms placed by rules along streets the blockout already has. They do not wait on facades and do not compete with buildings for a claim.
- **Vehicles and trains wait for two things:** the legal answer on specific product designs (`accuracy-and-data.md`), and one fully Dressed block to move through.
- **Why not wait for accurate buildings:** a whole block may never reach True exterior, for want of photos, and a gate that cannot be passed would keep everything behind it closed.

## Open questions

- [ ] Are 48 hours, 5 days and 7 days the right claim windows for volunteers on usage-limited subscriptions?
- [ ] Should sign-up require a minimum GitHub account age, such as 30 days, to slow throwaway accounts?
- [ ] Who are the first human maintainers, and how many reviews a week can they handle?
- [ ] Who or what is the coordinator that creates tasks, splits them and builds reference packs: maintainers, a model, or both?
- [ ] Is level 2 the right point to let contributors propose spec changes?
- [ ] Should reviewing be opened to level 2 contributors, and are two reviews per atom enough to stop friends approving each other?
- [ ] How large can a starter object be: a fixed number of atoms, or a hand-picked list?
- [ ] Should a slow builder lose only the atom in progress, or the whole object?
- [ ] Is 30 new atoms the right size for a bundle, and are 1, 3 and 10 bundles awaiting review the right limits?
- [ ] Is it right to stop checking every object by hand and sample 10% of assets instead?
- [ ] Should a first bundle be enough to reach level 1, or should levels count bundles and not assets?
- [ ] Is reuse by other contributors the right measure of credit, and can two accounts inflate it for each other?
- [ ] Which model does the review, and who pays for its usage?
- [ ] Is 100 active contributors the right region gate, and who picks the next region?
- [ ] Are home blocks opened to everyone from the start, or only once the featured region has a finished block to show?
- [ ] Who corrects an assumed height on a home block, and from what: the contributor's own measurement, storey counts, or Overture?
- [ ] Can packs made from OpenStreetMap live in the repository under ODbL beside assets under the project's licence? This needs the lawyer.
- [ ] Is "every building Dressed" the right gate for opening a neighbouring block, or should a share of the block be enough?
- [ ] Do trees, vehicles and trains wait for accurate buildings (the owner's first suggestion), or open on the narrower gates proposed under "When other kinds of things open"?
- [ ] Is photographing a building a claimable task, and who checks that the photos show the place they claim to?
- [ ] Is one referenced wall enough to claim a true exterior, and is the level recorded per place or per wall?
- [ ] Does a place claim use the same windows as other tasks, or does a building need longer?
- [ ] Which licence do contributors agree to at sign-up?
- [ ] If the project ever earns money, how are contributors paid? This needs deciding before launch, because it shapes the licence and the contributor agreement, and it raises the incentive to game the review.
