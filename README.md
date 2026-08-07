# NewsNook（有所闻）

[![License](https://img.shields.io/github/license/t59688/newsnook)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/t59688/newsnook)](https://github.com/t59688/newsnook/releases)
[![Issues](https://img.shields.io/github/issues/t59688/newsnook)](https://github.com/t59688/newsnook/issues)

本地优先的 Android 新闻阅读客户端：无账号、无后端、无推荐算法。订阅源由你配置，列表与正文由客户端直连上游获取，并在应用内阅读。

软件定位是**工具**，不是内容平台。不生产新闻，不做观点输出，不试图留住你的注意力。以 [Apache License 2.0](./LICENSE) 开源。

## 目录

- [界面预览](#界面预览)
- [特性](#特性)
- [安装](#安装)
- [快速开始](#快速开始)
- [理念](#理念)
- [功能详解](#功能详解)
- [架构](#架构)
- [贡献](#贡献)
- [许可与声明](#许可与声明)
- [致谢](#致谢)

## 界面预览

<table>
  <tr>
    <td align="center" width="33%"><img src="docs/screenshots/home.jpg" alt="首页信息流" /><br/><sub>首页信息流</sub></td>
    <td align="center" width="33%"><img src="docs/screenshots/bilingual.jpg" alt="对照翻译" /><br/><sub>对照翻译</sub></td>
    <td align="center" width="33%"><img src="docs/screenshots/scenes.jpg" alt="切换场景" /><br/><sub>切换场景</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/categories.jpg" alt="分类与信源" /><br/><sub>分类与信源</sub></td>
    <td align="center"><img src="docs/screenshots/appearance.jpg" alt="外观" /><br/><sub>外观</sub></td>
    <td align="center"><img src="docs/screenshots/home-dark.jpg" alt="夜读信息流" /><br/><sub>夜读信息流</sub></td>
  </tr>
</table>

更多界面截图见 [`docs/screenshots`](./docs/screenshots)。

## 特性

- **本地优先**：偏好、稍后读、阅读记录与正文缓存只存在本机，不上传到任何服务器
- **无推荐、无广告**：只展示你启用的源与类别，不做热度或算法强推
- **内置源 + 场景预设**：网易、知乎日报、BBC、科技媒体、博客 RSS 等；支持分类组织与一键切换场景
- **站内全文阅读**：应用内渲染正文，随时可跳转原站核对；图片放大 / 保存 / 分享，网易视频稿支持手势调亮度音量
- **翻译三路可选**：Android ML Kit、Bergamot 离线（`local` 包）、云端（Google / Azure / DeepL / DeepLX / OpenAI 兼容）
- **双构建变体**：轻量版（cloud，~2 MB）与完整版（local，含离线翻译相关组件）

## 安装

发布文件见 [Releases](https://github.com/t59688/newsnook/releases)。两个变体**包名与签名相同**，同一设备安装其中一个即可。安装时可能需允许「安装未知应用」。当前仅提供 Android。

| 变体 | 大约体积 | 说明 |
| --- | --- | --- |
| 轻量版（cloud） | ~ 2 MB | 功能完整，不含本地离线翻译相关原生库；可使用云端翻译 |
| 完整版（local） | ~ 60 MB | 额外体积主要为离线翻译相关组件；语言模型仍按需下载；Bergamot 当前仅支持 `arm64-v8a` |

不需要离线翻译时安装轻量版即可，其它功能没有缺失。

## 快速开始

技术栈：React 19 + Vite + TypeScript + Capacitor 8（Android）。

```bash
git clone https://github.com/t59688/newsnook.git
cd newsnook
npm install
npm run dev                 # Web 开发
npm run android:run         # 轻量 Android（需 Android SDK）
# npm run android:run:local # 完整版（含 Bergamot 时需先 npm run bergamot:init）
```

环境要求、签名、CI 发版与调试说明见 [`docs/android-build.md`](./docs/android-build.md)。贡献流程见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

## 理念

多数新闻 App 以停留时长与点击为目标，用推荐把人留在信息流里。NewsNook 不做这件事。

- **没有推荐**：不会根据阅读历史「猜你喜欢」，也不会按热度或算法排序强推内容
- **没有账号与云同步**：偏好、稍后读、阅读记录只存在本机
- **没有广告与信息流运营**：界面只展示你启用的源与类别
- **你配置什么，就看什么**：源、类别、场景预设都是显式配置，而不是黑箱投喂

如果你需要的是打开就有内容刷的平台体验，本项目可能不合适。如果你希望软件只负责把选定来源的文章读顺，合上就结束，那就是本项目的目标。

项目参考已长期停更的「卡片新闻」：简洁、专注阅读。旧版在新 Android 上难以稳定运行，因此重新实现，并补上多信源、站内全文、翻译与离线阅读等能力。

与 FreshRSS 等自建聚合器的定位差异见 [`docs/vs-freshrss.md`](./docs/vs-freshrss.md)。

## 功能详解

### 源与类别

应用内置一批可用源，例如：网易各频道、知乎日报、BBC、德国之声，以及少数派、36氪、爱范儿、IT之家等科技媒体，部分 AI 公司官网动态，以及个人博客 RSS。源可以单独开启或关闭。列表由客户端直接拉取 RSS / Atom 或公开接口，无自建业务后端。

源较多时用**类别**组织（如商业、政务、科技、国际等）。每个类别下挂若干源，主界面按类别横向切换。类别顺序、是否显示、每个类别包含哪些源，均可在设置中调整；也可以进入某一个源单独浏览。

### 场景预设

当前整套配置——分类顺序、显示开关、各类别下的源——可以保存为**场景预设**快照，之后一键切换。

内置预设包括：全景门户、极客与 AI、商业创投、全球视野、慢读智识、摸鱼消遣。也可以在任一预设基础上修改，另存为自己的版本。

### 站内阅读

点击条目后，在应用内渲染适合手机阅读的正文，包含标题、来源、时间、图片、表格等常见结构。若对排版或内容有疑虑，可随时跳转原网站核对。

图片支持放大、缩放、保存与分享。网易视频稿提供播放器，支持全屏；全屏下可通过左侧滑动调节亮度、右侧滑动调节音量。

### 翻译

支持将外文内容译为中文，有两种显示方式：

- **全文替换**：界面只显示译文
- **对照阅读**：保留原文，译文跟在对应段落下

翻译能力分三路，可按需选用：

- **Android 本地翻译（ML Kit）**：语言包下载到设备，离线可用；需能访问 Google 下载语言包
- **Bergamot 离线翻译**：Mozilla/Marian 专用翻译模型，按语对下载（首版 en↔zh），适合无 GMS 场景；当前仅在 `local` 包的 `arm64-v8a` 设备上可用
- **云端翻译**：支持 Google、Azure、DeepL、自建 DeepLX，以及 OpenAI 兼容的 **AI 翻译**（自备 Base URL / API Key / Model）。API Key 由用户自行填写并保存在本机；请求直连用户配置的服务地址。应用作者不中转这些请求，也无法查看你翻译了什么

完整版（local）构建前若要启用 Bergamot 原生引擎，需先执行 `npm run bergamot:init` 拉取 `bergamot-translator`。该脚本会自动应用当前所需的 Android 兼容补丁。

### 稍后读与缓存

加入「稍后读」的文章会预加载正文，便于无网时阅读。最近阅读过的条目有历史记录。完整打开过的正文会缓存在本机，断网后仍可回看；缓存过多时可在设置中手动清理。

### 外观

可调整字体、字号与行高，以及浅色 / 深色 / 跟随系统。相关偏好同样只保存在本机。

## 架构

```text
公开新闻源 → 客户端请求 → 列表解析 / 正文提取 → 分类 · 缓存 · 翻译 → 本地阅读
```

无自建内容服务器，部署简单，但也受上游接口、页面结构与反爬策略影响；源站改版后解析可能需同步更新。

更细的分层与模块说明见 [`docs/architecture.md`](./docs/architecture.md)。

## 贡献

欢迎通过 [Issue](https://github.com/t59688/newsnook/issues) 反馈：源失效、正文提取错误、翻译问题、崩溃、新源建议、交互建议。

请尽量附上：Android 版本、应用版本、设备型号、信源名称、文章链接、截图或日志、复现步骤。

开发与 PR 约定见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。安全问题见 [`SECURITY.md`](./SECURITY.md)。

## 许可与声明

- 软件以 [Apache License 2.0](./LICENSE) 授权；版权归属与署名见 [`NOTICE`](./NOTICE)
- NewsNook 是阅读器，不主张第三方新闻正文的版权；商标与媒体名称归各自权利人
- 偏好、缓存与用户自填的 API Key 仅保存在本机；维护者不收集、不托管
- 软件按「现状」提供；上游可用性、解析完整性与翻译质量均不保证

完整权利声明与免责声明见 [`docs/legal.md`](./docs/legal.md)。

## 致谢

感谢公开内容、开放接口与开源工具的提供者，尤其是 React、Vite、Capacitor、Mozilla Readability、Bergamot Translator、Tailwind CSS 等项目。

感谢 [Linux.do](https://linux.do) 社区提供的平台与交流环境，讨论与分享对本项目帮助很大。
