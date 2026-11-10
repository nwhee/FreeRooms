---
name: nextjs-app-router
description: Dynamic skill for files under app/. Next.js App Router conventions — server components, route handlers, server actions, loading and error states.
---

# Next.js App Router

- `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` per route
  segment. Every data page has a `loading.tsx` and an `error.tsx`.
- Pages are Server Components that fetch data directly (through `lib/db`). No fetch to
  your own API from a server component.
- Mutations use server actions (`"use server"`) in `app/**/actions.ts`, parse input
  with Zod, check auth, then `revalidatePath` / `revalidateTag`.
- Route handlers (`route.ts`) only for external callers (webhooks, mobile, public API).
- `params` and `searchParams` are async — `await` them.
- Metadata via `export const metadata` or `generateMetadata`.
