/**
 * Rasterize News Nook adaptive icon into legacy mipmap PNGs for API < 26.
 * Source of truth remains the VectorDrawable XMLs under res/drawable/.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const resRoot = path.resolve(__dirname, '../android/app/src/main/res')

const DENSITIES = [
  { folder: 'mipmap-ldpi', size: 36 },
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
]

// Matches newsnook_adaptive_icon VectorDrawables (108dp viewport, safe-zone scale).
const ICON_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108">
  <defs>
    <linearGradient id="bg" x1="14" y1="92" x2="94" y2="14" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0C6FFF"/>
      <stop offset="0.55" stop-color="#3EAEFF"/>
      <stop offset="1" stop-color="#75DBFF"/>
    </linearGradient>
    <radialGradient id="glow" cx="53" cy="77" r="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2A86FF" stop-opacity="0.52"/>
      <stop offset="1" stop-color="#2A86FF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sheet" x1="215" y1="360" x2="420" y2="910" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#EEF2F8"/>
      <stop offset="0.52" stop-color="#E4EBF4"/>
      <stop offset="1" stop-color="#C8D7EE"/>
    </linearGradient>
    <linearGradient id="curl" x1="320" y1="390" x2="340" y2="905" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#D9E2EF"/>
      <stop offset="1" stop-color="#98B2D8"/>
    </linearGradient>
    <linearGradient id="paper" x1="410" y1="330" x2="955" y2="1030" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F7F7F8"/>
      <stop offset="0.58" stop-color="#F2F4F7"/>
      <stop offset="1" stop-color="#E7EDF7"/>
    </linearGradient>
    <linearGradient id="thumb" x1="488" y1="590" x2="690" y2="362" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1E7EFF"/>
      <stop offset="1" stop-color="#42B0FF"/>
    </linearGradient>
    <linearGradient id="line" x1="760" y1="455" x2="936" y2="506" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C8D9EF"/>
      <stop offset="1" stop-color="#A7C1E6"/>
    </linearGradient>
    <linearGradient id="barA" x1="481" y1="704" x2="957" y2="647" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#19C7EE"/>
      <stop offset="0.52" stop-color="#21E2B6"/>
      <stop offset="1" stop-color="#18E79D"/>
    </linearGradient>
    <linearGradient id="barB" x1="507" y1="866" x2="980" y2="792" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1C79FF"/>
      <stop offset="0.62" stop-color="#2193FF"/>
      <stop offset="1" stop-color="#25A7FF"/>
    </linearGradient>
    <clipPath id="roundMask">
      <circle cx="54" cy="54" r="54"/>
    </clipPath>
  </defs>
  <g id="icon">
    <rect width="108" height="108" fill="url(#bg)"/>
    <rect width="108" height="108" fill="url(#glow)"/>
    <g transform="translate(5.3 5.2) scale(0.0783)">
      <path d="M201,410C201,372 231,342 269,342H310C348,342 378,372 378,410V934C378,973 348,1003 310,1003H269C231,1003 201,973 201,934V410Z" fill="url(#sheet)"/>
      <path d="M282,369C310,369 333,392 333,420V898C333,942 316,958 298,968C279,978 258,976 240,963C217,948 210,926 210,896V420C210,392 233,369 261,369H282Z" fill="url(#curl)" fill-opacity="0.85"/>
      <path d="M332,335C336,299 366,272 402,271L906,243C942,241 973,267 980,302L1036,824C1043,869 1012,911 967,917L396,972C360,976 328,949 323,913L332,335Z" fill="url(#paper)"/>
      <path d="M489,383C493,376 501,372 509,372H667C680,372 691,382 693,395L721,551C723,565 714,578 701,580L543,595C530,597 518,588 516,575L489,383Z" fill="url(#thumb)"/>
      <path d="M748,390H892C901,390 908,397 908,406C908,415 901,422 892,422H748C739,422 732,415 732,406C732,397 739,390 748,390Z" fill="url(#line)"/>
      <path d="M760,455H907C916,455 923,462 923,471C923,480 916,487 907,487H760C751,487 744,480 744,471C744,462 751,455 760,455Z" fill="url(#line)"/>
      <path d="M772,523H922C931,523 938,530 938,539C938,548 931,555 922,555H772C763,555 756,548 756,539C756,530 763,523 772,523Z" fill="url(#line)"/>
      <path d="M495,720C577,688 744,664 921,653" fill="none" stroke="url(#barA)" stroke-width="68" stroke-linecap="round"/>
      <path d="M514,858C625,808 781,792 943,783" fill="none" stroke="url(#barB)" stroke-width="72" stroke-linecap="round"/>
    </g>
  </g>
</svg>`

const ROUND_SVG = ICON_SVG.replace(
  '<g id="icon">',
  '<g id="icon" clip-path="url(#roundMask)">',
)

async function writeIcon(svg, outPath, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath)
}

async function main() {
  for (const { folder, size } of DENSITIES) {
    const dir = path.join(resRoot, folder)
    fs.mkdirSync(dir, { recursive: true })
    await writeIcon(ICON_SVG, path.join(dir, 'ic_launcher.png'), size)
    await writeIcon(ROUND_SVG, path.join(dir, 'ic_launcher_round.png'), size)
    console.log(`wrote ${folder} ${size}x${size}`)
  }
}

await main()
