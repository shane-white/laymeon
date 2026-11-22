# laymeon

## Database

Schema changes go in `supabase/migrations`: create one with `npx supabase migration new <name>` and apply it with `npx supabase db push --remote`. Don't change the live schema from the Supabase dashboard.

There's no local or branch database yet, so `--remote` is required: Supabase CLI v3 targets the local stack by default and fails without it. The remote is the production database, so run `npx supabase db push --remote --dry-run` first to see what will be applied.

## Task tracking (Linear)

Work for this repo is tracked in Linear in the **LayMeOn** team (key `LAY`). Use the `linear` MCP server; skills that create or read issues follow `docs/agents/issue-tracker.md`. The team's "Product Description" document describes the app's purpose, features and stack.

- Each feature set is a project in the `LAY` team. Put new issues in the project they belong to; if none fits, leave the project empty rather than creating one without asking. Current projects:
  - **UI Improvements**: polish and bug fixes in existing screens.
  - **MMP Features**: new or changed functionality needed for a minimum marketable product.
  - **Launch**: work outside the app needed to launch, such as the landing site and purchases.
  - **Optimizations**: improvements users don't see directly, before or after launch, such as lower AI token cost, faster responses, better performance and restructuring code to make it easier to test and change.
- Use sub-issues when one task breaks into several steps.
- Before creating an issue, search for an existing one to avoid duplicates.
- When starting non-trivial work, make sure an issue exists and move it to **In Progress**.
- When starting on several issues in one session (such as the sub-issues of a parent), first move them all to **Todo** so progress is easy to follow, then move each one forward as you work on it. Leave issues that are already In Progress or further along as they are.
- Name branches with the issue ID, e.g. `lay-12-fix-sidebar-scroll`.
- When a parent's sub-issues depend on each other, record it with Linear's blocking links (`blocks` / `blockedBy`), not with numbered titles or the order they're listed in. A sub-issue is ready when every issue blocking it is Done or merged into the parent's branch.
- Sub-issues of one parent share the parent's branch and PR (e.g. `lay-81-document-lifecycle`). Work ready sub-issues in parallel only when they touch different files: each in its own worktree and branch off the parent's branch, merged back into it when finished. Work the rest one at a time, directly on the parent's branch in the main checkout: a chain of dependent sub-issues, or ones that edit the same files. Each worktree needs its own `npm install` and `.next` cache, which is slow on Windows, so a worktree has to buy real parallel work. Commit each sub-issue with its own ID, and open the PR once every sub-issue is in the parent's branch.
- Reference the issue ID in commit messages (e.g. `LAY-12: fix sidebar scroll`).
- When a PR is opened, move every issue it covers to **In Review**. When it merges, move them to **Done**.
- If work surfaces a follow-up or bug you aren't fixing now, file it as a new issue in **Backlog** instead of leaving a TODO in the code.
- Team statuses: Backlog, Todo, In Progress, In Review, Done, Canceled, Duplicate.

## Agent skills

### When to use the workflow skills

- Use `tdd` for logic in `src/lib`. Make copy, styling and layout changes directly and check them in the running app.
- Run `mp-code-review` once per parent PR, on the parent's branch, rather than once per sub-issue.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
