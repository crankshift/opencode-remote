import { describe, expect, test } from "vitest"
import {
  createProgressTextState,
  recordProgressEvent,
} from "../../src/core/formatting/progressText.js"

describe("progress text formatting", () => {
  test("formats skill_view progress with the skill title", () => {
    const state = createProgressTextState({ verbosity: "all" })

    const result = recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_1",
      tool: "skill_view",
      title: "brainstorming",
    })

    expect(result).toEqual({
      changed: true,
      text: "Activity\n📚 skill_view: brainstorming",
    })
  })

  test("all verbosity records repeated invocations of the same tool", () => {
    const state = createProgressTextState({ verbosity: "all" })

    recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_1",
      tool: "bash",
    })
    const result = recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_2",
      tool: "bash",
    })

    expect(result).toEqual({
      changed: true,
      text: "Activity\n💻 bash\n💻 bash",
    })
  })

  test("new verbosity records each tool and title once", () => {
    const state = createProgressTextState({ verbosity: "new" })

    recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_1",
      tool: "skill_view",
      title: "brainstorming",
    })
    const result = recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_2",
      tool: "skill_view",
      title: "brainstorming",
    })

    expect(result).toEqual({ changed: false, text: "Activity\n📚 skill_view: brainstorming" })
  })

  test("updates an existing invocation when the skill title arrives later", () => {
    const state = createProgressTextState({ verbosity: "verbose" })

    recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_1",
      tool: "skill",
      input: {},
    })
    const result = recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_1",
      tool: "skill",
      title: "brainstorming",
      input: {},
    })

    expect(result).toEqual({
      changed: true,
      text: "Activity\n📚 skill: brainstorming",
    })
  })

  test("does not update an existing invocation when the line is unchanged", () => {
    const state = createProgressTextState({ verbosity: "verbose" })

    recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_1",
      tool: "skill",
      title: "brainstorming",
      input: {},
    })
    const result = recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_1",
      tool: "skill",
      title: "brainstorming",
      input: {},
    })

    expect(result).toEqual({
      changed: false,
      text: "Activity\n📚 skill: brainstorming",
    })
  })

  test("off verbosity does not record progress", () => {
    const state = createProgressTextState({ verbosity: "off" })

    const result = recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_1",
      tool: "bash",
    })

    expect(result).toEqual({ changed: false, text: "" })
  })

  test("verbose verbosity includes a short input preview", () => {
    const state = createProgressTextState({ verbosity: "verbose" })

    const result = recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_1",
      tool: "bash",
      input: {
        command: "pnpm test -- --very-long-flag-that-should-be-shortened-in-telegram",
      },
    })

    expect(result.changed).toBe(true)
    expect(result.text).toContain('💻 bash - {"command":"pnpm test')
    expect(result.text.length).toBeLessThan(140)
  })

  test("verbose verbosity does not render empty object input", () => {
    const state = createProgressTextState({ verbosity: "verbose" })

    const result = recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_1",
      tool: "skill",
      title: "brainstorming",
      input: {},
    })

    expect(result).toEqual({
      changed: true,
      text: "Activity\n📚 skill: brainstorming",
    })
  })

  test("skill tools use a skill emoji", () => {
    const state = createProgressTextState({ verbosity: "all" })

    const result = recordProgressEvent(state, {
      type: "tool.updated",
      partId: "part_1",
      tool: "skills_brand_guidelines",
    })

    expect(result).toEqual({
      changed: true,
      text: "Activity\n📚 skills_brand_guidelines",
    })
  })
})
