import { execa as defaultExeca } from "execa"

export async function renderVideoStickerPreview({
  inputPath,
  outputPath,
  execa = defaultExeca,
} = {}) {
  await execa("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vf",
    "fps=2,scale=256:-1,tile=3x2",
    "-frames:v",
    "1",
    outputPath,
  ])
  return { mime: "image/png", filePath: outputPath }
}

export async function renderAnimatedStickerPreview({
  inputPath,
  outputPath,
  execa = defaultExeca,
} = {}) {
  await execa("lottie_convert.py", [inputPath, outputPath])
  return { mime: "image/png", filePath: outputPath }
}
