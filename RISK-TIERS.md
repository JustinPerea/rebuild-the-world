# Risk tiers

How a change gets merged. The change sets the tier, not who wrote it. If a change touches
several tiers, the highest applies. If you are unsure, go one tier up. An agent's approval is
never Justin's approval.

`main` is protected: changes arrive by pull request and the checks must pass. Any agent may open
a pull request and merge a low or medium change. Only the lead session merges a contract change.
High changes wait for Justin.

The lead session is the Claude session Justin works with in this repository. Justin named it the
leader of the repo on 2026-11-12 ("Nothing should block you from merging as the leader of this
repo") and, asked how far that goes, chose: it merges everything itself after checks and a
review and tells him afterwards, except the licence, the waitlist endpoint and the tier rules.
`docs/accuracy-and-data.md` is kept with those three by the lead session's own choice, because it
holds his rules on what may be copied from the real world.
No other agent, session or contributor merges a contract or high change.

## Low

Docs other than the specs and legal files, notes, test-only additions, tooling and scripts.

Checks green, plus one agent review in a fresh context. The agent merges (auto-merge is fine).

## Medium

Site and announce work, the behaviour of the survey and refs tools, task files, and assets that
pass the validator.

Checks green, plus a finder agent and a second agent that tries to refute each finding. The agent
merges, and Justin checks the result afterwards.

## Contract

- `validator/` and `registry/` (the admission gates)
- `spec/` and `docs/*-spec.md` (contract changes)
- `.gitattributes` and any other Git LFS rule

Checks green, plus a finder agent and a second agent that tries to refute each finding. The lead
session merges, and tells Justin in its next message what changed and what it decided for him.
A decision the project brief lists as not decided yet stays marked as a proposal in the docs: the
merge does not confirm it.

## High

- `LICENSE.md`
- `docs/accuracy-and-data.md` (what may match the real world, what is held for legal review, which data sources are allowed)
- `site/api/earth-again/` (the waitlist endpoint stores emails)
- The tier controls themselves: `RISK-TIERS.md`, `.claude/high-tier-paths`, `.claude/settings.json`, `.claude/hooks/` and `.github/workflows/`. A change to them can weaken every other gate.

Justin's explicit OK, in his own words, in his own message, before merge. Record the date and his
words in the PR description. Nobody merges until that is there.

`brand/` is owned by the brand session and is not tracked here.

## For tooling

`.claude/high-tier-paths` lists the high-tier paths as globs, one per line, for a guard that
blocks `gh pr merge` on a high-tier diff. Keep it in step with this file. Contract paths are not
in it: the lead session merges those without the guard. The guard therefore does not enforce who
merges a contract change; that rule is kept by the agents that read this file.

The Claude Code hooks in `.claude/hooks/verify.py` run the matching checks after edits and when a
session stops. They also refuse tracked `implementation-notes.md` or `data/raw/` files, because
this repo is public.
