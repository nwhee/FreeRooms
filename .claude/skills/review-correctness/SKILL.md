---
name: review-correctness
description: VP Engineering evaluation skill. Checks that the code does what the spec says for all inputs, including edge cases.
---

# Review: correctness

- Trace each acceptance criterion to the code that meets it.
- Check edge cases: empty, null/undefined, one item, very many items, duplicates,
  concurrent requests, network failure, unauthorized user.
- Async: missing `await`, unhandled rejections, race conditions between requests.
- React: stale closures, missing effect dependencies, state updated after unmount,
  hydration mismatches between server and client.
- Data: off-by-one in pagination, time zones, number vs string ids, ObjectId compare.
- For each issue give the input or state that breaks it and what goes wrong.
