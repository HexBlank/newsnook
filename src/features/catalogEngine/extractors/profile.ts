import { getWebVideoProfile } from '../../webVideo/registry'
import type { CatalogItem } from '../types'

/** 站点模板层：NewPipe/RSS-Bridge 式 per-site bridge，作为高精度可选增强 */
export function extractProfileCatalog(
  html: string,
  pageUrl: string,
  profileId: string | undefined,
): CatalogItem[] {
  const profile = getWebVideoProfile(profileId)
  if (!profile) return []

  return profile.extractListItems(html, pageUrl).map((item) => ({
    id: item.id,
    title: item.title,
    originUrl: item.originUrl,
    image: item.image,
    summary: item.summary,
    publishedAt: item.publishedAt,
  }))
}
