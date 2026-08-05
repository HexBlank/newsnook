const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)$/i

export function parseVersion(raw: string): [number, number, number] | null {
  const match = VERSION_RE.exec(raw.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function normalizeTagVersion(tag: string): string {
  return tag.trim().replace(/^[vV]/, '')
}

export function compareSemver(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return Number.NaN
  for (let i = 0; i < 3; i += 1) {
    const delta = left[i]! - right[i]!
    if (delta !== 0) return delta
  }
  return 0
}

export function isNewerVersion(remote: string, local: string): boolean {
  const cmp = compareSemver(remote, local)
  return Number.isFinite(cmp) && cmp > 0
}
