const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const delta = now - timestamp
  const date = new Date(timestamp)
  // 预告稿 / 「月日」无年份解析偶尔落到未来：展示绝对日期，勿伪装成「刚刚」
  if (delta < 0) return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
  if (delta < MINUTE) return '刚刚'
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} 分钟前`
  if (delta < DAY) return `${Math.floor(delta / HOUR)} 小时前`
  if (delta < 2 * DAY) return `昨天 ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

/** 列表/详情用：只展示上游发布时间；缺失时不用抓取时间冒充「刚刚」 */
export function articleRelativeTime(
  article: { publishedAt: number; hasRealDate: boolean },
  now = Date.now(),
): string {
  if (!article.hasRealDate) return '时间以原文为准'
  return relativeTime(article.publishedAt, now)
}

export function clockTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function dayBucket(timestamp: number, now = Date.now()): string {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const todayStart = start.getTime()
  // 必须限制在 [今天 0 点, 明天 0 点)，否则未来时间戳会被误标成「今天」
  if (timestamp >= todayStart && timestamp < todayStart + DAY) return '今天'
  if (timestamp >= todayStart - DAY && timestamp < todayStart) return '昨天'
  return '更早'
}

export function chineseDate(timestamp = Date.now()): string {
  const date = new Date(timestamp)
  const digits = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  const month = date.getMonth() + 1
  const day = date.getDate()

  const monthText = month <= 10 ? digits[month] : `十${digits[month - 10]}`
  const dayText =
    day <= 10
      ? digits[day]
      : day < 20
        ? `十${digits[day - 10]}`
        : day % 10 === 0
          ? `${digits[day / 10]}十`
          : `${digits[Math.floor(day / 10)]}十${digits[day % 10]}`

  return `${monthText}月${dayText}日`
}
