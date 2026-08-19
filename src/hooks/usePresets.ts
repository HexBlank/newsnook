import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  loadEnabledSources,
  loadPreferences,
  loadPresetsState,
  savePresetsState,
} from '../lib/storage'
import {
  activatePreset,
  applySnapshotToPrefs,
  buildFreshInstallPresetsState,
  buildMigratedPresetsState,
  createBlankUserPreset,
  deleteUserPreset,
  ensureValidActivePreset,
  listResolvedBuiltins,
  normalizePresetsState,
  renameUserPreset,
  resolvePreset,
  restoreBuiltinFactory,
  saveAsUserPreset,
  snapshotFromRuntime,
  snapshotsEqual,
  updateActiveSnapshot,
  type LayoutPreset,
  type LayoutSnapshot,
  type PresetsState,
} from '../sources/presets'
import { normalizePreferences, type Preferences } from '../sources/preferences'
import { SOURCES } from '../sources/registry'

const DEFAULT_ENABLED = SOURCES.filter((source) => source.enabled).map((source) => source.id)

function bootstrapPresetsState(): PresetsState {
  const normalized = normalizePresetsState(loadPresetsState())
  if (normalized) return normalized

  const rawPrefs = loadPreferences()
  const rawEnabled = loadEnabledSources()
  const hadRuntime = rawPrefs != null || rawEnabled !== undefined

  if (hadRuntime) {
    return buildMigratedPresetsState(
      normalizePreferences(rawPrefs),
      rawEnabled ?? DEFAULT_ENABLED,
    )
  }

  return buildFreshInstallPresetsState()
}

export interface UsePresetsArgs {
  prefs: Preferences
  enabledIds: string[]
  updatePrefs: (updater: (prev: Preferences) => Preferences) => void
  setEnabledIds: (ids: string[] | ((prev: string[]) => string[])) => void
}

export interface UsePresetsApi {
  state: PresetsState
  builtins: readonly LayoutPreset[]
  activePreset: LayoutPreset | undefined
  applyPreset: (id: string) => void
  saveAs: (name: string, description?: string) => string
  createBlank: (name: string) => string
  restoreFactory: (id?: string) => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
}

export function usePresets({
  prefs,
  enabledIds,
  updatePrefs,
  setEnabledIds,
}: UsePresetsArgs): UsePresetsApi {
  const [state, setState] = useState<PresetsState>(() => {
    const initial = ensureValidActivePreset(bootstrapPresetsState())
    savePresetsState(initial)
    return initial
  })

  const stateRef = useRef(state)
  stateRef.current = state

  const skipSync = useRef(true)
  /** StrictMode 下 effect 可能跑两次；应用运行态后忽略随后的写回 */
  const suppressSyncCount = useRef(0)

  useEffect(() => {
    savePresetsState(state)
  }, [state])

  useEffect(() => {
    if (skipSync.current) {
      skipSync.current = false
      return
    }
    if (suppressSyncCount.current > 0) {
      suppressSyncCount.current -= 1
      return
    }

    const snapshot = snapshotFromRuntime(prefs, enabledIds)
    setState((prev) => {
      const ensured = ensureValidActivePreset(prev)
      const current = resolvePreset(ensured, ensured.activePresetId)
      if (current && snapshotsEqual(current.snapshot, snapshot)) {
        return ensured === prev ? prev : ensured
      }
      return updateActiveSnapshot(ensured, snapshot)
    })
  }, [prefs, enabledIds])

  const pushRuntime = useCallback(
    (snapshot: LayoutSnapshot) => {
      // prefs + enabledIds 各可能触发一次 sync effect；StrictMode 再加倍
      suppressSyncCount.current = 4
      updatePrefs((prev) => applySnapshotToPrefs(prev, snapshot))
      setEnabledIds(snapshot.enabledSourceIds)
    },
    [setEnabledIds, updatePrefs],
  )

  const activePreset = useMemo(() => resolvePreset(state, state.activePresetId), [state])
  const builtins = useMemo(() => listResolvedBuiltins(state), [state])

  const applyPreset = useCallback(
    (id: string) => {
      const result = activatePreset(stateRef.current, id)
      if (!result) return
      setState(result.state)
      pushRuntime(result.snapshot)
    },
    [pushRuntime],
  )

  const saveAs = useCallback(
    (name: string, description?: string) => {
      const current = resolvePreset(stateRef.current, stateRef.current.activePresetId)
      const snapshot = snapshotFromRuntime(prefs, enabledIds)
      const { state: next, preset } = saveAsUserPreset(
        stateRef.current,
        snapshot,
        name,
        description,
        current?.builtin ? current.id : undefined,
      )
      setState(next)
      return preset.id
    },
    [enabledIds, prefs],
  )

  const createBlank = useCallback(
    (name: string) => {
      const { state: next, preset } = createBlankUserPreset(stateRef.current, name)
      setState(next)
      pushRuntime(preset.snapshot)
      return preset.id
    },
    [pushRuntime],
  )

  const restoreFactory = useCallback(
    (id?: string) => {
      const targetId = id ?? stateRef.current.activePresetId
      const result = restoreBuiltinFactory(stateRef.current, targetId)
      if (!result) return
      setState(result.state)
      if (result.applied) pushRuntime(result.snapshot)
    },
    [pushRuntime],
  )

  const rename = useCallback((id: string, name: string) => {
    setState(renameUserPreset(stateRef.current, id, name))
  }, [])

  const remove = useCallback(
    (id: string) => {
      const prev = stateRef.current
      const next = ensureValidActivePreset(deleteUserPreset(prev, id))
      setState(next)
      if (next.activePresetId !== prev.activePresetId) {
        const active = resolvePreset(next, next.activePresetId)
        if (active) pushRuntime(active.snapshot)
      }
    },
    [pushRuntime],
  )

  return {
    state,
    builtins,
    activePreset,
    applyPreset,
    saveAs,
    createBlank,
    restoreFactory,
    rename,
    remove,
  }
}
