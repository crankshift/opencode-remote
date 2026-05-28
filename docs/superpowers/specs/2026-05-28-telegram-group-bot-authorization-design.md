# Telegram Group Bot Authorization Design

## Goal

Support Telegram group usage without weakening authorization. The gateway should accept private direct messages only from configured human user IDs and accept all messages, including bot messages, from explicitly allowed group chat IDs. The new config shape should replace the single `telegram.allowedUserId` value with direct-user and group-chat allowlists and migrate existing configs safely.

## Context

OpenCode Remote currently accepts Telegram updates only when `ctx.from.id` equals `telegram.allowedUserId`. This works for one private chat user but blocks group workflows where a trusted group should be the access boundary.

To receive all messages in a group, the bot must be a group admin or Group Privacy Mode must be disabled in BotFather. To receive messages sent by other bots in those groups, Bot-to-Bot Communication Mode may also be required. Setup and docs should tell users this so they do not mistake Telegram delivery limits for gateway bugs.

## Config Shape

New configs use top-level `schemaVersion: 2`.

```json
{
  "schemaVersion": 2,
  "telegram": {
    "botToken": "123456:telegram-bot-token",
    "allowedUserIds": [123456789],
    "allowedChatIds": [-1001234567890]
  }
}
```

`telegram.allowedUserIds` fully replaces `telegram.allowedUserId`. It contains positive Telegram user IDs for trusted human operators who may use the bot in private direct chats. It may be empty when `allowedChatIds` is configured.

`telegram.allowedChatIds` authorizes all senders in matching group chats, including humans and bots. Chat IDs may be negative because Telegram groups and supergroups use negative identifiers. It may be empty when `allowedUserIds` is configured. At least one of `allowedUserIds` or `allowedChatIds` must be non-empty.

## Config Migration

Add `src/config/configMigration.js` and run it before Zod validation in `loadConfigFromObject` and before writing config updates in `writeConfig.js`.

Unversioned configs are treated as v1. V1 allows the old `telegram.allowedUserId` field. Migration to v2 creates `telegram.allowedUserIds` from the singular value, removes `telegram.allowedUserId`, and sets `schemaVersion: 2`.

If both `telegram.allowedUserId` and `telegram.allowedUserIds` are present, `allowedUserIds` wins and the singular value is removed. Obsolete `allowedBotIds` values are removed because this design intentionally uses group chat IDs as the group trust boundary.

Runtime code should consume only the normalized v2 config returned by `loadConfigFromObject`. It should not keep fallback checks against `allowedUserId` after migration.

## Setup UX

Setup prompts should write the v2 shape only.

Prompts:

- `Telegram user IDs allowed to DM this bot directly, comma-separated (optional)`
- `Telegram allowed group chat IDs, comma-separated (optional)`

The parser accepts whitespace around comma-separated tokens, so `1,2` and `1,   3` both produce arrays. Blank user/chat prompts are allowed only when the other prompt contains at least one ID. Invalid tokens produce clear setup validation errors.

Setup must print a short warning before or near the group chat prompt:

```text
Allowed chat IDs authorize all messages in those groups, including messages from other bots. To receive all group messages, make this bot a group admin or disable Group Privacy Mode in BotFather. To receive messages from other bots in groups, also enable Bot-to-Bot Communication Mode. Direct messages are allowed only for configured direct user IDs.
```

## Authorization

Authorization remains a Telegram adapter responsibility. Core gateway code should not receive Telegram-specific types or IDs.

`isAuthorizedTelegramUser` should become a sender/chat authorization helper that accepts the Telegram context and normalized Telegram auth config. It authorizes when:

- The update is in a private chat, `ctx.from.is_bot` is not true, and `ctx.from.id` is in `allowedUserIds`.
- The update is in a non-private chat and the update chat ID is in `allowedChatIds`, regardless of whether the sender is a human or a bot.

Everything else is ignored. Unauthorized ignores must not reply to the chat or expose project/session state. Logs should stay safe and avoid raw payloads or secrets; numeric IDs are acceptable for local debug/warn logs because they are already user-provided config inputs, but no bot tokens or raw update bodies should be logged.

## Data Flow

1. Config JSON is read.
2. `migrateConfig` normalizes old config shapes to v2.
3. Zod validates the v2 config.
4. Runtime passes `resolvedConfig.telegram` to the Telegram bot factory.
5. Telegram middleware checks each update before command/message handlers run.
6. Authorized private users and allowed group senders continue into the existing command, prompt, media, voice, and permission flows.
7. Progress `Activity` messages are rendered only in private chats. Group chats force prompt progress off, and `/progress` replies that tool progress is private-chat only.

## Error Handling

Invalid config should fail startup with `GatewayConfigError` and safe messages that identify the invalid config path/key without printing secrets.

Setup should keep asking until at least one direct user ID or group chat ID is configured. Direct user IDs must be positive integers. Group chat IDs may be negative. Optional list input with invalid tokens should be rejected with a clear message and re-prompted.

Unauthorized Telegram updates should be ignored without chat replies. The existing best-effort logging style is preserved.

## Documentation

Update `README.md` and `FEATURES.md` to describe:

- Optional allowed private direct user IDs.
- Optional allowed group chat IDs that authorize every sender in those groups.
- Group/supergroup chat IDs can be negative.
- Admin or disabled Group Privacy Mode requirement for receiving all bot messages in groups.
- Injection risk if untrusted groups are configured in `allowedChatIds`.
- Private-chat-only progress messages.

## Testing

Add focused Vitest coverage for:

- Migration from v1 `allowedUserId` to v2 `allowedUserIds`.
- `allowedUserIds` winning when both singular and plural fields are present.
- Setup parsing `1,2` and `1,   3`.
- Setup rejecting invalid IDs.
- `allowedChatIds` accepting negative IDs.
- Human allowlist authorization.
- Private direct user authorization.
- Allowed group authorization for humans and bots.
- Rejection of private bot messages and unallowed group messages.
- Progress suppression in groups.
- Runtime passing normalized Telegram auth config into `createTelegramBot`.

## Self-Review

No placeholders remain. The design keeps Telegram IDs in the adapter/config boundary and does not move Telegram concepts into core gateway orchestration. The migration scope is limited to config JSON and does not create speculative project-state migrations.
