# newsnook 有所闻 Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** 在 `web/` 交付 backendless 手机比例 React 阅读 App：真源 RSS/网易直连，详情页站内全文（Feed 全文或 Readability 抽取），有所闻视觉与下拉刷新。

**Architecture:** Vite + React + TS + Tailwind v4；开发态 Vite 代理绕过 CORS；App 态 CapacitorHttp；Feed 解析统一为 Article；详情经 ArticleBodyResolver 保证站内全文。

**Tech Stack:** Vite, React 19, TypeScript, Tailwind v4, animejs, lucide-react, fast-xml-parser, @mozilla/readability, linkedom, dompurify, @capacitor/core + preferences

## Global Constraints

- backendless：无自建服务端；禁止详情页「请打开原文阅读」作为主路径
- 主题：有所闻 token（ink `#0E0F12` / paper `#E8E2D6` / cinnabar `#C45C4A`）
- 工程根：`web/`
- 解析禁止固定下标崩溃；单源失败不阻塞全局刷新

---

### Task 1: Scaffold `web/`

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css`, `web/tsconfig.json`, `web/capacitor.config.ts`

- [ ] Scaffold Vite React-TS，安装依赖：`tailwindcss @tailwindcss/vite animejs lucide-react fast-xml-parser @mozilla/readability linkedom dompurify @types/dompurify @capacitor/core @capacitor/preferences @capacitor/cli`
- [ ] 配置 Vite proxy：将 `/proxy` 转发到任意上游（改写 Host），覆盖 RSS 与原文域名
- [ ] 跑通空白墨砚底色手机框页面

### Task 2: Types + Source registry + HTTP + parsers

**Files:**
- Create: `web/src/types.ts`, `web/src/sources.ts`, `web/src/lib/http.ts`, `web/src/lib/parseFeed.ts`, `web/src/lib/parseNetEase.ts`, `web/src/lib/resolveBody.ts`, `web/src/lib/storage.ts`, `web/src/lib/feedService.ts`

- [ ] 定义 `Article`, `NewsSource`, `BodyStatus`
- [ ] 写入实测 PASS 默认源（含网易 HTTP）
- [ ] `httpGet(url)`：native 用 CapacitorHttp，web 用 `/proxy?url=`
- [ ] 解析 RSS/Atom/RDF；网易 JSON 动态 key
- [ ] `resolveArticleBody(article)`：Feed 全文优先，否则拉 originUrl + Readability + DOMPurify
- [ ] Preferences/localStorage 缓存列表与正文

### Task 3: App shell + Today feed + pull-to-refresh

**Files:**
- Create: `web/src/components/PhoneShell.tsx`, `InkHairline.tsx`, `PullToRefresh.tsx`, `ArticleList.tsx`, `ArticleRow.tsx`, `BottomNav.tsx`, `web/src/hooks/useFeed.ts`, `web/src/pages/TodayPage.tsx`

- [ ] 390×844 手机壳 + 底栏三 Tab
- [ ] 今日混合时间线、下拉刷新墨点动效（animejs）
- [ ] 右滑稍后读

### Task 4: Detail + Channels + Me

**Files:**
- Create: `web/src/pages/ArticlePage.tsx`, `ChannelsPage.tsx`, `SourcePage.tsx`, `MePage.tsx`, `web/src/components/ArticleBody.tsx`

- [ ] 详情：loading 骨架 → 站内全文；失败可重试；次要「原文」按钮
- [ ] 频道开关与单源列表
- [ ] 稍后读 / 已读 / 清缓存

### Task 5: Verify

- [ ] `npm run dev`，确认列表有真源标题，点开有正文（非「打开原文」占位）
- [ ] 记录仍失败的源

---

**Execution:** 本会话 Inline 连续执行 Task 1–5。
