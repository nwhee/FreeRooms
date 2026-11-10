---
name: tailwind-conventions
description: Dynamic skill for .tsx and styles. Tailwind CSS conventions — theme tokens, responsive and dark mode.
---

# Tailwind conventions

- Use theme tokens (`bg-background`, `text-muted-foreground`, `border-border`), never
  raw hex colors or arbitrary color values.
- Mobile first: base classes for phones, then `sm:` `md:` `lg:`.
- Dark mode works through the tokens. Check both themes.
- Layout with flex/grid and `gap-*`, not margins between siblings.
- Spacing on the 4px scale; no arbitrary values like `p-[13px]` without a reason.
- Long class lists: order layout → spacing → typography → color → state.
