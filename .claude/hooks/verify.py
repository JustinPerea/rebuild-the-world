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
import re
import shutil
import signal
import subprocess
import sys
import tempfile
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


# Checks that need a file or directory present, or they are skipped (never failed).
REQUIRES = {"validator tests": "validator/node_modules"}


def run(argv, cwd, timeout):
    """Run argv; on timeout kill the whole process tree. Returns (returncode, output, timed_out)."""
    kw = {}
    if os.name == "nt":
        kw["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    else:
        kw["start_new_session"] = True
    proc = subprocess.Popen(argv, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, **kw)
    try:
        out, _ = proc.communicate(timeout=timeout)
        return proc.returncode, out.decode("utf-8", "replace"), False
    except subprocess.TimeoutExpired:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except OSError:
                pass
        try:
            out, _ = proc.communicate(timeout=5)
        except Exception:
            out = b""
        return None, out.decode("utf-8", "replace"), True


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


# ---------------------------------------------------------------- state

def state_file(root):
    git_dir = git(["rev-parse", "--git-dir"], root).decode().strip()
    if not os.path.isabs(git_dir):
        git_dir = os.path.join(root, git_dir)
    return os.path.join(git_dir, "claude-verify", "state.json")


def load_state(path):
    state = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            loaded = json.load(f)
            if isinstance(loaded, dict):
                state = loaded
    except (OSError, ValueError):
        pass
    state.setdefault("last_pass", None)
    state.setdefault("fails", {})
    state.setdefault("edits", {})
    return state


def save_state(path, state):
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix="state-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(state, f)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def inside(root, path):
    """Repo-relative posix path if path is under root, else None."""
    try:
        rel = os.path.relpath(os.path.realpath(path), os.path.realpath(root))
    except ValueError:  # different drive on Windows
        return None
    if rel == ".." or rel.startswith(".." + os.sep) or os.path.isabs(rel):
        return None
    return rel.replace(os.sep, "/")


# ---------------------------------------------------------------- edit mode

def is_esm_without_module_package(path, root):
    """A .js file with import/export syntax and no package.json "type": "module" above it
    cannot be checked by node --check (Node 20 parses it as CommonJS)."""
    if not path.lower().endswith(".js"):
        return False
    d = os.path.dirname(os.path.realpath(path))
    root_real = os.path.realpath(root)
    while True:
        pj = os.path.join(d, "package.json")
        if os.path.isfile(pj):
            try:
                with open(pj, "r", encoding="utf-8") as f:
                    if json.load(f).get("type") == "module":
                        return False
            except (OSError, ValueError):
                pass
            break
        if d == root_real or os.path.dirname(d) == d:
            break
        d = os.path.dirname(d)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError:
        return False
    return re.search(r"^\s*(import\s*[\w{*\"']|export\s+(default|const|let|var|function|class|async|\{|\*))", text, re.M) is not None


def edit_mode():
    data = read_stdin()
    path = (data.get("tool_input") or {}).get("file_path")
    if not path:
        return 0
    path = os.path.abspath(path)
    root = project_root()
    rel = inside(root, path)
    if rel is None:
        return 0
    session = str(data.get("session_id") or "unknown")
    try:
        sp = state_file(root)
        state = load_state(sp)
        edits = state["edits"].setdefault(session, [])
        if rel not in edits:
            edits.append(rel)
            save_state(sp, state)
    except Exception as e:  # recording is best effort; never block an edit over it
        sys.stderr.write("verify: could not record edit: %r\n" % (e,))
    if not os.path.isfile(path) or not path.lower().endswith(EDIT_EXTS):
        return 0
    node = shutil.which("node")
    if not node:
        sys.stderr.write("verify: node not found, skipping syntax check\n")
        return 0
    if is_esm_without_module_package(path, root):
        sys.stderr.write("verify: %s uses ESM syntax without a package.json \"type\": \"module\"; skipping node --check\n" % rel)
        return 0
    rc, out, timed_out = run([node, "--check", path], os.path.dirname(path), EDIT_TIMEOUT)
    if timed_out:
        sys.stderr.write("verify: node --check timed out after %d s, skipped\n" % EDIT_TIMEOUT)
        return 0
    if rc != 0:
        sys.stderr.write("verify: syntax error in %s\n%s\n" % (rel, trim(out)))
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

    state_path = state_file(root)
    state = load_state(state_path)
    fp = fingerprint(root, untracked)
    if state.get("last_pass") == fp:
        return 0
    my_edits = set(state["edits"].get(session, []))

    start = time.time()
    results = []    # (label, globs, status, report) with status "fail" or "skip"
    timings = []

    def skip(label, why):
        sys.stderr.write("verify: skipping %s: %s\n" % (label, why))
        results.append((label, [], "skip", why))

    msg = hygiene(root)
    hygiene_failed = bool(msg)

    for label, globs, argv, kind in STOP_CHECKS:
        group = [p for p in changed if matches(p, globs)]
        if not group:
            continue
        need = REQUIRES.get(label)
        if need and not os.path.exists(os.path.join(root, need)):
            skip(label, "%s is missing (run npm ci in validator/)" % need)
            continue
        if kind == "node":
            exe = shutil.which("node")
            if not exe:
                skip(label, "node not found")
                continue
            argv = [exe] + argv[1:]
        else:
            if kind == "py-refs" and not python_has(["numpy", "cv2"]):
                skip(label, "numpy or opencv missing")
                continue
            argv = [sys.executable] + argv[1:]
        target = argv[-1]
        if target != "check" and not os.path.exists(os.path.join(root, target)):
            skip(label, "%s not found" % target)
            continue
        remaining = STOP_BUDGET - (time.time() - start)
        if remaining <= 1:
            skip(label, "overall %d s budget used up" % STOP_BUDGET)
            continue
        t0 = time.time()
        rc, out, timed_out = run(argv, root, remaining)
        timings.append("%s %.1fs" % (label, time.time() - t0))
        if timed_out:
            skip(label, "timed out")
        elif rc != 0:
            shown = " ".join(["node" if kind == "node" else "python3"] + argv[1:])
            results.append((label, globs, "fail", "$ %s\n%s" % (shown, trim(focus(out), 40))))

    sys.stderr.write("verify: ran in %.1fs (%s)\n" % (time.time() - start, "; ".join(timings) or "no test checks"))

    fails = [r for r in results if r[2] == "fail"]
    skipped = [r for r in results if r[2] == "skip"]
    # A check failing in a path group this session never edited is someone else's change.
    mine = [r for r in fails if any(matches(p, r[1]) for p in my_edits)]
    foreign = [r for r in fails if r not in mine]

    notes = []
    for label, globs, _, _ in foreign:
        files = [p for p in changed if matches(p, globs)]
        notes.append("verify: %s failing on changes this session didn't make: %s" % (label, ", ".join(files[:8])))

    if not hygiene_failed and not mine:
        # Cache a pass only when every applicable check ran and passed.
        if not fails and not skipped:
            state["last_pass"] = fp
            state["fails"].pop(session, None)
            save_state(state_path, state)
        if notes:
            sys.stdout.write(json.dumps({"systemMessage": "; ".join(notes)}))
        return 0

    blocking = ([("local-only files", msg)] if hygiene_failed else []) + [(r[0], r[3]) for r in mine]
    count = int(state["fails"].get(session, 0)) + 1
    state["fails"][session] = count
    save_state(state_path, state)
    if count > MAX_RETRIES:
        sys.stdout.write(json.dumps({"systemMessage": "verify: %s still failing after %d attempts; report it" % (blocking[0][0], MAX_RETRIES)}))
        return 0
    report = ["verify: %d check(s) failed (attempt %d of %d before it stops blocking)" % (len(blocking), count, MAX_RETRIES)]
    for label, text in blocking:
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
