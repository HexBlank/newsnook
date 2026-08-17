/**
 * 全屏播放的拇指手势：屏幕下半部分横滑调进度，右下竖滑调音量，左下竖滑调亮度。
 * 这里只做纯计算，播放器组件负责把结果落到 video / 系统能力上。
 */

/** 拇指自然覆盖的是下半屏；上半屏留给单击呼出控件，避免误触。 */
export const THUMB_ZONE_TOP_RATIO = 0.5
/** 与平台触摸 slop 接近，锁定方向前允许的抖动。 */
export const AXIS_LOCK_PX = 10
/** 对角线手势保持未锁定，避免把斜划误判成音量或进度。 */
export const AXIS_BIAS = 1.15
/** 横滑整屏宽对应的最大进度跨度；短视频按自身时长封顶。 */
export const SEEK_FULL_WIDTH_SEC = 120
/** 竖滑约 60% 屏高即可从 0 调到 100%，不需要从屏底划到屏顶。 */
export const LEVEL_FULL_SWING_RATIO = 0.6
export const MIN_VIDEO_SCALE = 1
export const MAX_VIDEO_SCALE = 4

export type VideoGesture = 'none' | 'seek' | 'volume' | 'brightness'
export type VideoRotation = 0 | 90 | 180 | 270

export interface GestureSurface {
  width: number
  height: number
}

export interface VideoViewportTransform {
  scale: number
  x: number
  y: number
  rotation: VideoRotation
}

/** 手势区限定在下半屏，且必须落在播放器内部。 */
export function isThumbZone(localY: number, height: number): boolean {
  if (height <= 0) return false
  return localY >= height * THUMB_ZONE_TOP_RATIO && localY <= height
}

/**
 * 方向锁定：先判轴向，竖向再按左右半屏区分亮度与音量。
 * 起点落在哪半屏就决定整段手势的语义，中途越过中线不会切换。
 */
export function resolveGesture(
  dx: number,
  dy: number,
  startX: number,
  surface: GestureSurface,
): VideoGesture {
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (absX < AXIS_LOCK_PX && absY < AXIS_LOCK_PX) return 'none'
  if (absX >= absY * AXIS_BIAS) return 'seek'
  if (absY < absX * AXIS_BIAS) return 'none'
  if (surface.width <= 0) return 'none'
  return startX >= surface.width / 2 ? 'volume' : 'brightness'
}

/** 右滑为快进，左滑为快退。 */
export function seekOffsetSeconds(dx: number, width: number, duration: number): number {
  if (width <= 0 || !Number.isFinite(duration) || duration <= 0) return 0
  const span = Math.min(duration, SEEK_FULL_WIDTH_SEC)
  return (dx / width) * span
}

export function clampSeekTarget(from: number, offset: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(duration, Math.max(0, from + offset))
}

/** 上滑为增大，下滑为减小；返回 0~1 档位的增量。 */
export function levelOffset(dy: number, height: number): number {
  if (height <= 0) return 0
  const swing = height * LEVEL_FULL_SWING_RATIO
  return swing > 0 ? -dy / swing : 0
}

export function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function clampVideoScale(value: number): number {
  if (!Number.isFinite(value)) return MIN_VIDEO_SCALE
  return Math.min(MAX_VIDEO_SCALE, Math.max(MIN_VIDEO_SCALE, value))
}

export function pinchScale(from: number, fromDistance: number, distance: number): number {
  if (fromDistance <= 0 || !Number.isFinite(distance)) return clampVideoScale(from)
  return clampVideoScale(from * (distance / fromDistance))
}

export function normalizeVideoRotation(value: number): VideoRotation {
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360
  return normalized as VideoRotation
}

/** 让旋转后的实际视频内容仍完整落在视口内，scale=1 始终代表“适应画面”。 */
export function videoRotationFit(
  surface: GestureSurface,
  media: GestureSurface,
  rotation: VideoRotation,
): number {
  if (surface.width <= 0 || surface.height <= 0 || media.width <= 0 || media.height <= 0) return 1
  if (rotation === 0 || rotation === 180) return 1
  const base = Math.min(surface.width / media.width, surface.height / media.height)
  const renderedWidth = media.width * base
  const renderedHeight = media.height * base
  return Math.min(surface.width / renderedHeight, surface.height / renderedWidth)
}

/** 缩放后限制平移范围，避免把视频整块拖出播放区域。 */
export function clampVideoPan(
  x: number,
  y: number,
  surface: GestureSurface,
  media: GestureSurface,
  scale: number,
  rotation: VideoRotation,
): Pick<VideoViewportTransform, 'x' | 'y'> {
  if (surface.width <= 0 || surface.height <= 0 || media.width <= 0 || media.height <= 0) {
    return { x: 0, y: 0 }
  }
  const base = Math.min(surface.width / media.width, surface.height / media.height)
  const fit = videoRotationFit(surface, media, rotation)
  const quarterTurn = rotation === 90 || rotation === 270
  const contentWidth = (quarterTurn ? media.height : media.width) * base * fit * scale
  const contentHeight = (quarterTurn ? media.width : media.height) * base * fit * scale
  const maxX = Math.max(0, (contentWidth - surface.width) / 2)
  const maxY = Math.max(0, (contentHeight - surface.height) / 2)
  return {
    x: maxX === 0 ? 0 : Math.min(maxX, Math.max(-maxX, Number.isFinite(x) ? x : 0)),
    y: maxY === 0 ? 0 : Math.min(maxY, Math.max(-maxY, Number.isFinite(y) ? y : 0)),
  }
}
