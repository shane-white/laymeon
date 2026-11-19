# Issue tracker: Linear

Issues and specs for this repo live in Linear, in the **LayMeOn** team (key `LAY`). Use the `linear` MCP server for all operations, not `gh issue`. The team conventions in `CLAUDE.md` (projects, statuses, branch names, commit messages) apply on top of this file.

## Conventions

- **Create an issue**: `save_issue` with `team: "LAY"`, `title`, `description` (Markdown) and `project` when one of the team's projects fits.
- **Read an issue**: `get_issue` with the identifier (e.g. `LAY-12`), then `list_comments` for the discussion.
- **List issues**: `list_issues` with `team: "LAY"` and filters such as `state`, `label`, `project`, `parentId`. Follow `cursor` while `hasNextPage` is true.
- **Sub-issues**: `save_issue` with `parentId: "LAY-<n>"`.
- **Blocking**: `save_issue` with `blockedBy: ["LAY-<n>"]` (or `blocks`). A ticket is unblocked when every blocker is Done, Canceled or Duplicate.
- **Comment**: `save_comment` on the issue.
- **Labels**: `save_issue` with `addLabels` / `removeLabels` (not `labels`, which replaces the whole set).
- **Close**: comment with the explanation, then set `state` to **Done** (or **Canceled** / **Duplicate** with `duplicateOf`).
## When a skill says "publish to the issue tracker"

Create a Linear issue in `LAY` as above.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a parent issue and its **child** issues are the tickets.

- **Map**: a `LAY` issue labelled `wayfinder:map` that holds the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a sub-issue of the map (`parentId`), labelled `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`).
- **Blocking**: see **Blocking** above.
- **Frontier query**: `list_issues` with `parentId: <map>`. Drop finished issues, any issue with an open blocker and any assigned issue. The first remaining one in map order wins.
- **Claim**: `save_issue` with `assignee: "me"` and `state: "In Progress"`. This is the session's first write.
- **Resolve**: comment with the answer, set the ticket to **Done**, then add a pointer (one-line gist plus link) to the map's Decisions-so-far section.
