export const TAP_TARGET = 5
export const TAP_GAP_MS = 1000
export const REOPEN_COOLDOWN_MS = 800

export type EasterEggTriggerState = {
  count: number
  lastTapAt: number
  cooldownUntil: number
}

export type TapResult = {
  state: EasterEggTriggerState
  unlocked: boolean
}

export function createEasterEggTriggerState(): EasterEggTriggerState {
  return { count: 0, lastTapAt: 0, cooldownUntil: 0 }
}

export function registerTap(state: EasterEggTriggerState, now: number): TapResult {
  if (now < state.cooldownUntil) {
    return { state: { ...state, lastTapAt: now }, unlocked: false }
  }

  const withinGap = state.lastTapAt > 0 && now - state.lastTapAt <= TAP_GAP_MS
  const count = withinGap ? state.count + 1 : 1

  if (count >= TAP_TARGET) {
    return {
      state: {
        count: 0,
        lastTapAt: now,
        cooldownUntil: now + REOPEN_COOLDOWN_MS,
      },
      unlocked: true,
    }
  }

  return {
    state: { count, lastTapAt: now, cooldownUntil: state.cooldownUntil },
    unlocked: false,
  }
}
