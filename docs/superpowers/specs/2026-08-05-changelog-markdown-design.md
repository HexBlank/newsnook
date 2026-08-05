# 更新日志 Markdown 渲染设计

> 日期：2026-08-05  
> 范围：`ChangelogScreen`、`UpdateDialog` 的 Release notes 展示  
> 不改：GitHub 拉取 / semver / 下载安装、阅读器正文消毒管线

## 1. 目标

GitHub Release `body` 为 Markdown；应用内不再用 `<pre>` 原文展示，改为安全渲染后的富文本。

## 2. 方案

采用 **`marked` + 现有 `DOMPurify`**（方案 A）。

| 层 | 职责 |
|---|---|
| `src/lib/markdown.ts` | `markdownToSafeHtml(md)`：`marked.parse` → 紧白名单消毒 |
| `src/components/MarkdownBody.tsx` | 注入 HTML、样式容器、外链点击打开 |
| `ChangelogScreen` / `UpdateDialog` | 用 `MarkdownBody` 替换 `<pre>` |

不采用：`react-markdown`（偏重）；手写子集解析（易漏 GFM）。

## 3. 安全

- 消毒允许：`p ul ol li h1 h2 h3 strong em a code pre br hr blockquote`
- `a[href]` 仅保留 `http:` / `https:`（相对链接可丢弃或忽略）
- 禁止：`script`、`iframe`、`img`、事件属性、`javascript:` 协议
- 浏览器：优先 `DOMPurify`；Node / linkedom（`isSupported === false` 时会原样返回脏 HTML）走同白名单的 DOM 清洗回退

## 4. 交互与样式

- 外链：点击委托，走现有 `Browser.open` / `window.open`（与 Changelog 页「在 GitHub 查看」一致）
- 样式类名：`changelog-md`（紧凑字号/间距，对齐设置页与弹框，不复用 `reader-prose`）
- 弹框：`max-h-40 overflow-y-auto` 保留；先对 **原始 MD 按行** `truncateReleaseNotes`，再渲染

## 5. 依赖

- 新增生产依赖：`marked`
- 复用：`dompurify`（已有）

## 6. 验证

- 含标题、列表、加粗、链接的 MD 能正确排版
- 恶意标签 / `javascript:` 链接被剥除
- 现有 `test:app-update`（截断逻辑）仍通过；可补 `markdownToSafeHtml` 小测
