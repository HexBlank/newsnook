import { BookmarkCheck } from 'lucide-react'

import { InkImage } from './InkImage'
import type { Article } from '../lib/types'
import { articleRelativeTime } from '../lib/time'

interface RowProps {
  article: Article
  read: boolean
  saved: boolean
  onOpen: (article: Article) => void
  onSourceClick?: (sourceId: string) => void
  /** 邻页预览等场景跳过入场透明，避免横滑露白 */
  revealed?: boolean
}

export function ArticleRow({
  article,
  read,
  saved,
  onOpen,
  onSourceClick,
  revealed = false,
}: RowProps) {
  return (
    <li
      data-reveal={revealed ? undefined : true}
      className={`relative transition-colors duration-300 md:h-full ${
        read ? 'bg-ink/30' : 'bg-ink-raised/70 md:bg-transparent'
      }`}
    >
      {/* 移动端横排布局 (Mobile: < md) */}
      <button
        type="button"
        onClick={() => onOpen(article)}
        className={`group relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all duration-200 sm:gap-3.5 sm:px-5 sm:py-4 md:hidden ${
          read
            ? 'bg-transparent hover:bg-ink/50 group-active:bg-ink-deep/40'
            : 'bg-gradient-to-r from-cinnabar/[0.035] via-transparent to-transparent hover:bg-ink-raised group-active:bg-ink-deep/20'
        }`}
      >
        {/* 未读朱砂印记 */}
        <span
          className={`self-start mt-1.5 h-3.5 w-[3px] rounded-full shrink-0 transition-all duration-300 ${
            read
              ? 'bg-transparent opacity-0'
              : 'bg-cinnabar shadow-[0_0_6px_rgba(196,92,74,0.35)] opacity-100 group-active:scale-y-110'
          }`}
          aria-hidden
        />

        <span className="min-w-0 flex-1">
          <span
            className={`flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] ${
              read ? 'text-paper-faint/80' : 'text-paper-faint'
            }`}
          >
            <span
              role={onSourceClick ? 'button' : undefined}
              tabIndex={onSourceClick ? 0 : undefined}
              onClick={
                onSourceClick
                  ? (e) => {
                      e.stopPropagation()
                      onSourceClick(article.sourceId)
                    }
                  : undefined
              }
              className={`${
                read ? 'text-paper-faint' : 'text-paper-muted font-medium'
              } ${onSourceClick ? 'hover:text-cinnabar transition-colors cursor-pointer' : ''}`}
            >
              {article.sourceLabel}
            </span>
            <span aria-hidden>·</span>
            <span>{articleRelativeTime(article)}</span>
            {saved && <BookmarkCheck size={11} strokeWidth={1.8} className="text-cinnabar" />}
          </span>

          <span
            className={`row-title mt-1.5 block font-display text-[16.5px] leading-[1.38] tracking-[0.01em] ${
              read
                ? 'font-normal text-paper-muted/80 opacity-75'
                : 'font-medium text-paper'
            }`}
          >
            {article.title}
          </span>

          {article.summary && (
            <span
              className={`mt-1.5 line-clamp-2 text-[12.5px] leading-[1.6] ${
                read ? 'text-paper-faint/85' : 'text-paper-muted/95'
              }`}
            >
              {article.summary}
            </span>
          )}
        </span>

        <InkImage
          src={article.image}
          collapseOnError
          className={`h-17 w-17 shrink-0 rounded-md transition-all duration-300 ${
            read
              ? 'opacity-[0.62] grayscale-[0.2] saturate-[0.8] group-active:opacity-85'
              : 'opacity-[0.96] group-active:opacity-100'
          }`}
        />
      </button>

      {/* 桌面端/平板端杂志卡片布局 (Desktop & Tablet: >= md) */}
      <button
        type="button"
        onClick={() => onOpen(article)}
        className={`group relative hidden h-full w-full flex-col justify-between rounded-xl border p-5 text-left transition-all duration-300 md:flex ${
          read
            ? 'border-haze/60 bg-ink/40 hover:border-haze hover:bg-ink-raised/40 opacity-85'
            : 'border-haze bg-ink-raised/60 hover:border-paper-faint/35 hover:bg-ink-raised hover:shadow-md'
        }`}
      >
        <div className="w-full">
          {/* 大图展示 (如果有图) */}
          {article.image && (
            <div className="mb-3.5 overflow-hidden rounded-lg bg-ink border border-haze/60">
              <InkImage
                src={article.image}
                collapseOnError
                className={`h-38 w-full object-cover transition-all duration-500 group-hover:scale-105 ${
                  read
                    ? 'opacity-70 grayscale-[0.2] saturate-[0.8]'
                    : 'opacity-95 group-hover:opacity-100'
                }`}
              />
            </div>
          )}

          {/* 信源与时间 */}
          <div className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-[0.14em] text-paper-faint">
            <div className="flex items-center gap-2 min-w-0">
              {!read && (
                <span
                  className="h-2 w-2 rounded-full bg-cinnabar shadow-[0_0_6px_rgba(196,92,74,0.4)] shrink-0"
                  aria-hidden
                />
              )}
              <span
                role={onSourceClick ? 'button' : undefined}
                tabIndex={onSourceClick ? 0 : undefined}
                onClick={
                  onSourceClick
                    ? (e) => {
                        e.stopPropagation()
                        onSourceClick(article.sourceId)
                      }
                    : undefined
                }
                className={`truncate ${
                  read ? 'text-paper-faint' : 'text-paper-muted font-medium'
                } ${onSourceClick ? 'hover:text-cinnabar transition-colors cursor-pointer' : ''}`}
              >
                {article.sourceLabel}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span>{articleRelativeTime(article)}</span>
              {saved && <BookmarkCheck size={12} strokeWidth={1.8} className="text-cinnabar" />}
            </div>
          </div>

          {/* 文章标题 */}
          <h2
            className={`row-title mt-2 font-display text-[17.5px] xl:text-[18.5px] leading-[1.38] tracking-[0.01em] transition-colors duration-200 ${
              read
                ? 'font-normal text-paper-muted/80'
                : 'font-medium text-paper group-hover:text-cinnabar'
            }`}
          >
            {article.title}
          </h2>

          {/* 摘要导读 */}
          {article.summary && (
            <p
              className={`mt-2 line-clamp-3 text-[13px] leading-[1.65] ${
                read ? 'text-paper-faint/80' : 'text-paper-muted/90'
              }`}
            >
              {article.summary}
            </p>
          )}
        </div>

        {/* 卡片底栏提示 */}
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-haze/50 font-mono text-[10px] text-paper-faint">
          <span>{read ? '已读 · 点击重温' : '点击阅读全文'}</span>
          <span className="text-paper-muted group-hover:text-cinnabar group-hover:translate-x-0.5 transition-all">
            →
          </span>
        </div>
      </button>
    </li>
  )
}

interface LeadProps {
  article: Article
  read?: boolean
  saved?: boolean
  onOpen: (article: Article) => void
  onSourceClick?: (sourceId: string) => void
  revealed?: boolean
}

/**
 * 头条：移动端为杂志封面感全宽图文；桌面端为精美双栏杂志特写卡片。
 */
export function LeadStory({
  article,
  read = false,
  saved = false,
  onOpen,
  onSourceClick,
  revealed = false,
}: LeadProps) {
  return (
    <>
      {/* 移动端头条 (Mobile: < lg) */}
      <button
        data-reveal={revealed ? undefined : true}
        type="button"
        onClick={() => onOpen(article)}
        className={`group block w-full text-left transition-colors duration-300 lg:hidden ${
          read
            ? 'bg-transparent'
            : 'bg-gradient-to-b from-transparent via-cinnabar/[0.015] to-ink-raised/40'
        }`}
      >
        <span className="ink-grain relative block overflow-hidden">
          <InkImage
            src={article.image}
            eager
            className={`mask-fade-b h-42 w-full transition-all duration-700 ease-ink group-active:scale-[1.015] md:h-55 ${
              read ? 'opacity-[0.78] grayscale-[0.15] saturate-[0.88]' : 'opacity-100'
            }`}
          />
        </span>

        <span className="page-x -mt-6 block pb-5 md:pb-6">
          <span
            className={`flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] ${
              read ? 'text-paper-faint' : 'text-cinnabar-soft'
            }`}
          >
            <span className={`h-px w-5 ${read ? 'bg-haze' : 'bg-cinnabar'}`} aria-hidden />
            <span
              role={onSourceClick ? 'button' : undefined}
              tabIndex={onSourceClick ? 0 : undefined}
              onClick={
                onSourceClick
                  ? (e) => {
                      e.stopPropagation()
                      onSourceClick(article.sourceId)
                    }
                  : undefined
              }
              className={onSourceClick ? 'hover:text-paper transition-colors cursor-pointer' : ''}
            >
              头条 · {article.sourceLabel}
            </span>
            {saved && <BookmarkCheck size={11} strokeWidth={1.8} className="text-cinnabar" />}
          </span>
          <span
            className={`lead-title mt-2.5 block font-display text-[21px] leading-[1.28] md:text-[25px] ${
              read ? 'font-normal text-paper-muted/80 opacity-80' : 'font-medium text-paper'
            }`}
          >
            {article.title}
          </span>
          {article.summary && (
            <span
              className={`mt-2 line-clamp-2 text-[13px] leading-[1.65] ${
                read ? 'text-paper-faint/85' : 'text-paper-muted'
              }`}
            >
              {article.summary}
            </span>
          )}
          <span className="mt-3 flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-paper-faint">
            <span>{articleRelativeTime(article)}</span>
            <span className="h-px w-3 bg-haze" aria-hidden />
            <span>{read ? '重温正文' : '阅读全文'}</span>
          </span>
        </span>
      </button>

      {/* 桌面端杂志特写头条 (Desktop: >= lg) */}
      <div
        data-reveal={revealed ? undefined : true}
        className="hidden lg:block my-6 px-6 xl:px-8 2xl:px-10"
      >
        <button
          type="button"
          onClick={() => onOpen(article)}
          className={`group relative grid w-full grid-cols-12 gap-8 items-center rounded-2xl border p-6 xl:p-8 2xl:p-10 text-left transition-all duration-300 ${
            read
              ? 'border-haze bg-ink/50 hover:bg-ink-raised/50 opacity-90'
              : 'border-haze bg-ink-raised/60 hover:border-paper-faint/40 hover:bg-ink-raised hover:shadow-xl'
          }`}
        >
          {/* 左侧大图 (7 栅格) */}
          <div className="col-span-7 h-[300px] xl:h-[350px] 2xl:h-[400px] w-full overflow-hidden rounded-xl bg-ink border border-haze/70 relative">
            <InkImage
              src={article.image}
              eager
              className={`h-full w-full object-cover transition-all duration-700 ease-ink group-hover:scale-105 ${
                read ? 'opacity-80 grayscale-[0.15] saturate-[0.88]' : 'opacity-100'
              }`}
            />
          </div>

          {/* 右侧深度排版区 (5 栅格) */}
          <div className="col-span-5 flex flex-col justify-between h-full py-2">
            <div>
              <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-cinnabar-soft">
                <span className="h-px w-6 bg-cinnabar" aria-hidden />
                <span
                  role={onSourceClick ? 'button' : undefined}
                  tabIndex={onSourceClick ? 0 : undefined}
                  onClick={
                    onSourceClick
                      ? (e) => {
                          e.stopPropagation()
                          onSourceClick(article.sourceId)
                        }
                      : undefined
                  }
                  className={onSourceClick ? 'hover:text-paper transition-colors cursor-pointer' : ''}
                >
                  头条特写 · {article.sourceLabel}
                </span>
                {saved && <BookmarkCheck size={13} strokeWidth={1.8} className="text-cinnabar" />}
              </div>

              <h1
                className={`lead-title mt-4 font-display text-[26px] xl:text-[30px] leading-[1.3] font-medium transition-colors duration-200 ${
                  read
                    ? 'text-paper-muted/90'
                    : 'text-paper group-hover:text-cinnabar'
                }`}
              >
                {article.title}
              </h1>

              {article.summary && (
                <p className="mt-3.5 line-clamp-4 text-[14px] leading-[1.7] text-paper-muted">
                  {article.summary}
                </p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-haze/60 font-mono text-[11px] text-paper-faint">
              <span className="flex items-center gap-2">
                <span>{articleRelativeTime(article)}</span>
                <span className="h-px w-3 bg-haze" aria-hidden />
                <span>{read ? '已读' : '精选要闻'}</span>
              </span>
              <span className="flex items-center gap-1 font-medium text-cinnabar group-hover:translate-x-1 transition-transform">
                <span>{read ? '重温正文' : '展开阅读'}</span>
                <span>→</span>
              </span>
            </div>
          </div>
        </button>
      </div>
    </>
  )
}
