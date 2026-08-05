#!/usr/bin/env node
/**
 * 拉取 browsermt/bergamot-translator 到 Android local third_party。
 * 不编入 git；编译 local flavor 前执行一次。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'android/app/src/local/cpp/third_party/bergamot-translator')
const parent = dirname(dest)
const repo = 'https://github.com/browsermt/bergamot-translator.git'

mkdirSync(parent, { recursive: true })

if (existsSync(join(dest, 'CMakeLists.txt'))) {
  console.log('bergamot-translator already present:', dest)
  console.log('Ensuring Android compatibility patches are applied…')
  applyAndroidPatches()
  console.log('OK. Ready.')
  process.exit(0)
}

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true })
}

if (process.platform === 'win32') {
  spawnSync('git', ['config', '--global', 'core.longpaths', 'true'], {
    shell: true,
  })
}

function run(args, label) {
  const gitArgs = process.platform === 'win32' ? ['-c', 'core.longpaths=true', ...args] : args
  const result = spawnSync('git', gitArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status === 0) return
  console.error(`Failed to ${label}`)
  process.exit(result.status ?? 1)
}

function normalizeNewlines(str) {
  return str.replace(/\r\n/g, '\n')
}

function patchFile(path, replacements) {
  const rawText = readFileSync(path, 'utf8')
  const isCrlf = rawText.includes('\r\n')
  let text = normalizeNewlines(rawText)
  let changed = false
  for (const { before, after, label } of replacements) {
    const normBefore = normalizeNewlines(before)
    const normAfter = normalizeNewlines(after)
    if (text.includes(normAfter)) continue
    if (!text.includes(normBefore)) {
      throw new Error(`Patch anchor not found for ${label}: ${path}`)
    }
    text = text.replace(normBefore, normAfter)
    changed = true
  }
  if (changed) {
    const outputText = isCrlf ? text.replace(/\n/g, '\r\n') : text
    writeFileSync(path, outputText, 'utf8')
    console.log('Patched:', path)
  }
}

function applyAndroidPatches() {
  patchFile(
    join(dest, '3rd_party/marian-dev/src/3rd_party/ruy/third_party/cpuinfo/CMakeLists.txt'),
    [
      {
        label: 'cpuinfo pthread detection',
        before: `  IF(CMAKE_SYSTEM_NAME STREQUAL "Linux" OR CMAKE_SYSTEM_NAME STREQUAL "Android")
    SET(CMAKE_THREAD_PREFER_PTHREAD TRUE)
    SET(THREADS_PREFER_PTHREAD_FLAG TRUE)
    FIND_PACKAGE(Threads REQUIRED)
  ENDIF()`,
        after: `  IF(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    SET(CMAKE_THREAD_PREFER_PTHREAD TRUE)
    SET(THREADS_PREFER_PTHREAD_FLAG TRUE)
    FIND_PACKAGE(Threads REQUIRED)
  ELSEIF(CMAKE_SYSTEM_NAME STREQUAL "Android")
    # Android bionic 自带 pthread；FindThreads 在 NDK/CMake 3.22 + cpuinfo 组合下偶发误判。
    SET(CMAKE_THREAD_LIBS_INIT "")
    SET(CMAKE_HAVE_THREADS_LIBRARY 1)
    SET(CMAKE_USE_PTHREADS_INIT 1)
    SET(Threads_FOUND TRUE)
  ENDIF()`,
      },
    ],
  )

  patchFile(
    join(dest, '3rd_party/marian-dev/src/3rd_party/sentencepiece/src/CMakeLists.txt'),
    [
      {
        label: 'sentencepiece pthread detection',
        before: `find_package(Threads REQUIRED)`,
        after: `if(ANDROID)
  # Android bionic 自带 pthread；FindThreads 在当前 NDK/CMake 组合下会误判。
  add_library(sentencepiece_threads INTERFACE)
  add_library(Threads::Threads ALIAS sentencepiece_threads)
else()
  find_package(Threads REQUIRED)
endif()`,
      },
    ],
  )

  patchFile(
    join(dest, '3rd_party/marian-dev/CMakeLists.txt'),
    [
      {
        label: 'marian arm build arch',
        before: `if(NOT COMPILE_WASM)
  # Setting BUILD_ARCH to native invokes CPU intrinsic detection logic below.
  # Prevent invoking that logic for WASM builds.
  set(BUILD_ARCH native CACHE STRING "Compile for this CPU architecture.")`,
        after: `if(NOT COMPILE_WASM)
  # Setting BUILD_ARCH to native invokes CPU intrinsic detection logic below.
  # Prevent invoking that logic for WASM builds.
  if(ANDROID)
    set(BUILD_ARCH armv8-a CACHE STRING "Compile for this CPU architecture." FORCE)
  else()
    set(BUILD_ARCH native CACHE STRING "Compile for this CPU architecture.")
  endif()`,
      },
      {
        label: 'marian skip host SSE probe on Android',
        before: `  if(BUILD_ARCH STREQUAL "native")
    message(STATUS "Checking support for CPU intrinsics")`,
        after: `  if(ANDROID)
    set(INTRINSICS "")
  elseif(BUILD_ARCH STREQUAL "native")
    message(STATUS "Checking support for CPU intrinsics")`,
      },
    ],
  )

  patchFile(
    join(dest, '3rd_party/ssplit-cpp/cmake/FindPCRE2.cmake'),
    [
      {
        label: 'pcre2 jit option',
        before: `  if(CMAKE_CXX_COMPILER MATCHES "/em\\\\+\\\\+(-[a-zA-Z0-9.])?$")`,
        after: `  if(ANDROID OR CMAKE_CXX_COMPILER MATCHES "/em\\\\+\\\\+(-[a-zA-Z0-9.])?$")`,
      },
      {
        label: 'pcre2 configure generator',
        before: `  set(PCRE2_CONFIGURE_OPTIONS
    -DBUILD_SHARED_LIBS=OFF`,
        after: `  set(PCRE2_CONFIGURE_OPTIONS
    -G
    Ninja
    -DBUILD_SHARED_LIBS=OFF`,
      },
      {
        label: 'pcre2 make program',
        before: `    \${PCRE2_JIT_OPTION}
    -DCMAKE_TOOLCHAIN_FILE=\${CMAKE_TOOLCHAIN_FILE} # Necessary for proper MacOS compilation
    -DCMAKE_CROSSCOMPILING_EMULATOR=\${CMAKE_CROSSCOMPILING_EMULATOR_WITH_SEMICOLON} # Necessary for proper MacOS compilation`,
        after: `    \${PCRE2_JIT_OPTION}
    -DCMAKE_TOOLCHAIN_FILE=\${CMAKE_TOOLCHAIN_FILE} # Necessary for proper MacOS compilation
    -DCMAKE_MAKE_PROGRAM=\${CMAKE_MAKE_PROGRAM}
    -DCMAKE_CROSSCOMPILING_EMULATOR=\${CMAKE_CROSSCOMPILING_EMULATOR_WITH_SEMICOLON} # Necessary for proper MacOS compilation`,
      },
      {
        label: 'pcre2 dedicated binary dir',
        before: `    DOWNLOAD_DIR \${PCRE2_SRC_DIR}
    SOURCE_DIR \${PCRE2_SRC_DIR}
    CONFIGURE_COMMAND \${CMAKE_COMMAND} \${PCRE2_SRC_DIR} \${PCRE2_CONFIGURE_OPTIONS}`,
        after: `    DOWNLOAD_DIR \${PCRE2_SRC_DIR}
    SOURCE_DIR \${PCRE2_SRC_DIR}
    BINARY_DIR \${CMAKE_BINARY_DIR}/pcre2/src/pcre2-build-android
    CONFIGURE_COMMAND \${CMAKE_COMMAND} \${PCRE2_SRC_DIR} \${PCRE2_CONFIGURE_OPTIONS}`,
      },
    ],
  )
}

console.log('Cloning bergamot-translator (shallow, blobless)…')
run(['clone', '--depth', '1', '--filter=blob:none', repo, dest], 'clone bergamot-translator')

console.log('Syncing submodules…')
run(
  ['-C', dest, 'submodule', 'update', '--init', '--recursive', '--depth', '1', '--jobs', '4'],
  'update bergamot submodules',
)

console.log('Applying Android compatibility patches…')
applyAndroidPatches()

console.log('OK. Next: npm run android:apk:local  (first native build may take a long time)')
