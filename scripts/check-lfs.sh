#!/usr/bin/env bash
# Fails if a file that .gitattributes routes to Git LFS is stored as a plain
# Git blob, or if any plain (non-LFS) file is over the size limit.
# It checks the index, i.e. what the next commit will contain.
#
# Usage: scripts/check-lfs.sh            all tracked files
#        scripts/check-lfs.sh --staged   only files changed in the index
# Run in CI and, optionally, as a pre-commit hook.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

MAX_PLAIN_BYTES=$((1024 * 1024))   # 1 MB; starting value
POINTER_MAX_BYTES=1024             # LFS pointers are ~130 bytes
POINTER_HEADER='version https://git-lfs.github.com/spec/v1'

case "${1:-}" in
  --staged) files=$(git -c core.quotepath=off diff --cached --name-only --diff-filter=ACMR) ;;
  "")       files=$(git -c core.quotepath=off ls-files) ;;
  *)        echo "usage: $0 [--staged]" >&2; exit 2 ;;
esac

fail=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  size=$(git cat-file -s ":$f")
  filter=$(git check-attr filter -- "$f" | sed 's/.*: filter: //')
  if [[ "$filter" == "lfs" ]]; then
    first_line=""
    if (( size <= POINTER_MAX_BYTES )); then
      first_line=$(git cat-file blob ":$f" | sed -n '1p')
    fi
    if [[ "$first_line" != "$POINTER_HEADER" ]]; then
      echo "FAIL lfs: $f matches an LFS pattern but is stored as a plain blob ($size bytes)."
      echo "          Fix: git lfs install --local && git rm --cached \"$f\" && git add \"$f\""
      fail=1
    fi
  elif (( size > MAX_PLAIN_BYTES )); then
    echo "FAIL size: $f is $size bytes in plain Git (limit $MAX_PLAIN_BYTES). Add its extension to .gitattributes for LFS."
    fail=1
  fi
done <<< "$files"

if (( fail )); then exit 1; fi
echo "check-lfs: ok"
