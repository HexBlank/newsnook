# Changelog Markdown Rendering Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render GitHub Release Markdown safely in ChangelogScreen and UpdateDialog.

**Architecture:** `marked` → tight `DOMPurify` whitelist in `markdownToSafeHtml`; shared `MarkdownBody` component; compact `changelog-md` CSS.

**Tech Stack:** marked, existing dompurify, React 19, Tailwind / index.css

## Global Constraints

- New production dep: `marked` only
- Do not change GitHub fetch / semver / download install
- Do not reuse `reader-prose` or article sanitize pipeline
- Truncate dialog notes on raw MD lines before render

---

### Task 1: markdownToSafeHtml + test

**Files:**
- Create: `src/lib/markdown.ts`
- Create: `scripts/markdown-safe.test.ts`
- Modify: `package.json` (dep + `test:markdown` script)

- [ ] Install `marked`
- [ ] Implement `markdownToSafeHtml`
- [ ] Add tests for headings/lists/bold/links and XSS stripping
- [ ] Run `npm run test:markdown`

### Task 2: MarkdownBody + CSS

**Files:**
- Create: `src/components/MarkdownBody.tsx`
- Modify: `src/index.css`

- [ ] Component with click-delegated external links
- [ ] `changelog-md` compact styles

### Task 3: Wire screens

**Files:**
- Modify: `src/screens/settings/ChangelogScreen.tsx`
- Modify: `src/features/appUpdate/UpdateDialog.tsx`

- [ ] Replace `<pre>` with `MarkdownBody`
- [ ] Run `npm run test:app-update` and `npm run test:markdown`
