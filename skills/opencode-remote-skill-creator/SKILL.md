---
name: opencode-remote-skill-creator
description: Use when a user asks OpenCode Remote to create, generate, draft, or improve a user/project OpenCode skill.
license: MIT
compatibility: opencode
metadata:
  audience: users-and-maintainers
  source: opencode-remote
---

# opencode-remote-skill-creator

Use this skill when helping a user design a generated OpenCode skill through OpenCode Remote.

## Destination Rules

- Project-local generated skills belong under `.opencode/skills/opencode-remote-generated/<skill-name>/SKILL.md`.
- Use global generated skills only when the user explicitly asks for a global user skill.
- Do not write generated skills into this repository's canonical `skills/` directory.
- Generated skills are user-owned OpenCode configuration, not runtime gateway protocol code.

## Skill Shape

Every generated skill needs:
- A lowercase hyphenated `name` that matches the folder name.
- A `description` that starts with concrete trigger words, such as `Use when...`.
- A focused body with clear instructions, boundaries, and examples when helpful.
- Privacy guidance when the skill might touch logs, credentials, paths, chat data, or project data.

## Creation Flow

Guide the user to provide:
1. A short skill name.
2. A trigger description explaining when the skill should activate.
3. The body instructions the skill should contain.
4. Confirmation before writing the file.

If the request is vague, ask one question at a time. Prefer practical multiple-choice prompts when possible.

## Privacy Rules

- Do not put API keys, bot tokens, raw Telegram IDs, raw local paths, raw logs, private config values, or private message text into generated skills.
- Summarize preferences and workflows instead of copying sensitive examples verbatim.
- If the user provides sensitive material, ask for a sanitized version before creating the skill.

## Output Rules

- Keep generated skills narrow. One skill should handle one recurring workflow or preference area.
- Do not create broad catch-all skills that pollute default skill context.
- Mention that OpenCode may need a restart or fresh process before a new skill is discovered.
