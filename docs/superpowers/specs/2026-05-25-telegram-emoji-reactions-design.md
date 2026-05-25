# Telegram Emoji Reactions Design

## Goal

Add Telegram emoji reaction support to the gateway so reactions become part of the OpenCode conversation without moving Telegram-specific behavior into the core OpenCode integration.

The feature has three user-visible behaviors:

- Mark incoming authorized user text messages with an eye reaction while OpenCode is processing them.
- Let the user react to any known bot message and send that reaction to OpenCode as a normal prompt.
- Let OpenCode choose an emoji reaction for the bot to apply to the original user message by emitting a hidden marker in its response.

## Scope

This is Telegram-only adapter behavior. The core gateway still exposes normal prompt sending and does not learn Telegram message IDs, reactions, or grammY types.

The first implementation uses runtime memory only for bot message lookup. It does not persist Telegram message history across restarts.

## Telegram Capabilities

grammY supports reaction updates with `bot.on("message_reaction", handler)`. Long polling must request reaction updates with `allowed_updates`, including `"message"`, `"callback_query"`, and `"message_reaction"`.

The bot applies or clears reactions through Telegram's `setMessageReaction` API:

```js
ctx.api.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji: "👀" }])
ctx.api.setMessageReaction(chatId, messageId, [])
```

Reaction API failures are best-effort warnings. They must not block prompt sending or reply delivery.

## User Message Processing

When the authorized user sends a non-command text message:

1. The Telegram adapter applies `👀` to the user's message.
2. The adapter sends the text to OpenCode through the existing controller prompt path.
3. The adapter parses the OpenCode response for a hidden Telegram reaction marker.
4. The adapter sends the visible response chunks to Telegram.
5. The adapter stores sent bot message IDs and visible text in a bounded in-memory map.
6. The adapter clears `👀` from the user's message.
7. If a hidden reaction marker was present, the adapter applies that emoji as the bot reaction to the original user message.

The eye reaction is a processing indicator. Clearing it happens after replies are attempted. If clearing fails, the gateway logs a warning and continues.

## Hidden Bot-Reaction Marker

OpenCode can ask the Telegram adapter to react to the original user message by including this marker anywhere in its response:

```text
[telegram_reaction: 👍]
```

The marker is removed before sending the response to Telegram. The visible reply should never include it.

Only one reaction marker is used. If multiple markers appear, the adapter uses the first one and removes all marker occurrences from the visible response.

The marker accepts standard Telegram emoji reaction text as emitted by OpenCode. Invalid or unsupported emoji values are sent to Telegram best-effort; Telegram API failure is logged as a warning.

## User Reactions To Bot Messages

When the user changes a reaction on any bot message:

1. The Telegram adapter receives a `message_reaction` update.
2. The adapter ignores updates from unauthorized users.
3. The adapter extracts newly added emoji reactions.
4. The adapter looks up the reacted bot message in the in-memory bot message map.
5. If the bot message is unknown, the adapter does nothing.
6. If the bot message is known, the adapter sends OpenCode a normal prompt:

```text
User reacted to one of your Telegram bot messages with 👍.

Bot message:
<stored visible bot message text>
```

The adapter should send feedback only for newly added emoji reactions. Removing a reaction should not send a prompt.

OpenCode's response to a reaction feedback prompt is sent back to Telegram with the same chunking and bot-message memory behavior as a normal prompt response. If the response contains a hidden Telegram reaction marker, the marker is stripped from the visible reply; there is no user-message target for the bot reaction in this flow, so the requested reaction is ignored.

## Bot Message Memory

The Telegram adapter keeps a bounded in-memory map of recent bot messages:

- Key: `${chatId}:${messageId}`.
- Value: visible text content sent by the bot.
- Limit: 200 most recent bot messages.
- Persistence: none.

This map includes any bot messages sent through helper functions used by commands, callbacks, prompt replies, and reaction-feedback replies. If a handler sends a message and Telegram returns no message ID, nothing is stored.

The bound prevents unbounded memory growth in a long-running bot.

## Polling Startup

Runtime startup should call:

```js
bot.start({ allowed_updates: ["message", "callback_query", "message_reaction"] })
```

This keeps existing text messages and callback query handling active while enabling user reactions on bot messages.

## Error Handling

- Unauthorized reaction updates are ignored through the existing authorization middleware.
- Unknown reacted bot messages are ignored without notifying the user.
- Telegram reaction API failures log warnings and do not interrupt prompt flow.
- OpenCode prompt failures continue to use the existing safe grammY error handler.
- Reaction feedback prompts use the same active-session resolution as normal user prompts.

## Testing

Add tests for:

- Text prompts apply `👀`, send the OpenCode prompt, send the visible reply, then clear `👀`.
- Hidden `[telegram_reaction: 👍]` markers are removed from visible replies and applied to the original user message.
- `message_reaction` updates for known bot messages send reaction feedback prompts to OpenCode.
- `message_reaction` updates for unknown bot messages do nothing.
- Long polling starts with `allowed_updates` including `"message_reaction"`.
- Bot message memory remains bounded.

Default tests must keep using mocked Telegram and OpenCode objects. They should not require live Telegram or live OpenCode.

## Self-Review Notes

The design keeps Telegram-specific reaction mechanics in the Telegram adapter, preserves the messenger-neutral controller prompt boundary, avoids persisted Telegram message history, and handles rare unknown-message cases by doing nothing as requested.
