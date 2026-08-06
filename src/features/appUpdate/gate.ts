import type { AppUpdatePrefs } from './types'

export const SNOOZE_MS = 2 * 60 * 60 * 1000
export const RESUME_CHECK_INTERVAL_MS = 15 * 60 * 1000
export const CHECK_INTERVAL_MS = RESUME_CHECK_INTERVAL_MS

export function shouldFetchForAutoCheck(input: {
  prefs: AppUpdatePrefs
  now: number
  downloading: boolean
  isColdStart?: boolean
}): boolean {
  if (input.downloading) return false
  if (input.isColdStart) return true
  if (
    input.prefs.lastCheckAt != null &&
    input.now - input.prefs.lastCheckAt < RESUME_CHECK_INTERVAL_MS
  ) {
    return false
  }
  return true
}

export function shouldAutoPrompt(input: {
  remoteVersion: string
  prefs: AppUpdatePrefs
  now: number
  downloading: boolean
}): boolean {
  if (input.downloading) return false
  if (input.prefs.skippedVersion === input.remoteVersion) return false
  if (input.prefs.snoozeUntil != null && input.now < input.prefs.snoozeUntil) return false
  return true
}

export function shouldShowUpdateBadge(input: {
  remoteVersion: string
  prefs: AppUpdatePrefs
}): boolean {
  if (input.prefs.skippedVersion === input.remoteVersion) return false
  return true
}
