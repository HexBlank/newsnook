import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceHtml = join(projectRoot, 'src', 'features', 'easterEgg', 'craneGame.html')
const fontOutputDir = join(projectRoot, 'public', 'fonts', 'easter-egg')
const subsetTextFile = join(fontOutputDir, 'MaShanZheng-subset.txt')
const subsetFontFile = join(fontOutputDir, 'MaShanZheng-subset.woff')
const cachedFontDir = join(projectRoot, 'node_modules', '.cache', 'newsnook', 'fonts')
const sourceFontFile = join(cachedFontDir, 'MaShanZheng.ttf')
const sourceFontUrl =
  'https://fonts.gstatic.com/s/mashanzheng/v17/NaPecZTRCLxvwo41b4gvzkXaRMQ.ttf'

const EXTRA_CHARS = '0123456789 ·—\n'

main().catch((error) => {
  console.error(`[easter-font] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

async function main() {
  mkdirSync(fontOutputDir, { recursive: true })
  mkdirSync(cachedFontDir, { recursive: true })

  const html = readFileSync(sourceHtml, 'utf8')
  const subsetText = buildSubsetText(html)
  writeFileSync(subsetTextFile, subsetText, 'utf8')

  await ensureSourceFont()
  ensurePyftsubset()

  const result = spawnSync(
    'pyftsubset',
    [
      sourceFontFile,
      `--text-file=${subsetTextFile}`,
      '--flavor=woff',
      `--output-file=${subsetFontFile}`,
      '--no-hinting',
      '--drop-tables+=GSUB,GPOS,GDEF',
    ],
    {
      cwd: projectRoot,
      stdio: 'inherit',
    },
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  const glyphCount = [...new Set([...subsetText].filter((char) => isSubsetChar(char)))].length
  const fileSizeKb = (statSync(subsetFontFile).size / 1024).toFixed(1)
  console.log(`[easter-font] rebuilt ${glyphCount} glyphs -> ${fileSizeKb} KB`)
}

function buildSubsetText(html) {
  const segments = new Set()
  const markup = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
  const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1],
  )

  for (const [, text] of markup.matchAll(/>([^<]+)</g)) {
    addFilteredChars(segments, text)
  }

  for (const script of scriptBlocks) {
    for (const match of script.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
      addFilteredChars(segments, match[2])
    }
  }

  addFilteredChars(segments, EXTRA_CHARS)

  return [...segments].join('')
}

function addFilteredChars(target, text) {
  for (const char of text) {
    if (isSubsetChar(char)) {
      target.add(char)
    }
  }
}

function isSubsetChar(char) {
  if (char === '\n' || char === ' ' || char === '·' || char === '—') {
    return true
  }

  if (/[0-9]/.test(char)) {
    return true
  }

  return /\p{Script=Han}/u.test(char)
}

async function ensureSourceFont() {
  if (existsSync(sourceFontFile)) {
    return
  }

  console.log(`[easter-font] downloading source font: ${sourceFontUrl}`)
  const response = await fetch(sourceFontUrl)
  if (!response.ok) {
    throw new Error(`failed to download source font: ${response.status} ${response.statusText}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  writeFileSync(sourceFontFile, buffer)
}

function ensurePyftsubset() {
  const result = spawnSync('pyftsubset', ['--help'], {
    cwd: projectRoot,
    stdio: 'ignore',
  })

  if (result.status === 0) {
    return
  }

  throw new Error(
    'pyftsubset not found. Install fonttools first, then rerun `npm run fonts:easter-egg`.',
  )
}
