import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { javaExecutable, loadAndroidEnv } from './android-env.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const androidRoot = join(projectRoot, 'android')
const format = process.argv[2]
const flavorArgument = process.argv[3] ?? 'all'
const supportedFlavors = ['cloud', 'local']

if (format !== 'apk' && format !== 'aab') {
  throw new Error('Usage: node scripts/android-build.mjs <apk|aab> [cloud|local|all]')
}
if (flavorArgument !== 'all' && !supportedFlavors.includes(flavorArgument)) {
  throw new Error('Flavor must be cloud, local, or all.')
}
const flavors = flavorArgument === 'all' ? supportedFlavors : [flavorArgument]

const env = loadAndroidEnv(projectRoot)
const requiredSigningVariables = [
  'NEWSNOOK_KEYSTORE_FILE',
  'NEWSNOOK_KEYSTORE_PASSWORD',
  'NEWSNOOK_KEY_ALIAS',
  'NEWSNOOK_KEY_PASSWORD',
]
const missingSigningVariables = requiredSigningVariables.filter((key) => !env[key])
if (missingSigningVariables.length) {
  throw new Error(
    `Release signing is missing (${missingSigningVariables.join(', ')}). Run npm run android:keystore:init first.`,
  )
}
if (!existsSync(env.NEWSNOOK_KEYSTORE_FILE)) {
  throw new Error(`Release keystore not found: ${env.NEWSNOOK_KEYSTORE_FILE}`)
}

const taskPrefix = format === 'apk' ? 'assemble' : 'bundle'
const tasks = flavors.map(
  (flavor) => `${taskPrefix}${flavor[0].toUpperCase()}${flavor.slice(1)}Release`,
)
const gradleWrapperJar = join(
  androidRoot,
  'gradle',
  'wrapper',
  'gradle-wrapper.jar',
)
const result = spawnSync(
  javaExecutable(env.JAVA_HOME),
  [
    '-Dorg.gradle.appname=gradlew',
    '-classpath',
    '',
    '-jar',
    gradleWrapperJar,
    ...tasks,
    '--no-daemon',
    '--console=plain',
    '--stacktrace',
  ],
  {
    cwd: androidRoot,
    env,
    stdio: 'inherit',
  },
)
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const outputDirectory = join(projectRoot, 'artifacts', 'android')
mkdirSync(outputDirectory, { recursive: true })
const apksignerJar = format === 'apk' ? findApksignerJar(env.ANDROID_HOME) : null

for (const flavor of flavors) {
  const source =
    format === 'apk'
      ? join(
          androidRoot,
          'app',
          'build',
          'outputs',
          'apk',
          flavor,
          'release',
          `app-${flavor}-release.apk`,
        )
      : join(
          androidRoot,
          'app',
          'build',
          'outputs',
          'bundle',
          `${flavor}Release`,
          `app-${flavor}-release.aab`,
        )
  if (!existsSync(source)) {
    throw new Error(`Gradle completed but the expected artifact is missing: ${source}`)
  }

  const destination = join(
    outputDirectory,
    `newsnook-${packageJson.version}-${flavor}-release.${format}`,
  )
  copyFileSync(source, destination)

  if (format === 'apk') {
    verify(
      javaExecutable(env.JAVA_HOME),
      ['-jar', apksignerJar, 'verify', '--verbose', '--print-certs', destination],
      env,
      `${flavor} APK signature verification failed`,
    )
  } else {
    verify(
      javaExecutable(env.JAVA_HOME, 'jarsigner'),
      ['-verify', '-certs', destination],
      env,
      `${flavor} AAB signature verification failed`,
      true,
    )
  }

  const sizeMiB = (statSync(destination).size / 1024 / 1024).toFixed(2)
  console.log(
    `Android ${flavor} ${format.toUpperCase()} ready: ${destination} (${sizeMiB} MiB)`,
  )
}

function findApksignerJar(androidHome) {
  const buildToolsRoot = join(androidHome, 'build-tools')
  const directory = readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .find((name) =>
      existsSync(
        join(
          buildToolsRoot,
          name,
          process.platform === 'win32' ? 'apksigner.bat' : 'apksigner',
        ),
      ),
    )
  if (!directory) throw new Error(`apksigner not found under ${buildToolsRoot}`)
  return join(buildToolsRoot, directory, 'lib', 'apksigner.jar')
}

function verify(command, args, commandEnv, errorMessage, quiet = false) {
  const verification = spawnSync(command, args, {
    encoding: quiet ? 'utf8' : undefined,
    env: commandEnv,
    stdio: quiet ? 'pipe' : 'inherit',
  })
  if (verification.status !== 0) {
    if (quiet) {
      process.stderr.write(verification.stdout ?? '')
      process.stderr.write(verification.stderr ?? '')
    }
    throw new Error(errorMessage)
  }
  if (quiet) console.log('AAB signature verified.')
}
