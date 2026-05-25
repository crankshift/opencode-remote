# npm Trusted Publishing Design

## Goal

Add a repeatable npm release path for `@crankshift/opencode-remote` that publishes the built CLI package from GitHub Actions without storing a long-lived npm token in repository secrets.

The release path should help maintainers answer:

- What command or event publishes to npm?
- What verification runs before publishing?
- What npm and GitHub setup is required before the first release?
- How do maintainers cut a new SemVer release?

## Release Strategy

Use npm trusted publishing from GitHub Actions. Releases are triggered by pushing a Git tag that matches `v*`, such as `v0.1.1`.

This is preferred over token-based publishing because npm can exchange the GitHub Actions OIDC identity for publish credentials at release time. The repository does not need `NPM_TOKEN`, and the published package can carry provenance for the GitHub workflow that produced it.

Manual local publishing remains possible for emergency use by maintainers with npm access, but it is not the documented default path.

## Workflow

Add `.github/workflows/publish.yml` with one publish job:

- Trigger on pushed tags matching `v*`.
- Run on `ubuntu-latest`.
- Grant `contents: read` and `id-token: write` permissions.
- Check out the repository.
- Set up Node.js 24 and the npm registry URL.
- Enable pnpm through Corepack.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Run `pnpm run check` so lint, tests, build, and package smoke checks pass before publishing.
- Run `npm publish --access public`.

The package already has `publishConfig.access=public`, but the explicit `--access public` flag keeps first publish behavior clear for this scoped package.

Release builds should not use dependency caching. npm's trusted publishing guidance recommends disabling package-manager cache for release workflows.

## npm Setup Requirement

Before the first tag-triggered release, configure a trusted publisher for `@crankshift/opencode-remote` on npmjs.com.

The trusted publisher must match:

- The GitHub organization or username.
- The GitHub repository name.
- The workflow filename `publish.yml`.
- The GitHub environment name only if this workflow is later configured to use a protected environment.

If the trusted publisher is not configured, `npm publish` should fail with an authentication error instead of falling back to a repository secret.

npm's trusted publishing troubleshooting guidance also recommends that `package.json` include a `repository.url` matching the GitHub repository used for publishing. The package manifest should use the canonical GitHub repository URL `git+ssh://git@github.com/crankshift/opencode-remote.git`.

## Maintainer Release Steps

Document the release process in `README.md`:

1. Confirm npm trusted publishing is configured for the package and workflow.
2. Update `package.json` version and `CHANGELOG.md` for the release.
3. Run `pnpm run check` locally.
4. Commit the release changes.
5. Create an annotated or lightweight tag named `vX.Y.Z` matching the package version.
6. Push the commit and tag.
7. Verify the GitHub Actions publish workflow completes and the package appears on npm.

## Documentation Updates

Update public docs so the project no longer only says the package is buildable/publishable. It should also explain the supported release path.

`CHANGELOG.md` should note the new trusted npm publishing workflow under `Unreleased`.

`README.md` should add a concise maintainer-facing release section near the development/package checks.

## Verification

Local verification for this change is:

```bash
pnpm run check
```

The GitHub workflow itself cannot be fully exercised locally because trusted publishing requires GitHub-hosted OIDC. Review the workflow for correct permissions, trigger, package manager setup, and absence of `NODE_AUTH_TOKEN` or `NPM_TOKEN`.

## Out Of Scope

- Automated version bumping.
- GitHub Release creation.
- Changelog generation.
- Publishing prerelease dist-tags such as `next` or `beta`.
- Token-based npm publishing fallback.

## Self-Review Notes

The design is intentionally small: it adds one workflow and release documentation, relies on the package's existing build and smoke checks, and avoids new release tooling until there is a concrete need.
