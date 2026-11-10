---
name: security-data-privacy
description: Security reviewer skill. What data is collected, stored and published, and how outside services are used.
---

# Security: data and privacy

- List the data the change collects, stores or publishes. Flag anything personal
  (names, emails, IDs, locations of individuals) and anything that sat behind a login.
- Published data must already be public where it came from, and the site must not
  make it easier to misuse (for example, private event names or locations).
- Outside services: the change respects their terms and robots.txt, sends a clear
  User-Agent that doesn't include personal contact details, rate-limits, backs off on
  errors and caches results. No logins or session tokens in automated jobs unless
  the user approved it.
- Analytics and third-party scripts: none are added without the user's OK, and
  only privacy-respecting ones.
- Logs don't contain personal data or secrets.
- Anything new that's stored has a reason to be kept and a way to be deleted.
