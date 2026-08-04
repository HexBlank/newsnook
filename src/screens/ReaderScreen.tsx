import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Browser } from '@capacitor/browser'
import { ArrowLeft, BookmarkCheck, BookmarkPlus, Globe, Languages, LoaderCircle, RefreshCw } from 'lucide-react'

import { ImageLightbox } from '../components/ImageLightbox'
import { InkImage } from '../components/InkImage'
import { InkVideoPlayer } from '../components/InkVideoPlayer'
import { InlineArticleVideos } from '../components/InlineArticleVideos'
import { loadCachedBody, saveCachedBody } from '../lib/bodyCache'
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack'
import { useProgressiveImages } from '../hooks/useProgressiveImages'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { revealReader } from '../lib/motion'
import { resolveArticleBody, type BodySource } from '../lib/resolveBody'
import { articleRelativeTime } from '../lib/time'
import type { Article } from '../lib/types'
import { createTranslationService } from '../features/translation/service'
import {
  translationDisplayModeLabel,
  translationLanguageLabel,
  translationProviderLabel,
} from '../features/translation/config'
import type { TranslatedArticleContent, TranslationPrefs } from '../features/translation/types'

interface Props {
  article: Article
  saved: boolean
  onClose: () => void
  onToggleLater: (article: Article) => void
  onCacheChange: () => void
  /** 返回 true 表示已消费系统返回（例如关闭大图），供 App 回退栈使用 */
  overlayCloserRef?: MutableRefObject<(() => boolean) | null>
  translationPrefs: TranslationPrefs
}

type LoadState = 'loading' | 'ready' | 'error'
const TRANSLATION_TIMEOUT_MS = 60_000

export function ReaderScreen({
  article,
  saved,
  onClose,
  onToggleLater,
  onCacheChange,
  overlayCloserRef,
  translationPrefs,
}: Props) {
  const reduced = useReducedMotion()
  const shellRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const proseRef = useRef<HTMLDivElement>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [html, setHtml] = useState('')
  const [bodySource, setBodySource] = useState<BodySource | null>(null)
  const [resolvedOriginUrl, setResolvedOriginUrl] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [translated, setTranslated] = useState<TranslatedArticleContent | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [translationState, setTranslationState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [translationError, setTranslationError] = useState('')
  const translationAbortRef = useRef<AbortController | null>(null)
  const translationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEdgeSwipeBack({
    containerRef: shellRef,
    onBack: onClose,
    disabled: Boolean(lightbox),
    reduced,
  })

  useEffect(() => {
    const root = proseRef.current
    if (!root || loadState !== 'ready') return

    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLImageElement)) return
      if (target.classList.contains('async-img-failed')) return
      if (
        target.classList.contains('reader-img-badge') ||
        target.getAttribute('data-reader-role') === 'badge'
      ) {
        return
      }
      const src = target.currentSrc || target.src
      if (!src) return
      event.preventDefault()
      setLightbox({ src, alt: target.alt || '' })
    }

    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [html, loadState, showTranslation, translated])

  useEffect(() => {
    translationAbortRef.current?.abort()
    translationAbortRef.current = null
    if (translationTimeoutRef.current) clearTimeout(translationTimeoutRef.current)
    translationTimeoutRef.current = null
    setTranslated(null)
    setShowTranslation(false)
    setTranslationState('idle')
    setTranslationError('')
  }, [
    article.id,
    translationPrefs.displayMode,
    translationPrefs.provider,
    translationPrefs.sourceLanguage,
    translationPrefs.targetLanguage,
  ])

  useEffect(
    () => () => {
      translationAbortRef.current?.abort()
      if (translationTimeoutRef.current) clearTimeout(translationTimeoutRef.current)
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    setError(null)

    // 正文内容是静态的，命中缓存直接出，断网也能重读；重新抽取时才绕过
    if (retryToken === 0) {
      const cached = loadCachedBody(article.id)
      if (cached) {
        setHtml(cached.html)
        setBodySource(cached.bodySource)
        setFromCache(true)
        setLoadState('ready')
        if (!cached.article) {
          saveCachedBody(article, {
            html: cached.html,
            bodySource: cached.bodySource,
          })
        }
        onCacheChange()
        return () => controller.abort()
      }
    }

    setLoadState('loading')
    setHtml('')
    setBodySource(null)
    setResolvedOriginUrl(undefined)
    setFromCache(false)

    resolveArticleBody(article, controller.signal)
      .then((resolved) => {
        if (controller.signal.aborted) return
        setHtml(resolved.contentHtml)
        setBodySource(resolved.bodySource)
        setResolvedOriginUrl(resolved.resolvedOriginUrl)
        setLoadState('ready')
        // 视频稿正文只是占位文案，缓存没有意义
        if (resolved.bodySource !== 'video') {
          const cached = saveCachedBody(article, {
            html: resolved.contentHtml,
            bodySource: resolved.bodySource,
          })
          if (cached) onCacheChange()
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : '正文加载失败')
        setLoadState('error')
      })

    return () => controller.abort()
  }, [article, onCacheChange, retryToken])

  useEffect(() => {
    if (loadState === 'ready') {
      revealReader(rootRef.current, reduced)
    }
  }, [article.id, loadState, reduced])

  const displayedHtml = showTranslation && translated ? translated.html : html
  const comparing = Boolean(
    showTranslation && translated && translationPrefs.displayMode === 'compare',
  )
  const displayedTitle = showTranslation && translated && !comparing ? translated.title : article.title

  const isCjkArticle = useMemo(() => {
    const textSample = `${displayedTitle} ${displayedHtml.slice(0, 1500)}`
    return /[\p{Script=Han}\u3040-\u30ff\uac00-\ud7af]/u.test(textSample)
  }, [displayedTitle, displayedHtml])

  useEffect(() => {
    const root = proseRef.current
    if (!root || loadState !== 'ready') return

    root.querySelectorAll('table').forEach((table) => {
      if (table.parentElement?.hasAttribute('data-reader-horizontal-scroll')) return
      const scroller = document.createElement('div')
      scroller.className = 'reader-table-scroll'
      scroller.setAttribute('data-reader-horizontal-scroll', 'true')
      scroller.setAttribute('role', 'region')
      scroller.setAttribute('aria-label', '可横向滚动的表格')
      table.before(scroller)
      scroller.append(table)
    })
  }, [displayedHtml, loadState])

  useProgressiveImages(proseRef, displayedHtml, loadState === 'ready')

  const sourceHint = useMemo(() => {
    const origin =
      bodySource === 'feed'
        ? '来自订阅源全文'
        : bodySource === 'netease'
          ? '来自网易正文接口'
          : bodySource === 'readability'
            ? '已在应用内抽取原文'
            : bodySource === 'video'
              ? '视频报道 · 应用内播放'
              : null
    if (!origin) return null
    return fromCache ? `${origin} · 离线缓存` : origin
  }, [bodySource, fromCache])

  const openOriginal = async () => {
    const url = resolvedOriginUrl || article.originUrl
    if (!url) return
    await Browser.open({ url })
  }

  const toggleTranslation = async () => {
    if (translated && translationState === 'idle') {
      setShowTranslation((value) => !value)
      setTranslationError('')
      return
    }
    if (loadState !== 'ready' || translationState === 'loading') return

    const controller = new AbortController()
    translationAbortRef.current?.abort()
    translationAbortRef.current = controller
    setTranslationState('loading')
    setTranslationError('')
    setShowTranslation(true)
    setTranslated({ title: article.title, html })

    translationTimeoutRef.current = setTimeout(() => {
      if (translationAbortRef.current !== controller) return
      controller.abort()
      setTranslationError('翻译等待超过 60 秒，请检查网络或翻译服务后重试。')
      setTranslationState('error')
    }, TRANSLATION_TIMEOUT_MS)
    try {
      const result = await createTranslationService(translationPrefs).translateArticle(
        article.title,
        html,
        translationPrefs,
        {
          signal: controller.signal,
          onPartial: (partial) => {
            if (controller.signal.aborted) return
            setTranslated(partial)
          },
        },
      )
      if (controller.signal.aborted) return
      setTranslated(result)
      setShowTranslation(true)
      setTranslationState('idle')
    } catch (error) {
      if (controller.signal.aborted) return
      const raw = error instanceof Error ? error.message : '翻译失败'
      setTranslationError(
        raw.includes('MODEL_NOT_DOWNLOADED')
          ? '请先到「我的 → 翻译」下载当前语言包。'
          : raw,
      )
      setTranslationState('error')
    } finally {
      if (translationAbortRef.current === controller) {
        translationAbortRef.current = null
        if (translationTimeoutRef.current) clearTimeout(translationTimeoutRef.current)
        translationTimeoutRef.current = null
      }
    }
  }

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col pt-[env(safe-area-inset-top)]"
      style={{
        animation: reduced ? undefined : 'reader-in 360ms var(--ease-ink) both',
      }}
    >
      <style>{`@keyframes reader-in { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: none } }`}</style>

      <div
        ref={shellRef}
        className="reader-swipe-surface flex min-h-0 flex-1 flex-col bg-ink"
      >
        <header className="page-x flex shrink-0 items-center justify-between gap-2 pt-1 pb-1">
          <button type="button" onClick={onClose} aria-label="返回列表" className="flex h-9 w-9 shrink-0 items-center justify-center">
            <ArrowLeft size={18} strokeWidth={1.6} className="text-paper" />
          </button>
          <span className="min-w-0 flex-1 truncate text-center font-mono text-[10px] tracking-[0.18em] text-paper-faint">
            {article.sourceName}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={loadState !== 'ready' || translationState === 'loading'}
              onClick={() => void toggleTranslation()}
              aria-pressed={showTranslation}
              aria-label={showTranslation ? '显示原文' : '翻译文章'}
              className="flex h-9 items-center gap-1 px-1 transition-colors duration-200 disabled:opacity-40"
            >
              {translationState === 'loading' ? (
                <LoaderCircle size={14} strokeWidth={1.7} className="animate-spin text-cinnabar-soft" />
              ) : (
                <Languages size={14} strokeWidth={1.7} className={showTranslation ? 'text-cinnabar' : 'text-paper-muted'} />
              )}
              <span className={`font-mono text-[10px] tracking-[0.08em] ${showTranslation ? 'text-cinnabar-soft' : 'text-paper-muted'}`}>
                {translationState === 'loading'
                  ? '翻译中'
                  : translationState === 'error'
                    ? '重试'
                    : showTranslation
                      ? '原文'
                      : '翻译'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onToggleLater(article)}
              aria-pressed={saved}
              aria-label={saved ? '取消收藏' : '收藏'}
              className="flex h-9 items-center gap-1 px-1 transition-colors duration-200"
            >
              {saved ? (
                <BookmarkCheck size={14} strokeWidth={1.7} className="text-cinnabar" />
              ) : (
                <BookmarkPlus size={14} strokeWidth={1.7} className="text-paper-muted" />
              )}
              <span className={`hidden font-mono text-[10px] tracking-[0.08em] min-[390px]:inline ${saved ? 'text-cinnabar-soft' : 'text-paper-muted'}`}>
                {saved ? '已收藏' : '收藏'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void openOriginal()}
              disabled={!resolvedOriginUrl && !article.originUrl}
              aria-label="在浏览器核对原文"
              className="flex h-9 w-9 shrink-0 items-center justify-center disabled:opacity-40"
            >
              <Globe size={14} strokeWidth={1.7} className="text-paper-muted" />
            </button>
          </div>
        </header>

        <div
          ref={rootRef}
          className="scroll-hidden min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-3xl">
            {/* 标题在正文抽取期间就已就位，不随加载状态闪烁 */}
            <div className="page-x pt-4">
              <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-cinnabar-soft">
                <span className="h-px w-5 bg-cinnabar" aria-hidden />
                {articleRelativeTime(article)}
              </span>
              <h1 className="reader-title mt-3 text-paper">{displayedTitle}</h1>
              {comparing && translated && translated.title && translated.title !== article.title && (
                <p className="reader-title-translation" lang={translationPrefs.targetLanguage}>
                  {translated.title}
                </p>
              )}
              {/* 预留一行高度，正文来源确定后填入，避免标题区抖动 */}
              <p className="mt-3 h-[13px] font-mono text-[10px] leading-[13px] tracking-[0.12em] text-paper-faint">
                {sourceHint}
              </p>
              {(showTranslation || translationState === 'loading') && (
                <p className="mt-2 font-mono text-[9.5px] tracking-[0.1em] text-cinnabar-soft">
                  {translationState === 'loading'
                    ? `${translationProviderLabel(translationPrefs.provider)} 正在翻译正文…`
                    : `${translationProviderLabel(translationPrefs.provider)} · ${translationDisplayModeLabel(translationPrefs.displayMode)} · 已译为${translationLanguageLabel(translationPrefs.targetLanguage)}`}
                </p>
              )}
              {showTranslation && translated?.usedFallback && translationState === 'idle' && (
                <p className="mt-2 font-mono text-[9.5px] tracking-[0.08em] text-paper-faint">
                  未可靠识别原文语言，已按英语翻译
                </p>
              )}
              {translationError && (
                <div role="alert" className="mt-3 rounded-xl border border-cinnabar/35 bg-cinnabar/10 px-3.5 py-3 text-[11.5px] leading-relaxed text-cinnabar-soft">
                  {translationError}
                </div>
              )}
            </div>

            {article.image && article.contentType !== 'video' && (
              <div className="mt-5">
                <InkImage
                  src={article.image}
                  eager
                  collapseOnError
                  className="h-[200px] w-full md:h-[280px] lg:h-[320px]"
                  onOpen={(src) => setLightbox({ src, alt: article.title })}
                />
              </div>
            )}

            {article.contentType === 'video' && article.videoUrl && loadState === 'ready' && (
              <div data-reader-block className="page-x mt-5">
                <InkVideoPlayer
                  src={article.videoUrl}
                  poster={article.image}
                  title={article.title}
                />
              </div>
            )}

            <div className="page-x pt-6 pb-[max(env(safe-area-inset-bottom),40px)]">
              {loadState === 'loading' && <ReaderSkeleton />}

              {loadState === 'error' && (
                <div className="rounded-2xl border border-haze bg-ink-raised/80 px-5 py-6">
                  <p className="font-display text-[20px] text-paper">正文暂时未能展开</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-paper-muted">
                    {error || '网络或站点限制导致抽取失败。可重试，或在浏览器打开原文。'}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setRetryToken((value) => value + 1)}
                      className="inline-flex items-center gap-2 rounded-full border border-cinnabar/50 bg-cinnabar/15 px-4 py-2.5 text-[13px] text-paper"
                    >
                      <RefreshCw size={14} strokeWidth={1.7} className="text-cinnabar-soft" />
                      重新抽取正文
                    </button>
                    {(resolvedOriginUrl || article.originUrl) && (
                      <button
                        type="button"
                        onClick={() => void openOriginal()}
                        className="inline-flex items-center gap-2 rounded-full border border-haze px-4 py-2.5 text-[13px] text-paper-muted"
                      >
                        <Globe size={14} strokeWidth={1.7} />
                        浏览器打开原文
                      </button>
                    )}
                  </div>
                </div>
              )}

              {loadState === 'ready' && (
                <>
                  <div
                    ref={proseRef}
                    data-reader-block
                    data-article-lang={isCjkArticle ? 'zh' : 'en'}
                    className={`reader-prose ${
                      translationState === 'loading'
                        ? 'translation-pending'
                        : translationState === 'error'
                          ? 'translation-failed'
                          : ''
                    }`}
                    dangerouslySetInnerHTML={{ __html: displayedHtml }}
                  />
                  <InlineArticleVideos
                    rootRef={proseRef}
                    html={displayedHtml}
                    enabled={loadState === 'ready'}
                    fallbackTitle={displayedTitle}
                  />
                </>
              )}

              {loadState === 'ready' && (
                <div data-reader-block className="mt-8">
                  <div className="h-px w-full bg-haze" />
                  <p className="mt-4 font-mono text-[10px] leading-relaxed text-paper-faint">
                    来源 {article.sourceName}
                    <br />
                    {resolvedOriginUrl || article.originUrl || '原文地址缺失'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
          overlayCloserRef={overlayCloserRef}
        />
      )}
    </div>
  )
}

const SKELETON_LINES = [92, 100, 88, 96, 74, 100, 90, 66]

function ReaderSkeleton() {
  return (
    <div aria-hidden>
      <div className="flex items-center gap-2 pb-6 font-mono text-[10px] tracking-[0.2em] text-paper-faint">
        <span
          className="block h-1.5 w-1.5 rounded-full bg-cinnabar"
          style={{ animation: 'ink-pulse 1.4s var(--ease-ink) infinite' }}
        />
        正在展开正文
      </div>

      <div className="space-y-3.5">
        {SKELETON_LINES.map((width, index) => (
          <div
            key={index}
            className="ink-shimmer h-3 rounded-full"
            style={{ width: `${width}%`, animationDelay: `${index * 80}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
