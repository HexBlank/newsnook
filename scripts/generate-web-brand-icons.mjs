/**
 * 从 assets/android-icon/mark-path.txt 组装真正的 path SVG。
 * 日常改轮廓：编辑 mark-path.txt 后跑本脚本。
 * 若要从 PNG 重描，需本机有 potrace：node scripts/generate-web-brand-icons.mjs --trace
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const iconDir = path.join(projectRoot, 'assets/android-icon')
const publicDir = path.join(projectRoot, 'public')
const markPathFile = path.join(iconDir, 'mark-path.txt')
const monoPng = path.join(iconDir, 'ic_launcher_monochrome.png')

const GRADIENT = { start: '#004BFA', end: '#05C8FB' }
/** Favicon：对角蓝渐变，亮端保持饱和蓝，避免接近白而冲掉标 */
const FAVICON_GRADIENT = { start: '#0038FF', mid: '#0066FF', end: '#00A8E8' }
const wantTrace = process.argv.includes('--trace')

function roundPath(d, digits = 1) {
  return d.replace(/-?\d+\.?\d*/g, (n) => {
    const v = Number(n)
    if (!Number.isFinite(v)) return n
    return String(Number(v.toFixed(digits)))
  })
}

async function traceFromPng() {
  const sharp = (await import('sharp')).default
  const potrace = (await import('potrace')).default

  const { data, info } = await sharp(monoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const out = Buffer.alloc(info.width * info.height)
  for (let i = 0; i < info.width * info.height; i++) {
    out[i] = data[i * 4 + 3] > 20 ? 0 : 255
  }
  const bw = path.join(iconDir, '_bw_mono.png')
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toFile(bw)

  const svg = await new Promise((resolve, reject) => {
    potrace.trace(
      bw,
      {
        threshold: 128,
        turdSize: 30,
        optTolerance: 0.35,
        turnPolicy: potrace.Potrace.TURNPOLICY_MAJORITY,
        color: '#000',
        background: 'transparent',
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    )
  })

  const match = svg.match(/<path\s+d="([^"]+)"/)
  if (!match) throw new Error('potrace output missing path')
  const d = roundPath(match[1].replace(/,/g, ' ').replace(/\s+/g, ' ').trim(), 1)
  fs.writeFileSync(markPathFile, `${d}\n`)
  try {
    fs.unlinkSync(bw)
  } catch {
    /* ignore */
  }
  return d
}

function writeSvgs(d) {
  const logoLight = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" fill="none">
  <title>Suwen - dark mode</title>
  <desc>White paper-wing mark for dark UI.</desc>
  <path fill-rule="evenodd" clip-rule="evenodd" fill="#FFFFFF" d="${d}"/>
</svg>
`

  const logoDark = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" fill="none">
  <title>Suwen - light mode</title>
  <desc>Blue gradient paper-wing mark for light UI.</desc>
  <defs>
    <linearGradient id="g" x1="220" y1="540" x2="880" y2="540" gradientUnits="userSpaceOnUse">
      <stop stop-color="${GRADIENT.start}"/>
      <stop offset="1" stop-color="${GRADIENT.end}"/>
    </linearGradient>
  </defs>
  <path fill-rule="evenodd" clip-rule="evenodd" fill="url(#g)" d="${d}"/>
</svg>
`

  const favicon = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 1080 1080" fill="none">
  <title>Suwen favicon</title>
  <desc>Rounded app icon: punchy diagonal blue gradient with enlarged white mark for tab readability.</desc>
  <defs>
    <linearGradient id="bg" x1="80" y1="1000" x2="1000" y2="80" gradientUnits="userSpaceOnUse">
      <stop stop-color="${FAVICON_GRADIENT.start}"/>
      <stop offset="0.45" stop-color="${FAVICON_GRADIENT.mid}"/>
      <stop offset="1" stop-color="${FAVICON_GRADIENT.end}"/>
    </linearGradient>
    <clipPath id="clip">
      <rect width="1080" height="1080" rx="200" ry="200"/>
    </clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="1080" height="1080" fill="url(#bg)"/>
    <g transform="translate(540 540) scale(1.18) translate(-540 -540)">
      <path fill-rule="evenodd" clip-rule="evenodd" fill="#FFFFFF" d="${d}"/>
    </g>
  </g>
</svg>
`

  fs.writeFileSync(path.join(publicDir, 'logo-light.svg'), logoLight)
  fs.writeFileSync(path.join(publicDir, 'logo-dark.svg'), logoDark)
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), favicon)

  console.log('wrote path SVGs:', {
    light: fs.statSync(path.join(publicDir, 'logo-light.svg')).size,
    dark: fs.statSync(path.join(publicDir, 'logo-dark.svg')).size,
    fav: fs.statSync(path.join(publicDir, 'favicon.svg')).size,
  })
}

async function main() {
  let d
  if (wantTrace) {
    if (!fs.existsSync(monoPng)) throw new Error(`Missing ${monoPng}`)
    d = await traceFromPng()
  } else {
    if (!fs.existsSync(markPathFile)) {
      throw new Error(`Missing ${markPathFile}. Run with --trace once to generate it.`)
    }
    d = fs.readFileSync(markPathFile, 'utf8').trim()
  }
  writeSvgs(d)
}

await main()
