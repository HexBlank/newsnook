import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type Hls from 'hls.js'
import {
  AlertCircle,
  ChevronsLeft,
  ChevronsRight,
  LoaderCircle,
  ListVideo,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCcw,
  RotateCw,
  Scan,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react'

import {
  browserMediaProxyUrl,
  createHotlinkHlsLoader,
  needsMediaHotlinkBypass,
} from '../lib/mediaFetch'
import { getVideoStatusMessage } from '../lib/videoStatus'
import {
  createBrightnessControl,
  createVolumeControl,
  lockVideoScreenOrientation,
  unlockVideoScreenOrientation,
  type LevelControl,
  type VideoScreenOrientation,
} from '../lib/deviceMediaControls'
import {
  clampLevel,
  clampSeekTarget,
  clampVideoPan,
  isThumbZone,
  levelOffset,
  normalizeVideoRotation,
  pinchScale,
  resolveGesture,
  seekOffsetSeconds,
  videoPointForRotation,
  videoSurfaceForRotation,
  type VideoGesture,
  type VideoRotation,
} from '../lib/videoGestures'
import { Capacitor } from '@capacitor/core'
import { clearNativeMediaPlayback, prepareNativeMediaPlayback } from '../features/mediaSniffer/native'
import type { MediaResourceDescriptor } from '../features/mediaSniffer/types'

interface Props {
  src: string
  poster?: string
  title?: string
  format?: 'progressive' | 'hls' | 'dash'
  sourcePage?: string
  requestHeaders?: Record<string, string>
  extraUrls?: string[]
  resources?: MediaResourceDescriptor[]
  deferLoad?: boolean
  onUnlocked?: () => void
  onRefreshSource?: () => void
  onPlaybackError?: () => void
}

function playableFormatForUrl(url: string, format?: Props['format']): NonNullable<Props['format']> {
  if (format) return format
  if (/\.m3u8(?:$|[?#])/i.test(url)) return 'hls'
  if (/\.mpd(?:$|[?#])/i.test(url)) return 'dash'
  return 'progressive'
}

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const
/** 长按临时倍速；松手回落到用户选定倍速 */
const BOOST_RATE = 2.5
const LONG_PRESS_MS = 380
const DOUBLE_TAP_MS = 320
const TAP_SLOP_PX = 12
const RATE_EPSILON = 0.01
/** 手指离开后 HUD 再停留一瞬，便于确认调到了哪一档。 */
const HUD_LINGER_MS = 460

type GestureHud =
  | { kind: 'seek'; target: number; offset: number }
  | { kind: 'volume' | 'brightness'; value: number }
  | { kind: 'zoom'; scale: number; rotation: VideoRotation }

interface VideoViewState {
  scale: number
  x: number
  y: number
  rotation: VideoRotation
}

interface PinchState {
  distance: number
  midpoint: { x: number; y: number }
  view: VideoViewState
}

const DEFAULT_VIDEO_VIEW: VideoViewState = {
  scale: 1,
  x: 0,
  y: 0,
  rotation: 0,
}

interface GestureState {
  /** 视口坐标，用于计算位移 */
  x: number
  y: number
  /** 播放器内坐标，用于判定左右半屏与拇指区 */
  localX: number
  at: number
  moved: boolean
  boosted: boolean
  /** 起点是否落在全屏拇指手势区 */
  thumb: boolean
  axis: VideoGesture
  surface: { width: number; height: number }
  fromTime: number
  fromLevel: number
  fromView: VideoViewState
}

const IDLE_GESTURE: GestureState = {
  x: 0,
  y: 0,
  localX: 0,
  at: 0,
  moved: false,
  boosted: false,
  thumb: false,
  axis: 'none',
  surface: { width: 0, height: 0 },
  fromTime: 0,
  fromLevel: 1,
  fromView: DEFAULT_VIDEO_VIEW,
}

function hasPlaybackRate(video: HTMLVideoElement, expected: number): boolean {
  return Math.abs(video.playbackRate - expected) < RATE_EPSILON
}

function applyPlaybackRate(video: HTMLVideoElement, next: number): boolean {
  try {
    video.playbackRate = next
  } catch {
    return false
  }
  return hasPlaybackRate(video, next)
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 墨砚阅读器视频：单一自定义控件（播放 / 进度 / 倍速 / 静音 / 全屏）。
 * 不使用原生 controls，避免与自定义 UI 叠出多个播放键。
 *
 * 手势分两套：
 * - 内嵌：单击切换控件、双击左右各 ±10s、长按临时 2.5 倍速。
 * - 全屏：下半屏（拇指区）横滑调进度、左下竖滑调亮度、右下竖滑调音量，
 *   双击专职播放 / 暂停；上半屏与内嵌一致。
 * - 通用：双指缩放，放大后单指平移；顶部按钮旋转 / 还原画面。
 */
export function InkVideoPlayer({ src, poster, title, format, sourcePage, requestHeaders, extraUrls, resources, deferLoad, onUnlocked, onRefreshSource, onPlaybackError }: Props) {
  const [allowed, setAllowed] = useState(!deferLoad)
  const [selectedResource, setSelectedResource] = useState<MediaResourceDescriptor | null>(null)
  const resourceOptions = useMemo<MediaResourceDescriptor[]>(() => {
    if (resources?.length) return resources
    return [{
      id: `direct:${src}`,
      type: playableFormatForUrl(src, format),
      url: src,
      pageUrl: sourcePage || '',
      score: 0,
      videoTracks: [],
      audioTracks: [],
      subtitles: [],
      drm: false,
      drmKeySystems: [],
      requestHeaders,
      relatedUrls: extraUrls,
    }]
  }, [extraUrls, format, requestHeaders, resources, sourcePage, src])

  useEffect(() => {
    setSelectedResource(null)
  }, [src, resources])

  useEffect(() => {
    if (!deferLoad) setAllowed(true)
  }, [deferLoad])

  if (!allowed) {
    return (
      <div
        data-no-page-tap=""
        data-reader-block
        role="button"
        tabIndex={0}
        className="reader-deferred-host aspect-video"
        onClick={() => {
          setAllowed(true)
          onUnlocked?.()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setAllowed(true)
            onUnlocked?.()
          }
        }}
      >
        <span className="reader-deferred-label">点击加载视频</span>
      </div>
    )
  }

  const active = selectedResource
  const activeExtraUrls = Array.from(new Set([
    ...(active?.relatedUrls ?? []),
    ...(extraUrls ?? []),
  ]))
  return <InkVideoPlayerReady
    key={`${active?.id || active?.type || format || 'media'}:${active?.url || src}`}
    src={active?.url || src}
    poster={poster}
    title={title}
    format={active?.type || format}
    sourcePage={active?.pageUrl || sourcePage}
    requestHeaders={active?.requestHeaders || requestHeaders}
    extraUrls={activeExtraUrls.length ? activeExtraUrls : undefined}
    resources={resourceOptions}
    onSelectResource={setSelectedResource}
    onRefreshSource={onRefreshSource}
    onPlaybackError={onPlaybackError}
  />
}

function InkVideoPlayerReady({ src, poster, title, format, sourcePage, requestHeaders, extraUrls, resources, onSelectResource, onRefreshSource, onPlaybackError }: Props & { onSelectResource?: (resource: MediaResourceDescriptor) => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const dashRef = useRef<{ reset: () => void } | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const scrubbingRef = useRef(false)
  const rateRef = useRef(1)
  const tapTimerRef = useRef<number | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const gestureRef = useRef<GestureState>({ ...IDLE_GESTURE })
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<PinchState | null>(null)
  const multiTouchRef = useRef(false)
  const videoViewRef = useRef<VideoViewState>(DEFAULT_VIDEO_VIEW)
  const screenOrientationLockedRef = useRef(false)
  const lastTapRef = useRef(0)
  const showChromeRef = useRef(true)
  const hudTimerRef = useRef<number | null>(null)
  /** 音量 / 亮度手势进行中；松手后迟到的异步写入不能把淡出定时器冲掉。 */
  const levelingRef = useRef(false)
  const levelsRef = useRef({ volume: 1, brightness: 1 })
  const levelWriteRef = useRef<{
    busy: boolean
    pending: { kind: 'volume' | 'brightness'; value: number } | null
  }>({ busy: false, pending: null })

  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [seeking, setSeeking] = useState(false)
  const [rate, setRate] = useState(1)
  const [rateMenuOpen, setRateMenuOpen] = useState(false)
  const [resourceMenuOpen, setResourceMenuOpen] = useState(false)
  const [boosting, setBoosting] = useState(false)
  const [gestureHud, setGestureHud] = useState<GestureHud | null>(null)
  const [videoView, setVideoView] = useState<VideoViewState>(DEFAULT_VIDEO_VIEW)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [mediaSize, setMediaSize] = useState({ width: 0, height: 0 })
  const [viewInteracting, setViewInteracting] = useState(false)
  /** 无原生亮度能力时的兜底压暗层 */
  const [scrim, setScrim] = useState(0)
  const immersive = fullscreen || fallbackFullscreen
  const resourceOptions = resources?.length ? resources : []

  const brightnessControl = useMemo(() => createBrightnessControl(setScrim), [])
  const volumeControl = useMemo(
    () => createVolumeControl(() => videoRef.current),
    [],
  )
  const levelControl = useCallback(
    (kind: 'volume' | 'brightness'): LevelControl =>
      kind === 'volume' ? volumeControl : brightnessControl,
    [brightnessControl, volumeControl],
  )

  const setScrubbingState = (value: boolean) => {
    scrubbingRef.current = value
    setScrubbing(value)
  }

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHideControls = useCallback(() => {
    clearHideTimer()
    const video = videoRef.current
    if (!video || video.paused || scrubbing) return
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false)
    }, 2600)
  }, [clearHideTimer, scrubbing])

  const revealControls = useCallback(() => {
    setControlsVisible(true)
    scheduleHideControls()
  }, [scheduleHideControls])

  const syncBoostIndicator = useCallback((video: HTMLVideoElement) => {
    setBoosting(
      gestureRef.current.boosted && hasPlaybackRate(video, BOOST_RATE),
    )
  }, [])

  const updateVideoView = useCallback((next: VideoViewState) => {
    videoViewRef.current = next
    setVideoView(next)
  }, [])

  const lockPlayerScreenOrientation = useCallback(
    async (orientation: VideoScreenOrientation): Promise<boolean> => {
      const locked = await lockVideoScreenOrientation(orientation)
      if (locked) screenOrientationLockedRef.current = true
      return locked
    },
    [],
  )

  const releasePlayerScreenOrientation = useCallback(async () => {
    if (!screenOrientationLockedRef.current) return
    screenOrientationLockedRef.current = false
    await unlockVideoScreenOrientation()
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const syncViewport = () => {
      const rect = stage.getBoundingClientRect()
      setViewport({ width: rect.width, height: rect.height })
    }
    syncViewport()
    const observer = new ResizeObserver(syncViewport)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    updateVideoView(DEFAULT_VIDEO_VIEW)
    setMediaSize({ width: 0, height: 0 })
  }, [src, updateVideoView])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    const url = src
    const isHls = format === 'hls' || /\.m3u8(\?|$)/i.test(url)
    const isDash = format === 'dash' || /\.mpd(\?|$)/i.test(url)
    let cancelled = false
    let progressiveBridgeAttempted = false
    let directRetryAttempted = false
    const failPlayback = (message: string) => {
      if (cancelled) return
      setFatal(message)
      onPlaybackError?.()
    }

    setReady(false)
    setFatal(null)
    setHint(null)
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    setBuffered(0)
    setControlsVisible(true)
    setWaiting(true)
    setSeeking(false)
    setRateMenuOpen(false)

    const markReady = () => {
      if (cancelled) return
      // canplay can fire again after HLS buffering. Keep a held boost instead of
      // silently restoring the user's normal rate while the boost badge remains.
      video.defaultPlaybackRate = rateRef.current
      applyPlaybackRate(
        video,
        gestureRef.current.boosted ? BOOST_RATE : rateRef.current,
      )
      syncBoostIndicator(video)
      setWaiting(false)
      setReady(true)
    }
    const onFatalMedia = () => {
      if (cancelled) return
      if (
        Capacitor.isNativePlatform()
        && !isHls
        && !isDash
        && progressiveBridgeAttempted
        && !directRetryAttempted
      ) {
        directRetryAttempted = true
        setWaiting(true)
        void clearNativeMediaPlayback({
          url,
          sourcePage,
          format: 'progressive',
          extraUrls,
        }).then(() => {
          if (cancelled) return
          setFatal(null)
          video.src = url
          video.load()
        }).catch(() => {
          if (!cancelled) failPlayback('瑙嗛婧愭殏鏃舵棤娉曟挱鏀?')
        })
        return
      }
      if (
        Capacitor.isNativePlatform()
        && !isHls
        && !isDash
        && !progressiveBridgeAttempted
      ) {
        progressiveBridgeAttempted = true
        setWaiting(true)
        void prepareNativeMediaPlayback({
          url,
          sourcePage,
          format: 'progressive',
          headers: requestHeaders,
          extraUrls,
          forceBridge: true,
        }).then(() => {
          if (cancelled) return
          setFatal(null)
          video.src = url
          video.load()
        }).catch(() => {
          if (!cancelled) failPlayback('视频源暂时无法播放')
        })
        return
      }
      failPlayback('视频源暂时无法播放')
    }
    const onPlay = () => {
      setPlaying(true)
      setHint(null)
    }
    const onPause = () => {
      setPlaying(false)
      setControlsVisible(true)
      clearHideTimer()
    }
    const onTime = () => {
      if (!scrubbingRef.current) setCurrent(video.currentTime)
    }
    const onMeta = () => {
      if (Number.isFinite(video.duration)) setDuration(video.duration)
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setMediaSize({ width: video.videoWidth, height: video.videoHeight })
      }
      markReady()
    }
    const onDuration = () => {
      if (Number.isFinite(video.duration)) setDuration(video.duration)
    }
    const onProgress = () => {
      if (!video.buffered.length) return
      try {
        setBuffered(video.buffered.end(video.buffered.length - 1))
      } catch {
        /* ignore */
      }
    }
    const onEnded = () => {
      setPlaying(false)
      setControlsVisible(true)
      clearHideTimer()
      setWaiting(false)
      setSeeking(false)
    }
    const onRateChange = () => syncBoostIndicator(video)
    // 音量手势可能解除静音，静音按钮的状态要跟着走
    const onVolumeChange = () => setMuted(video.muted)
    const onLoadStart = () => {
      setWaiting(true)
      setSeeking(false)
    }
    const onWaiting = () => setWaiting(true)
    const onSeeking = () => setSeeking(true)
    const onSeeked = () => {
      setSeeking(false)
      setWaiting(false)
    }
    const onPlaying = () => {
      setWaiting(false)
      setSeeking(false)
    }

    video.addEventListener('loadstart', onLoadStart)
    video.addEventListener('canplay', markReady)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onWaiting)
    video.addEventListener('seeking', onSeeking)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('volumechange', onVolumeChange)
    video.addEventListener('loadeddata', markReady)
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('durationchange', onDuration)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('progress', onProgress)
    video.addEventListener('error', onFatalMedia)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('ratechange', onRateChange)

    void (async () => {
      progressiveBridgeAttempted = await prepareNativeMediaPlayback({
        url,
        sourcePage,
        format: isDash ? 'dash' : isHls ? 'hls' : 'progressive',
        headers: requestHeaders,
        extraUrls,
        forceBridge: !isHls && !isDash && needsMediaHotlinkBypass(url),
      })
      if (cancelled) return
      const requestContext = sourcePage || requestHeaders
        ? { sourcePage, headers: requestHeaders }
        : undefined
      const bypass = needsMediaHotlinkBypass(url) || Boolean(isHls && sourcePage && Capacitor.isNativePlatform())
      // 防盗链 CDN：即使系统原生支持 HLS，也走 hls.js + 自定义 loader，避免 WebView 带 localhost Origin 被 403
      const useNativeHls = !bypass && Boolean(video.canPlayType('application/vnd.apple.mpegurl'))
      const HlsClass =
        isHls && !useNativeHls ? (await import('hls.js')).default : null
      if (cancelled) return

      if (isDash) {
        const module = await import('dashjs')
        if (cancelled) return
        const dash = module.MediaPlayer().create()
        dashRef.current = dash
        dash.initialize(video, url, false)
      } else if (isHls) {
        if (useNativeHls) {
          video.src = url
        } else if (HlsClass?.isSupported()) {
          const hls = new HlsClass({
            enableWorker: true,
            lowLatencyMode: false,
            ...(bypass ? { loader: createHotlinkHlsLoader(requestContext) } : {}),
          })
          hlsRef.current = hls
          hls.loadSource(url)
          hls.attachMedia(video)
          hls.on(HlsClass.Events.MANIFEST_PARSED, markReady)
          hls.on(HlsClass.Events.ERROR, (_event, data) => {
            if (!data.fatal || cancelled) return
            if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad()
              return
            }
            if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError()
              return
            }
            failPlayback('视频流加载失败')
          })
        } else {
          failPlayback('当前环境不支持 HLS 播放')
        }
      } else if (bypass) {
        if (Capacitor.isNativePlatform()) {
          // Main WebView 的流式请求桥接会补齐 Referer/Cookie/代理，避免整段视频进内存。
          video.src = url
        } else {
          video.src = browserMediaProxyUrl(url)
        }
      } else {
        video.src = url
      }
    })().catch(() => {
      failPlayback('视频流加载失败')
    })

    return () => {
      cancelled = true
      clearHideTimer()
      video.removeEventListener('loadstart', onLoadStart)
      video.removeEventListener('canplay', markReady)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onWaiting)
      video.removeEventListener('seeking', onSeeking)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('loadeddata', markReady)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('durationchange', onDuration)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('progress', onProgress)
      video.removeEventListener('error', onFatalMedia)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('ratechange', onRateChange)
      video.removeEventListener('volumechange', onVolumeChange)
      hlsRef.current?.destroy()
      hlsRef.current = null
      dashRef.current?.reset()
      dashRef.current = null
      video.removeAttribute('src')
      video.load()
    }
  }, [clearHideTimer, extraUrls, format, onPlaybackError, requestHeaders, sourcePage, src, syncBoostIndicator])

  useEffect(() => {
    const onFs = () => {
      const node = rootRef.current
      const active = Boolean(node && document.fullscreenElement === node)
      setFullscreen(active)
      if (active) setFallbackFullscreen(false)
      else {
        updateVideoView(DEFAULT_VIDEO_VIEW)
        void releasePlayerScreenOrientation()
      }
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [releasePlayerScreenOrientation, updateVideoView])

  useEffect(() => {
    const currentView = videoViewRef.current
    const pan = clampVideoPan(
      currentView.x,
      currentView.y,
      videoSurfaceForRotation(viewport, currentView.rotation),
      mediaSize,
      currentView.scale,
    )
    if (pan.x !== currentView.x || pan.y !== currentView.y) {
      updateVideoView({ ...currentView, ...pan })
    }
  }, [mediaSize, updateVideoView, viewport])

  /** 进入全屏时对齐当前系统档位，退出时把亮度还给系统。 */
  useEffect(() => {
    if (!immersive) {
      brightnessControl.release()
      volumeControl.release()
      return
    }

    let cancelled = false
    void (async () => {
      const [volume, brightness] = await Promise.all([
        volumeControl.read(),
        brightnessControl.read(),
      ])
      if (cancelled) return
      levelsRef.current = { volume, brightness }
    })()

    return () => {
      cancelled = true
    }
  }, [brightnessControl, immersive, volumeControl])

  useEffect(() => {
    if (playing && !scrubbing) scheduleHideControls()
    else {
      clearHideTimer()
      setControlsVisible(true)
    }
  }, [playing, scrubbing, scheduleHideControls, clearHideTimer])

  useEffect(
    () => () => {
      if (tapTimerRef.current != null) window.clearTimeout(tapTimerRef.current)
      if (longPressTimerRef.current != null) window.clearTimeout(longPressTimerRef.current)
      if (hudTimerRef.current != null) window.clearTimeout(hudTimerRef.current)
      activePointersRef.current.clear()
      pinchRef.current = null
      // 卸载时若仍在全屏，窗口亮度必须归还系统，否则整个应用会一直停在调暗状态
      brightnessControl.release()
      volumeControl.release()
      void releasePlayerScreenOrientation()
    },
    [brightnessControl, releasePlayerScreenOrientation, volumeControl],
  )

  const playWithFallback = async () => {
    const video = videoRef.current
    if (!video) return

    setHint(null)
    try {
      await video.play()
      revealControls()
      return
    } catch {
      /* 部分 WebView 要求先静音 */
    }

    try {
      const wasMuted = video.muted
      video.muted = true
      setMuted(true)
      await video.play()
      if (!wasMuted) {
        video.muted = false
        setMuted(false)
      }
      revealControls()
    } catch {
      setHint('播放被系统拦截，请再点一次')
    }
  }

  const togglePlay = async () => {
    const video = videoRef.current
    if (!video || fatal) return
    if (!video.paused) {
      video.pause()
      return
    }
    await playWithFallback()
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
    revealControls()
  }

  const onSeekInput = (value: number) => {
    if (!duration) return
    setScrubbingState(true)
    setCurrent(value)
  }

  const onSeekCommit = (value: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = value
    setCurrent(value)
    setScrubbingState(false)
    revealControls()
  }

  const toggleFullscreen = async () => {
    const root = rootRef.current
    if (!root) return
    const exiting = fallbackFullscreen || document.fullscreenElement === root
    try {
      if (fallbackFullscreen) {
        setFallbackFullscreen(false)
        updateVideoView(DEFAULT_VIDEO_VIEW)
      } else if (document.fullscreenElement === root) {
        await document.exitFullscreen()
      } else {
        await root.requestFullscreen()
      }
    } catch {
      if (!exiting) setFallbackFullscreen(true)
    }

    if (exiting) {
      await releasePlayerScreenOrientation()
      updateVideoView(DEFAULT_VIDEO_VIEW)
    } else if (mediaSize.width > mediaSize.height) {
      const locked = await lockPlayerScreenOrientation('landscape')
      if (locked) updateVideoView(DEFAULT_VIDEO_VIEW)
    }
    revealControls()
  }

  const applyRate = (next: number) => {
    rateRef.current = next
    setRate(next)
    const video = videoRef.current
    if (video) {
      video.defaultPlaybackRate = next
      if (!applyPlaybackRate(video, next)) {
        setHint('当前视频暂不支持此播放速度')
      }
    }
    setRateMenuOpen(false)
    revealControls()
  }

  const startBoost = () => {
    const video = videoRef.current
    if (!video || video.paused || fatal) return
    gestureRef.current.boosted = true
    if (!applyPlaybackRate(video, BOOST_RATE)) {
      gestureRef.current.boosted = false
      setBoosting(false)
      setHint(`当前视频暂不支持 ${BOOST_RATE}x 播放`)
      revealControls()
      return
    }
    setHint(null)
    syncBoostIndicator(video)
    setControlsVisible(false)
    clearHideTimer()
  }

  const endBoost = () => {
    if (!gestureRef.current.boosted) return
    gestureRef.current.boosted = false
    const video = videoRef.current
    if (video) applyPlaybackRate(video, rateRef.current)
    setBoosting(false)
    revealControls()
  }

  const clearGestureTimers = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const showHud = (hud: GestureHud) => {
    if (hudTimerRef.current != null) {
      window.clearTimeout(hudTimerRef.current)
      hudTimerRef.current = null
    }
    setGestureHud(hud)
  }

  const fadeHud = () => {
    if (hudTimerRef.current != null) window.clearTimeout(hudTimerRef.current)
    hudTimerRef.current = window.setTimeout(() => {
      hudTimerRef.current = null
      setGestureHud(null)
    }, HUD_LINGER_MS)
  }

  const showViewHud = (view: VideoViewState) => {
    showHud({ kind: 'zoom', scale: view.scale, rotation: view.rotation })
  }

  const resetVideoView = () => {
    updateVideoView(DEFAULT_VIDEO_VIEW)
    setViewInteracting(false)
    showViewHud(DEFAULT_VIDEO_VIEW)
    fadeHud()
    revealControls()
  }

  const rotateVideoView = async () => {
    const root = rootRef.current
    if (!root) return
    if (!immersive) {
      try {
        await root.requestFullscreen()
      } catch {
        setFallbackFullscreen(true)
      }
    }

    const targetOrientation: VideoScreenOrientation =
      viewport.width > viewport.height ? 'portrait' : 'landscape'
    if (await lockPlayerScreenOrientation(targetOrientation)) {
      updateVideoView(DEFAULT_VIDEO_VIEW)
      revealControls()
      return
    }

    const currentView = videoViewRef.current
    const rotation = normalizeVideoRotation(currentView.rotation + 90)
    const pan = clampVideoPan(
      currentView.x,
      currentView.y,
      videoSurfaceForRotation(viewport, rotation),
      mediaSize,
      currentView.scale,
    )
    const next = { ...currentView, ...pan, rotation }
    updateVideoView(next)
    showViewHud(next)
    fadeHud()
    revealControls()
  }

  const pointerPair = () => {
    const pointers = Array.from(activePointersRef.current.values())
    if (pointers.length < 2) return null
    const [first, second] = pointers
    return {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      midpoint: {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      },
    }
  }

  const pointerLocation = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const physicalSurface = { width: rect.width, height: rect.height }
    const point = videoPointForRotation(
      event.clientX - rect.left,
      event.clientY - rect.top,
      physicalSurface,
      videoViewRef.current.rotation,
    )
    return {
      point,
      surface: videoSurfaceForRotation(physicalSurface, videoViewRef.current.rotation),
    }
  }

  /**
   * 档位写入是异步的（原生桥或元素音量），滑动过程中只保留最后一个目标值，
   * 避免每个 pointermove 都排队一次调用。
   */
  const commitLevel = (kind: 'volume' | 'brightness', value: number) => {
    const queue = levelWriteRef.current
    queue.pending = { kind, value }
    if (queue.busy) return
    queue.busy = true
    void (async () => {
      while (queue.pending != null) {
        const next = queue.pending
        queue.pending = null
        const applied = await levelControl(next.kind).write(next.value)
        showHud({ kind: next.kind, value: applied })
      }
      queue.busy = false
      // 松手后最后一次异步写入会取消 fade 定时器，这里重新排程淡出
      if (!levelingRef.current) fadeHud()
    })()
  }

  /** 全屏下半屏才接管滑动；竖屏内嵌播放器保持原有的点按语义。 */
  const lockGesture = (gesture: GestureState, dx: number, dy: number) => {
    const axis = resolveGesture(dx, dy, gesture.localX, gesture.surface)
    if (axis === 'none') return
    gesture.axis = axis
    levelingRef.current = axis === 'volume' || axis === 'brightness'
    const video = videoRef.current
    gesture.fromTime = video ? video.currentTime : 0
    gesture.fromLevel =
      axis === 'volume'
        ? levelsRef.current.volume
        : axis === 'brightness'
          ? levelsRef.current.brightness
          : 0
    setControlsVisible(false)
    clearHideTimer()
    setRateMenuOpen(false)
  }

  const trackGesture = (gesture: GestureState, dx: number, dy: number) => {
    if (gesture.axis === 'seek') {
      const video = videoRef.current
      const total = video && Number.isFinite(video.duration) ? video.duration : 0
      const offset = seekOffsetSeconds(dx, gesture.surface.width, total)
      showHud({
        kind: 'seek',
        target: clampSeekTarget(gesture.fromTime, offset, total),
        offset,
      })
      return
    }

    const kind = gesture.axis === 'volume' ? 'volume' : 'brightness'
    const next = clampLevel(gesture.fromLevel + levelOffset(dy, gesture.surface.height))
    levelsRef.current[kind] = next
    commitLevel(kind, next)
  }

  /** 松手才真正跳转，滑动过程中只做预览，避免 HLS 反复起播。 */
  const finishGesture = (gesture: GestureState, dx: number) => {
    if (gesture.axis === 'seek') {
      const video = videoRef.current
      const total = video && Number.isFinite(video.duration) ? video.duration : 0
      if (video && total > 0) {
        const offset = seekOffsetSeconds(dx, gesture.surface.width, total)
        const target = clampSeekTarget(gesture.fromTime, offset, total)
        video.currentTime = target
        setCurrent(target)
      }
    }
    levelingRef.current = false
    fadeHud()
  }

  /**
   * 触摸落下时再对齐一次真实档位：音量可能刚被物理按键改过。
   * 读取是异步的，手势一旦锁定方向就以自己的连续值为准，不再回填。
   */
  const syncLevels = (gesture: GestureState) => {
    void (async () => {
      const [volume, brightness] = await Promise.all([
        volumeControl.read(),
        brightnessControl.read(),
      ])
      if (gestureRef.current !== gesture || gesture.axis !== 'none') return
      levelsRef.current = { volume, brightness }
    })()
  }

  const onGesturePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (fatal) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const { point, surface } = pointerLocation(event)
    activePointersRef.current.set(event.pointerId, point)
    if (activePointersRef.current.size >= 2) {
      const pair = pointerPair()
      if (!pair) return
      multiTouchRef.current = true
      clearGestureTimers()
      endBoost()
      gestureRef.current.moved = true
      gestureRef.current.axis = 'none'
      pinchRef.current = {
        ...pair,
        view: videoViewRef.current,
      }
      setViewInteracting(true)
      setControlsVisible(false)
      setRateMenuOpen(false)
      clearHideTimer()
      return
    }
    const gesture: GestureState = {
      ...IDLE_GESTURE,
      x: point.x,
      y: point.y,
      localX: point.x,
      at: Date.now(),
      thumb: immersive && isThumbZone(point.y, surface.height),
      surface,
      fromView: videoViewRef.current,
    }
    gestureRef.current = gesture
    clearGestureTimers()
    if (videoViewRef.current.scale === 1) {
      longPressTimerRef.current = window.setTimeout(startBoost, LONG_PRESS_MS)
    }
    if (gesture.thumb) syncLevels(gesture)
  }

  const onGesturePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const { point } = pointerLocation(event)
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, point)
    }
    if (multiTouchRef.current) {
      const pair = pointerPair()
      const pinch = pinchRef.current
      if (!pair || !pinch) return
      const scale = pinchScale(pinch.view.scale, pinch.distance, pair.distance)
      const pan = clampVideoPan(
        pinch.view.x + pair.midpoint.x - pinch.midpoint.x,
        pinch.view.y + pair.midpoint.y - pinch.midpoint.y,
        videoSurfaceForRotation(viewport, pinch.view.rotation),
        mediaSize,
        scale,
      )
      const next = { ...pinch.view, ...pan, scale }
      updateVideoView(next)
      showViewHud(next)
      return
    }

    const gesture = gestureRef.current
    if (gesture.boosted) return

    const dx = point.x - gesture.x
    const dy = point.y - gesture.y

    if (!gesture.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) {
      gesture.moved = true
      clearGestureTimers()
    }
    if (videoViewRef.current.scale > 1 && gesture.moved) {
      const pan = clampVideoPan(
        gesture.fromView.x + dx,
        gesture.fromView.y + dy,
        gesture.surface,
        mediaSize,
        gesture.fromView.scale,
      )
      const next = { ...gesture.fromView, ...pan }
      updateVideoView(next)
      setViewInteracting(true)
      setControlsVisible(false)
      clearHideTimer()
      showViewHud(next)
      return
    }
    if (!gesture.thumb) return

    if (gesture.axis === 'none') lockGesture(gesture, dx, dy)
    if (gesture.axis === 'none') return
    trackGesture(gesture, dx, dy)
  }

  const onGesturePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const { point } = pointerLocation(event)
    activePointersRef.current.delete(event.pointerId)
    clearGestureTimers()
    if (multiTouchRef.current) {
      if (activePointersRef.current.size < 2) pinchRef.current = null
      if (activePointersRef.current.size === 0) {
        multiTouchRef.current = false
        setViewInteracting(false)
        fadeHud()
        revealControls()
      }
      return
    }
    const gesture = gestureRef.current
    if (gesture.boosted) {
      endBoost()
      return
    }
    if (videoViewRef.current.scale > 1 && gesture.moved) {
      setViewInteracting(false)
      fadeHud()
      revealControls()
      return
    }
    if (gesture.axis !== 'none') {
      finishGesture(gesture, point.x - gesture.x)
      gesture.axis = 'none'
      return
    }
    if (gesture.moved || fatal) return

    const now = Date.now()

    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      if (tapTimerRef.current != null) {
        window.clearTimeout(tapTimerRef.current)
        tapTimerRef.current = null
      }
      void togglePlay()
      return
    }

    lastTapRef.current = now
    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null
      if (rateMenuOpen) {
        setRateMenuOpen(false)
        return
      }
      if (showChromeRef.current) {
        setControlsVisible(false)
        clearHideTimer()
      } else {
        revealControls()
      }
    }, DOUBLE_TAP_MS)
  }

  const onGesturePointerCancel = () => {
    activePointersRef.current.clear()
    pinchRef.current = null
    multiTouchRef.current = false
    setViewInteracting(false)
    clearGestureTimers()
    const gesture = gestureRef.current
    if (gesture.axis !== 'none') {
      // 取消不提交进度，只收掉 HUD
      gesture.axis = 'none'
      levelingRef.current = false
      fadeHud()
    }
    endBoost()
  }

  const progress = duration > 0 ? current / duration : 0
  const bufferRatio = duration > 0 ? Math.min(1, buffered / duration) : 0
  const showChrome = (controlsVisible || !playing || scrubbing) && !boosting
  const statusMessage = getVideoStatusMessage({
    ready,
    fatal,
    scrubbing,
    waiting,
    seeking,
  })
  const orientedViewport = videoSurfaceForRotation(viewport, videoView.rotation)
  const viewTransformed = videoView.scale !== 1 || videoView.rotation !== 0
  const viewLabel = `${Math.round(videoView.scale * 100)}%${videoView.rotation ? ` · ${videoView.rotation}°` : ''}`
  showChromeRef.current = showChrome

  return (
    <>
      <div
      ref={rootRef}
      // 播放器控件叠在画面上，始终按深色配色渲染
      data-theme="dark"
      // 播放器内的横滑属于播放手势，阅读页的滑动返回不应再接管
      data-video-gestures=""
      className={`overflow-hidden border border-haze bg-ink-deep ${
        fallbackFullscreen ? 'fixed inset-0 z-[100] border-0' : ''
      } ${
        immersive ? 'rounded-none' : 'rounded-2xl'
      }`}
    >
      <div
        ref={stageRef}
        className={`relative overflow-hidden bg-black ${immersive ? 'h-full min-h-[240px]' : 'aspect-video'}`}
      >
        <div
          data-video-rotation={videoView.rotation}
          className="absolute left-1/2 top-1/2 overflow-hidden bg-black"
          style={{
            width: orientedViewport.width > 0 ? `${orientedViewport.width}px` : '100%',
            height: orientedViewport.height > 0 ? `${orientedViewport.height}px` : '100%',
            transform: `translate(-50%, -50%) rotate(${videoView.rotation}deg)`,
            transition: 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
        <video
          ref={videoRef}
          className="ink-video-player-media h-full w-full object-contain will-change-transform"
          style={{
            transform: `translate3d(${videoView.x}px, ${videoView.y}px, 0) scale(${videoView.scale})`,
            transition: viewInteracting ? 'none' : 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
          }}
          poster={poster}
          playsInline
          preload="metadata"
          controls={false}
          disablePictureInPicture
          title={title}
        />

        {ready && !fatal && (
          <div
            data-video-gesture-surface=""
            className="absolute inset-0 z-[1] touch-none select-none"
            onPointerDown={onGesturePointerDown}
            onPointerMove={onGesturePointerMove}
            onPointerUp={onGesturePointerUp}
            onPointerCancel={onGesturePointerCancel}
            onContextMenu={(event) => event.preventDefault()}
          />
        )}

        {scrim > 0 && (
          <div
            className="pointer-events-none absolute inset-0 z-[2] bg-black"
            style={{ opacity: scrim }}
          />
        )}

        {ready && !fatal && (
          <div
            onPointerDown={(event) => {
              event.stopPropagation()
              revealControls()
            }}
            className={`pointer-events-none absolute inset-x-0 top-0 z-[6] flex items-start gap-2 bg-gradient-to-b from-black/75 via-black/30 to-transparent pb-8 pl-[max(0.625rem,var(--sal,0px))] pr-[max(0.625rem,var(--sar,0px))] transition-opacity duration-200 ${
              immersive ? 'pt-[max(0.5rem,var(--sat,0px))]' : 'pt-2'
            } ${showChrome ? 'opacity-100' : 'opacity-0'}`}
          >
            <div className="min-w-0 flex-1 px-1 pt-1.5">
              <div className="truncate text-[12px] font-medium tracking-[0.01em] text-paper/90">
                {title || '文章视频'}
              </div>
              {viewTransformed && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-paper/60">
                  <Scan size={12} strokeWidth={1.8} />
                  <span className="font-mono">{viewLabel}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              aria-label="切换横竖屏"
              title="切换横竖屏"
              onClick={() => void rotateVideoView()}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-paper transition-colors active:bg-paper/15 ${
                showChrome ? 'pointer-events-auto' : ''
              }`}
            >
              <RotateCw size={18} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              aria-label="还原画面"
              title="还原画面"
              disabled={!viewTransformed}
              onClick={resetVideoView}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-paper transition-colors active:bg-paper/15 disabled:opacity-30 ${
                showChrome ? 'pointer-events-auto' : ''
              }`}
            >
              <RefreshCcw size={17} strokeWidth={1.7} />
            </button>
          </div>
        )}

        {ready && !fatal && !playing && !waiting && showChrome && (
          <button
            type="button"
            aria-label="播放"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              void togglePlay()
            }}
            className="absolute left-1/2 top-1/2 z-[5] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-paper/20 bg-black/45 text-paper shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md transition-transform active:scale-95"
          >
            <Play size={25} strokeWidth={1.6} className="ml-1" fill="currentColor" fillOpacity={0.16} />
          </button>
        )}

        {gestureHud && <GestureHudOverlay hud={gestureHud} duration={duration} />}

        {boosting && (
          <div
            className="pointer-events-none absolute inset-x-0 z-[2] flex justify-center"
            style={{ top: 'max(12px, calc(var(--sat, 0px) + 8px))' }}
          >
            <span className="inline-block whitespace-nowrap rounded-full bg-ink-raised/85 px-3 py-1 text-[11px] leading-none text-paper">
              {BOOST_RATE}x 快进中
            </span>
          </div>
        )}

        {statusMessage && (
          <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-black/35">
            <div className="flex items-center gap-2 rounded-full bg-ink-raised/85 px-3 py-2 text-[12px] text-paper">
              <LoaderCircle className="h-4 w-4 animate-spin text-paper/80" strokeWidth={1.8} />
              <span>{statusMessage}</span>
            </div>
          </div>
        )}

        {fatal && (
          <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-2 bg-black/70 px-4 text-center">
            <AlertCircle className="h-6 w-6 text-cinnabar-soft" strokeWidth={1.6} />
            <div className="text-[13px] text-paper">{fatal}</div>
            {onRefreshSource && (
              <button
                type="button"
                className="rounded-full border border-paper/30 px-3 py-1.5 text-[12px] text-paper"
                onClick={(event) => {
                  event.stopPropagation()
                  onRefreshSource()
                }}
              >
                重新探测
              </button>
            )}
          </div>
        )}

        {ready && !fatal && (
          <div
            onPointerDown={(event) => {
              event.stopPropagation()
              revealControls()
            }}
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/80 via-black/45 to-transparent pl-[max(0.75rem,var(--sal,0px))] pr-[max(0.75rem,var(--sar,0px))] pt-10 transition-opacity duration-200 ${
              immersive
                ? 'pb-[max(0.625rem,var(--sab,0px))]'
                : 'pb-2.5'
            } ${showChrome ? 'opacity-100' : 'opacity-0'}`}
          >
            <div
              className={`relative mb-2.5 h-5 touch-none ${
                showChrome ? 'pointer-events-auto' : ''
              }`}
            >
              <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-paper/20">
                <div
                  className="absolute inset-y-0 left-0 bg-paper/35"
                  style={{ width: `${bufferRatio * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-cinnabar"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.05}
                value={Number.isFinite(current) ? current : 0}
                disabled={!duration}
                aria-label="播放进度"
                className="ink-seek absolute inset-0 w-full cursor-pointer appearance-none bg-transparent"
                onPointerDown={() => setScrubbingState(true)}
                onPointerUp={(event) => onSeekCommit(Number(event.currentTarget.value))}
                onChange={(event) => onSeekInput(Number(event.currentTarget.value))}
                onKeyUp={(event) => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    onSeekCommit(Number(event.currentTarget.value))
                  }
                }}
                onClick={(event) => {
                  onSeekCommit(Number(event.currentTarget.value))
                }}
              />
            </div>

            <div className={`flex items-center gap-1 ${showChrome ? 'pointer-events-auto' : ''}`}>
              <button
                type="button"
                aria-label={playing ? '暂停' : '播放'}
                onClick={() => void togglePlay()}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-paper transition-colors active:bg-paper/15"
              >
                {playing ? (
                  <Pause size={18} strokeWidth={1.7} />
                ) : (
                  <Play size={18} strokeWidth={1.7} className="ml-0.5" />
                )}
              </button>

              <span className="min-w-[70px] font-mono text-[10px] tracking-wide text-paper/85">
                {formatTime(current)} / {formatTime(duration)}
              </span>

              <span className="flex-1" />

              <div className="relative">
                <button
                  type="button"
                  aria-label="播放速度"
                  aria-expanded={rateMenuOpen}
                  onClick={() => {
                    setRateMenuOpen((open) => !open)
                    revealControls()
                  }}
                  className="flex h-12 min-w-12 items-center justify-center rounded-full px-2 font-mono text-[11px] tracking-wide text-paper transition-colors active:bg-paper/15"
                >
                  {rate}x
                </button>
                {rateMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-2 flex min-w-[64px] flex-col overflow-hidden rounded-xl border border-haze bg-ink-raised/95 shadow-lg">
                    {PLAYBACK_RATES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => applyRate(value)}
                        className={`px-3 py-1.5 text-right font-mono text-[11px] ${
                          value === rate ? 'text-cinnabar-soft' : 'text-paper/80'
                        }`}
                      >
                        {value}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                aria-label={muted ? '取消静音' : '静音'}
                onClick={toggleMute}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-paper transition-colors active:bg-paper/15"
              >
                {muted ? (
                  <VolumeX size={17} strokeWidth={1.7} />
                ) : (
                  <Volume2 size={17} strokeWidth={1.7} />
                )}
              </button>

              <button
                type="button"
                aria-label={immersive ? '退出全屏' : '全屏'}
                onClick={() => void toggleFullscreen()}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-paper transition-colors active:bg-paper/15"
              >
                {immersive ? (
                  <Minimize2 size={16} strokeWidth={1.7} />
                ) : (
                  <Maximize2 size={16} strokeWidth={1.7} />
                )}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {hint && (
        <div className="border-t border-haze px-3 py-2 text-[11px] leading-relaxed text-paper-muted">
          {hint}
        </div>
      )}
    </div>
    {typeof document !== 'undefined' && createPortal(
      <MediaResourceOverlay
        resources={resourceOptions}
        open={resourceMenuOpen}
        immersive={immersive}
        onToggle={() => {
          setResourceMenuOpen((open) => !open)
          revealControls()
        }}
        onSelect={(resource) => {
          onSelectResource?.(resource)
          setResourceMenuOpen(false)
          revealControls()
        }}
      />,
      document.body,
      )}
    </>
  )
}

function MediaResourceOverlay({
  resources,
  open,
  immersive,
  onToggle,
  onSelect,
}: {
  resources: MediaResourceDescriptor[]
  open: boolean
  immersive: boolean
  onToggle: () => void
  onSelect: (resource: MediaResourceDescriptor) => void
}) {
  if (!resources.length || immersive) return null
  return (
    <>
      <button
        type="button"
        data-no-page-tap=""
        aria-label={`选择视频资源，共 ${resources.length} 个`}
        aria-expanded={open}
        title={`视频资源（${resources.length}）`}
        onClick={onToggle}
        className="fixed z-[100] flex items-center gap-2 rounded-full border border-haze bg-ink/95 px-3.5 py-2 text-paper shadow-xl shadow-black/35 backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
        style={{
          bottom: 'max(calc(var(--sab, 0px) + 76px), 76px)',
          right: 'max(calc(var(--sar, 0px) + 1rem), 1rem)',
        }}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cinnabar/15 text-cinnabar">
          <ListVideo size={13} strokeWidth={2} />
        </span>
        <span className="font-mono text-[12px] font-medium tracking-[0.03em]">嗅探 {resources.length}</span>
      </button>

      {open && (
        <div
          className="fixed z-[101] max-h-[min(60vh,280px)] w-[min(88vw,330px)] overflow-y-auto rounded-xl border border-paper/20 bg-ink-raised/95 p-1.5 shadow-xl backdrop-blur-md"
          style={{
            bottom: 'max(calc(var(--sab, 0px) + 128px), 128px)',
            right: 'max(calc(var(--sar, 0px) + 1rem), 1rem)',
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="px-2.5 py-1.5 text-[10px] tracking-wide text-paper/55">已嗅探到 {resources.length} 个资源</div>
          {resources.map((resource, index) => {
            const label = resource.type === 'hls' ? 'HLS' : resource.type === 'dash' ? 'DASH' : 'MP4'
            const detail = resource.videoTracks.find((track) => track.width || track.height)
            return (
              <button
                key={`${resource.id || resource.url}:${index}`}
                type="button"
                onClick={() => onSelect(resource)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-paper transition-colors hover:bg-paper/10 active:bg-paper/15"
              >
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-paper/10 font-mono text-[10px]">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[11px]">
                    <span>{label}</span>
                    {resource.isAd && <span className="rounded bg-cinnabar/20 px-1 text-[9px] text-cinnabar-soft">广告</span>}
                    {detail && <span className="text-paper/50">{detail.width || '?'}×{detail.height || '?'}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-paper/50">{resource.url}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

function LevelBar({ value }: { value: number }) {
  return (
    <div className="h-[3px] w-24 overflow-hidden rounded-full bg-paper/25">
      <div className="h-full rounded-full bg-paper" style={{ width: `${value * 100}%` }} />
    </div>
  )
}

function HudShell({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center">
      <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-ink-raised/85 px-4 py-2.5">
        {children}
      </div>
    </div>
  )
}

/** 全屏手势的即时反馈：进度预览、音量与亮度档位。 */
function GestureHudOverlay({ hud, duration }: { hud: GestureHud; duration: number }) {
  if (hud.kind === 'zoom') {
    return (
      <HudShell>
        <div className="flex items-center gap-2 text-paper">
          <Scan size={17} strokeWidth={1.8} />
          <span className="font-mono text-[14px] leading-none">
            {Math.round(hud.scale * 100)}%
          </span>
          {hud.rotation !== 0 && (
            <span className="font-mono text-[11px] leading-none text-cinnabar-soft">
              {hud.rotation}°
            </span>
          )}
        </div>
        <span className="text-[10px] leading-none text-paper/55">
          双指缩放 · 单指拖动画面
        </span>
      </HudShell>
    )
  }

  if (hud.kind === 'seek') {
    const seconds = Math.round(hud.offset)
    return (
      <HudShell>
        <div className="flex items-center gap-1.5 font-mono text-[15px] leading-none text-paper">
          {seconds < 0 ? (
            <ChevronsLeft size={16} strokeWidth={1.8} />
          ) : (
            <ChevronsRight size={16} strokeWidth={1.8} />
          )}
          <span>{formatTime(hud.target)}</span>
          <span className="text-paper/55">/ {formatTime(duration)}</span>
        </div>
        <span className="font-mono text-[11px] leading-none text-cinnabar-soft">
          {seconds >= 0 ? `+${seconds}` : seconds}s
        </span>
      </HudShell>
    )
  }

  const percent = Math.round(hud.value * 100)
  return (
    <HudShell>
      <div className="flex items-center gap-2 text-paper">
        {hud.kind === 'brightness' ? (
          <Sun size={16} strokeWidth={1.8} />
        ) : hud.value === 0 ? (
          <VolumeX size={16} strokeWidth={1.8} />
        ) : (
          <Volume2 size={16} strokeWidth={1.8} />
        )}
        <LevelBar value={hud.value} />
        <span className="w-8 text-right font-mono text-[11px] leading-none">{percent}%</span>
      </div>
    </HudShell>
  )
}
