"""QA end-to-end simulation of fetch -> publish against a throwaway local bare repo.
Runs the workflow's real `run:` blocks (extracted from the YAML) in order, with
`npm run fetch-data` replaced by a stub, and actions/checkout replaced by a shallow clone."""
import json, os, shutil, subprocess, sys, tempfile, yaml

WF = sys.argv[1]; ROOT = tempfile.mkdtemp(prefix="fr3sim-", dir=sys.argv[2])
wf = yaml.safe_load(open(WF))
fsteps = wf["jobs"]["fetch"]["steps"]; pstep = wf["jobs"]["publish"]["steps"][2]["run"]
REALGIT = shutil.which("git")

def sh(cmd, cwd=None, env=None, check=True):
    r = subprocess.run(cmd, shell=True, cwd=cwd, env=env, text=True, capture_output=True)
    if check and r.returncode: raise SystemExit(f"FAILED {cmd}\n{r.stdout}{r.stderr}")
    return r.stdout.strip()

def gitenv(extra=None):
    e = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@x", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@x"}
    e.update(extra or {}); return e

def new_origin(name):
    bare = f"{ROOT}/{name}.git"; seed = f"{ROOT}/{name}-seed"
    sh(f"git init -q --bare -b main {bare}")
    sh(f"git init -q -b main {seed}")
    os.makedirs(f"{seed}/public/data"); open(f"{seed}/package.json", "w").write("{}")
    open(f"{seed}/.gitignore", "w").write("public/data/schedule.json\n")
    sh("git add -A && git commit -qm main-init && git remote add origin " + bare + " && git push -q origin main", seed, gitenv())
    return bare

def schedule(tag, warnings=()):
    return json.dumps({"schemaVersion": 1, "generatedAt": tag, "warnings": list(warnings)})

def put_data(bare, content, msg="seed data"):
    d = tempfile.mkdtemp(dir=ROOT)
    sh(f"git init -q -b data {d}"); open(f"{d}/schedule.json", "w").write(content)
    sh(f"git add schedule.json && git commit -qm '{msg}' && git push -q {bare} data", d, gitenv())

def run_step(script, cwd, env):
    return subprocess.run(["bash", "-e", "-c", script], cwd=cwd, env=env, text=True, capture_output=True)

def fetch_job(bare, fetch_stub):
    """Returns (job_ok, outputs, workdir)."""
    work = f"{ROOT}/fetch-{os.urandom(3).hex()}"; tmp = work + "-tmp"; os.makedirs(tmp)
    sh(f"git clone -q --depth 1 --branch main file://{bare} {work}")  # actions/checkout (persist-credentials false is irrelevant for file://)
    out = f"{tmp}/GITHUB_OUTPUT"; open(out, "w").close()
    env = gitenv({"RUNNER_TEMP": tmp, "GITHUB_OUTPUT": out, "GITHUB_SERVER_URL": "https://github.com",
                  "GITHUB_REPOSITORY": "nwhee/FreeRooms", "GITHUB_RUN_ID": "42"})
    outputs = {}
    for s in fsteps:
        name = s.get("name")
        if "uses" in s or s.get("run") == "npm ci": continue
        if s.get("run") == "npm run fetch-data":
            script = fetch_stub
        else:
            if "if" in s: continue  # publish-false print step / upload: evaluated by GitHub; covered elsewhere
            script = s["run"]
        e = dict(env)
        for k, v in (s.get("env") or {}).items():  # resolve the only expressions used: steps.<id>.outputs.<x>
            key = v.split(".")[-1].rstrip(" }")
            e[k] = outputs.get(key, "")
        r = run_step(script, work, e)
        print(f"   [fetch] {name}: exit {r.returncode} {r.stdout.strip()[:160]} {r.stderr.strip()[:200]}")
        for line in open(out).read().splitlines():
            if "=" in line and not line.startswith("body"): k, v = line.split("=", 1); outputs[k] = v
        if r.returncode: return False, outputs, work
    return True, outputs, work

def publish_job(bare, work, race=None):
    """race: None | 'nonconflict' | 'conflict' | 'always'"""
    pub = f"{ROOT}/pub-{os.urandom(3).hex()}"; tmp = pub + "-tmp"; os.makedirs(f"{tmp}/schedule")
    sh(f"git clone -q --depth 1 --branch main file://{bare} {pub}")
    shutil.copy(f"{work}/public/data/schedule.json", f"{tmp}/schedule/schedule.json")  # download-artifact
    bindir = f"{tmp}/bin"; os.makedirs(bindir)
    if race:
        # git shim: before a push to data, a competing writer pushes first.
        open(f"{bindir}/git", "w").write(f"""#!/usr/bin/env bash
if [ "$1" = push ] && {{ [ ! -e {tmp}/raced ] || [ "{race}" = always ] || [ "{race}" = always-nc ]; }}; then
  touch {tmp}/raced
  d=$(mktemp -d {ROOT}/racer-XXXX); {REALGIT} clone -q -b data file://{bare} $d
  if [ "{race}" = nonconflict ] || [ "{race}" = always-nc ]; then echo $RANDOM >> $d/OTHER; else echo "{{\\"racer\\":$RANDOM}}" > $d/schedule.json; fi
  {REALGIT} -C $d add -A; {REALGIT} -C $d -c user.name=r -c user.email=r@x commit -qm racer; {REALGIT} -C $d push -q origin data
fi
exec {REALGIT} "$@"
""")
        os.chmod(f"{bindir}/git", 0o755)
    env = gitenv({"RUNNER_TEMP": tmp, "DATA_DIR": f"{tmp}/data-branch", "NEW_FILE": f"{tmp}/schedule/schedule.json",
                  "PATH": f"{bindir}:{os.environ['PATH']}"})
    for k in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"): env.pop(k)
    r = run_step(pstep, pub, env)
    print(f"   [publish] exit {r.returncode}\n      " + (r.stdout + r.stderr).strip().replace("\n", "\n      "))
    return r.returncode == 0

def show(bare, label):
    main = sh(f"git --git-dir={bare} rev-parse main")
    data = sh(f"git --git-dir={bare} rev-parse --verify -q data", check=False)
    print(f"   [{label}] main={main[:8]} data={data[:8] or '(none)'}")
    if data:
        print("      ls-tree data:", sh(f"git --git-dir={bare} ls-tree -r --name-only data").replace("\n", ", "))
        print("      log data:", sh(f"git --git-dir={bare} log --format='%h %p|%an <%ae>|%s' data").replace("\n", "\n                "))
    return main, data

WRITE_NEW = "set -e; mkdir -p public/data; printf '%s' '" + schedule("new", ["Term 202710 has no academic calendar file (expected data/calendar/2026-2027.json); no-class days and exam periods will be missing."]) + "' > public/data/schedule.json; echo 'Wrote public/data/schedule.json'"
NO_CHANGE = "echo 'No change; not writing.'"
FAIL = "echo 'Run failed: Banner 503' >&2; exit 1"

results = []
def scenario(title, bare, stub, race=None, expect_publish=True, expect_ok=True):
    print(f"\n===== {title}")
    m0, d0 = show(bare, "before")
    ok, outs, work = fetch_job(bare, stub)
    print(f"   fetch job ok={ok} outputs={outs}")
    pub_ran = False; pub_ok = None
    # job-level if: needs.fetch succeeded (implicit success()) AND changed == 'true' (schedule run => publish)
    if ok and outs.get("changed") == "true":
        pub_ran = True; pub_ok = publish_job(bare, work, race)
    print(f"   publish job ran={pub_ran} ok={pub_ok}")
    m1, d1 = show(bare, "after")
    results.append((title, ok, pub_ran, pub_ok, m0 == m1, d0 != d1))
    return ok, pub_ran, pub_ok, m0 == m1, d0, d1

# A: first run, no data branch -> orphan branch with exactly schedule.json, no parent
b = new_origin("A"); scenario("A first run, no data branch (bootstrap)", b, WRITE_NEW)
print("      date check: TZ=America/New_York date +%F ->", sh("TZ=America/New_York date +%F"), "| UTC date ->", sh("TZ=UTC date +%F"))
# B: data exists, fetch says No change -> changed=false, publish skipped, no commit
b = new_origin("B"); put_data(b, schedule("old")); scenario("B data exists, fetch prints 'No change; not writing.'", b, NO_CHANGE)
# C: data exists, fetch rewrites -> one commit on top of data
b = new_origin("C"); put_data(b, schedule("old")); scenario("C data exists, file changed", b, WRITE_NEW)
# D: fetch exits 1 -> job red, no publish, no commit
b = new_origin("D"); put_data(b, schedule("old")); scenario("D fetch exits 1", b, FAIL)
# E: push rejected once by a non-conflicting racer -> pull --rebase + one retry succeeds
b = new_origin("E"); put_data(b, schedule("old")); scenario("E push rejected once (non-conflicting racer) -> rebase + retry", b, WRITE_NEW, race="nonconflict")
# F: push rejected once by a racer that also rewrote schedule.json -> rebase conflicts -> job fails
b = new_origin("F"); put_data(b, schedule("old")); scenario("F push rejected once (racer rewrote schedule.json) -> rebase conflict", b, WRITE_NEW, race="conflict")
# G: push rejected twice -> exactly one retry, then job fails
b = new_origin("G"); put_data(b, schedule("old")); scenario("G push rejected on both attempts -> job fails after one retry", b, WRITE_NEW, race="always")
# G2: rejected twice, rebase succeeds both times -> second push rejected -> job fails, no third push
b = new_origin("G2"); put_data(b, schedule("old")); scenario("G2 push rejected on both attempts, rebase clean -> job fails after exactly one retry", b, WRITE_NEW, race="always-nc")
# H: two consecutive nightly runs: second run with no change does nothing
b = new_origin("H"); scenario("H1 bootstrap", b, WRITE_NEW); scenario("H2 next night, no change", b, NO_CHANGE)

print("\n===== SUMMARY (title | fetch_ok | publish_ran | publish_ok | main_unchanged | data_moved)")
for r in results: print("  ", " | ".join(map(str, r)))
