# OpenCode Tool Progress Design

## Goal

Show the Telegram user which OpenCode tools and skills are used while a prompt is running, using a Hermes-style editable activity message.

## Decisions

- Use OpenCode SDK event streaming with `client.event.list()`.
- Treat `message.part.updated` events with `part.type === "tool"` as the source of tool progress.
- Keep OpenCode event shapes out of Telegram code by normalizing them in the OpenCode core.
- Add `OPENCODE_PROGRESS_VERBOSITY` with allowed values `off`, `new`, `all`, and `verbose`.
- Add `/progress` so the Telegram user can show or set the same verbosity values without restarting the gateway.
- Treat `OPENCODE_PROGRESS_VERBOSITY` as the startup default when no persisted Telegram setting exists.
- Default verbosity is `all`, meaning every distinct tool invocation is shown, including repeated uses of the same tool.
- Render `skill_view` as a skill line, for example `📚 skill_view: brainstorming`.
- Keep the activity UI best-effort. If event streaming or Telegram editing fails, the final prompt response should still be delivered.

## Architecture

The OpenCode client wrapper starts an event stream for prompts that provide an `onProgress` callback. It filters events by session ID and normalizes tool parts into messenger-neutral progress events:

```js
{
  type: "tool.updated",
  sessionId: "ses_...",
  messageId: "msg_...",
  partId: "part_...",
  tool: "skill_view",
  title: "brainstorming",
  status: "running",
  input: { skill: "brainstorming" },
}
```

The gateway controller accepts optional prompt options and passes progress callbacks through to OpenCode. The controller does not render or store Telegram-specific message IDs.

The Telegram adapter owns the editable activity message. It formats normalized progress events, sends the first activity message when the first visible event arrives, and edits that message as new invocations are discovered. Edits are throttled to reduce Telegram flood-control risk and flushed before the final assistant response is sent.

## Telegram UI

Default activity message:

```text
Activity
📚 skill_view: brainstorming
💻 bash
🔍 grep
📚 skill_view: verification-before-completion
```

Verbosity behavior:

- `off`: do not create an activity message.
- `new`: show each tool or skill name once per prompt.
- `all`: show each distinct tool invocation once per prompt.
- `verbose`: show each distinct invocation and append a safe short input preview when available.

Telegram control:

- `/progress` shows the current mode.
- `/progress off`, `/progress new`, `/progress all`, and `/progress verbose` set and persist the mode.
- `/status` includes the current mode.

Activity messages are not remembered as assistant replies for reaction feedback. Only final assistant replies remain part of bot message memory.

## Data Flow

```text
Telegram text or photo prompt
  -> Telegram adapter starts typing/reaction feedback
  -> Telegram adapter creates a prompt progress renderer
  -> gateway controller resolves the active OpenCode session
  -> OpenCode client starts event stream and sends prompt
  -> OpenCode emits message.part.updated tool parts
  -> OpenCode core normalizes progress events
  -> Telegram progress renderer appends and edits activity message
  -> OpenCode prompt resolves with final assistant text
  -> Telegram renderer flushes pending activity edits
  -> Telegram adapter sends final response chunks
```

## Error Handling

- Event-stream startup failures are logged or ignored as progress-only failures.
- Callback/rendering failures do not fail the OpenCode prompt.
- Telegram edit failures are logged and disable further edits for that activity message.
- If an activity message nears Telegram's message length limit, the adapter starts a new activity message.
- Final response errors keep using the existing safe user-facing error behavior.

## Tests

- OpenCode client tests cover event stream startup, tool event normalization, session filtering, and no-op behavior when progress is disabled.
- Formatting tests cover skill display, default `all`, `new`, `off`, and `verbose` behavior.
- Controller tests cover option pass-through to `opencode.sendPrompt`.
- Telegram adapter tests cover sending an activity message, editing it on later tool invocations, throttling, final flush, and not using activity messages for reaction feedback.

## Self-Review Notes

The design is scoped to prompt-time tool and skill visibility. It does not implement permissions, full assistant streaming, model switching, or command browsing. The OpenCode event stream is introduced only through a normalized progress callback so later permission and streaming features can reuse the same boundary without leaking SDK event shapes into adapters.
