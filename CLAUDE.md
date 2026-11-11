# laymeon

## Database

Schema changes go in `supabase/migrations`: create one with `npx supabase migration new <name>` and apply it with `npx supabase db push --remote`. Don't change the live schema from the Supabase dashboard.

There's no local or branch database yet, so `--remote` is required: Supabase CLI v3 targets the local stack by default and fails without it. The remote is the production database, so run `npx supabase db push --remote --dry-run` first to see what will be applied.

## Task tracking (Linear)

Work for this repo is tracked in Linear in the **LayMeOn** team (key `LAY`). Use the `linear` MCP server. The team's "Product Description" document describes the app's purpose, features and stack.

- Each feature set is a project in the `LAY` team. Put new issues in the project they belong to; if none fits, leave the project empty rather than creating one without asking. Current projects:
  - **UI Improvements**: polish and bug fixes in existing screens.
  - **MMP Features**: new or changed functionality needed for a minimum marketable product.
  - **Launch**: work outside the app needed to launch, such as the landing site and purchases.
  - **Optimizations**: post-launch improvements users don't see directly, such as lower AI token cost, faster responses and better performance.
- Use sub-issues when one task breaks into several steps.
- Before creating an issue, search for an existing one to avoid duplicates.
- When starting non-trivial work, make sure an issue exists and move it to **In Progress**.
- Name branches with the issue ID, e.g. `lay-12-fix-sidebar-scroll`.
- Reference the issue ID in commit messages (e.g. `LAY-12: fix sidebar scroll`).
- When a PR is opened, move the issue to **In Review**. When it merges, move it to **Done**.
- If work surfaces a follow-up or bug you aren't fixing now, file it as a new issue in **Backlog** instead of leaving a TODO in the code.
- Team statuses: Backlog, Todo, In Progress, In Review, Done, Canceled, Duplicate.
