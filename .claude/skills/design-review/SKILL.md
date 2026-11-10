---
name: design-review
description: Default design reviewer skill. Usability, accessibility (WCAG 2.2 AA), responsive layout and visual consistency.
---

# Design review

**Clarity**
- Can a first-time user tell what the page is for and what to do next within a few
  seconds? Is the most important information the most visible?
- Labels say what things do, in plain words. No jargon or internal codes shown to users.
- Every state is designed: loading, empty, error, success, and stale data.

**Accessibility (WCAG 2.2 AA)**
- Text contrast is at least 4.5:1 (3:1 for large text and UI parts), in light and
  dark themes.
- Everything works by keyboard, with a visible focus ring, in a sensible order.
- Controls have accessible names. Icons alone get `aria-label`s. Errors are
  announced, not just colored.
- Touch targets are at least 24×24px (44px preferred). Nothing relies on hover alone.
- Respect `prefers-reduced-motion`.

**Layout**
- Works at 390px with no sideways scrolling, and at 1280px+ without overly long lines.
- Spacing, type sizes, colors and components come from the existing theme and
  shadcn/ui. One-off styles are flagged.

**Trust**
- Shows where the data comes from and how fresh it is when that matters.
- Never implies certainty the data doesn't have.
