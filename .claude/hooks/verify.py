#!/usr/bin/env python3
"""Claude Code verification hooks for this repo (Python 3.9+, standard library only).

  verify.py edit   PostToolUse on Edit|Write|MultiEdit: syntax-check the one file just written.
  verify.py stop   Stop: run the checks that match what changed, the same commands CI runs
                   (.github/workflows/checks.yml).

Hook JSON arrives on stdin. Exit 2 sends stderr back to the agent; exit 1 is a hook crash and
never blocks. See RISK-TIERS.md for how checks fit into merging.
"""
import fnmatch
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

EDIT_TIMEOUT = 25
STOP_BUDGET = 180
MAX_REPORT_LINES = 60
MAX_RETRIES = 2          # after this many blocked attempts in a session, stop blocking
BIG_FILE = 1024 * 1024
EDIT_EXTS = (".js", ".mjs", ".cjs")

# (label, path globs that trigger it, argv, kind). fnmatch globs: "*" crosses "/".
# kind "node" needs node on PATH; "py-refs" needs numpy and opencv importable.
STOP_CHECKS = [
    ("validator tests", ["validator/*"], ["node", "--test", "validator/test/"], "node"),
    ("contributor server tests", ["mcp/*"], ["node", "--test", "mcp/test/"], "node"),
    ("survey tool tests", ["tools/survey/*"], ["node", "--test", "tools/survey/test/"], "node"),
    ("survey plans pass", ["tools/survey/*"], ["node", "tools/survey/survey.mjs", "check"], "node"),
    ("spec.json matches the docs", ["spec/*", "docs/*-spec.md"], ["node", "scripts/check-spec-sync.mjs"], "node"),
    ("site api tests", ["site/api/*"], ["node", "--test", "site/test/api.test.mjs"], "node"),
    ("wall reference tests", ["tools/refs/*"], ["PY", "tools/refs/test_wallrefs.py"], "py-refs"),
    ("OpenStreetMap pack tests", ["tools/data-pack/*"], ["PY", "tools/data-pack/test_osm_block.py"], "py"),
]


def run(argv, cwd, timeout, **kw):
    return subprocess.run(argv, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          timeout=timeout, **kw)


def git(args, cwd, check=True):
    p = subprocess.run(["git"] + args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and p.returncode != 0:
        raise RuntimeError("git %s failed: %s" % (" ".join(args), p.stderr.decode("utf-8", "replace").strip()))
    return p.stdout


def project_root():
    start = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    return git(["rev-parse", "--show-toplevel"], start).decode().strip()


def trim(text, limit=MAX_REPORT_LINES):
    lines = text.splitlines()
    if len(lines) <= limit:
        return "\n".join(lines)
    head = limit // 3
    tail = limit - head
    return "\n".join(lines[:head] + ["... (%d lines trimmed) ..." % (len(lines) - limit)] + lines[-tail:])


def focus(text):
    """For TAP output, keep only the failing tests and the summary; otherwise return text as is."""
    lines = text.splitlines()
    keep = set()
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith("not ok"):
            keep.update(range(i, min(i + 22, len(lines))))
        elif ln.startswith("# ") and ln.split(" ")[1:2] in (["tests"], ["pass"], ["fail"]):
            keep.add(i)
    if not keep:
        return text
    return "\n".join(lines[i] for i in sorted(keep))


def matches(path, globs):
    return any(fnmatch.fnmatch(path, g) for g in globs)


def read_stdin():
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except (ValueError, OSError):
        return {}


# ---------------------------------------------------------------- edit mode

def edit_mode():
    data = read_stdin()
    path = (data.get("tool_input") or {}).get("file_path")
    if not path or not os.path.isfile(path) or not path.lower().endswith(EDIT_EXTS):
        return 0
    node = shutil.which("node")
    if not node:
        sys.stderr.write("verify: node not found, skipping syntax check\n")
        return 0
    try:
        p = run([node, "--check", path], os.path.dirname(os.path.abspath(path)), EDIT_TIMEOUT)
    except subprocess.TimeoutExpired:
        sys.stderr.write("verify: node --check timed out after %d s\n" % EDIT_TIMEOUT)
        return 2
    if p.returncode != 0:
        sys.stderr.write("verify: syntax error in %s\n%s\n" % (path, trim(p.stdout.decode("utf-8", "replace"))))
        return 2
    return 0


# ---------------------------------------------------------------- stop mode

def changed_files(root):
    tracked = git(["diff", "--name-only", "HEAD"], root, check=False).decode("utf-8", "replace").splitlines()
    untracked = git(["ls-files", "-o", "--exclude-standard"], root).decode("utf-8", "replace").splitlines()
    return sorted(set(tracked)), sorted(set(untracked))


def fingerprint(root, untracked):
    h = hashlib.sha256()
    h.update(git(["diff", "--no-ext-diff", "HEAD"], root, check=False))
    for rel in untracked:
        full = os.path.join(root, rel)
        h.update(b"\0" + rel.encode("utf-8"))
        try:
            st = os.stat(full)
            if st.st_size > BIG_FILE:
                h.update(("size=%d mtime=%d" % (st.st_size, int(st.st_mtime))).encode())
                continue
            with open(full, "rb") as f:
                head = f.read(200)
                if head.startswith(b"version https://git-lfs"):
                    h.update(("lfs size=%d mtime=%d" % (st.st_size, int(st.st_mtime))).encode())
                    continue
                f.seek(0)
                h.update(f.read())
        except OSError:
            h.update(b"unreadable")
    return h.hexdigest()


def load_state(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            s = json.load(f)
            if isinstance(s, dict):
                s.setdefault("fails", {})
                return s
    except (OSError, ValueError):
        pass
    return {"last_pass": None, "fails": {}}


def save_state(path, state):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    os.replace(tmp, path)


def hygiene(root):
    """Return a failure message or None. Local-only files must never be tracked (public repo)."""
    problems = []
    for line in git(["ls-files"], root).decode("utf-8", "replace").splitlines():
        base = line.rsplit("/", 1)[-1]
        if base == "implementation-notes.md" or line.startswith("data/raw/"):
            problems.append("tracked: " + line)
    for probe in ("implementation-notes.md", "docs/implementation-notes.md", "data/raw/probe.bin"):
        p = subprocess.run(["git", "check-ignore", "-q", "--no-index", probe], cwd=root)
        if p.returncode != 0:
            problems.append(".gitignore does not cover " + probe)
    if not problems:
        return None
    return ("local-only files are tracked or unignored (this repo is public; see CLAUDE.md):\n  "
            + "\n  ".join(problems) + "\nRun git rm --cached on them and fix .gitignore.")


def python_has(mods):
    p = subprocess.run([sys.executable, "-c", "import " + ",".join(mods)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return p.returncode == 0


def stop_mode():
    data = read_stdin()
    session = str(data.get("session_id") or "unknown")
    root = project_root()
    tracked, untracked = changed_files(root)
    changed = tracked + untracked
    if not changed:
        return 0

    git_dir = git(["rev-parse", "--git-dir"], root).decode().strip()
    if not os.path.isabs(git_dir):
        git_dir = os.path.join(root, git_dir)
    state_path = os.path.join(git_dir, "claude-verify", "state.json")
    state = load_state(state_path)
    fp = fingerprint(root, untracked)
    if state.get("last_pass") == fp:
        return 0

    start = time.time()
    failures = []   # (label, report)
    timings = []

    msg = hygiene(root)
    if msg:
        failures.append(("local-only files", msg))

    for label, globs, argv, kind in STOP_CHECKS:
        if not any(matches(p, globs) for p in changed):
            continue
        if kind == "node":
            exe = shutil.which("node")
            if not exe:
                sys.stderr.write("verify: node not found, skipping %s\n" % label)
                continue
            argv = [exe] + argv[1:]
        else:
            if kind == "py-refs" and not python_has(["numpy", "cv2"]):
                sys.stderr.write("verify: numpy or opencv missing, skipping %s\n" % label)
                continue
            argv = [sys.executable] + argv[1:]
        # the test files for a changed path may not exist yet (e.g. site/test): skip, do not fail
        target = argv[-1] if not argv[-1].startswith("-") else None
        if target and target not in ("check",) and not os.path.exists(os.path.join(root, target)):
            sys.stderr.write("verify: %s not found, skipping %s\n" % (target, label))
            continue
        remaining = STOP_BUDGET - (time.time() - start)
        if remaining <= 0:
            failures.append((label, "not run: overall %d s budget used up" % STOP_BUDGET))
            continue
        t0 = time.time()
        try:
            p = run(argv, root, remaining)
            ok, out = p.returncode == 0, p.stdout.decode("utf-8", "replace")
        except subprocess.TimeoutExpired:
            ok, out = False, "timed out"
        timings.append("%s %.1fs" % (label, time.time() - t0))
        if not ok:
            failures.append((label, "$ %s\n%s" % (" ".join(["node" if kind == "node" else "python3"] + argv[1:]), trim(focus(out), 40))))

    sys.stderr.write("verify: ran in %.1fs (%s)\n" % (time.time() - start, "; ".join(timings) or "no test checks"))

    if not failures:
        state["last_pass"] = fp
        state["fails"] = {}
        save_state(state_path, state)
        return 0

    count = int(state["fails"].get(session, 0)) + 1
    state["fails"][session] = count
    save_state(state_path, state)
    first = failures[0][0]
    if count > MAX_RETRIES:
        sys.stdout.write(json.dumps({"systemMessage": "verify: %s still failing after %d attempts; report it" % (first, MAX_RETRIES)}))
        return 0
    report = ["verify: %d check(s) failed (attempt %d of %d before it stops blocking)" % (len(failures), count, MAX_RETRIES)]
    for label, text in failures:
        report.append("--- %s" % label)
        report.append(text)
    sys.stderr.write(trim("\n".join(report), MAX_REPORT_LINES) + "\n")
    return 2


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if mode == "edit":
            return edit_mode()
        if mode == "stop":
            return stop_mode()
        sys.stderr.write("usage: verify.py edit|stop\n")
        return 1
    except Exception as e:  # never exit 2 on a hook bug: that would feed noise back to the agent
        sys.stderr.write("verify: hook error: %r\n" % (e,))
        return 1


if __name__ == "__main__":
    sys.exit(main())
