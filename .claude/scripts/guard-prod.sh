#!/usr/bin/env bash
# PreToolUse hook: blocks any tool call that would touch production.
# AI never touches production directly; humans run scripts/deploy/.
# Exit 2 blocks the call and shows the message to Claude.

input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // ""')"

block() {
  echo "Blocked by guard-prod: $1. Production changes go only through scripts/deploy/, run by a human. Tell the user what needs to run instead." >&2
  exit 2
}

case "$tool" in
  Bash)
    cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"
    # Deploy commands
    printf '%s' "$cmd" | grep -Eq 'vercel[^|;&]*(--prod|promote|rollback)' && block "production Vercel command"
    printf '%s' "$cmd" | grep -Eq 'vercel[^|;&]*env[^|;&]*(pull|add|rm)[^|;&]*production' && block "production env vars"
    # Deploy scripts are for humans
    printf '%s' "$cmd" | grep -Eq '(^|[[:space:]/])scripts/deploy/' && block "deploy script"
    # Production credentials and env files
    printf '%s' "$cmd" | grep -Eiq '\.env\.production|MONGODB_URI_PROD|PROD(UCTION)?_DATABASE_URL' && block "production credentials"
    # Destructive git on shared branches
    printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push[^|;&]*(--force|-f)([[:space:]]|$)[^|;&]*(main|master)' && block "force push to main"
    ;;
  Read|Edit|Write|MultiEdit)
    path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')"
    case "$path" in
      *.env.production|*.env.production.*) block "production env file" ;;
      */scripts/deploy/*)
        [ "$tool" = "Read" ] || block "editing deploy scripts (they stay fixed once tested; ask the user first)"
        ;;
    esac
    ;;
esac
exit 0
