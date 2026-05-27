---
name: github-project-task-workflow
description: Use when creating, starting, selecting, or finishing work from this repository's GitHub Projects board, especially "let's create a task", "let's do a task", project item, task branch, or worktree requests.
---

# GitHub Project Task Workflow

## Core Rule

Board work starts from the GitHub Projects board and must use a task branch named `github-login/taskid-free-task-name` before coding.

When the user says "let's create a task", create a GitHub Project draft item in `Todo` using the public task template structure from `.github/ISSUE_TEMPLATE/task.md`. Do not create a GitHub issue unless the user explicitly asks for an issue.

Board: `https://github.com/users/crankshift/projects/3/views/1`, owner `crankshift`, project `3`, status options `Todo`, `In Progress`, `Done`.

`gh project` item commands are project-scoped, not view-scoped. Treat view `1` as the configured human board view; if it has filters beyond `Status`, confirm the item is visible in that view before starting.

If `gh project` reports missing scopes, stop and ask the user to authorize:

```bash
gh auth refresh -s read:project -s project
```

Continue only after `gh project` reads succeed.

## Create Workflow

1. Derive a clear title from the request; ask only if the title is ambiguous.
2. Build the body with the same sections as `.github/ISSUE_TEMPLATE/task.md`: Summary, Context, Acceptance Criteria, Notes. Write it to a temp file and remove the temp file after creation.
3. Create a Project draft item with `gh project item-create 3 --owner crankshift --title "Task title" --body "$(< /tmp/task-body.md)" --format json`.
4. Resolve project ID, `Status` field ID, and `Todo` option ID live with `gh project view` and `gh project field-list`.
5. Set the new item to `Todo` with `gh project item-edit`.
6. Summarize the created draft item title, project item ID or URL, and `Todo` status.

Draft items do not automatically use GitHub issue templates. The template file is for public repository issues; this workflow mirrors its structure manually for Project draft items.

If the user explicitly asks for a GitHub issue, create the issue using `.github/ISSUE_TEMPLATE/task.md`, add it to project `3`, then set `Status` to `Todo`.

## Start Workflow

1. Read the board with `gh project item-list 3 --owner crankshift --query "status:Todo" --limit 100 --format json`.
2. If the user did not name a task, ask which visible `Todo` item to start.
3. Resolve project item ID, project ID, `Status` field ID, and `In Progress` option ID.
4. Resolve login with `gh api user --jq .login`.
5. Create branch `github-login/taskid-free-task-name`; check `git status --short` before switching.
6. If the user requested a worktree, use the worktree/isolation skill when available, but keep the same branch name.
7. Move the item to `In Progress` only after the branch or worktree exists.
8. Then continue with normal design, TDD, debugging, and verification skills.

## Branch Names

Format: `github-login/taskid-free-task-name`.

Rules:

| Piece | Source |
| --- | --- |
| `github-login` | `gh api user --jq .login` |
| `taskid` | GitHub issue or PR number, not project item ID |
| `free-task-name` | Lowercase ASCII title slug; remove punctuation, collapse hyphens |

Example: issue `42`, title `Fix Telegram Album Cleanup`, login `crankshift` -> `crankshift/42-fix-telegram-album-cleanup`.

Draft-only Project items have no valid `taskid`. Ask the user to create or link a GitHub issue/PR before creating a branch.

Never use `task/42-...`, `issue-42-...`, or `feature/...` for board tasks.

## Finish Workflow

Before moving an item to `Done`:

1. Inspect `git status --short` and `git diff`.
2. Run normal verification: `pnpm run lint`, `pnpm test`, `pnpm run check`.
3. Move to `Done` only after verification succeeds and the user is ready to finish.

If the user asks to skip tests, do not mark `Done` based on optimism. Leave the item `In Progress` unless the user explicitly accepts an unverified board state.

## Quick Reference

```bash
gh auth status
gh project item-create 3 --owner crankshift --title "Task title" --body "$(< /tmp/task-body.md)" --format json
gh project item-list 3 --owner crankshift --query "status:Todo" --limit 100 --format json
gh project view 3 --owner crankshift --format json --jq .id
gh project field-list 3 --owner crankshift --format json
gh api user --jq .login
git switch -c crankshift/42-fix-telegram-album-cleanup
git worktree add .worktrees/crankshift-42-fix-telegram-album-cleanup -b crankshift/42-fix-telegram-album-cleanup
gh project item-edit --id ITEM_ID --project-id PROJECT_ID --field-id STATUS_FIELD_ID --single-select-option-id OPTION_ID
```

Use `gh project item-list` for `ITEM_ID`; do not pass an issue number or issue node ID to `gh project item-edit`.

## Common Mistakes

| Mistake | Correct behavior |
| --- | --- |
| Coding on `main` | Create the task branch first. |
| Worktree path replaces branch naming | Path may replace `/` with `-`; branch must keep `github-login/taskid-...`. |
| Moving `In Progress` before branch creation | Create branch/worktree first. |
| Moving `Done` before verification | Verify first or leave `In Progress`. |
| Using a draft project item ID as `taskid` | Ask to create/link an issue or PR. |
| Creating a GitHub issue for "let's create a task" | Create a Project draft item unless the user asks for an issue. |
| Assuming draft items use issue templates | Mirror `.github/ISSUE_TEMPLATE/task.md` manually in the draft body. |

## Red Flags

- User said "let's do a task" and you have not read the board.
- User said "let's create a task" and you are creating an issue instead of a Project draft item.
- You are about to edit code without a task branch.
- Branch does not start with the current GitHub login.
- Branch task ID is not a GitHub issue or PR number.
- Worktree exists without the required branch.
- Board status update uses stale field or option IDs.
- You are about to mark `Done` without verification output.
