---
name: github-project-task-workflow
description: Use when creating, starting, selecting, or finishing work from this repository's GitHub Projects board, especially "let's create a task", "let's do a task", project item, task branch, or worktree requests.
---

# GitHub Project Task Workflow

## Core Rule

Board work starts from a real GitHub repository issue on the GitHub Projects board and must use a task branch named `github-login/taskid-free-task-name` before coding.

When the user says "let's create a task", create a real GitHub issue in `crankshift/opencode-remote`, add that issue to the project board, and set it to `Todo`. Do not create GitHub Project draft items for normal board tasks.

Board: `https://github.com/users/crankshift/projects/3/views/1`, owner `crankshift`, project `3`, status options `Todo`, `In Progress`, `Done`.

`gh project` item commands are project-scoped, not view-scoped. Treat view `1` as the configured human board view; if it has filters beyond `Status`, confirm the item is visible in that view before starting.

If `gh project` or `gh issue` reports missing scopes, stop and ask the user to authorize:

```bash
gh auth refresh -s read:project -s project
```

Continue only after `gh project` reads and repository issue commands succeed.

## Create Workflow

1. Derive a clear title from the request; ask only if the title is ambiguous.
2. Build the body with the same sections as `.github/ISSUE_TEMPLATE/task.md`: Summary, Context, Acceptance Criteria, Notes. Write it to a temp file and remove the temp file after creation.
3. Ensure the repository has a `task` label. Check for an exact match with `gh label list -R crankshift/opencode-remote --search task --json name --jq '.[] | select(.name == "task") | .name'`; if there is no output, create it with `gh label create task -R crankshift/opencode-remote --description "Scoped implementation, maintenance, or documentation work" --color 5319E7`.
4. Create a repository issue with `gh issue create -R crankshift/opencode-remote --title "Task title" --body-file /tmp/task-body.md --label task`. Capture the issue URL from stdout.
5. Add the issue to the project with `gh project item-add 3 --owner crankshift --url "$issue_url" --format json`. Capture the project item ID from the JSON output.
6. Resolve project ID, `Status` field ID, and `Todo` option ID live with `gh project view` and `gh project field-list`.
7. Set the project item to `Todo` with `gh project item-edit`.
8. Summarize the created issue title, issue URL/number, project item ID, and `Todo` status.

Do not rely on draft project items for task work. Draft items have no repository issue number, which blocks the required branch naming format.

Do not silently drop the `task` label from the workflow. The template declares that label, so create it once if it is missing.

## Start Workflow

1. Read the board with `gh project item-list 3 --owner crankshift --query "status:Todo" --limit 100 --format json`.
2. If the user did not name a task, ask which visible `Todo` item to start.
3. If the chosen item is a draft project item, ask the user to convert or link it to a real GitHub issue before creating a task branch.
4. Resolve project item ID, issue number, project ID, `Status` field ID, and `In Progress` option ID.
5. Resolve login with `gh api user --jq .login`.
6. Create branch `github-login/taskid-free-task-name`; check `git status --short` before switching.
7. If the user requested a worktree, use the worktree/isolation skill when available, but keep the same branch name.
8. Move the item to `In Progress` only after the branch or worktree exists.
9. Then continue with normal design, TDD, debugging, and verification skills.

## Branch Names

Format: `github-login/taskid-free-task-name`.

Rules:

| Piece | Source |
| --- | --- |
| `github-login` | `gh api user --jq .login` |
| `taskid` | GitHub issue or PR number, not project item ID |
| `free-task-name` | Lowercase ASCII title slug; remove punctuation, collapse hyphens |

Example: issue `42`, title `Fix Telegram Album Cleanup`, login `crankshift` -> `crankshift/42-fix-telegram-album-cleanup`.

Draft-only project items have no valid `taskid`. Ask the user to create or link a GitHub issue/PR before creating a branch.

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
gh label list -R crankshift/opencode-remote --search task --json name --jq '.[] | select(.name == "task") | .name'
gh label create task -R crankshift/opencode-remote --description "Scoped implementation, maintenance, or documentation work" --color 5319E7
issue_url=$(gh issue create -R crankshift/opencode-remote --title "Task title" --body-file /tmp/task-body.md --label task)
item_id=$(gh project item-add 3 --owner crankshift --url "$issue_url" --format json --jq .id)
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
| Creating a Project draft item for "let's create a task" | Create a real repository issue, add it to the project, and set `Todo`. |
| Assuming `gh issue create --project` is enough | Add the issue with `gh project item-add`, then set `Status` explicitly with `gh project item-edit`. |
| Assuming issue templates fill draft bodies | Mirror `.github/ISSUE_TEMPLATE/task.md` manually in the issue body. |
| Dropping the `task` label because it does not exist | Create the repo label once, then create the issue with `--label task`. |

## Red Flags

- User said "let's do a task" and you have not read the board.
- User said "let's create a task" and you are creating a Project draft item instead of a real repository issue.
- You are about to edit code without a task branch.
- Branch does not start with the current GitHub login.
- Branch task ID is not a GitHub issue or PR number.
- The chosen board item is a draft item and you are about to invent a task ID.
- Worktree exists without the required branch.
- Board status update uses stale field or option IDs.
- You are about to mark `Done` without verification output.
