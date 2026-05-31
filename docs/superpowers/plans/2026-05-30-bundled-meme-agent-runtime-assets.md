# Bundled Meme Skill Runtime Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make OpenCode Remote's bundled meme-generation skill project-locally visible to OpenCode sessions and deliver locally rendered meme media through Telegram with a safe `MEDIA:` marker contract.

**Architecture:** Install package-owned bundled skills into the first project-local configured `skills.paths` directory, or `.opencode/skills/opencode-remote-bundled/<skill-name>/SKILL.md` when no project-local custom path is configured. Keep Telegram prompts on the active OpenCode session so OpenCode can decide whether to use the discoverable skill. Expose a hidden `opencode-remote meme render --spec` helper for deterministic local rendering, and let the Telegram adapter deliver only validated generated-media cache files.

**Important direction change:** Earlier drafts used a bundled OpenCode agent. The final implementation is skill-only. The installer still removes the legacy project-local `.opencode/agent/opencode-remote-meme.md` file when present so old experiments do not keep influencing OpenCode behavior.

## Files And Responsibilities

- `src/core/opencode/bundledRuntimeAssets.js`: project-local status and install for bundled skills, plus legacy project-local agent cleanup. No Telegram logic.
- `tests/core/bundledRuntimeAssets.test.js`: focused tests for status, install paths, legacy cleanup, no global writes, and overwrite behavior.
- `bundled-skills/meme-generation/SKILL.md`: self-contained OpenCode skill for direct local meme generation through OpenCode Remote.
- `src/core/memes/renderer.js`: deterministic local renderer with constrained template sources, text fitting, and output verification.
- `tests/core/memeRenderer.test.js`: renderer unit tests with mocked fetch and generated test images.
- `src/bin/program.js`: hidden `meme render` command for the bundled skill to call.
- `tests/bin/gatewayProgram.test.js`: hidden command behavior and JSON/spec validation tests.
- `src/adapters/telegram/generatedMedia.js`: parse `MEDIA:` lines, validate local image files, and send them through Telegram safely.
- `tests/adapters/telegramGeneratedMedia.test.js`: marker parsing and delivery tests.
- `src/adapters/telegram/skillsMenu.js`: show bundled meme skill status and refresh bundled skills in `/skills`.
- `src/adapters/telegram/bot.js`: wire runtime status/install dependencies for `/skills`, leave prompts on the active OpenCode session, add generated-media instructions, and deliver generated media markers.
- `tests/adapters/telegramBot.test.js`: menu, refresh callback, active-session routing, and generated media integration tests.
- `tests/runtime/aiSkillRegistration.test.js`: bundled skill registration tests.
- `tests/smoke/packageSmoke.js`: package smoke checks for bundled skills.
- `README.md`, `FEATURES.md`, `AGENTS.md`: document project-local enablement, generated media, and runtime asset boundaries.
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`: add `sharp`, allow its build, and package bundled skills.

## Completed Tasks

- [x] Add project-local bundled meme skill status/install manager.
- [x] Install bundled skills under a project-local configured `skills.paths` directory when available, otherwise under `.opencode/skills/opencode-remote-bundled/<skill-name>/SKILL.md`.
- [x] Remove legacy `.opencode/agent/opencode-remote-meme.md` during install if present.
- [x] Keep bundled runtime assets project-local and avoid global OpenCode config writes.
- [x] Make the bundled meme skill direct and bounded, with no task/subagent delegation.
- [x] Add local meme renderer and hidden `opencode-remote meme render --spec` CLI.
- [x] Restrict renderer remote templates to HTTPS Imgflip template URLs and forbid public meme creation endpoints.
- [x] Add safe generated-media marker parsing and Telegram delivery.
- [x] Constrain `MEDIA:` delivery to the gateway generated-media cache or injected test allowlist.
- [x] Pass exact generated-media directory instructions into OpenCode gateway context.
- [x] Remove Telegram-side forced agent selection for meme prompts.
- [x] Remove package references to bundled agents.
- [x] Update public docs for the skill-only workflow.

## Remaining Verification

- [ ] Run focused tests for bundled runtime assets, Telegram behavior, skill registration, and OpenCode client prompt bodies.
- [ ] Run full verification: `pnpm run lint`, `pnpm test`, and `pnpm run check`.
- [ ] Optionally live-smoke gateway startup or `/skills` refresh, restart OpenCode if an already-running server does not discover the skill, and confirm a generated meme file under the gateway generated-media cache is delivered through Telegram.

## Acceptance Criteria

- Gateway startup writes bundled skills under the first project-local configured `skills.paths` directory, or `.opencode/skills/opencode-remote-bundled/<skill-name>/SKILL.md` when none is configured, before ensuring the OpenCode server.
- `/skills` refresh updates bundled skills under the same project-local skill directory for the current project.
- Startup and `/skills` refresh remove legacy `.opencode/agent/opencode-remote-meme.md` if present.
- Telegram prompts never pass a forced agent option for meme requests.
- The meme skill uses local rendering and never calls Imgflip `/caption_image` or another public meme creation endpoint.
- `MEDIA:` markers are removed from visible text and only validated generated-media files are sent.
- Missing, unsafe, or unsupported media paths produce safe user-facing fallback behavior.
