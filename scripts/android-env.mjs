import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

export function loadAndroidEnv(projectRoot) {
  const env = { ...process.env }
  const envFile = join(projectRoot, '.env.android.local')

  if (existsSync(envFile)) {
    for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator <= 0) continue
      const key = line.slice(0, separator).trim()
      if (env[key]) continue
      env[key] = unquote(line.slice(separator + 1).trim())
    }
  }

  env.ANDROID_HOME ||= findAndroidSdk(env)
  env.ANDROID_SDK_ROOT ||= env.ANDROID_HOME
  env.JAVA_HOME = findJavaHome(env)

  if (!env.ANDROID_HOME || !existsSync(env.ANDROID_HOME)) {
    throw new Error(
      'Android SDK not found. Install Android Studio or set ANDROID_HOME/ANDROID_SDK_ROOT.',
    )
  }
  if (!env.JAVA_HOME || !existsSync(javaExecutable(env.JAVA_HOME))) {
    throw new Error(
      'Compatible JDK not found (need 17–24, prefer 21). Install JDK 21 or set JAVA_HOME.',
    )
  }

  return env
}

export function javaExecutable(javaHome, executable = 'java') {
  return join(javaHome, 'bin', process.platform === 'win32' ? `${executable}.exe` : executable)
}

function findAndroidSdk(env) {
  const candidates = [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Android', 'Sdk'),
    // Windows 偶发未继承 LOCALAPPDATA 时仍能落到默认安装位
    env.USERPROFILE && join(env.USERPROFILE, 'AppData', 'Local', 'Android', 'Sdk'),
    env.HOME && join(env.HOME, 'Android', 'Sdk'),
    env.HOME && join(env.HOME, 'Library', 'Android', 'sdk'),
  ]
  return candidates.find((candidate) => candidate && existsSync(candidate))
}

/** Gradle 8.14 + current AGP run on JDK 17–24; Android Studio JBR may be newer (e.g. 25). */
const MIN_SUPPORTED_JAVA_MAJOR = 17
const MAX_SUPPORTED_JAVA_MAJOR = 24

function findJavaHome(env) {
  const programFiles = env.ProgramFiles || 'C:\\Program Files'
  const candidates = []

  const pushUnique = (candidate) => {
    if (!candidate || candidates.includes(candidate)) return
    candidates.push(candidate)
  }

  pushUnique(env.JAVA_HOME)
  pushUnique(join(programFiles, 'Android', 'Android Studio', 'jbr'))

  const localToolchainsRoot =
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'NewsNook', 'toolchains')
  if (localToolchainsRoot && existsSync(localToolchainsRoot)) {
    for (const entry of readdirSync(localToolchainsRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && /^jdk-(?:17|21)(?:\.|-)/.test(entry.name)) {
        pushUnique(resolve(localToolchainsRoot, entry.name))
      }
    }
  }

  const adoptiumRoot = join(programFiles, 'Eclipse Adoptium')
  if (existsSync(adoptiumRoot)) {
    for (const entry of readdirSync(adoptiumRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && /^jdk-(?:17|21)(?:\.|-)/.test(entry.name)) {
        pushUnique(resolve(adoptiumRoot, entry.name))
      }
    }
  }

  const userJdksRoot = env.USERPROFILE && join(env.USERPROFILE, '.jdks')
  if (userJdksRoot && existsSync(userJdksRoot)) {
    for (const entry of readdirSync(userJdksRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        pushUnique(resolve(userJdksRoot, entry.name))
      }
    }
  }

  const compatible = candidates
    .filter((candidate) => existsSync(javaExecutable(candidate)))
    .map((javaHome) => ({ javaHome, major: readJavaMajorVersion(javaHome) }))
    .filter(
      ({ major }) =>
        major != null &&
        major >= MIN_SUPPORTED_JAVA_MAJOR &&
        major <= MAX_SUPPORTED_JAVA_MAJOR,
    )
    .sort((a, b) => javaPreference(b.major) - javaPreference(a.major))

  return compatible[0]?.javaHome
}

function javaPreference(major) {
  if (major === 21) return 300
  if (major === 17) return 200
  return major
}

function readJavaMajorVersion(javaHome) {
  const releaseFile = join(javaHome, 'release')
  if (!existsSync(releaseFile)) return null
  const match = readFileSync(releaseFile, 'utf8').match(/JAVA_VERSION="(\d+)/)
  return match ? Number(match[1]) : null
}
