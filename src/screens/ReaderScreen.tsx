import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Browser } from '@capacitor/browser'
import { ArrowLeft, BookmarkCheck, BookmarkPlus, Globe, Languages, LoaderCircle, MessageSquare, RefreshCw } from 'lucide-react'

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
import { fetchCommentCount, supportsComments } from '../features/comments/service'
import { CommentsDrawer } from '../features/comments/components/CommentsDrawer'

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
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState<number | undefined>()
  const [translated, setTranslated] = useState<TranslatedArticleContent | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [translationState, setTranslationState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [translationError, setTranslationError] = useState('')
  const translationAbortRef = useRef<AbortController | null>(null)
  const translationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPartialRef = useRef<TranslatedArticleContent | null>(null)
  const partialFrameRef = useRef(0)
  const canComment = useMemo(
    () => supportsComments({ ...article, originUrl: resolvedOriginUrl || article.originUrl }),
    [article, resolvedOriginUrl],
  )

  useEffect(() => {
    if (!canComment) return
    const controller = new AbortController()
    void fetchCommentCount(
      { ...article, originUrl: resolvedOriginUrl || article.originUrl },
      controller.signal,
    ).then((count) => {
      if (typeof count === 'number') {
        setCommentCount(count)
      }
    })
    return () => controller.abort()
  }, [article, resolvedOriginUrl, canComment])

  useEffect(() => {
    if (!overlayCloserRef) return
    if (commentsOpen) {
      const prev = overlayCloserRef.current
      overlayCloserRef.current = () => {
        setCommentsOpen(false)
        return true
      }
      return () => {
        overlayCloserRef.current = prev
      }
    }
  }, [commentsOpen, overlayCloserRef])

  const [pillVisible, setPillVisible] = useState(true)
  const lastScrollTopRef = useRef(0)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleScroll = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const currentScrollTop = el.scrollTop
    const delta = currentScrollTop - lastScrollTopRef.current

    if (currentScrollTop < 50 || delta < -8) {
      setPillVisible(true)
    } else if (delta > 15 && currentScrollTop > 80) {
      setPillVisible(false)
    }
    lastScrollTopRef.current = currentScrollTop

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      setPillVisible(true)
    }, 450)
  }, [])

  // 屏幕右侧边缘向左滑动手势拉出跟贴
  useEffect(() => {
    const element = shellRef.current
    if (!element || !canComment || commentsOpen || lightbox) return

    let startX = 0
    let startY = 0
    let isTracking = false

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const touch = e.touches[0]
      if (window.innerWidth - touch.clientX <= 38) {
        startX = touch.clientX
        startY = touch.clientY
        isTracking = true
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!isTracking || e.touches.length !== 1) return
      const touch = e.touches[0]
      const deltaX = touch.clientX - startX
      const deltaY = touch.clientY - startY

      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5 && Math.abs(deltaY) > 15) {
        isTracking = false
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!isTracking) return
      isTracking = false
      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - startX
      const deltaY = touch.clientY - startY

      if (deltaX <= -36 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
        setCommentsOpen(true)
      }
    }

    element.addEventListener('touchstart', onTouchStart, { passive: true })
    element.addEventListener('touchmove', onTouchMove, { passive: true })
    element.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('touchend', onTouchEnd)
    }
  }, [canComment, commentsOpen, lightbox])

  useEdgeSwipeBack({
    containerRef: shellRef,
    onBack: onClose,
    disabled: Boolean(lightbox || commentsOpen),
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

  const commentsArticle = useMemo(
    () => ({
      id: article.id,
      title: displayedTitle || article.title,
      sourceId: article.sourceId,
      originUrl: resolvedOriginUrl || article.originUrl,
      neteaseDocId: article.neteaseDocId,
    }),
    [
      article.id,
      article.title,
      article.sourceId,
      article.originUrl,
      article.neteaseDocId,
      displayedTitle,
      resolvedOriginUrl,
    ],
  )

  const isCjkArticle = useMemo(() => {
    const textSample = `${displayedTitle} ${displayedHtml.slice(0, 1500)}`
    return /[\p{Script=Han}\u3040-\u30ff\uac00-\ud7af]/u.test(textSample)
  }, [displayedTitle, displayedHtml])

  useEffect(() => {
    // 翻译过程中正文 HTML 高频替换，跳过表格包裹避免重复 DOM 操作
    if (translationState === 'loading') return
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
  }, [displayedHtml, loadState, translationState])

  useProgressiveImages(
    proseRef,
    displayedHtml,
    loadState === 'ready' && translationState !== 'loading',
  )
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
      const flushPartial = () => {
        partialFrameRef.current = 0
        const pending = pendingPartialRef.current
        if (!pending || controller.signal.aborted) return
        setTranslated(pending)
      }
      const result = await createTranslationService(translationPrefs).translateArticle(
        article.title,
        html,
        translationPrefs,
        {
          signal: controller.signal,
          onPartial: (partial) => {
            if (controller.signal.aborted) return
            // 每帧最多落地一次整篇 HTML，避免 batch 回调把主线程打满
            pendingPartialRef.current = partial
            if (partialFrameRef.current) return
            partialFrameRef.current = window.requestAnimationFrame(flushPartial)
          },
        },
      )
      if (controller.signal.aborted) return
      if (partialFrameRef.current) {
        window.cancelAnimationFrame(partialFrameRef.current)
        partialFrameRef.current = 0
      }
      pendingPartialRef.current = null
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
      if (partialFrameRef.current) {
        window.cancelAnimationFrame(partialFrameRef.current)
        partialFrameRef.current = 0
      }
      pendingPartialRef.current = null
    }
  }

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col pt-[var(--sat)]"
      style={{
        animation: reduced ? undefined : 'reader-in 360ms var(--ease-ink) both',
      }}
    >
      <style>{`@keyframes reader-in { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: none } }`}</style>

      <div
        ref={shellRef}
        className="reader-swipe-surface flex min-h-0 flex-1 flex-col bg-ink"
      >
        <header className="shrink-0 pt-1 pb-1 border-b border-haze/30 bg-ink/90 backdrop-blur-md sticky top-0 z-20">
          <div className="page-x lg:px-8 max-w-4xl mx-auto w-full flex items-center justify-between gap-2">
            <button type="button" onClick={onClose} aria-label="返回列表" className="flex h-9 w-9 shrink-0 items-center justify-center hover:text-paper">
              <ArrowLeft size={18} strokeWidth={1.6} className="text-paper" />
            </button>
            <span className="min-w-0 flex-1 truncate text-center font-mono text-[10px] lg:text-[11px] tracking-[0.18em] text-paper-faint">
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
              {canComment && (
                <button
                  type="button"
                  onClick={() => setCommentsOpen(true)}
                  aria-label="查看跟贴与评论"
                  className="flex h-9 items-center gap-1 px-1 text-paper-muted hover:text-cinnabar transition-colors duration-200"
                >
                  <MessageSquare size={14} strokeWidth={1.7} className={commentsOpen ? 'text-cinnabar' : 'text-paper-muted'} />
                  <span className={`font-mono text-[10px] tracking-[0.08em] ${commentsOpen ? 'text-cinnabar-soft' : 'text-paper-muted'}`}>
                    {commentCount != null && commentCount > 0 ? commentCount : '跟贴'}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void openOriginal()}
                disabled={!resolvedOriginUrl && !article.originUrl}
                aria-label="在浏览器核对原文"
                className="flex h-9 w-9 shrink-0 items-center justify-center disabled:opacity-40 hover:text-paper"
              >
                <Globe size={14} strokeWidth={1.7} className="text-paper-muted" />
              </button>
            </div>
          </div>
        </header>

        <div
          ref={rootRef}
          onScroll={handleScroll}
          className="scroll-hidden min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-3xl lg:max-w-4xl">
            {/* 标题在正文抽取期间就已就位，不随加载状态闪烁 */}
            <div className="page-x lg:px-8 pt-4">
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
              <div className="mt-5 page-x lg:px-8">
                <InkImage
                  src={article.image}
                  eager
                  collapseOnError
                  className="h-[220px] w-full sm:h-[300px] md:h-[380px] lg:h-[420px] rounded-xl overflow-hidden"
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

            <div className="page-x pt-6 pb-[max(var(--sab),40px)]">
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
                    enabled={loadState === 'ready' && translationState !== 'loading'}
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

              {loadState === 'ready' && canComment && (
                <div data-reader-block className="mt-8">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setCommentsOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setCommentsOpen(true)
                    }}
                    className="group flex w-full cursor-pointer items-center justify-between rounded-2xl border border-haze bg-ink-raised/80 p-4.5 transition hover:border-cinnabar/50 hover:bg-ink-raised"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cinnabar/15 text-cinnabar group-hover:bg-cinnabar group-hover:text-white transition">
                        <MessageSquare size={20} />
                      </div>
                      <div className="min-w-0 text-left">
                        <h3 className="text-[14px] font-semibold text-paper group-hover:text-cinnabar transition">
                          网友精彩跟贴与讨论
                        </h3>
                        <p className="mt-0.5 font-mono text-[11px] text-paper-faint truncate">
                          {commentCount != null && commentCount > 0
                            ? `共 ${commentCount} 条跟贴互动 · 点击展开热评与盖楼`
                            : '点击展开网友观点与最新讨论'}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-haze bg-ink px-3 py-1.5 font-mono text-[11px] font-medium text-paper-muted group-hover:border-cinnabar/40 group-hover:text-cinnabar transition">
                      展开讨论 →
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 底部右下角悬浮跟贴胶囊（随时一触即达） */}
      {canComment && !commentsOpen && (
        <div
          className={`fixed bottom-[max(var(--sab),20px)] right-4 z-40 transition-all duration-300 pointer-events-auto ${
            pillVisible
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-6 scale-90 pointer-events-none'
          }`}
        >
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            aria-label="查看跟贴讨论"
            className="group flex items-center gap-2 rounded-full border border-haze bg-ink/95 px-3.5 py-2 text-paper shadow-xl shadow-black/35 backdrop-blur-md transition hover:scale-105 hover:border-cinnabar/60 active:scale-95"
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cinnabar/15 text-cinnabar group-hover:bg-cinnabar group-hover:text-white transition">
              <MessageSquare size={13} strokeWidth={2} />
            </div>
            <span className="font-mono text-[12px] font-medium tracking-[0.03em] text-paper">
              {commentCount != null && commentCount > 0 ? (
                <>
                  <span className="text-cinnabar font-semibold">{commentCount}</span> 跟贴
                </>
              ) : (
                '看跟贴'
              )}
            </span>
          </button>
        </div>
      )}

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
          overlayCloserRef={overlayCloserRef}
        />
      )}

      <CommentsDrawer
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        article={commentsArticle}
      />
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
