import { execa as defaultExeca } from "execa"

export const FFMPEG_INSTALL_MESSAGE = [
  "Voice mode requires ffmpeg to send Telegram voice notes.",
  "Install ffmpeg, then restart opencode-remote.",
  "",
  "macOS:   brew install ffmpeg",
  "Debian:  sudo apt install ffmpeg",
  "Fedora:  sudo dnf install ffmpeg",
  "Windows: winget install Gyan.FFmpeg",
].join("\n")

export async function checkFfmpeg({ execa = defaultExeca } = {}) {
  try {
    await execa("ffmpeg", ["-version"])
    return { available: true }
  } catch (error) {
    return { available: false, message: FFMPEG_INSTALL_MESSAGE, error }
  }
}

export async function assertFfmpegAvailable(options = {}) {
  const result = await checkFfmpeg(options)
  if (!result.available) {
    throw new Error(result.message)
  }
  return result
}

export async function convertMp3ToTelegramOgg({
  inputPath,
  outputPath,
  execa = defaultExeca,
} = {}) {
  await execa("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-ac",
    "1",
    "-c:a",
    "libopus",
    "-b:a",
    "32k",
    "-f",
    "ogg",
    outputPath,
  ])
  return { outputPath }
}
