# 贡献指南

感谢你对 NewsNook 的兴趣。本文说明如何报告问题、提交改动，以及本地开发时常用的命令。

产品理念与安装说明见 [`README.md`](./README.md)。构建细节见 [`docs/android-build.md`](./docs/android-build.md)。

## 欢迎的贡献类型

- 修复失效信源或正文提取
- 崩溃 / 兼容性问题修复
- 翻译链路（ML Kit、Bergamot、云端 provider）相关修复
- 文档与注释改进
- 小范围交互与无障碍改进
- 经过讨论后的新源接入

大改架构、替换技术栈或引入新的网络依赖前，请先开 Issue 讨论。

## 报告问题

请用 [Issue](https://github.com/t59688/newsnook/issues) 反馈，并尽量附上：

- 应用版本（Releases 中的 tag 或关于页版本号）
- Android 版本与设备型号
- 构建变体：轻量版（cloud）或完整版（local）
- 信源名称、文章链接（如有）
- 复现步骤、截图或相关日志

安全相关问题请按 [`SECURITY.md`](./SECURITY.md) 处理，不要在公开 Issue 中贴出可被利用的细节。

## 开发环境

- Node.js 22+
- Android SDK（API 36、Build Tools 36）与 JDK 21（仅 Android 构建需要）

```bash
git clone https://github.com/t59688/newsnook.git
cd newsnook
npm install
npm run dev
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | Web 开发服务器 |
| `npm run lint` | oxlint |
| `npm run android:run` | 同步并运行轻量 Android |
| `npm run android:run:local` | 同步并运行完整版 |
| `npm run bergamot:init` | 拉取 Bergamot 原生依赖（local 离线翻译） |

签名与发版流程见 [`docs/android-build.md`](./docs/android-build.md)。**不要**把 keystore、`.env.android.local` 或 API Key 提交进仓库。

## 拉取请求

1. 从最新的默认分支创建开分支
2. 改动尽量小而完整：一次 PR 解决一个问题
3. 不顺手重构无关文件，不批量格式化未改动的代码
4. 若触及解析、翻译、缓存等逻辑，尽量补充或运行相关 `npm run test:*` 脚本
5. PR 描述写清：动机、改了什么、如何验证

新增生产依赖前请在 PR 中说明原因。

## 代码约定

- 跟随现有目录、命名与错误处理方式；优先复用已有模块
- 公开 API、本地存储格式与外部行为变更需在 PR 中明确写出
- 注释只写非显而易见的约束与权衡；命名应尽量自解释
- 中文用于面向用户的文案与文档；代码标识符保持项目既有英文风格

## 行为准则

请保持尊重、就事论事。人身攻击、骚扰或恶意利用 Issue / PR 的行为不可接受。维护者可关闭不当讨论并拒绝相关贡献。
