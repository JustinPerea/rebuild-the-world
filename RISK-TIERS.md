# Risk tiers

How a change gets merged. The change sets the tier, not who wrote it. If a change touches
several tiers, the highest applies. If you are unsure, go one tier up. An agent's approval is
never Justin's approval.

`main` is protected: changes arrive by pull request and the checks must pass. Agents open the
PR and use `gh pr merge --auto` for low and medium changes. High changes wait for Justin.

## Low

Docs other than the specs and legal files, notes, test-only additions, tooling and scripts.

Checks green, plus one agent review in a fresh context. The agent merges (auto-merge is fine).

## Medium

Site and announce work, the behaviour of the survey and refs tools, task files, and assets that
pass the validator.

Checks green, plus a finder agent and a second agent that tries to refute each finding. The agent
merges, and Justin checks the result afterwards.

## High

The tier controls themselves are high tier: `RISK-TIERS.md`, `.claude/high-tier-paths`, `.claude/settings.json`, `.claude/hooks/` and `.github/workflows/`. A change to them can weaken every other gate.

- `validator/` and `registry/` (the admission gates)
- `spec/` and `docs/*-spec.md` (contract changes)
- `site/api/earth-again/` (the waitlist endpoint stores emails)
- `LICENSE.md`
- `docs/accuracy-and-data.md`
- `.gitattributes` and any other Git LFS rule

Justin's explicit OK, in his own words, in his own message, before merge. Record the date and his
words in the PR description. The agent does not merge until that is there.

`brand/` is owned by the brand session and is not tracked here.

## For tooling

`.claude/high-tier-paths` lists the high-tier paths as globs, one per line, for a guard that
blocks `gh pr merge` on a high-tier diff. Keep it in step with this file.

The Claude Code hooks in `.claude/hooks/verify.py` run the matching checks after edits and when a
session stops. They also refuse tracked `implementation-notes.md` or `data/raw/` files, because
this repo is public.
