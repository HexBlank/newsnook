# Android GitHub Actions 发版设计

> 日期：2026-08-05  
> 范围：打 `v*` tag 时自动构建签名 APK/AAB，并创建 published GitHub Release  
> 不改：本机构建脚本行为、签名密钥轮换流程、Play Console 上传、iOS

## 1. 目标

推送符合约定的版本 tag 后，CI 产出与本地 `npm run android:apk` / `android:aab` 一致的签名产物，并挂到对应 GitHub Release，便于分发与存档。

## 2. 触发与校验

- 事件：`push` tags，过滤 `v*`（例如 `v1.3.8`）
- 校验：去掉前缀 `v` 后的字符串必须等于仓库根目录 `package.json` 的 `version`；不匹配则失败并提示先改 version 再打 tag
- 并发：同一 workflow + 同一 tag 使用 `concurrency`，取消进行中的重复 run

## 3. 方案选择

复用现有 npm 脚本（方案 1），不在 CI 中直接编排 Gradle 任务，避免与 `scripts/android-build.mjs` / Capacitor sync 行为漂移。

不采用：多 job 按 flavor 并行（复杂度高于当前收益）；跳过 Node 直接 Gradle（易漏 sync / 签名校验）。

## 4. Runner 与工具链

| 项 | 值 |
|---|---|
| OS | `ubuntu-latest` |
| Node | 22（与 README 一致） |
| JDK | 21（Temurin） |
| Android SDK | `platforms;android-36`、`build-tools;36.0.0`（与 `variables.gradle` 的 compileSdk 36 对齐） |
| 缓存 | npm（`actions/setup-node` cache）+ Gradle（`actions/cache` 或 setup-java cache） |

## 5. 签名注入

不在 CI 运行 `android:keystore:init`。仓库 Secrets：

| Secret | 用途 |
|---|---|
| `NEWSNOOK_KEYSTORE_BASE64` | release keystore 文件的 base64 |
| `NEWSNOOK_KEYSTORE_PASSWORD` | store 密码 |
| `NEWSNOOK_KEY_ALIAS` | 密钥别名 |
| `NEWSNOOK_KEY_PASSWORD` | key 密码 |

Job 步骤：将 base64 解码到 runner 临时路径（例如 `$RUNNER_TEMP/newsnook-release.jks`），设置：

- `NEWSNOOK_KEYSTORE_FILE` → 该路径
- 其余三个密码/别名从 Secrets 映射到同名环境变量

与 README 已有 CI 约定一致；仅把「文件路径」改为 CI 可恢复的 base64 传输。

## 6. 构建步骤

1. `actions/checkout`
2. 安装 Node / JDK / Android SDK 命令行工具与平台包
3. 恢复签名文件并导出环境变量
4. `npm ci`
5. 校验 tag ↔ `package.json` version
6. `npm run android:apk`（cloud + local）
7. `npm run android:aab`（cloud + local）

说明：两步各会执行一次 `android:sync`；可接受的重复成本。本次不新增「只 sync 一次」的脚本，以免扩大范围。

期望产物：

```text
artifacts/android/newsnook-<version>-cloud-release.apk
artifacts/android/newsnook-<version>-local-release.apk
artifacts/android/newsnook-<version>-cloud-release.aab
artifacts/android/newsnook-<version>-local-release.aab
```

## 7. Release 发布

- `permissions: contents: write`
- 使用 `softprops/action-gh-release`（或等价 `gh release create`）创建 **published** Release（非 draft）
- Release 名称与 tag 一致（或 `News Nook <version>`）；body 可用简短默认说明（构建产物列表）
- 将上述 4 个文件作为 assets 上传
- 若同 tag Release 已存在：以 action 默认行为覆盖/更新 assets（实现时固定为可重复上传，避免重跑失败）

## 8. 仓库改动

| 路径 | 动作 |
|---|---|
| `.github/workflows/android-release.yml` | 新增 |
| `README.md` | 增补「GitHub Actions 发版」：Secrets 配置、tag 推送命令、产物说明 |

不提交 keystore、`.env.android.local`、`artifacts/`。

## 9. 运维操作（人工一次性）

1. 本机将 `.android-signing/newsnook-release.jks` 转为 base64，写入 Secret `NEWSNOOK_KEYSTORE_BASE64`
2. 将 `.env.android.local` 中的密码与 alias 写入对应 Secrets
3. 确认 `package.json` version 已递增并已提交
4. `git tag vX.Y.Z && git push origin vX.Y.Z`
5. 在 Actions / Releases 页确认构建成功与附件齐全

## 10. 成功标准

- 推送匹配 version 的 `v*` tag 后 workflow 变绿
- GitHub Release 为 published，且含 cloud/local 的 apk+aab 共 4 个附件
- version 与 tag 不一致时 workflow 明确失败
- 无密钥明文进入日志或仓库
