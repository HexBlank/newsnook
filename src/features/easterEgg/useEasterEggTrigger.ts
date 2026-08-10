import { useCallback, useRef } from 'react'

import { createEasterEggTriggerState, registerTap } from './trigger'

export function useEasterEggTrigger(onUnlock: () => void): { onTap: () => void } {
  const stateRef = useRef(createEasterEggTriggerState())
  const onUnlockRef = useRef(onUnlock)
  onUnlockRef.current = onUnlock

  const onTap = useCallback(() => {
    const result = registerTap(stateRef.current, Date.now())
    stateRef.current = result.state
    if (result.unlocked) onUnlockRef.current()
  }, [])

  return { onTap }
}
