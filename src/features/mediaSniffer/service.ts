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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
  const runtimeObservations =
    options.runtime !== false && !hasStaticPlayable && Capacitor.isNativePlatform()
      ? await observeMediaInNativePage(options.pageUrl, options.timeoutMs ?? 6000).catch(() => [])
      : []
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
