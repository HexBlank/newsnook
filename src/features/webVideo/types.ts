import type { PagingStrategy } from '../../sources/registry'

/** 从视频站列表页抽取的单条目录项 */
export interface WebVideoListItem {
  id: string
  title: string
  originUrl: string
  image?: string
  summary?: string
  publishedAt?: number
}

/**
 * 内置「视频站模板」契约。
 * 列表/搜索 URL 由模板负责；详情播放仍走通用 mediaSniffer（Android 运行时嗅探）。
 */
export interface WebVideoProfile {
  id: string
  name: string
  /** 可匹配的 host，支持 `91porn.com` 或 `*.91porn.com` */
  hosts: readonly string[]
  pagingStrategy: PagingStrategy
  maxOffsetPages?: number
  extractListItems(html: string, pageUrl: string): WebVideoListItem[]
  buildPageUrl(pageUrl: string, page: number): string
  buildSearchUrl?(siteRoot: string, query: string): string
}
