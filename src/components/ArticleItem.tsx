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
      className={`relative transition-colors duration-300 ${
        read ? 'bg-ink/30' : 'bg-ink-raised/70'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(article)}
        className={`group relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all duration-200 sm:gap-3.5 sm:px-5 sm:py-4 md:px-5 ${
          read
            ? 'bg-transparent hover:bg-ink/50 group-active:bg-ink-deep/40'
            : 'bg-gradient-to-r from-cinnabar/[0.035] via-transparent to-transparent hover:bg-ink-raised group-active:bg-ink-deep/20'
        }`}
      >
        {/* 未读朱砂印记：未读为 3px 宽精致朱砂柱，已读朱砂褪去变透明 */}
        <span
          className={`self-start mt-1.5 h-3.5 w-[3px] rounded-full shrink-0 transition-all duration-300 ${
            read
              ? 'bg-transparent opacity-0'
              : 'bg-cinnabar shadow-[0_0_6px_rgba(196,92,74,0.35)] opacity-100 group-active:scale-y-110'
          }`}
          aria-hidden
        />

        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] ${
            read ? 'text-paper-faint/80' : 'text-paper-faint'
          }`}>
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
            className={`row-title mt-1.5 block font-display text-[16.5px] leading-[1.38] tracking-[0.01em] md:text-[17.5px] ${
              read
                ? 'font-normal text-paper-muted/80 opacity-75'
                : 'font-medium text-paper'
            }`}
          >
            {article.title}
          </span>

          {article.summary && (
            <span className={`mt-1.5 line-clamp-2 text-[12.5px] leading-[1.6] ${
              read ? 'text-paper-faint/85' : 'text-paper-muted/95'
            }`}>
              {article.summary}
            </span>
          )}
        </span>

        <InkImage
          src={article.image}
          collapseOnError
          className={`h-17 w-17 shrink-0 rounded-md transition-all duration-300 md:h-22 md:w-22 lg:h-24 lg:w-24 ${
            read
              ? 'opacity-[0.62] grayscale-[0.2] saturate-[0.8] group-active:opacity-85'
              : 'opacity-[0.96] group-active:opacity-100'
          }`}
        />
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
 * 头条：图片作为独立视觉面，标题落在纸面上——杂志封面感，避免字压图的脏糊。
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
    <button
      data-reveal={revealed ? undefined : true}
      type="button"
      onClick={() => onOpen(article)}
      className={`group block w-full text-left transition-colors duration-300 ${
        read ? 'bg-transparent' : 'bg-gradient-to-b from-transparent via-cinnabar/[0.015] to-ink-raised/40'
      }`}
    >
      <span className="ink-grain relative block overflow-hidden">
        <InkImage
          src={article.image}
          eager
          className={`mask-fade-b h-42 w-full transition-all duration-700 ease-ink group-active:scale-[1.015] md:h-55 lg:h-70 ${
            read ? 'opacity-[0.78] grayscale-[0.15] saturate-[0.88]' : 'opacity-100'
          }`}
        />
      </span>

      <span className="page-x -mt-6 block pb-5 md:pb-6 lg:max-w-4xl">
        <span className={`flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] ${
          read ? 'text-paper-faint' : 'text-cinnabar-soft'
        }`}>
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
        <span className={`lead-title mt-2.5 block font-display text-[21px] leading-[1.28] md:text-[25px] lg:text-[28px] ${
          read ? 'font-normal text-paper-muted/80 opacity-80' : 'font-medium text-paper'
        }`}>
          {article.title}
        </span>
        {article.summary && (
          <span className={`mt-2 line-clamp-2 text-[13px] leading-[1.65] ${
            read ? 'text-paper-faint/85' : 'text-paper-muted'
          }`}>
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
  )
}

