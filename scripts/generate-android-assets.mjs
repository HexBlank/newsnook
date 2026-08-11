/**
 * 只生成 Android 启动闪屏，绝不改动 Adaptive Icon。
 *
 * 尺寸目录与 @capacitor/assets 的 Android splash 模板对齐；
 * 不再调用 capacitor-assets，避免它看到 logo.svg 后重写 ic_launcher*。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const assetsDir = join(projectRoot, 'assets')
const publicDir = join(projectRoot, 'public')
const resRoot = join(projectRoot, 'android', 'app', 'src', 'main', 'res')

const LOGO_SCALE = 0.2
const SPLASH_BG = '#0E0F12'
const SPLASH_BG_DARK = '#08090B'

/** 与 @capacitor/assets dist/platforms/android/assets.js 中的 splash 模板一致 */
const SPLASH_TARGETS = [
  { density: '', width: 320, height: 480, dark: false },
  { density: 'land-ldpi', width: 320, height: 240, dark: false },
  { density: 'land-mdpi', width: 480, height: 320, dark: false },
  { density: 'land-hdpi', width: 800, height: 480, dark: false },
  { density: 'land-xhdpi', width: 1280, height: 720, dark: false },
  { density: 'land-xxhdpi', width: 1600, height: 960, dark: false },
  { density: 'land-xxxhdpi', width: 1920, height: 1280, dark: false },
  { density: 'port-ldpi', width: 240, height: 320, dark: false },
  { density: 'port-mdpi', width: 320, height: 480, dark: false },
  { density: 'port-hdpi', width: 480, height: 800, dark: false },
  { density: 'port-xhdpi', width: 720, height: 1280, dark: false },
  { density: 'port-xxhdpi', width: 960, height: 1600, dark: false },
  { density: 'port-xxxhdpi', width: 1280, height: 1920, dark: false },
  { density: 'night', width: 320, height: 240, dark: true },
  { density: 'land-night-ldpi', width: 320, height: 240, dark: true },
  { density: 'land-night-mdpi', width: 480, height: 320, dark: true },
  { density: 'land-night-hdpi', width: 800, height: 480, dark: true },
  { density: 'land-night-xhdpi', width: 1280, height: 720, dark: true },
  { density: 'land-night-xxhdpi', width: 1600, height: 960, dark: true },
  { density: 'land-night-xxxhdpi', width: 1920, height: 1280, dark: true },
  { density: 'port-night-ldpi', width: 240, height: 320, dark: true },
  { density: 'port-night-mdpi', width: 320, height: 480, dark: true },
  { density: 'port-night-hdpi', width: 480, height: 800, dark: true },
  { density: 'port-night-xhdpi', width: 720, height: 1280, dark: true },
  { density: 'port-night-xxhdpi', width: 960, height: 1600, dark: true },
  { density: 'port-night-xxxhdpi', width: 1280, height: 1920, dark: true },
]

const ICON_MARKERS = [
  'values/colors.xml',
  'mipmap-anydpi-v26/ic_launcher.xml',
  'mipmap-anydpi-v26/ic_launcher_round.xml',
  'mipmap-anydpi-v33/ic_launcher.xml',
  'mipmap-anydpi-v33/ic_launcher_round.xml',
  'drawable-mdpi/ic_launcher_foreground.png',
  'drawable-mdpi/ic_launcher_monochrome.png',
  'drawable-hdpi/ic_launcher_foreground.png',
  'drawable-hdpi/ic_launcher_monochrome.png',
  'drawable-xhdpi/ic_launcher_foreground.png',
  'drawable-xhdpi/ic_launcher_monochrome.png',
  'drawable-xxhdpi/ic_launcher_foreground.png',
  'drawable-xxhdpi/ic_launcher_monochrome.png',
  'drawable-xxxhdpi/ic_launcher_foreground.png',
  'drawable-xxxhdpi/ic_launcher_monochrome.png',
]

function die(message) {
  console.error(`[assets] ${message}`)
  process.exit(1)
}

function findSource(basenames, dirs = [assetsDir]) {
  const extensions = ['.png', '.webp', '.jpg', '.jpeg', '.svg']
  for (const dir of dirs) {
    for (const base of basenames) {
      for (const ext of extensions) {
        const path = join(dir, `${base}${ext}`)
        if (existsSync(path)) return path
      }
    }
  }
  return null
}

function drawableDir(density) {
  return density ? `drawable-${density}` : 'drawable'
}

function listIconFiles() {
  const files = []
  for (const relativePath of ICON_MARKERS) {
    const absolute = join(resRoot, relativePath)
    if (existsSync(absolute)) files.push(absolute)
  }
  for (const density of ['ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
      const absolute = join(resRoot, `mipmap-${density}`, name)
      if (existsSync(absolute)) files.push(absolute)
    }
  }
  return files
}

function fingerprint(files) {
  const hash = createHash('sha256')
  for (const file of [...files].sort()) {
    hash.update(file)
    hash.update(readFileSync(file))
  }
  return hash.digest('hex')
}

async function composeMasterSplash(sourcePath, background, dedicatedSplash) {
  if (dedicatedSplash) {
    return sharp(sourcePath).resize(2732, 2732, { fit: 'cover' }).png().toBuffer()
  }

  const logoWidth = Math.floor(2732 * LOGO_SCALE)
  const logo = await sharp(sourcePath).resize(logoWidth, logoWidth, { fit: 'contain' }).png().toBuffer()
  return sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 4,
      background,
    },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer()
}

async function writeSplash(master, target) {
  const dir = join(resRoot, drawableDir(target.density))
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, 'splash.png')
  await sharp(master).resize(target.width, target.height, { fit: 'cover' }).png().toFile(dest)
  return dest
}

async function main() {
  if (!existsSync(resRoot)) die('未找到 android/.../res')

  const splashSource = findSource(['splash', 'android/splash'])
  const splashDarkSource = findSource(['splash-dark', 'android/splash-dark'])
  // 闪屏深色底：用浅色标（logo-light）；无则回退 logo-dark / logo
  const logoSource =
    findSource(['logo-light'], [publicDir]) ??
    findSource(['logo-dark'], [publicDir]) ??
    findSource(['logo'], [publicDir, assetsDir])

  const lightSource = splashSource ?? logoSource
  const darkSource = splashDarkSource ?? splashSource ?? logoSource
  if (!lightSource || !darkSource) {
    die('缺少源图：请提供 assets/splash(.png|.svg) 或 public/logo-light.svg')
  }

  const beforeIcons = fingerprint(listIconFiles())

  console.log('[assets] 仅生成 Android 启动闪屏（跳过启动图标）')
  if (!splashSource && logoSource) {
    console.log(`[assets] 未找到 splash.*，由 ${relative(projectRoot, logoSource)} 合成`)
  }

  const lightMaster = await composeMasterSplash(lightSource, SPLASH_BG, Boolean(splashSource))
  const darkMaster = await composeMasterSplash(darkSource, SPLASH_BG_DARK, Boolean(splashDarkSource || splashSource))

  const written = []
  for (const target of SPLASH_TARGETS) {
    written.push(await writeSplash(target.dark ? darkMaster : lightMaster, target))
  }

  const afterIcons = fingerprint(listIconFiles())
  if (beforeIcons !== afterIcons) {
    die('检测到启动图标被改动，请检查 android/.../res 下的 ic_launcher*')
  }

  console.log(`[assets] 完成：写入 ${written.length} 个 splash.png，启动图标未改动`)
}

await main()
