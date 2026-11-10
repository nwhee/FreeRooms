---
name: data-table-patterns
description: Dynamic skill for table and list components. TanStack Table with shadcn Table, server-side pagination, sort and filter.
---

# Data table patterns

- TanStack Table (`@tanstack/react-table`) rendered with shadcn `Table` components.
- Column definitions in `columns.tsx` next to the table, typed with `ColumnDef<Row>`.
- Pagination, sorting and filtering live in the URL (`searchParams`) and run on the
  server for anything over ~100 rows.
- Always render empty, loading (skeleton rows) and error states.
- Row actions in a `DropdownMenu` with an accessible label.
- Mobile: hide low-priority columns below `md:` or switch to a card list.
