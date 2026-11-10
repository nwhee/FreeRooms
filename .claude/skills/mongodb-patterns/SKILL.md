---
name: mongodb-patterns
description: Dynamic skill for lib/db, models and migrations. MongoDB access patterns, schemas, indexes and migrations.
---

# MongoDB patterns

- One shared client in `lib/db/client.ts`, reused across requests (cached on
  `globalThis` in development).
- Every collection has a Zod schema in `lib/schemas/` and a typed accessor in
  `lib/db/<collection>.ts`. Routes and components never call the driver directly.
- Convert `ObjectId` to string at the `lib/db` boundary. Validate incoming ids with
  `ObjectId.isValid`.
- Index every field you filter or sort on. Declare indexes in
  `lib/db/indexes.ts`.
- Migrations live in `migrations/` as numbered scripts that are idempotent and
  reversible. They run against local or staging only — production migrations go
  through `scripts/deploy/`, run by a human.
- Tests use `mongodb-memory-server`.
