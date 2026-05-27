# GitHub Project Task Workflow Skill Design

## Goal

Add a repo-local OpenCode skill that makes GitHub Projects board tasks start from the configured board, supports creating new draft tasks, uses the required task branch format, and updates status only when the work state justifies it.

## Decisions

- The board is `https://github.com/users/crankshift/projects/3/views/1`.
- The board owner is `crankshift` and the project number is `3`.
- GitHub CLI item commands are project-scoped, so view `1` is treated as the configured human board view; if the view has filters beyond `Status`, agents must confirm the item is visible in that view before starting.
- The workflow treats `Todo`, `In Progress`, and `Done` as `Status` field options.
- "Let's create a task" creates a GitHub Project draft item in `Todo`, not a repository issue, unless the user explicitly asks for an issue.
- Draft task descriptions use the same public contributor structure as `.github/ISSUE_TEMPLATE/task.md`.
- GitHub issue templates do not apply automatically to Project draft items, so the skill mirrors the template structure manually when calling `gh project item-create`.
- Branches must use `github-login/taskid-free-task-name`.
- `github-login` is resolved from `gh api user --jq .login`.
- `taskid` is the GitHub issue or PR number for the project item.
- Draft-only project items must be converted to or linked with an issue/PR before branch creation.
- Worktree requests still require the same separate branch.
- Items move to `In Progress` only after the branch or worktree exists.
- Items move to `Done` only after verification succeeds, unless the user explicitly accepts an unverified board state.

## Skill Location

```text
.opencode/skills/github-project-task-workflow/SKILL.md
.github/ISSUE_TEMPLATE/task.md
```

The skill location is a repo-local OpenCode skill path. OpenCode must be restarted before a running session automatically discovers the new skill. The GitHub template location is the repository path GitHub uses for public issue templates.

## Baseline Skill Tests

Three RED-phase pressure scenarios were run before creating the skill:

- "Let's do a task quickly" often produced a reasonable flow but used `task/<id>-<slug>` instead of the required branch format.
- "Start issue 42 in a worktree" created a separate branch, but used `issue-42-...` rather than `github-login/42-...`.
- "Mark done and skip tests" correctly resisted skipping verification, but still needed explicit Done-state rules tied to board status.
- "Let's create a task for open source contributors" created a GitHub issue and found no `.github/ISSUE_TEMPLATE` file; the desired workflow is a Project draft item in `Todo` with a mirrored public task template.

The skill directly addresses these failures with required branch format examples, status gates, worktree-specific branch requirements, create-task draft item rules, template mirroring, and red flags.

## Self-Review Notes

The skill is intentionally repo-specific. It does not add automation scripts because `gh project` can perform the required board operations and field IDs should be resolved live.
