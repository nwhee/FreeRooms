---
name: review-security
description: VP Engineering evaluation skill. Checks auth, input validation, secrets and data exposure.
---

# Review: security

- Every route handler and server action checks the session **and** that the user owns
  or may access the resource.
- All input is parsed with Zod before use. No raw `req.body` in queries (NoSQL
  injection via `$` operators).
- No secrets in client components, `NEXT_PUBLIC_*` variables, logs or error messages.
- Responses return only the fields the client needs. Never send whole documents with
  password hashes or internal fields.
- No `dangerouslySetInnerHTML` with user content.
- No production credentials, URIs or deploy commands anywhere in the change.
