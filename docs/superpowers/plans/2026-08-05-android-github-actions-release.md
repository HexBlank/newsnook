# Android GitHub Actions 发版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 推送匹配 `package.json` version 的 `v*` tag 时，CI 构建 cloud/local 的签名 APK+AAB，并创建 published GitHub Release 挂载产物。

**Architecture:** 单 job workflow 复用现有 `npm run android:apk` / `android:aab`；Secrets 注入 keystore（base64）与密码；`softprops/action-gh-release` 发布。不改本机构建脚本。

**Tech Stack:** GitHub Actions；Node 22；Temurin JDK 21；`android-actions/setup-android@v4`；Gradle 8.14.3（wrapper）；Capacitor 8 现有脚本。

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-05-android-github-actions-release-design.md`
- 触发：仅 `push` tags `v*`；Release 为 published（非 draft）
- 签名 Secrets：`NEWSNOOK_KEYSTORE_BASE64`、`NEWSNOOK_KEYSTORE_PASSWORD`、`NEWSNOOK_KEY_ALIAS`、`NEWSNOOK_KEY_PASSWORD`
- 不在 CI 运行 `android:keystore:init`
- 不提交 keystore / `.env.android.local` / `artifacts/`
- 未经用户明确要求不执行 `git commit`

---

## File Structure

| 文件 | 职责 |
|---|---|
| `.github/workflows/android-release.yml` | tag 触发的完整发版流水线 |
| `README.md` | Secrets 配置与 `git tag` 发版说明 |

---

### Task 1: 新增 `android-release.yml`

**Files:**
- Create: `.github/workflows/android-release.yml`

**Interfaces:**
- Consumes: GitHub Secrets（见 Global Constraints）；`package.json` `version`；`npm run android:apk` / `android:aab`
- Produces: published Release，assets 为 `artifacts/android/newsnook-<version>-{cloud,local}-release.{apk,aab}`

- [ ] **Step 1: 创建目录与 workflow 文件**

写入完整内容（勿删改步骤语义）：

```yaml
name: Android Release

on:
  push:
    tags:
      - 'v*'

concurrency:
  group: android-release-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 90

    env:
      NEWSNOOK_KEYSTORE_PASSWORD: ${{ secrets.NEWSNOOK_KEYSTORE_PASSWORD }}
      NEWSNOOK_KEY_ALIAS: ${{ secrets.NEWSNOOK_KEY_ALIAS }}
      NEWSNOOK_KEY_PASSWORD: ${{ secrets.NEWSNOOK_KEY_PASSWORD }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
          cache: gradle

      - name: Set up Android SDK
        uses: android-actions/setup-android@v4
        with:
          packages: 'tools platform-tools platforms;android-36 build-tools;36.0.0'

      - name: Verify tag matches package.json version
        run: |
          TAG_VERSION="${GITHUB_REF_NAME#v}"
          PKG_VERSION="$(node -p "require('./package.json').version")"
          echo "tag=${GITHUB_REF_NAME} package.json=${PKG_VERSION}"
          if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
            echo "::error::Tag ${GITHUB_REF_NAME} must match package.json version ${PKG_VERSION} (got ${TAG_VERSION})."
            exit 1
          fi

      - name: Restore release keystore
        env:
          NEWSNOOK_KEYSTORE_BASE64: ${{ secrets.NEWSNOOK_KEYSTORE_BASE64 }}
        run: |
          if [ -z "$NEWSNOOK_KEYSTORE_BASE64" ]; then
            echo "::error::Secret NEWSNOOK_KEYSTORE_BASE64 is missing."
            exit 1
          fi
          for name in NEWSNOOK_KEYSTORE_PASSWORD NEWSNOOK_KEY_ALIAS NEWSNOOK_KEY_PASSWORD; do
            if [ -z "${!name}" ]; then
              echo "::error::Secret ${name} is missing."
              exit 1
            fi
          done
          KEYSTORE_PATH="${RUNNER_TEMP}/newsnook-release.jks"
          printf '%s' "$NEWSNOOK_KEYSTORE_BASE64" | base64 -d > "$KEYSTORE_PATH"
          echo "NEWSNOOK_KEYSTORE_FILE=${KEYSTORE_PATH}" >> "$GITHUB_ENV"
          echo "Restored keystore to ${KEYSTORE_PATH}"

      - name: Install npm dependencies
        run: npm ci

      - name: Build signed APKs (cloud + local)
        run: npm run android:apk

      - name: Build signed AABs (cloud + local)
        run: npm run android:aab

      - name: List artifacts
        run: ls -lh artifacts/android/

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.ref_name }}
          name: ${{ github.ref_name }}
          draft: false
          prerelease: false
          generate_release_notes: true
          fail_on_unmatched_files: true
          files: |
            artifacts/android/newsnook-*-cloud-release.apk
            artifacts/android/newsnook-*-local-release.apk
            artifacts/android/newsnook-*-cloud-release.aab
            artifacts/android/newsnook-*-local-release.aab
```

- [ ] **Step 2: 静态自检**

确认：

1. `on.push.tags` 为 `v*`
2. `permissions.contents: write`
3. 未调用 `android:keystore:init`
4. JDK 21、Node 22、platforms/build-tools 36
5. Release `draft: false`

- [ ] **Step 3: Commit（仅当用户明确要求）**

```bash
git add .github/workflows/android-release.yml
git commit -m "$(cat <<'EOF'
ci: add Android release workflow for v* tags

EOF
)"
```

---

### Task 2: README 发版说明

**Files:**
- Modify: `README.md`（在「初始化」CI 段落后，或「构建 Android」之后，新增「GitHub Actions 发版」小节）

**Interfaces:**
- Consumes: Task 1 的 Secret 名称与触发约定
- Produces: 维护者可按文档配置 Secrets 并推送 tag

- [ ] **Step 1: 在 README 追加小节**

建议插在「初始化」中 CI 环境变量说明之后，「构建 Android」之前。写入：

```markdown
## GitHub Actions 发版

推送与 `package.json` 的 `version` 一致的 tag（形如 `v1.3.8`）后，workflow `.github/workflows/android-release.yml` 会构建 cloud/local 的签名 APK 与 AAB，并创建 published GitHub Release。

在仓库 Settings → Secrets and variables → Actions 配置：

| Secret | 说明 |
|---|---|
| `NEWSNOOK_KEYSTORE_BASE64` | release keystore（`.jks`）的 base64 |
| `NEWSNOOK_KEYSTORE_PASSWORD` | keystore 密码 |
| `NEWSNOOK_KEY_ALIAS` | 密钥别名（本机初始化默认为 `newsnook`） |
| `NEWSNOOK_KEY_PASSWORD` | 密钥密码 |

本机生成 base64（PowerShell）：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".android-signing/newsnook-release.jks")) | Set-Clipboard
```

本机生成 base64（bash）：

```bash
base64 -w0 .android-signing/newsnook-release.jks | pbcopy   # macOS
base64 -w0 .android-signing/newsnook-release.jks            # Linux，复制输出
```

发版流程：

1. 将 `package.json` 的 `version` 升到目标 semver 并提交
2. `git tag vX.Y.Z`（`X.Y.Z` 必须与 version 完全一致）
3. `git push origin vX.Y.Z`
4. 在 Actions 与 Releases 页确认四个附件：`newsnook-<version>-{cloud,local}-release.{apk,aab}`

CI 不会运行 `android:keystore:init`；必须使用与线上一致的既有签名密钥。
```

注意：若该段落入已有 fenced code 冲突，保持 README 整体 Markdown 合法（外层小节用普通段落 + 表格 + 独立 code fence）。

- [ ] **Step 2: 核对 Secret 名称与 workflow 一致**

四者必须与 `.github/workflows/android-release.yml` 中引用完全一致。

- [ ] **Step 3: Commit（仅当用户明确要求）**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: document Android GitHub Actions release flow

EOF
)"
```

---

### Task 3: 人工验证清单（不在本机跑完整 Android CI）

无法在本会话完整模拟 GitHub-hosted runner；实现后由维护者完成：

- [ ] **Step 1: 配置 Secrets**（一次性）
- [ ] **Step 2: 推送匹配 version 的测试 tag**（或正式发版 tag）
- [ ] **Step 3: 确认 workflow 变绿，Release published，4 个附件齐全**
- [ ] **Step 4: 故意推送错误 tag（version 不匹配）应失败于校验步骤**

可选本地预检（有 Android SDK 时）：

```bash
npm ci
npm run android:apk
npm run android:aab
ls artifacts/android/
```

---

## Spec coverage（自检）

| Spec 要求 | Task |
|---|---|
| `v*` tag 触发 | Task 1 |
| tag ↔ version 校验 | Task 1 |
| Node 22 / JDK 21 / API 36 | Task 1 |
| Secrets 签名注入 | Task 1 |
| `android:apk` + `android:aab` | Task 1 |
| published Release + 4 assets | Task 1 |
| concurrency | Task 1 |
| README 运维说明 | Task 2 |
| 不跑 keystore:init | Task 1 / README |
