---
name: implementation-patterns
description: Default engineer skill. How to implement a change in this codebase by following existing patterns, keeping changes small and typed.
---

# Implementation patterns

- **Find the closest existing example first.** Search for a component, route or model
  that does something similar and follow its structure, naming and file layout.
  Don't introduce a new pattern when one already exists.
- **TypeScript strict.** No `any`, no `@ts-ignore`. Use `unknown` and narrow it.
  Infer types from Zod schemas (`z.infer`) instead of writing them twice.
- **Validate at the boundaries.** Route handlers, server actions and form submits
  parse input with Zod. Inside the app, trust the types.
- **Server first.** Default to Server Components. Add `"use client"` only for state,
  effects, event handlers or browser APIs, and keep client components small (leaves).
- **One concern per file.** Data access in `lib/db/`, validation in `lib/schemas/`,
  UI in `components/`, routes in `app/`.
- **Errors:** throw typed errors in `lib/`, catch them at the route or action and
  return a clear message. Never swallow an error silently.
- **No dead code.** Delete what you replace. No commented-out blocks.
- **Small commits** after each working step.
