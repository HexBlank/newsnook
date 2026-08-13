/**
 * Rasterize Suwen adaptive icon into legacy mipmap PNGs for API < 26.
 *
 * Source of truth (assets/android-icon/):
 * - ic_launcher_background.png
 * - ic_launcher_foreground.png
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const resRoot = path.join(projectRoot, 'android/app/src/main/res')
const iconDir = path.join(projectRoot, 'assets/android-icon')
const backgroundPath = path.join(iconDir, 'ic_launcher_background.png')
const foregroundPath = path.join(iconDir, 'ic_launcher_foreground.png')

const DENSITIES = [
  { folder: 'mipmap-ldpi', size: 36 },
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
]

async function composeIcon(size, round) {
  const canvas = 1080
  const background = await sharp(backgroundPath).resize(canvas, canvas).png().toBuffer()
  const foreground = await sharp(foregroundPath)
    .resize(canvas, canvas, { fit: 'fill', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  let composed = await sharp(background)
    .composite([{ input: foreground, top: 0, left: 0 }])
    .png()
    .toBuffer()

  if (round) {
    const mask = await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}">
          <circle cx="${canvas / 2}" cy="${canvas / 2}" r="${canvas / 2}" fill="#fff"/>
        </svg>`,
      ),
    )
      .resize(canvas, canvas)
      .ensureAlpha()
      .png()
      .toBuffer()

    composed = await sharp(composed)
      .ensureAlpha()
      .composite([{ input: mask, blend: 'dest-in', top: 0, left: 0 }])
      .png()
      .toBuffer()
  }

  return sharp(composed).resize(size, size).png().toBuffer()
}

async function main() {
  for (const required of [backgroundPath, foregroundPath]) {
    if (!fs.existsSync(required)) {
      throw new Error(`Missing icon master: ${required}`)
    }
  }

  for (const { folder, size } of DENSITIES) {
    const dir = path.join(resRoot, folder)
    fs.mkdirSync(dir, { recursive: true })
    const square = await composeIcon(size, false)
    const round = await composeIcon(size, true)
    await fs.promises.writeFile(path.join(dir, 'ic_launcher.png'), square)
    await fs.promises.writeFile(path.join(dir, 'ic_launcher_round.png'), round)
    console.log(`wrote ${folder} ${size}x${size}`)
  }
}

await main()
