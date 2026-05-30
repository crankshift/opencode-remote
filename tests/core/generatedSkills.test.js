import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  buildGeneratedSkillDocument,
  GENERATED_SKILL_PARENT,
  generatedSkillDestination,
  sanitizeGeneratedSkillName,
} from "../../src/core/opencode/generatedSkills.js"

describe("generated OpenCode skills", () => {
  test("plans project-local generated skills under the opencode-remote-generated parent", () => {
    const destination = generatedSkillDestination({
      scope: "project",
      projectRoot: "/project/app",
      name: "Image Style Coach",
    })

    expect(destination).toEqual({
      scope: "project",
      skillName: "image-style-coach",
      directory: join(
        "/project/app",
        ".opencode",
        "skills",
        GENERATED_SKILL_PARENT,
        "image-style-coach",
      ),
      filePath: join(
        "/project/app",
        ".opencode",
        "skills",
        GENERATED_SKILL_PARENT,
        "image-style-coach",
        "SKILL.md",
      ),
      overwrite: false,
    })
  })

  test("plans global generated skills under the opencode-remote-generated parent", () => {
    const destination = generatedSkillDestination({
      scope: "global",
      homeDirectory: "/home/user",
      name: "Deploy Helper",
      overwrite: true,
    })

    expect(destination).toEqual({
      scope: "global",
      skillName: "deploy-helper",
      directory: join(
        "/home/user",
        ".config",
        "opencode",
        "skills",
        GENERATED_SKILL_PARENT,
        "deploy-helper",
      ),
      filePath: join(
        "/home/user",
        ".config",
        "opencode",
        "skills",
        GENERATED_SKILL_PARENT,
        "deploy-helper",
        "SKILL.md",
      ),
      overwrite: true,
    })
  })

  test("sanitizes readable skill names into OpenCode skill folder names", () => {
    expect(sanitizeGeneratedSkillName("My Image Prompt Style!")).toBe("my-image-prompt-style")
    expect(sanitizeGeneratedSkillName("  deploy___helper  ")).toBe("deploy-helper")
  })

  test("rejects invalid generated skill names", () => {
    expect(() => sanitizeGeneratedSkillName("")).toThrow("Generated skill name is required")
    expect(() => sanitizeGeneratedSkillName("!!!")).toThrow(
      "Generated skill name must contain letters or numbers",
    )
    expect(() => sanitizeGeneratedSkillName("a".repeat(90))).toThrow(
      "Generated skill name must be 64 characters or fewer",
    )
  })

  test("builds a generated SKILL.md document with ownership and privacy guidance", () => {
    const document = buildGeneratedSkillDocument({
      name: "image-style-coach",
      description: "Use when improving user-specific image prompt style.",
      body: "Prefer stark contrast, practical constraints, and direct composition notes.",
    })

    expect(document).toContain("---\nname: image-style-coach\n")
    expect(document).toContain(
      "description: Use when improving user-specific image prompt style.\n",
    )
    expect(document).toContain("source: opencode-remote-generated")
    expect(document).toContain("# image-style-coach")
    expect(document).toContain(
      "This skill was generated through OpenCode Remote and belongs to this OpenCode configuration scope.",
    )
    expect(document).toContain("Prefer stark contrast")
    expect(document).toContain("Do not store secrets, raw Telegram IDs, private local paths")
  })

  test("rejects generated skill documents without a useful description", () => {
    expect(() =>
      buildGeneratedSkillDocument({
        name: "deploy-helper",
        description: "",
        body: "Deploy with pnpm.",
      }),
    ).toThrow("Generated skill description is required")
  })
})
