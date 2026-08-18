import { porn91Profile } from './profiles/91porn'
import type { WebVideoProfile } from './types'

const PROFILES: WebVideoProfile[] = [porn91Profile]

const byId = new Map(PROFILES.map((profile) => [profile.id, profile]))

function hostMatches(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase()
  const rule = pattern.toLowerCase()
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(2)
    return host === suffix || host.endsWith(`.${suffix}`)
  }
  return host === rule || host.endsWith(`.${rule}`)
}

export function listWebVideoProfiles(): WebVideoProfile[] {
  return [...PROFILES]
}

export function getWebVideoProfile(id: string | undefined): WebVideoProfile | undefined {
  if (!id) return undefined
  return byId.get(id)
}

/** 按 URL host 匹配可用模板；未命中则 undefined */
export function matchWebVideoProfile(rawUrl: string): WebVideoProfile | undefined {
  let hostname: string
  try {
    hostname = new URL(rawUrl).hostname
  } catch {
    return undefined
  }

  for (const profile of PROFILES) {
    if (profile.hosts.some((pattern) => hostMatches(hostname, pattern))) {
      return profile
    }
  }
  return undefined
}
