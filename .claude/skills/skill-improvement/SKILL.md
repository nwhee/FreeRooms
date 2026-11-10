---
name: skill-improvement
description: Use when the user corrects the same kind of mistake twice. Propose a small edit to the relevant skill file so future sessions don't repeat it.
---

# Skill improvement

1. Name the mistake in one line and the correction the user gave.
2. Find the skill that should have prevented it (`.claude/skills/*/SKILL.md`), or the
   entry in `.claude/skill-map.json` that should have loaded a skill and didn't.
3. Propose the smallest edit: one bullet added or changed, or one map entry.
4. Show the user the diff and wait for their OK before writing it.
5. Never delete rules the user wrote. Never grow a skill past ~60 lines — split it.
