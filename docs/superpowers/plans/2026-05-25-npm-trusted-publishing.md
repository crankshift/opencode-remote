# npm Trusted Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tag-triggered npm trusted publishing workflow and maintainer release instructions.

**Architecture:** Keep release automation in a single GitHub Actions workflow and keep release process documentation in the public README. Reuse the existing `pnpm run check` command so lint, tests, build, and package smoke checks remain the release gate.

**Tech Stack:** GitHub Actions, npm trusted publishing/OIDC, Node.js 24, Corepack/pnpm, Markdown.

---

## File Structure

- Create `.github/workflows/publish.yml`: tag-triggered trusted npm publish workflow.
- Modify `README.md`: add maintainer release steps near development checks.
- Modify `CHANGELOG.md`: record the trusted publishing workflow under `Unreleased`.
- Modify `docs/superpowers/specs/2026-05-25-npm-trusted-publishing-design.md`: already created design source for this plan.

## Task 1: Add Trusted Publishing Workflow

**Files:**
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Create the workflow directory and file**

Create `.github/workflows/publish.yml` with this content:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - "v*"

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"
          package-manager-cache: false

      - name: Enable pnpm
        run: corepack enable pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run checks
        run: pnpm run check

      - name: Publish package
        run: npm publish --access public
```

- [ ] **Step 2: Review workflow authentication**

Confirm the workflow has no npm token fallback:

```text
Expected workflow properties:
- permissions.id-token is write
- permissions.contents is read
- no NODE_AUTH_TOKEN environment variable
- no NPM_TOKEN secret reference
- publish command is npm publish --access public
```

## Task 2: Document Maintainer Release Process

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add release instructions after package smoke check**

In `README.md`, after the package smoke check block, add:

```md
## Release

Releases publish to npm from GitHub Actions using npm trusted publishing. The repository does not need an `NPM_TOKEN` secret.

Before the first release, configure a trusted publisher for `@crankshift/opencode-remote` on npmjs.com. It must match the GitHub repository and workflow filename `publish.yml`.

To publish a release:

1. Update `package.json` version and `CHANGELOG.md`.
2. Run `pnpm run check`.
3. Commit the release changes.
4. Tag the commit with `vX.Y.Z`, matching the package version.
5. Push the commit and tag.
6. Verify the `Publish to npm` GitHub Actions workflow completes and the package appears on npm.

The workflow runs `pnpm run check` before `npm publish --access public`.
```

## Task 3: Update Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add an Unreleased bullet**

Under `## Unreleased` and `### Added`, add this bullet:

```md
- Added a tag-triggered GitHub Actions workflow for npm trusted publishing.
```

## Task 4: Verify Release Changes

**Files:**
- Verify: `.github/workflows/publish.yml`
- Verify: `README.md`
- Verify: `CHANGELOG.md`

- [ ] **Step 1: Run full local checks**

Run:

```bash
pnpm run check
```

Expected: PASS. This confirms lint, tests, build, package smoke checks, and npm pack verification still pass.

- [ ] **Step 2: Inspect git diff**

Run:

```bash
git diff -- .github/workflows/publish.yml README.md CHANGELOG.md docs/superpowers/specs/2026-05-25-npm-trusted-publishing-design.md docs/superpowers/plans/2026-05-25-npm-trusted-publishing.md
```

Expected: Diff contains only the new workflow, release docs, changelog bullet, and superpowers design/plan docs.

## Self-Review

The plan covers every approved spec requirement: tag trigger, Node 24, Corepack pnpm install, existing `pnpm run check` gate, token-free `npm publish --access public`, README release instructions, and changelog documentation. It avoids unapproved version bumping, GitHub Release creation, changelog generation, prerelease dist-tags, and npm token fallback.
