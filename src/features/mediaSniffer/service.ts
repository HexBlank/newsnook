import { Capacitor } from '@capacitor/core'

import { fetchMediaBytes } from '../../lib/mediaFetch'
import {
  buildMediaDescriptor,
  collectMediaCandidates,
  mergeObservationSources,
  observeMediaInHtml,
  observeMediaInPayload,
} from './core'
import { observeMediaInNativePage } from './native'
import type { MediaDescriptor, MediaObservation } from './types'

const MAX_MANIFEST_BYTES = 512 * 1024
const MAX_EMBEDDED_PAGES = 3

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function embeddedPageUrlsInHtml(html: string, pageUrl: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<iframe\b[^>]*>/gi)) {
    const tag = match[0]
    const value = tag
      .match(/\b(?:src|data-src|data-video-src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
      ?.slice(1)
      .find((item): item is string => item !== undefined)
    if (!value) continue
    try {
      const url = new URL(value.replace(/&amp;/g, '&'), pageUrl)
      if (!/^https?:$/.test(url.protocol) || seen.has(url.href)) continue
      seen.add(url.href)
      urls.push(url.href)
      if (urls.length >= MAX_EMBEDDED_PAGES) break
    } catch {
      // A malformed embed cannot be loaded safely and is left to the fallback.
    }
  }
  return urls
}

export function runtimeProbePageUrl(pageUrl: string): string {
  try {
    const url = new URL(pageUrl)
    const host = url.hostname.toLowerCase()
    if (
      /^(?:www\.)?youtube(?:-nocookie)?\.com$/.test(host) &&
      /^\/embed\//i.test(url.pathname)
    ) {
      url.searchParams.set('autoplay', '1')
      url.searchParams.set('mute', '1')
      url.searchParams.set('playsinline', '1')
    } else if (host === 'player.vimeo.com' && /^\/video\//i.test(url.pathname)) {
      url.searchParams.set('autoplay', '1')
      url.searchParams.set('muted', '1')
      url.searchParams.set('playsinline', '1')
    }
    return url.href
  } catch {
    return pageUrl
  }
}

async function manifestBodies(
  observations: MediaObservation[],
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const manifests = collectMediaCandidates(observations)
    .filter((candidate) => candidate.format === 'hls' || candidate.format === 'dash')
    .slice(0, 2)
  const result = new Map<string, string>()

  await Promise.all(
    manifests.map(async (candidate) => {
      try {
        const { data } = await fetchMediaBytes(candidate.originalUrl, signal, {
          sourcePage: candidate.pageUrl,
          headers: candidate.requestHeaders,
          range: `bytes=0-${MAX_MANIFEST_BYTES - 1}`,
        })
        if (data.byteLength > MAX_MANIFEST_BYTES) return
        result.set(candidate.originalUrl, new TextDecoder().decode(data))
      } catch {
        // URL 与媒体类型信号仍可用于播放；清单增强失败不应丢掉候选。
      }
    }),
  )
  return result
}

export async function discoverMediaDescriptor(options: {
  pageUrl: string
  html?: string
  payload?: unknown
  runtime?: boolean
  timeoutMs?: number
  referrer?: string
  signal?: AbortSignal
}): Promise<MediaDescriptor | null> {
  const staticObservations = options.html
    ? observeMediaInHtml(options.html, options.pageUrl)
    : options.payload === undefined
      ? []
      : observeMediaInPayload(options.payload, options.pageUrl)
  const hasStaticPlayable = collectMediaCandidates(staticObservations).some(
    (candidate) => candidate.format !== 'segment',
  )
  const runtimeObservations: MediaObservation[] = []
  if (options.runtime !== false && !hasStaticPlayable && Capacitor.isNativePlatform()) {
    const embeddedPages = options.html
      ? embeddedPageUrlsInHtml(options.html, options.pageUrl)
      : []
    const targets = [...embeddedPages, options.pageUrl]
    const targetTimeoutMs = Math.max(
      1500,
      Math.floor((options.timeoutMs ?? 6000) / targets.length),
    )
    for (const target of targets) {
      const probeTarget = runtimeProbePageUrl(target)
      const observations = await observeMediaInNativePage(
        probeTarget,
        targetTimeoutMs,
        target === options.pageUrl ? options.referrer : options.pageUrl,
      ).catch(() => [])
      runtimeObservations.push(...observations)
      if (collectMediaCandidates(runtimeObservations).some((candidate) => candidate.format !== 'segment')) {
        break
      }
    }
  }
  const observations = mergeObservationSources(staticObservations, runtimeObservations)
  if (!observations.length) return null
  const manifests = await manifestBodies(observations, options.signal)
  return buildMediaDescriptor(observations, manifests)
}

export function mediaDescriptorHtml(
  descriptor: MediaDescriptor,
  options: { title: string; poster?: string; contentHtml?: string },
): string {
  const content = options.contentHtml || ''
  if (descriptor.drm) {
    return `${content}<p>检测到受保护媒体，需在原站授权播放。</p>`
  }

  const attrs = [
    `src="${escapeHtml(descriptor.url)}"`,
    `title="${escapeHtml(options.title)}"`,
    `data-media-format="${descriptor.type}"`,
    `data-source-page="${escapeHtml(descriptor.pageUrl)}"`,
    'controls',
    'playsinline',
    'preload="metadata"',
  ]
  if (descriptor.requestHeaders && Object.keys(descriptor.requestHeaders).length) {
    attrs.push(`data-media-headers="${escapeHtml(JSON.stringify(descriptor.requestHeaders))}"`)
  }
  if (options.poster) attrs.push(`poster="${escapeHtml(options.poster)}"`)
  return `<video ${attrs.join(' ')}></video>${content}`
}
