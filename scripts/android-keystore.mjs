import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { javaExecutable, loadAndroidEnv } from './android-env.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const signingDirectory = join(projectRoot, '.android-signing')
const keystoreFile = join(signingDirectory, 'newsnook-release.jks')
const envFile = join(projectRoot, '.env.android.local')

if (existsSync(keystoreFile) || existsSync(envFile)) {
  throw new Error(
    'Release signing already exists. Back it up; remove it manually only when intentionally rotating the signing key.',
  )
}

mkdirSync(signingDirectory, { recursive: true })

const env = loadAndroidEnv(projectRoot)
const password = randomBytes(24).toString('hex')
const alias = 'newsnook'
const keytool = javaExecutable(env.JAVA_HOME, 'keytool')
const result = spawnSync(
  keytool,
  [
    '-genkeypair',
    '-v',
    '-keystore',
    keystoreFile,
    '-storetype',
    'JKS',
    '-storepass',
    password,
    '-keypass',
    password,
    '-alias',
    alias,
    '-keyalg',
    'RSA',
    '-keysize',
    '4096',
    '-validity',
    '10000',
    '-dname',
    'CN=News Nook, OU=Mobile, O=Aizeek, L=Shanghai, ST=Shanghai, C=CN',
  ],
  { env, stdio: 'inherit' },
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const normalizedPath = keystoreFile.replaceAll('\\', '/')
writeFileSync(
  envFile,
  [
    '# Generated locally. Never commit this file or the referenced keystore.',
    `NEWSNOOK_KEYSTORE_FILE=${normalizedPath}`,
    `NEWSNOOK_KEYSTORE_PASSWORD=${password}`,
    `NEWSNOOK_KEY_ALIAS=${alias}`,
    `NEWSNOOK_KEY_PASSWORD=${password}`,
    '',
  ].join('\n'),
  { encoding: 'utf8', flag: 'wx' },
)

console.log(`Release signing initialized at ${keystoreFile}`)
console.log('Back up both .android-signing/newsnook-release.jks and .env.android.local securely.')
