#!/usr/bin/env bash
# PreToolUse hook (Bash): makes Claude stop and ask the user before
#   1. pushing to a remote or creating/deleting a remote repo, and
#   2. any command that looks like it could spend money (purchases, plan
#      upgrades, paid cloud resources).
# It returns permissionDecision "ask", so the user is prompted even in auto mode.
# The same script is installed globally at ~/.claude/hooks/guard-spend-push.sh.

input="$(cat)"
[ "$(printf '%s' "$input" | jq -r '.tool_name // ""')" = "Bash" ] || exit 0
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"

ask() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
}

# --- Pushing and remote repos -------------------------------------------------
# Separators, redirects and $(...)/`...` boundaries count on both sides, so
# `git push;ls`, `git push>x` and `echo $(git push)` are caught. A path or
# backslash before git (`/usr/bin/git`, `\git`) counts too.
if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:](`/\])git([[:space:]]+[^;&|[:space:]]+)*[[:space:]]+push([[:space:];&|)`<>]|$)'; then
  ask "guard-spend-push: git push needs the user's explicit OK. Pushing publishes code to a remote."
fi
# A path before gh (`/opt/homebrew/bin/gh`) counts as a boundary.
if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:](`/])gh[[:space:]]+(repo[[:space:]]+(create|delete|edit|fork)|release[[:space:]]+create|pr[[:space:]]+merge)'; then
  ask "guard-spend-push: this changes a GitHub repo. It needs the user's explicit OK."
fi

# --- Spending money -----------------------------------------------------------
# Any command that buys, upgrades or subscribes, in any tool.
# `git [opts] checkout` is a branch switch, not a purchase: drop just that word
# before matching, so other checkouts in the same command (URLs, stripe) still ask.
# Never strip when the command has `$(` or a backtick (a nested command could hide
# behind "git"). Only git's own subcommand is stripped: between git and checkout
# the only words allowed are -C <path>, --no-pager, --git-dir=<x> and
# --work-tree=<x>, so aliases (`git co checkout`, `-c alias.x=!cmd`) still ask.
spend_cmd="$cmd"
tok='[^;&|[:space:]$()`'"'"'"<>]+'
git_opts="([[:space:]]+(-C[[:space:]]+$tok|--no-pager|--git-dir=$tok|--work-tree=$tok))*"
case "$cmd" in
  *'$('* | *'`'*) ;;
  *) spend_cmd="$(printf '%s' "$cmd" | sed -E "s/(^|[;&|[:space:]])(git$git_opts[[:space:]]+)checkout([[:space:]]|\$)/\1\2\5/g")" ;;
esac
if printf '%s' "$spend_cmd" | grep -Eiq '(^|[^a-z])(buy|purchase|checkout|subscribe|upgrade[[:space:]]+(plan|tier|team|account)|billing|payment|add-?on)([^a-z]|$)'; then
  ask "guard-spend-push: this may spend money. Spending needs the user's permission AND a second confirmation of the item and the exact cost."
fi
# Cloud and SaaS CLIs creating or scaling resources (these can bill).
# `(` / `)` and backtick count as boundaries so $(...) and `...` forms are caught.
clouds='aws|gcloud|az|doctl|flyctl|fly|railway|heroku|netlify|supabase|atlas|stripe|vercel|neonctl|planetscale|pscale|turso|render|linode-cli|hcloud|terraform|pulumi|cdk|sst'
if printf '%s' "$cmd" | grep -Eq "(^|[;&|[:space:]/(\`])($clouds)([[:space:]].*)?[[:space:]](create|deploy|scale|apply|up|provision|launch|run-instances|domains[[:space:]]+add|certs[[:space:]]+add|projects?[[:space:]]+add)([[:space:])\`]|$)"; then
  ask "guard-spend-push: this creates or scales a cloud resource, which may cost money. Spending needs the user's permission AND a second confirmation of the item and the exact cost."
fi
# Paid API keys used directly (usage-billed LLM or other APIs).
if printf '%s' "$cmd" | grep -Eq '(api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.stripe\.com)'; then
  ask "guard-spend-push: this calls a usage-billed API. It needs the user's OK."
fi
exit 0
