#!/usr/bin/env bash
# FreeRooms production deploy (FR-7). DRAFT.
#
# A human reviews this file, copies it to scripts/deploy/deploy.sh and runs
# `chmod +x` on it. Agents never run it, in either location.
#
# Steps, in order:
#   1. Strict mode and required tools (vercel, curl, jq, npm).
#   2. Branch must be main, the working tree must be clean, HEAD must
#      match origin/main, and .vercelignore must exclude .env* and *.pem.
#   3. NEXT_PUBLIC_DATA_URL must be set for Vercel production, and the
#      published schedule.json must have schemaVersion 1.
#   4. npm ci, then npm run check.
#   5. Warn about local .env* (except .env.example) or *.pem files, then
#      show the commit and ask for confirmation.
#   6. Deploy to Vercel production.
#
# Optional: DATA_URL overrides the URL used for the step 3 data check.

set -euo pipefail

DEFAULT_DATA_URL="https://raw.githubusercontent.com/nwhee/FreeRooms/data/schedule.json"

die() {
  echo "deploy.sh: $*" >&2
  exit 1
}

trap 'echo "deploy.sh: unexpected failure at line $LINENO." >&2' ERR

# Step 1: required tools.
for tool in vercel curl jq npm git; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is not on PATH. Install it, then re-run."
done

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Not inside a git repository."
cd "$repo_root"

# Step 2: main branch, clean tree.
branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  die "Current branch is '${branch:-detached HEAD}'. Deploy only from main."
fi

if [[ -n "$(git status --porcelain)" ]]; then
  die "Working tree is not clean. Commit or discard changes, then re-run."
fi

if ! git fetch origin main --quiet; then
  die "'git fetch origin main' failed. Check your network and git remote, then re-run."
fi

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  die "Local main does not match origin/main. Push or pull first, then re-run."
fi

# .vercelignore keeps local env and key files out of the upload.
if [[ ! -f .vercelignore ]]; then
  die ".vercelignore is missing. Restore it from main, then re-run."
fi
for pattern in '.env*' '*.pem'; do
  if ! grep -qxF -- "$pattern" .vercelignore; then
    die ".vercelignore has no '$pattern' line. Add it, then re-run."
  fi
done

# Step 3: NEXT_PUBLIC_DATA_URL is set in Vercel production, and the data is reachable.
if ! env_list="$(vercel env ls production 2>&1)"; then
  echo "$env_list" >&2
  die "'vercel env ls production' failed. Are you logged in (vercel login) and is the project linked (vercel link)?"
fi

if ! grep -qw "NEXT_PUBLIC_DATA_URL" <<<"$env_list"; then
  die "NEXT_PUBLIC_DATA_URL is not set for production in Vercel. Set it, then re-run."
fi

data_url="${DATA_URL:-$DEFAULT_DATA_URL}"
if ! data_json="$(curl -fsS --connect-timeout 10 --max-time 30 "$data_url")"; then
  die "Could not fetch $data_url. If the data branch does not exist yet, run the nightly-data workflow once with publish: true, then re-run."
fi

if ! jq -e '.schemaVersion == 1' >/dev/null <<<"$data_json"; then
  die "$data_url is not valid schedule data with schemaVersion 1."
fi

# Step 4: install and run the full check.
if ! npm ci; then
  die "npm ci failed."
fi

if ! npm run check; then
  die "npm run check failed. Fix the build before deploying."
fi

# Step 5: warn about local env or key files, then confirm.
# -z gives NUL-separated "XY path" entries, so paths with spaces stay intact.
# Rename/copy entries carry the original path as an extra NUL field; skip it.
sensitive_files=()
while IFS= read -r -d '' entry; do
  status="${entry:0:2}"
  path="${entry:3}"
  if [[ "$status" == R* || "$status" == C* ]]; then
    IFS= read -r -d '' _ || true
  fi
  name="${path##*/}"
  if [[ "$name" == ".env.example" ]]; then
    continue
  fi
  if [[ "$name" == .env* || "$name" == *.pem ]]; then
    sensitive_files+=("$path")
  fi
done < <(git status --porcelain --ignored -z)

if (( ${#sensitive_files[@]} > 0 )); then
  echo "deploy.sh: WARNING: local env or key files are present:" >&2
  printf '  %s\n' "${sensitive_files[@]}" >&2
  echo "deploy.sh: .vercelignore excludes .env* and *.pem, so they are not uploaded." >&2
fi

commit="$(git rev-parse --short HEAD)"
echo "About to deploy commit $commit (branch main) to Vercel production."
answer=""
read -r -p "Deploy to production? [y/N] " answer || answer=""
if [[ "$answer" != "y" ]]; then
  echo "Not deploying."
  exit 0
fi

# Step 6: deploy.
if ! vercel --prod; then
  die "Vercel production deploy failed."
fi

echo "Deployed commit $commit to production."
