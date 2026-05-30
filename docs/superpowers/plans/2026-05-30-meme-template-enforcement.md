# Meme Template Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bundled meme generation use Imgflip/local templates first and reject accidental blank custom compositions.

**Architecture:** Keep the behavior split between the bundled OpenCode skill and deterministic renderer. The skill directs OpenCode to find an Imgflip template before rendering, while the renderer enforces that a render spec includes either an approved remote template URL or an explicitly allowed local template image.

**Tech Stack:** JavaScript ESM, Vitest, Sharp, OpenCode skill markdown, Biome.

---

## Files And Responsibilities

- `bundled-skills/meme-generation/SKILL.md`: user-facing OpenCode skill instructions. Require Imgflip/template-first workflow and allow design skills only as fallback.
- `src/core/memes/renderer.js`: deterministic local renderer. Reject specs that do not provide `template.url` or `template.imagePath`.
- `tests/core/memeRenderer.test.js`: renderer regression coverage for missing template rejection.
- `tests/runtime/aiSkillRegistration.test.js`: package/skill content expectations for the new instructions.
- `docs/superpowers/specs/2026-05-30-bundled-meme-agent-runtime-assets-design.md`: update durable design wording to match template-first behavior.

## Task 1: Renderer Rejects Missing Templates

**Files:**

- Modify: `tests/core/memeRenderer.test.js`
- Modify: `src/core/memes/renderer.js`

- [ ] **Step 1: Write the failing test**

Add this test near the existing renderer rejection tests:

```js
test("rejects render specs without a template source", async () => {
  await expect(
    renderMemeFromSpec({
      outputDirectory: await makeTempDirectory(),
      spec: { texts: ["do not invent poster"] },
    }),
  ).rejects.toThrow(/requires an Imgflip template URL or allowed local template image/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/core/memeRenderer.test.js -- --runInBand`

Expected: the new test fails because the renderer currently creates a blank Sharp image when no template is supplied.

- [ ] **Step 3: Write minimal implementation**

In `src/core/memes/renderer.js`, replace the no-template blank-image fallback with:

```js
throw new Error("Meme render spec requires an Imgflip template URL or allowed local template image")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/core/memeRenderer.test.js -- --runInBand`

Expected: all renderer tests pass.

## Task 2: Make Meme Skill Template-First

**Files:**

- Modify: `bundled-skills/meme-generation/SKILL.md`
- Modify: `tests/runtime/aiSkillRegistration.test.js`
- Modify: `docs/superpowers/specs/2026-05-30-bundled-meme-agent-runtime-assets-design.md`

- [ ] **Step 1: Write failing skill content assertions**

In `tests/runtime/aiSkillRegistration.test.js`, update the meme-generation assertions to include:

```js
expect(skill).toContain("Use Imgflip templates as the primary source")
expect(skill).toContain("Only use design or image-generation skills as fallback")
expect(skill).not.toContain("This skill is the complete workflow")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/runtime/aiSkillRegistration.test.js -- --runInBand`

Expected: the new assertions fail before the skill text changes.

- [ ] **Step 3: Update the skill instructions**

Edit `bundled-skills/meme-generation/SKILL.md` so it says:

```md
Use Imgflip templates as the primary source. Fetch the popular template list or a specific Imgflip template image, choose the closest fit, and render locally.

Only use design or image-generation skills as fallback when Imgflip/template discovery fails or no suitable template exists. Do not use fallback design generation instead of an available meme template.
```

Remove the sentence starting with `This skill is the complete workflow.`

- [ ] **Step 4: Update the design doc**

In `docs/superpowers/specs/2026-05-30-bundled-meme-agent-runtime-assets-design.md`, update the meme skill responsibilities and error handling sections to state that Imgflip/template discovery is the primary path and design/image-generation skills are fallback-only.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test tests/runtime/aiSkillRegistration.test.js -- --runInBand`

Expected: skill registration tests pass.

## Task 3: Verify The Change Set

**Files:**

- Verify: all modified files

- [ ] **Step 1: Run focused tests**

Run: `pnpm test tests/core/memeRenderer.test.js tests/runtime/aiSkillRegistration.test.js -- --runInBand`

Expected: both focused suites pass.

- [ ] **Step 2: Run standard verification**

Run: `pnpm run lint && pnpm test && pnpm run check`

Expected: lint, full tests, coverage/build/package/workflow smoke checks pass.

- [ ] **Step 3: Live-smoke only if needed**

If the dev gateway is still running, restart it after the package checks so OpenCode sees the updated bundled skill. Send a meme prompt and confirm Activity loads `meme-generation` and no blank custom generated poster is returned.

## Self-Review

- Spec coverage: covers template-first behavior, renderer enforcement, fallback-only design skills, tests, and docs.
- Placeholder scan: no placeholders or TBD items.
- Type consistency: uses existing `renderMemeFromSpec`, `makeTempDirectory`, and current Vitest patterns.
