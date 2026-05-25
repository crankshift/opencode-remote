export const PROGRESS_VERBOSITIES = ["off", "new", "all", "verbose"]

const DEFAULT_VERBOSITY = "all"
const DEFAULT_PREVIEW_LENGTH = 80

export function createProgressTextState({ verbosity = DEFAULT_VERBOSITY, maxPreviewLength } = {}) {
  return {
    verbosity: PROGRESS_VERBOSITIES.includes(verbosity) ? verbosity : DEFAULT_VERBOSITY,
    lines: [],
    seen: new Set(),
    lineIndexes: new Map(),
    maxPreviewLength: maxPreviewLength ?? DEFAULT_PREVIEW_LENGTH,
  }
}

export function recordProgressEvent(state, event) {
  if (!state || state.verbosity === "off" || event?.type !== "tool.updated") {
    return { changed: false, text: renderProgressText(state) }
  }

  const line = formatProgressEvent(event, state)
  if (!line) {
    return { changed: false, text: renderProgressText(state) }
  }

  const key = progressEventKey(state.verbosity, event)
  const invocationKey = safeText(event?.partId)
  if (invocationKey && state.lineIndexes?.has(invocationKey)) {
    state.seen.add(key)
    const index = state.lineIndexes.get(invocationKey)
    if (state.lines[index] === line) {
      return { changed: false, text: renderProgressText(state) }
    }
    state.lines[index] = line
    return { changed: true, text: renderProgressText(state) }
  }

  if (state.seen.has(key)) {
    return { changed: false, text: renderProgressText(state) }
  }

  state.seen.add(key)
  if (invocationKey) {
    state.lineIndexes?.set(invocationKey, state.lines.length)
  }
  state.lines.push(line)
  return { changed: true, text: renderProgressText(state) }
}

export function formatProgressEvent(event, state = createProgressTextState()) {
  const tool = safeText(event?.tool) || "tool"
  const title = safeText(event?.title)
  const prefix = `${toolEmoji(tool)} ${tool}${title ? `: ${title}` : ""}`

  if (state.verbosity !== "verbose") {
    return prefix
  }

  const preview = formatInputPreview(event?.input, state.maxPreviewLength)
  return preview ? `${prefix} - ${preview}` : prefix
}

function renderProgressText(state) {
  if (!state?.lines?.length) {
    return ""
  }
  return ["Activity", ...state.lines].join("\n")
}

function progressEventKey(verbosity, event) {
  const tool = safeText(event?.tool) || "tool"
  const title = safeText(event?.title)
  if (verbosity === "new") {
    return `${tool}:${title}`
  }
  return safeText(event?.partId) || `${tool}:${title}`
}

function toolEmoji(tool) {
  if (tool === "skill" || tool === "skill_view" || tool.startsWith("skills_")) {
    return "📚"
  }

  switch (tool) {
    case "bash":
    case "shell":
    case "terminal":
      return "💻"
    case "glob":
    case "grep":
    case "web_search":
      return "🔍"
    case "read":
      return "📖"
    case "edit":
    case "write":
      return "📝"
    case "task":
      return "🤖"
    default:
      return "🔧"
  }
}

function formatInputPreview(input, maxLength) {
  if (input === undefined || input === null || input === "") {
    return ""
  }
  if (isEmptyPlainObject(input)) {
    return ""
  }
  const text = typeof input === "string" ? input : JSON.stringify(input)
  if (!text) {
    return ""
  }
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`
}

function isEmptyPlainObject(value) {
  return value && value.constructor === Object && Object.keys(value).length === 0
}

function safeText(value) {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim()
}
