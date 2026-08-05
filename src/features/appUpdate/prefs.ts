import { loadAppUpdatePrefs, saveAppUpdatePrefs } from '../../lib/storage'

import { SNOOZE_MS } from './gate'
import type { AppUpdatePrefs } from './types'

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function loadAppUpdatePrefsNormalized(): AppUpdatePrefs {
  const raw = loadAppUpdatePrefs()
  if (!raw || typeof raw !== 'object') return {}
  const record = raw as Record<string, unknown>
  const prefs: AppUpdatePrefs = {}
  const skipped = asNonEmptyString(record.skippedVersion)
  if (skipped) prefs.skippedVersion = skipped
  const snoozeUntil = asFiniteNumber(record.snoozeUntil)
  if (snoozeUntil != null) prefs.snoozeUntil = snoozeUntil
  const lastCheckAt = asFiniteNumber(record.lastCheckAt)
  if (lastCheckAt != null) prefs.lastCheckAt = lastCheckAt
  return prefs
}

function persist(patch: AppUpdatePrefs): AppUpdatePrefs {
  const next = { ...loadAppUpdatePrefsNormalized(), ...patch }
  saveAppUpdatePrefs(next)
  return next
}

export function saveSkippedVersion(version: string): AppUpdatePrefs {
  return persist({ skippedVersion: version })
}

export function saveSnooze(now: number): AppUpdatePrefs {
  return persist({ snoozeUntil: now + SNOOZE_MS })
}

export function touchLastCheck(now: number): AppUpdatePrefs {
  return persist({ lastCheckAt: now })
}
