# Telegram Command Menus

Guide for Telegram command menus and inline button flows. Read this before changing Telegram command handlers, menu helpers, callback handlers, or pending text-input flows.

## Goals

- Make commands understandable without memorizing subcommands.
- Keep fast direct commands for power users.
- Keep Telegram UI concerns in `src/adapters/telegram/`.
- Keep command definitions centralized in `src/core/commands/commands.js`.
- Keep callback payloads short, bounded, and non-secret.

## Hybrid Pattern

Use this default pattern:

- Bare commands open a menu or dashboard, for example `/voice`, `/progress`, `/stickers`, and `/group`.
- Direct commands still work where useful, for example `/voice list ua 2`, `/voice set uk-UA-OstapNeural`, `/progress verbose`, and `/stickers forget pack_name`.
- Complex settings use grouped submenus instead of one long flat inline keyboard.
- Destructive or disruptive actions require confirmation.
- Free text is only for naturally user-authored values, such as a custom group trigger phrase.
- Menu buttons must perform real work: change state, open a submenu, start guided input, run an action, or navigate back. Do not add buttons that only tell the user to type another slash command.

## Visual Rules

- Message text explains current state and context.
- Buttons describe actions.
- Do not mix unrelated settings in one vertical button dump.
- Prefer 2-5 buttons per screen. Split or paginate when more are needed.
- Include `Back` on submenus and `Cancel` on confirmation or text-entry flows.
- Use human labels. Avoid raw IDs unless troubleshooting requires them.
- If a value must be typed, the button should start an explicit input flow and consume the next matching private text message.

Good labels:

```text
Answer humans only
Disable memory
Add trigger phrase
Back to Group
```

Bad labels:

```text
Reply: humans
Memory: off
Context chars: 12k
```

The bad labels are ambiguous because they mix current state with the action that will happen after tapping.

## Callback Rules

- Always call `answerCallbackQuery`; Telegram clients show a loading indicator until callbacks are answered.
- Use bounded in-memory tokens for long or sensitive values such as session IDs, permission IDs, group IDs, pack names, and voice choices.
- Scope tokens to the originating user when a menu changes private settings.
- Expired or wrong-user tokens must answer safely, for example `Menu expired`, without revealing private state.
- Do not persist raw callback payloads.
- Do not put raw session IDs, permission IDs, chat IDs, or user IDs directly in callback data.

## Menu State

Menu state can be:

- Durable app state, such as progress verbosity or saved group settings.
- Ephemeral token state, such as selected group, voice list page, or pending confirmation.
- Pending text-input state, such as waiting for a custom trigger phrase.

Keep ephemeral token state in bounded memory. If a token expires, the user can reopen the menu.

Pending text-input state must be keyed by user and target. Do not persist arbitrary user text before validation.

## Free Text Input

Use this flow when a menu action needs arbitrary user text:

1. A button starts input mode, for example `Add trigger phrase`.
2. The bot answers the callback and sends a clear prompt.
3. The next private text message from that user is consumed by the pending flow, not sent to OpenCode.
4. `/cancel` exits without changing state.
5. Validation errors explain the problem and keep the user in input mode.
6. Success updates state and returns to the relevant submenu.

Prompt requirements:

- Say exactly what value is expected.
- Include the target context, such as the group title.
- Include length or count limits.
- Include an example when helpful.
- Always mention `/cancel`.

Example:

```text
Add custom trigger

Send the phrase people can type in Build Room to route a message to OpenCode.
Max length: 64 characters.
Examples: codex please, remote

Send /cancel to stop.
```

## Command Recommendations

### `/help`

Use as a launcher and command reference.

- Buttons: `Status`, `Sessions`, `Voice`, `Progress`, `Stickers`, `Groups`, `Command Reference`.
- Keep a text reference for direct commands.

### `/status`

Use as a compact dashboard.

- Show gateway state, active session, progress setting, voice setting, and group summary when available.
- Buttons can link to `Sessions`, `Progress`, `Voice`, and `Refresh`.

### `/new`

Creating a session changes selected session and clears group memory. Prefer confirmation.

- Buttons: `Create Session`, `Cancel`.
- After success, offer `Sessions` or a short next-step hint.

### `/sessions`

Keep as an inline picker.

- Show current session clearly.
- Hide raw session IDs unless needed for troubleshooting.
- Paginate long lists.
- Include `Prev`, `Next`, `New Session`, and `Refresh` when applicable.

### `/stop`

Use confirmation.

- Show which session/task will be stopped.
- Buttons: `Stop Task`, `Cancel`.
- Stopping must not delete the session.

### `/progress`

Use a four-choice setting menu in private chats only.

- Show current progress mode in message text.
- Buttons: `Hide activity`, `Show new prompts`, `Show every update`, `Show detailed updates`.
- Keep direct commands: `/progress off`, `/progress new`, `/progress all`, `/progress verbose`.
- Group chats should keep Activity hidden and reply with a short private-chat-only notice.

### `/voice`

Use a settings hub.

- Show mode, captions, selected voice, STT readiness, and `ffmpeg` readiness.
- Buttons: `Reply Format`, `Captions`, `List Voices`, `Test Voice`.
- `Reply Format` opens a submenu with outcome-based buttons: `Text replies only`, `Voice when I send voice`, and `Voice for every prompt`.
- `Captions` opens a submenu with a captions toggle.
- `List Voices` opens a paginated country picker generated from the available Edge TTS voices; selecting a country opens a paginated voice picker with one button per voice.
- Keep direct commands: `/voice status`, `/voice on`, `/voice off`, `/voice all`, `/voice captions on|off`, `/voice list <countryCode|locale> [page]`, `/voice set <voiceShortName>`, `/voice test`.

Voice list flow:

- The menu flow should show paginated countries first, then paginated clickable voices for the selected country.
- Voice buttons must call the same validation/persistence path as `/voice set <voiceShortName>`.
- Direct `/voice list <countryCode|locale> [page]` still accepts typed country or locale filters.
- Paginate results.
- Show concise voice labels and selected/current state.
- Include `Prev`, `Next`, `Set Selected`, and `Back to Voice` when useful.
- Avoid dumping all Edge TTS voices.

### `/stickers`

Use a saved-pack manager.

- Show saved pack count and explain how packs are used.
- Buttons: `Saved Packs`, `How to Save`.
- `Saved Packs` opens pack buttons; a pack button opens pack actions such as `Forget Pack` and `Back`.
- Keep reply-based `/stickers save`; saving a pack needs a replied-to sticker.
- Keep direct commands: `/stickers list`, `/stickers forget <pack_name>`.
- Forgetting a pack should confirm before removing saved metadata and disposable cached previews.

### `/group`

Use a DM-only grouped settings menu.

- Running `/group` in a group sends a short notice to use DM.
- DM menu first lists known allowed groups by title.
- The group settings hub summarizes state and routes to category submenus.

Group hub buttons:

```text
Who the bot answers
What triggers replies
Custom trigger phrases
Temporary memory
Clear temporary memory
```

Who the bot answers submenu:

- Explain who the bot should answer.
- Show current policy in text.
- Buttons: `Do not answer group messages`, `Answer humans only`, `Answer bots only`, `Answer everyone`, `Back`.

Triggers submenu:

- Explain what makes a group message addressed to the bot.
- Show current enabled triggers in text.
- Buttons should be clear toggles, such as `Disable @mention` or `Enable name anywhere`.

Custom trigger phrases submenu:

- Explain bounded phrase matching.
- Show configured phrases and remaining capacity.
- Buttons: `Add trigger phrase`, `Remove trigger phrase`, `Remove all trigger phrases`, `Back`.
- `Add trigger phrase` uses the free-text input flow above.

Temporary memory submenu:

- Explain that memory is temporary and clears on restart or session changes.
- Show current memory status and context limits.
- Buttons should use action labels, such as `Disable memory`, `Keep last 10 messages`, `Use 12k chars`, `Back`.

Clear temporary memory:

- Require confirmation.
- Confirmation text must say persistent settings are not deleted.

## Existing Callback Flows

Permission approvals and sticker-save offers already use inline buttons and keep special behavior.

- Permission prompts must remain text-only, even when voice replies are enabled.
- Permission buttons stay explicit: `Allow once`, `Always allow`, `Deny`.
- Sticker-save offers can stay as a single `Save Pack` button.

## Testing

Add or update focused tests whenever menu behavior changes.

Cover:

- Bare command opens the expected menu.
- Direct command form still works.
- Callback tokens are bounded and user-scoped when settings are private.
- Every callback path calls `answerCallbackQuery`.
- Expired/wrong-user callback tokens fail safely.
- Pending text input consumes only the intended private text message.
- `/cancel` exits pending text input.
- Validation errors do not change state.
- Destructive actions require confirmation.

Default tests must mock Telegram and external services. Do not require live Telegram, OpenCode, Groq, Edge TTS, or `ffmpeg` for menu tests.

## Dependency Guidance

The adapter currently uses grammY `InlineKeyboard` directly. Evaluate `@grammyjs/menu` only if nested menus, dynamic ranges, back navigation, or menu updates become complex enough that the dependency reduces code and test complexity.
