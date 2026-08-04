export const PULL_THRESHOLD_PX = 72
export const MAX_PULL_PX = 132
export const PULL_RESISTANCE_PX = 152

/**
 * Rubber-band resistance: responsive at the start, progressively firmer near
 * the limit. This avoids the mechanical feel of a fixed multiplier.
 */
export function resistedPullDistance(rawDistance: number): number {
  if (rawDistance <= 0) return 0
  return Math.min(
    MAX_PULL_PX,
    MAX_PULL_PX * (1 - Math.exp(-rawDistance / PULL_RESISTANCE_PX)),
  )
}
