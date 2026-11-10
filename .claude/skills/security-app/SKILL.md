---
name: security-app
description: Security reviewer skill. Application security — auth, input handling, output encoding, secrets and headers in a Next.js app.
---

# Security: application

- Every route handler, server action and API route checks who the caller is and
  whether they may do this. Public, read-only endpoints say so explicitly.
- All input (body, query, params, headers, cookies, file uploads) is parsed with Zod
  before use. No raw input in database queries, shell commands, file paths or URLs
  (injection, path traversal, SSRF).
- No `dangerouslySetInnerHTML`, `eval` or `new Function` with data that isn't fully
  trusted.
- Secrets only in server-side code and env vars. Never `NEXT_PUBLIC_*`, never in
  client components, logs, error messages or committed files (`.env*` is gitignored).
- Responses return only the fields the client needs.
- Security headers: a CSP where practical, `X-Content-Type-Options`, and
  `Referrer-Policy`. Any cookies are `HttpOnly`, `Secure` and `SameSite`.
- Rate-limit anything that can be abused (forms, search, anything that triggers
  outside calls).
