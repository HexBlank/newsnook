export interface VideoStatusInput {
  ready: boolean
  fatal: string | null
  scrubbing: boolean
  waiting: boolean
  seeking: boolean
}

export function getVideoStatusMessage({
  ready,
  fatal,
  scrubbing,
  waiting,
  seeking,
}: VideoStatusInput): string | null {
  if (fatal) return null
  if (scrubbing) return '正在拖动进度…'
  if (seeking) return '正在跳转…'
  if (!ready) return '视频加载中'
  if (waiting) return '缓冲中…'
  return null
}
