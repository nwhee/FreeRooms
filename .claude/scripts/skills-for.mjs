#!/usr/bin/env node
// Prints the skills an agent should load for a task.
// Usage: node .claude/scripts/skills-for.mjs <agent-name> <file> [file...]
//   Prints the default skills, then the dynamic skills matched from .claude/skill-map.json,
//   with the file that triggered each one.
// Usage: node .claude/scripts/skills-for.mjs --reviewers <file> [file...]
//   Prints who checks a change: qa-tester first (when code changed), then in parallel
//   vp-engineering and vp-product always, security-reviewer for securityTriggers files,
//   and design-reviewer for designTriggers files.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mapPath = join(here, "..", "skill-map.json");
const skillsDir = join(here, "..", "skills");

// Turns a glob into a RegExp. Supports **, *, ? and {a,b}.
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?"; // "**/" matches zero or more directories
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      const parts = glob.slice(i + 1, end).split(",").map((p) => p.replace(/[.+^$()|[\]\\]/g, "\\$&"));
      re += `(?:${parts.join("|")})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function skillsFor(map, agent, files) {
  const defaults = map.defaults[agent];
  if (!defaults) throw new Error(`Unknown agent "${agent}". Known: ${Object.keys(map.defaults).join(", ")}`);
  const result = defaults.map((skill) => ({ skill, reason: "default" }));
  if ((map.appliesTo?.[agent] ?? "code") === "none") return result;

  const seen = new Set(defaults);
  for (const rule of map.rules) {
    const patterns = rule.files.map(globToRegExp);
    const hit = files.map((f) => f.replace(/^\.\//, "")).find((f) => patterns.some((p) => p.test(f)));
    if (!hit) continue;
    for (const skill of rule.skills) {
      if (seen.has(skill)) continue;
      seen.add(skill);
      result.push({ skill, reason: hit });
    }
  }
  return result;
}

export function reviewersFor(map, files) {
  const clean = files.map((f) => f.replace(/^\.\//, ""));
  const match = (globs) => {
    const patterns = (globs ?? []).map(globToRegExp);
    return clean.filter((f) => patterns.some((p) => p.test(f)));
  };
  const code = clean.filter((f) => !/^docs\//.test(f) && !/\.md$/.test(f));
  const list = [];
  // QA runs first, so the reviewers (and the design reviewer especially) get its evidence.
  if (code.length) list.push({ reviewer: "qa-tester", reason: "first: behaviour may have changed" });
  list.push({ reviewer: "vp-engineering", reason: "always" }, { reviewer: "vp-product", reason: "always" });
  const sec = match(map.securityTriggers);
  if (sec.length) list.push({ reviewer: "security-reviewer", reason: sec.join(", ") });
  const ui = match(map.designTriggers);
  if (ui.length) list.push({ reviewer: "design-reviewer", reason: ui.join(", ") });
  return list;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [agent, ...files] = process.argv.slice(2);
  if (agent === "--reviewers") {
    const map = JSON.parse(readFileSync(mapPath, "utf8"));
    for (const { reviewer, reason } of reviewersFor(map, files)) console.log(`${reviewer}\t${reason}`);
    process.exit(0);
  }
  if (!agent) {
    console.error("Usage: skills-for.mjs <agent-name> <file> [file...]");
    process.exit(1);
  }
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  let list;
  try {
    list = skillsFor(map, agent, files);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  let missing = false;
  for (const { skill, reason } of list) {
    const ok = existsSync(join(skillsDir, skill, "SKILL.md"));
    if (!ok) missing = true;
    console.log(`${skill}\t${reason === "default" ? "default" : `dynamic: ${reason}`}${ok ? "" : "\tMISSING SKILL FILE"}`);
  }
  process.exit(missing ? 2 : 0);
}
