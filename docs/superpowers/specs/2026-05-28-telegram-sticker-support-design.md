# Telegram Sticker Support Design

## Goal

Add Telegram sticker understanding and sticker replies so OpenCode receives meaningful visual sticker context, while the gateway can remember user-approved sticker packs for future replies.

## Decisions

- Static Telegram stickers are sent to OpenCode as downloaded `image/webp` attachments with no animation parsing.
- Video stickers use a generated visual preview contact sheet so OpenCode receives image context rather than only metadata.
- Animated `.tgs` stickers use `lottie_convert.py` from python-lottie when available, with source-file fallback when conversion is unavailable.
- Generated previews are cached under the opencode-remote app-data cache, not in OpenCode settings or project files.
- Cache identity is based on Telegram `file_unique_id`, sticker kind, dimensions, optional `file_size`, and a local converter version.
- `file_id` is stored only as the current Telegram handle for downloading or re-sending, never as the sticker identity.
- Saved sticker packs are controlled through Telegram UI: inline `Save pack`, `/stickers save`, `/stickers list`, and `/stickers forget <pack_name>`.
- Sticker pack state stores only non-secret Telegram file identifiers and metadata. It does not store bot tokens, download URLs, chat IDs, user IDs, raw Telegram payloads, or local temp paths.
- Existing incoming-message eye reactions remain unchanged.
- OpenCode permission prompts remain text-only.
- Default tests mock Telegram, OpenCode, file conversion, and network behavior.

## Architecture

Sticker behavior stays in the Telegram adapter. Core gateway and OpenCode modules continue to exchange messenger-neutral prompt objects with `text`, `author`, and `attachments`.

```text
src/adapters/telegram/stickerCache.js     app-data sticker cache paths, cache validation, and preview file cleanup
src/adapters/telegram/stickerStore.js     SQLite-backed saved packs and seen sticker metadata
src/adapters/telegram/stickerRenderer.js  static/video/animated representation helpers with injectable conversion
src/adapters/telegram/stickers.js         Telegram sticker download, metadata formatting, and prompt attachment orchestration
src/adapters/telegram/bot.js              commands, callbacks, message handlers, and sticker-vs-emoji reply selection
```

Runtime wiring opens a Telegram sticker store beside existing project state and passes sticker dependencies into `createTelegramBot`.

## Sticker Understanding Flow

```text
Telegram sticker message
  -> adapter stores seen sticker metadata
  -> adapter checks cache using file_unique_id and visual metadata
  -> static sticker downloads WebP and attaches it directly
  -> video or animated sticker reuses or creates a contact-sheet preview image
  -> prompt text includes sticker emoji, pack name, type, dimensions, and representation details
  -> OpenCode receives file attachment plus metadata text
  -> temporary downloads are cleaned up
```

If video or animated preview generation fails, the adapter logs a warning and falls back to Telegram's sticker thumbnail when available. If no visual attachment can be produced, the bot sends a safe short Telegram reply instead of sending metadata-only sticker understanding as a successful prompt.

## Cache Validation

A cached preview is reusable only when all checks pass:

```text
same file_unique_id
same sticker kind: static, video, or animated
same width and height
same file_size when Telegram provides it
same converter version
cached preview file exists
```

If a sticker pack author replaces a sticker, Telegram should send a different `file_unique_id`, so the gateway treats it as a new sticker and regenerates the cached visual.

## Sticker Pack Commands

```text
/stickers save
/stickers list
/stickers forget <pack_name>
```

- `/stickers save` must be used as a reply to a sticker. It saves the sticker's pack with `getStickerSet` when available, falling back to the replied sticker if Telegram cannot return the full set.
- `/stickers list` shows saved pack names, sticker counts, and a compact emoji summary.
- `/stickers forget <pack_name>` removes the saved pack from reply eligibility and deletes cached preview files associated with that pack.
- Incoming stickers with an unsaved `set_name` include an inline `Save pack` button. Callback data uses short bounded tokens, not raw pack names.

## Sticker Replies

The existing hidden OpenCode marker remains the model contract:

```text
[telegram_reaction: 👍]
```

When a marker is present and saved stickers exist, the adapter randomly chooses between the existing emoji reaction behavior and a sticker reply. Sticker selection prefers a saved sticker whose `emoji` matches the requested reaction. If no match exists, any saved sticker may be used. If sending the sticker fails, the bot falls back to the emoji reaction.

The temporary incoming `👀` reaction for text prompts remains unchanged and is not replaced by sticker behavior.

## Error Handling

- Telegram reaction and sticker-send failures are best-effort warnings and must not block prompt delivery.
- Sticker download/render failures use safe Telegram replies and log details without leaking tokens or raw provider bodies.
- Permission prompts continue to use plain text plus inline buttons, even when sticker packs are saved.
- Cache cleanup failures are logged as warnings.

## Self-Review Notes

The design keeps Telegram details inside the adapter, uses direct static sticker images without unnecessary parsing, caches expensive generated previews, and makes pack persistence explicit through user commands or an inline button.
