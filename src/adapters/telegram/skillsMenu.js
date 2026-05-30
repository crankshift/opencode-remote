import { InlineKeyboard } from "grammy"

export function createTelegramSkillsMenu({
  discoverSkills,
  createGeneratedSkill,
  reply,
  logger,
  shouldStartFromText = () => true,
}) {
  const creationStates = new Map()

  return {
    async handleCommand(ctx) {
      if (telegramCommandArgs(ctx) === "create") {
        creationStates.set(pendingSkillKey(ctx), { step: "name" })
        await reply(ctx, "Skill name? Send a short name, or /cancel.")
        return
      }

      const result = await discoverSkills()
      logger?.debug?.(
        skillsDiscoveryLogContext(result),
        "OpenCode skills discovered for Telegram menu",
      )
      const keyboard = new InlineKeyboard()
        .text("Refresh", "skills:refresh")
        .row()
        .text("New skill", "skills:create")
      await reply(ctx, formatSkillsList(result), { parse_mode: "HTML", reply_markup: keyboard })
    },

    async handleCallback(ctx) {
      const action = ctx.match?.[1]
      if (action === "create") {
        creationStates.set(pendingSkillKey(ctx), { step: "name" })
        await ctx.answerCallbackQuery?.({ text: "Creating generated skill" })
        await reply(ctx, "Skill name? Send a short name, or /cancel.")
        return
      }
      if (action === "refresh") {
        await ctx.answerCallbackQuery?.({ text: "Refreshing skills" })
        await this.handleCommand(ctx)
      }
    },

    async handlePendingText(ctx) {
      const key = pendingSkillKey(ctx)
      const state = creationStates.get(key)
      if (!state) {
        const text = String(ctx.message?.text ?? "").trim()
        if (!shouldStartFromText(ctx) || !isSkillCreationRequest(text)) {
          return false
        }
        creationStates.set(key, { step: "name" })
        logger?.debug?.(
          { trigger: "natural_text" },
          "OpenCode generated skill creation started from Telegram text",
        )
        await reply(ctx, "Skill name? Send a short name, or /cancel.")
        return true
      }

      const text = String(ctx.message?.text ?? "").trim()
      if (text === "/cancel") {
        creationStates.delete(key)
        await reply(ctx, "Skill creation cancelled.")
        return true
      }

      if (state.step === "name") {
        creationStates.set(key, { ...state, step: "description", name: text })
        await reply(ctx, "Skill trigger description? Start with 'Use when ...', or /cancel.")
        return true
      }

      if (state.step === "description") {
        creationStates.set(key, { ...state, step: "body", description: text })
        await reply(ctx, "Skill instructions? Send the body text, or /cancel.")
        return true
      }

      if (state.step === "body") {
        creationStates.set(key, { ...state, step: "confirm", body: text })
        await reply(ctx, formatGeneratedSkillPreview({ ...state, body: text }))
        return true
      }

      if (state.step === "confirm") {
        if (!isAffirmative(text)) {
          creationStates.delete(key)
          await reply(ctx, "Skill creation cancelled.")
          return true
        }
        const created = await createGeneratedSkill({
          scope: "project",
          name: state.name,
          description: state.description,
          body: state.body,
          overwrite: false,
        })
        logger?.debug?.(
          { generatedSkillName: created.skillName, scope: created.scope ?? "project" },
          "OpenCode generated skill created from Telegram menu",
        )
        creationStates.delete(key)
        await reply(
          ctx,
          [
            `Created generated skill ${created.skillName}.`,
            `Path: ${created.filePath}`,
            "Restart OpenCode or start a fresh OpenCode process if the skill is not discovered immediately.",
          ].join("\n"),
        )
        return true
      }

      return false
    },
  }
}

function skillsDiscoveryLogContext({ skills = [], remoteSkillUrls = [] } = {}) {
  return {
    generatedSkillCount: skills.filter((skill) => skill.generated).length,
    remoteSkillUrlCount: remoteSkillUrls.length,
    skillCount: skills.length,
    skillScopes: uniqueSorted(skills.map((skill) => skill.scope)),
    skillSources: uniqueSorted(skills.map((skill) => skill.source)),
  }
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort()
}

function formatSkillsList({ skills = [], remoteSkillUrls = [] } = {}) {
  const projectSkills = skills.filter((skill) => skill.scope === "project" && !skill.generated)
  const generatedSkills = skills.filter((skill) => skill.generated)
  const bundledSkills = skills.filter((skill) => skill.scope === "bundled" && !skill.generated)
  const globalOpenCodeSkills = skills.filter(
    (skill) => skill.scope === "global" && !skill.generated && !isCompatibleSkill(skill),
  )
  const compatibleSkills = skills.filter((skill) => !skill.generated && isCompatibleSkill(skill))
  const sections = []

  appendSkillSection(sections, "<b>Project skills</b>", projectSkills)
  appendSkillSection(sections, "<b>Generated by OpenCode Remote</b>", generatedSkills)
  appendSkillSection(sections, "<b>Bundled OpenCode Remote skills</b>", bundledSkills)
  appendSkillSection(sections, "<b>Global OpenCode skills</b>", globalOpenCodeSkills)
  appendSkillSection(sections, "<b>Compatible skills (.claude/.agents)</b>", compatibleSkills)

  if (remoteSkillUrls.length > 0) {
    sections.push("", "Remote skill URLs are configured but not listed yet.")
  }
  if (sections.length === 0) {
    sections.push("No local OpenCode skills found.")
  }

  return sections.join("\n")
}

function isCompatibleSkill(skill) {
  return skill.source === "claude-compatible" || skill.source === "agents-compatible"
}

function appendSkillSection(sections, title, skills) {
  if (skills.length === 0) {
    return
  }
  if (sections.length > 0) {
    sections.push("")
  }
  sections.push(title)
  for (const [index, skill] of skills.entries()) {
    if (index > 0) {
      sections.push("")
    }
    sections.push(`📚 ${escapeHtml(skill.name)} - ${escapeHtml(skill.description)}`)
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
}

function formatGeneratedSkillPreview({ name, description, body }) {
  return [
    "Create generated project skill?",
    "",
    `Name: ${name}`,
    `Description: ${description}`,
    "Destination: .opencode/skills/opencode-remote-generated/<skill-name>/SKILL.md",
    "",
    "Instructions:",
    body,
    "",
    "Reply yes to create it, or /cancel.",
  ].join("\n")
}

function isAffirmative(text) {
  return /^(yes|y)$/iu.test(String(text ?? "").trim())
}

function isSkillCreationRequest(text) {
  const normalized = String(text ?? "").toLowerCase()
  return /\b(create|make|generate|add|draft)\b[\s\S]*\bskill\b/u.test(normalized)
}

function pendingSkillKey(ctx) {
  return String(ctx.chat?.id ?? ctx.message?.chat?.id ?? ctx.from?.id ?? "unknown")
}

function telegramCommandArgs(ctx) {
  const text = String(ctx.message?.text ?? "")
  return text.replace(/^\/skills(?:@\S+)?\s*/iu, "").trim()
}
