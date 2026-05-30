---
name: github-project-task-workflow
description: Use when creating, starting, selecting, or finishing GitHub issue-scoped tasks in this repository, especially "let's create a task", "let's do a task", issue branch, task branch, or worktree requests.
---

# GitHub Issue Task Workflow

## Core Rule

Task work should map to a GitHub repository issue when one exists and must use a branch named from the current GitHub login plus the issue number or free task name.

When the user says "let's create a task", prefer a GitHub issue in `crankshift/opencode-remote` using `.github/ISSUE_TEMPLATE/task.md` as the body structure, but allow manual issue creation or work without an issue when needed. Do not create or edit GitHub Project items.

GitHub Project board management is maintainer-owned and manual. External contributors should not need board permissions for this workflow.

Vocabulary split: `issue` and `task` mean GitHub issue/branch workflow only. `ticket`, `board ticket`, `project ticket`, or `maintainer ticket` means private maintainer board workflow and belongs to a global maintainer skill, not this public repo skill.

GitHub CLI is optional for contributors. Use it when available, but do not require users to install it.

If `gh` is missing or unauthenticated, offer the manual browser path instead of blocking:

1. Create the issue at `https://github.com/crankshift/opencode-remote/issues/new` using `.github/ISSUE_TEMPLATE/task.md` as the structure.
2. Ask the user for the issue number or URL if they want an issue-scoped branch.
3. If they do not want to create an issue yet, continue with a free branch name and never invent an issue number.

If the user wants to use `gh` but it reports missing authentication, ask the user to authorize:

```bash
gh auth login
```

If the user cannot or does not want to create an issue, continue with a free branch name and do not invent an issue number.

## Create Workflow

1. Derive a clear title from the request; ask only if the title is ambiguous.
2. Build the body with the same sections as `.github/ISSUE_TEMPLATE/task.md`: Summary, Context, Acceptance Criteria, Notes.
3. If `gh` is available and authenticated, write the body to a temp file, create a repository issue with `gh issue create -R crankshift/opencode-remote --title "Task title" --body-file /tmp/task-body.md`, capture the issue URL from stdout, and remove the temp file after creation.
4. If `gh` is missing or unauthenticated, give the user the title and body to create manually at `https://github.com/crankshift/opencode-remote/issues/new`; continue only after they provide an issue number/URL, or continue without an issue if they choose.
5. Summarize the created issue title, issue URL/number, and that board placement is manual.

Do not require labels, milestones, assignees, or project fields. External contributors may not have permission to set them.

## Start Workflow

1. If the user provides an issue number or URL and `gh` is available, resolve its title with `gh issue view ISSUE -R crankshift/opencode-remote --json number,title,url`.
2. If `gh` is missing, use the issue number/URL the user provided and ask for the title only if needed for the branch slug.
3. If the user names a task but no issue, ask whether to use an existing issue, create one manually or with `gh`, or work without an issue.
4. If the user chooses no issue, derive a clear free task name from the request.
5. Resolve login with `gh api user --jq .login` when possible; if `gh` is missing, ask for the GitHub login to use in the branch name.
6. Check `git status --short` before switching.
7. Create the branch using the Branch Names rules below.
8. If the user requested a worktree, use the worktree/isolation skill when available, but keep the same branch name.
9. Then continue with normal design, TDD, debugging, and verification skills.

## Branch Names

Issue format: `github-login/issue-number-title-slug`.

Free format: `github-login/free-task-name`.

Rules:

| Piece | Source |
| --- | --- |
| `github-login` | `gh api user --jq .login` when available, otherwise ask the user |
| `issue-number` | GitHub issue number only when an issue exists |
| `title-slug` / `free-task-name` | Lowercase ASCII title slug; remove punctuation, collapse hyphens |

Example: issue `42`, title `Fix Telegram Album Cleanup`, login `crankshift` -> `crankshift/42-fix-telegram-album-cleanup`.

Example without issue: title `Refresh README screenshots`, login `octocat` -> `octocat/refresh-readme-screenshots`.

Never use an issue number unless a real GitHub issue exists. Never use `task/42-...`, `issue-42-...`, or `feature/...` for issue-scoped tasks.

## Finish Workflow

Before creating a pull request or calling work complete:

1. Inspect `git status --short` and `git diff`.
2. Bump `package.json` version and update `CHANGELOG.md` so merging the pull request triggers the next release tag build.
3. Run normal verification: `pnpm run lint`, `pnpm test`, `pnpm run check`.
4. If work was issue-scoped, mention the issue number in the summary.

Do not move GitHub Project board status. The maintainer handles board management manually.

## Quick Reference

```bash
gh auth status
issue_url=$(gh issue create -R crankshift/opencode-remote --title "Task title" --body-file /tmp/task-body.md)
gh issue view 42 -R crankshift/opencode-remote --json number,title,url
gh api user --jq .login
git switch -c crankshift/42-fix-telegram-album-cleanup
git switch -c octocat/refresh-readme-screenshots
```

Manual issue creation URL: `https://github.com/crankshift/opencode-remote/issues/new`

## Common Mistakes

| Mistake | Correct behavior |
| --- | --- |
| Coding on `main` | Create the task branch first. |
| Worktree path replaces branch naming | Path may replace `/` with `-`; branch must keep `github-login/issue-number-title-slug` or `github-login/free-task-name`. |
| Inventing an issue number | Use an issue number only after resolving a real issue. |
| Requiring board access | Use GitHub issues and branches only; board management is manual. |
| Requiring GitHub CLI installation | Offer manual issue creation and ask for the issue number/URL or GitHub login when needed. |
| Assuming issue templates fill CLI bodies | Mirror `.github/ISSUE_TEMPLATE/task.md` manually in the issue body. |
| Requiring labels from contributors | Let maintainers manage labels manually. |
| Creating a pull request without release metadata | Before PR creation, bump `package.json` version and update `CHANGELOG.md`. |

## Red Flags

- User said "let's do issue 42" and you have not resolved issue 42.
- User said "let's create a task" and you are creating or editing a Project item instead of a repository issue.
- You are about to edit code without a task branch.
- Branch does not start with the current GitHub login.
- Branch includes an issue number that does not map to a real GitHub issue.
- You are telling a contributor to install `gh` instead of offering manual issue creation or free-branch fallback.
- Worktree exists without the required branch.
- You are about to create a pull request without an updated `package.json` version and `CHANGELOG.md` entry.
- You are about to claim completion without verification output.
