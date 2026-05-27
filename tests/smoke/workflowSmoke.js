import { readFile } from "node:fs/promises"

const checkWorkflow = await readRequiredFile(".github/workflows/check.yml")
const publishWorkflow = await readRequiredFile(".github/workflows/publish.yml")
const dependabotConfig = await readRequiredFile(".github/dependabot.yml")

assertMatches(checkWorkflow, /^name:\s*Check$/m, "check workflow is named Check")
assertIncludes(checkWorkflow, "pull_request:", "check workflow runs on pull requests")
assertMatches(
  checkWorkflow,
  /push:\n\s+branches:\n\s+- main/m,
  "check workflow runs on pushes to main",
)
assertMatches(checkWorkflow, /cache:\s*["']?pnpm["']?/m, "check workflow caches pnpm store")
assertIncludes(
  checkWorkflow,
  "pnpm install --frozen-lockfile",
  "check workflow uses lockfile install",
)
assertIncludes(checkWorkflow, "pnpm run check", "check workflow runs the repository check script")
assertDoesNotInclude(
  checkWorkflow,
  "id-token: write",
  "check workflow does not request npm publishing OIDC permissions",
)

assertMatches(
  publishWorkflow,
  /push:\n\s+tags:\n\s+- ["']v\*["']/m,
  "publish workflow runs only from v* tags",
)
assertDoesNotMatch(publishWorkflow, /^\s+branches:/m, "publish workflow does not run from branches")
assertMatches(publishWorkflow, /^\s+check:$/m, "publish workflow has a check job")
assertMatches(publishWorkflow, /^\s+publish:$/m, "publish workflow has a publish job")
assertIncludes(publishWorkflow, "needs: check", "publish job depends on check job")
assertIncludes(
  publishWorkflow,
  "package-manager-cache: false",
  "publish workflow disables package-manager caching",
)
assertIncludes(publishWorkflow, "GITHUB_REF_NAME", "publish workflow validates the release tag")
assertIncludes(
  publishWorkflow,
  "npm publish --provenance --access public",
  "publish workflow publishes with provenance and public access",
)
assertIncludes(
  publishWorkflow,
  "id-token: write",
  "publish workflow grants OIDC permission for trusted publishing",
)
assertDoesNotMatch(
  publishWorkflow,
  /NPM_TOKEN|NODE_AUTH_TOKEN/,
  "publish workflow does not use long-lived npm token secrets",
)

assertIncludes(dependabotConfig, "package-ecosystem: github-actions", "Dependabot updates actions")
assertIncludes(dependabotConfig, "package-ecosystem: npm", "Dependabot updates npm dependencies")

async function readRequiredFile(path) {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Required workflow file is missing: ${path}`)
    }
    throw error
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), `${message}: missing ${expected}`)
}

function assertDoesNotInclude(content, forbidden, message) {
  assert(!content.includes(forbidden), `${message}: found ${forbidden}`)
}

function assertMatches(content, pattern, message) {
  assert(pattern.test(content), `${message}: expected ${pattern}`)
}

function assertDoesNotMatch(content, pattern, message) {
  assert(!pattern.test(content), `${message}: matched ${pattern}`)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
