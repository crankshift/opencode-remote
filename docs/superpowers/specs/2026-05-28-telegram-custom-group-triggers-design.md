# Telegram Custom Group Triggers Design

## Overview

Telegram group routing currently supports built-in addressing triggers: replies to the bot, bot username mentions, bot-name prefixes, and optional bot-name anywhere matching. Add per-group custom trigger phrases so users can route group messages with workspace-specific phrases such as `codex please` or `shipbot`.

Custom triggers are configured from the existing DM-only `/group` menu. They are plain text, case-insensitive substring matches against the message text used for routing. They are not regular expressions.

## Requirements

- Store custom trigger phrases per Telegram group.
- Match custom triggers anywhere in text messages, photo captions, and voice transcripts.
- Keep trigger matching case-insensitive.
- Treat trigger phrases as plain text, not regex patterns.
- Normalize phrases by trimming and collapsing internal whitespace.
- Normalize candidate routing text by collapsing internal whitespace before matching.
- Deduplicate phrases case-insensitively.
- Cap each group at 20 custom triggers.
- Cap each phrase at 64 characters after normalization.
- Manage triggers from the existing DM `/group` menu.
- Do not persist group message text beyond the existing settings JSON.

## Non-Goals

- Regex triggers.
- Per-trigger match modes.
- Per-trigger reply policies.
- Group-chat configuration commands.
- Import/export of trigger lists.

## Data Model

Extend the existing group settings JSON with a `customTriggers` array:

```json
{
  "customTriggers": ["codex please", "shipbot"]
}
```

This keeps the change aligned with existing per-group settings and avoids a new table for a small bounded list. Existing groups without this field normalize to an empty list.

## Routing

The group routing decision keeps the current order for built-in triggers:

1. Reply to this gateway bot.
2. Mention this gateway bot.
3. Bot-name prefix.
4. Optional bot-name anywhere.
5. Custom trigger phrase anywhere.

Custom triggers use the same text source already passed to routing:

- Text messages use `message.text`.
- Photo routing uses combined captions.
- Voice routing uses the transcript.
- Stickers generally have no text, so custom triggers do not route sticker messages unless another trigger applies.

When matched, routing returns `trigger: "custom"`.

Matching uses normalized lower-case strings and plain substring checks. A phrase such as `codex please` matches `Codex    please check this`; punctuation remains literal text.

## Menu UX

The existing DM-only `/group` menu gains a custom trigger section in the group settings view:

- Show configured custom triggers in the settings summary.
- Provide an `Add custom trigger` button.
- Provide a `Remove custom trigger` button when at least one trigger exists.
- Provide a `Clear custom triggers` button when at least one trigger exists.

Adding a phrase uses a short pending state tied to the requesting user and selected group. The next private text message from that user is treated as the phrase, normalized, validated, and saved. `/cancel` exits the pending state without changes.

The Telegram bot checks this pending state before normal private text prompt handling so trigger setup messages are not forwarded to OpenCode.

Removal shows one button per configured phrase, using bounded callback tokens rather than raw long phrases.

## Validation

When adding a trigger phrase:

- Empty phrases are rejected.
- Phrases longer than 64 characters after normalization are rejected.
- Duplicate phrases, compared case-insensitively, are rejected.
- The 21st phrase is rejected with a clear message.

All messages are safe user-facing strings and do not expose internal paths, stack traces, or raw provider data.

## Testing

Add focused tests for:

- Routing matches custom triggers anywhere, case-insensitively.
- Routing treats custom trigger phrases as plain text.
- Routing does not match when no custom trigger is configured.
- Store normalization persists custom triggers and defaults missing values to `[]`.
- Menu add/remove/clear flows update group settings.
- Bot integration routes group text by custom trigger and includes passive context.

Run the normal verification command after implementation:

```bash
pnpm run check
```
