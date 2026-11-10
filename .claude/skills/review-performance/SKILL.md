---
name: review-performance
description: VP Engineering evaluation skill. Checks queries, rendering and bundle size for avoidable cost.
---

# Review: performance

- MongoDB: queries filter on indexed fields; no N+1 loops of queries; projections
  instead of whole documents; pagination on unbounded lists.
- Rendering: work done on the server where possible; no large client components;
  lists have stable keys; no needless re-renders from new objects in props.
- Bundle: no heavy library imported into a client component for a small task.
- Caching: fetches and server data use the right Next.js cache / revalidate settings.
- Only flag what has a real cost at expected scale. Give the scale.
