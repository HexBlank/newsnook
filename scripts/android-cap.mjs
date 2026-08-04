import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

import { loadAndroidEnv } from './android-env.mjs'

/**
 * 在自动探测到的 ANDROID_HOME / JAVA_HOME 环境下转发 `cap …`。
 * 不写 local.properties，换机只要本机装了 Android Studio/SDK 即可。
 */
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('Usage: node scripts/android-cap.mjs <cap-args…>')
  process.exit(1)
}

const env = loadAndroidEnv(projectRoot)
const capBin = join(projectRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor')
if (!existsSync(capBin)) {
  console.error(`Capacitor CLI not found: ${capBin}. Run npm install first.`)
  process.exit(1)
}

console.log(`[android-env] ANDROID_HOME=${env.ANDROID_HOME}`)
console.log(`[android-env] JAVA_HOME=${env.JAVA_HOME}`)

const result = spawnSync(process.execPath, [capBin, ...args], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
