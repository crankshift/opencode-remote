import { execa as defaultExeca } from "execa"

const ffmpegInstallers = [
  {
    platform: "darwin",
    detectCommand: "brew",
    command: "brew",
    args: ["install", "ffmpeg"],
    displayCommand: "brew install ffmpeg",
  },
  {
    platform: "linux",
    detectCommand: "apt",
    command: "sudo",
    args: ["apt", "install", "ffmpeg"],
    displayCommand: "sudo apt install ffmpeg",
  },
  {
    platform: "linux",
    detectCommand: "dnf",
    command: "sudo",
    args: ["dnf", "install", "ffmpeg"],
    displayCommand: "sudo dnf install ffmpeg",
  },
  {
    platform: "win32",
    detectCommand: "winget",
    command: "winget",
    args: ["install", "Gyan.FFmpeg"],
    displayCommand: "winget install Gyan.FFmpeg",
  },
]

export const FFMPEG_INSTALL_MESSAGE = [
  "Voice mode requires ffmpeg to send Telegram voice notes.",
  "Install ffmpeg, then retry setup or restart opencode-remote.",
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

export async function detectFfmpegInstaller({
  platform = process.platform,
  execa = defaultExeca,
} = {}) {
  for (const installer of ffmpegInstallers.filter((candidate) => candidate.platform === platform)) {
    if (await commandExists(installer.detectCommand, execa)) {
      return {
        command: installer.command,
        args: installer.args,
        displayCommand: installer.displayCommand,
      }
    }
  }
  return null
}

export async function installFfmpeg(installer, { execa = defaultExeca } = {}) {
  try {
    await execa(installer.command, installer.args, { stdio: "inherit" })
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

async function commandExists(command, execa) {
  try {
    await execa(command, ["--version"])
    return true
  } catch {
    return false
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
