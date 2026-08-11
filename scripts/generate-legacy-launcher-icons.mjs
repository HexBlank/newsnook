/**
 * Rasterize NewsNook adaptive icon into legacy mipmap PNGs for API < 26.
 *
 * Source of truth:
 * - background: android/.../res/values/colors.xml → ic_launcher_background
 * - foreground: assets/android-icon/ic_launcher_foreground.svg
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const resRoot = path.join(projectRoot, 'android/app/src/main/res')
const foregroundSvgPath = path.join(projectRoot, 'assets/android-icon/ic_launcher_foreground.svg')
const colorsPath = path.join(resRoot, 'values/colors.xml')

const DENSITIES = [
  { folder: 'mipmap-ldpi', size: 36 },
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
]

function readBackgroundColor() {
  const xml = fs.readFileSync(colorsPath, 'utf8')
  const match = xml.match(/<color\s+name="ic_launcher_background">\s*(#[0-9A-Fa-f]{6,8})\s*<\/color>/)
  if (!match) {
    throw new Error(`Missing ic_launcher_background in ${colorsPath}`)
  }
  return match[1]
}

async function composeIcon(foregroundSvg, background, size, round) {
  const canvas = 108
  const fg = await sharp(Buffer.from(foregroundSvg))
    .resize(canvas, canvas, { fit: 'fill', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  let composed = await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background,
    },
  })
    .composite([{ input: fg, top: 0, left: 0 }])
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
  if (!fs.existsSync(foregroundSvgPath)) {
    throw new Error(`Missing foreground SVG: ${foregroundSvgPath}`)
  }

  const background = readBackgroundColor()
  const foregroundSvg = fs.readFileSync(foregroundSvgPath, 'utf8')

  for (const { folder, size } of DENSITIES) {
    const dir = path.join(resRoot, folder)
    fs.mkdirSync(dir, { recursive: true })
    const square = await composeIcon(foregroundSvg, background, size, false)
    const round = await composeIcon(foregroundSvg, background, size, true)
    await fs.promises.writeFile(path.join(dir, 'ic_launcher.png'), square)
    await fs.promises.writeFile(path.join(dir, 'ic_launcher_round.png'), round)
    console.log(`wrote ${folder} ${size}x${size}`)
  }
}

await main()
