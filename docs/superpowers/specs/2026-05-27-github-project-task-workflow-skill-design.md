# GitHub Project Task Workflow Skill Design

## Goal

Add a repo-local OpenCode skill that makes GitHub Projects board tasks start from the configured board, use the required task branch format, and update status only when the work state justifies it.

## Decisions

- The board is `https://github.com/users/crankshift/projects/3/views/1`.
- The board owner is `crankshift` and the project number is `3`.
- GitHub CLI item commands are project-scoped, so view `1` is treated as the configured human board view; if the view has filters beyond `Status`, agents must confirm the item is visible in that view before starting.
- The workflow treats `Todo`, `In Progress`, and `Done` as `Status` field options.
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
```

This location is a repo-local OpenCode skill path. OpenCode must be restarted before a running session automatically discovers the new skill.

## Baseline Skill Tests

Three RED-phase pressure scenarios were run before creating the skill:

- "Let's do a task quickly" often produced a reasonable flow but used `task/<id>-<slug>` instead of the required branch format.
- "Start issue 42 in a worktree" created a separate branch, but used `issue-42-...` rather than `github-login/42-...`.
- "Mark done and skip tests" correctly resisted skipping verification, but still needed explicit Done-state rules tied to board status.

The skill directly addresses these failures with required branch format examples, status gates, worktree-specific branch requirements, and red flags.

## Self-Review Notes

The skill is intentionally repo-specific. It does not add automation scripts because `gh project` can perform the required board operations and field IDs should be resolved live.
