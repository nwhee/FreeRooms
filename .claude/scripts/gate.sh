#!/usr/bin/env bash
# Stop / SubagentStop hook: the automatic gate.
# If source files changed since the last green run, runs `npm run check`
# (typecheck + lint + tests). On failure, exit 2 sends the output back to Claude
# so it keeps working instead of reporting done on a red build.

input="$(cat)"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" || exit 0

# Avoid loops: if Claude is already continuing because of this hook, let it stop.
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

# Nothing to check without a git repo or a "check" script.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
[ -f package.json ] || exit 0
jq -e '.scripts.check' package.json >/dev/null 2>&1 || exit 0

# Fingerprint the current state of the code. Skip if it already passed.
stamp_file="$root/.claude/.gate-pass"
fingerprint="$( { git rev-parse HEAD 2>/dev/null; git diff HEAD -- . ':(exclude)docs' ':(exclude).claude'; git ls-files -z --others --exclude-standard -- . ':(exclude)docs' ':(exclude).claude' | xargs -0 shasum 2>/dev/null; } | shasum | cut -d' ' -f1 )"
[ -f "$stamp_file" ] && [ "$(cat "$stamp_file")" = "$fingerprint" ] && exit 0

if out="$(npm run --silent check 2>&1)"; then
  printf '%s' "$fingerprint" > "$stamp_file"
  exit 0
fi

{
  echo "Gate failed: \`npm run check\` is red. Fix it before reporting done (last 60 lines):"
  printf '%s\n' "$out" | tail -n 60
} >&2
exit 2
