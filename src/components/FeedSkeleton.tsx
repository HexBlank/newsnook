interface Props {
  /** 是否预留头条大图位置 */
  showLead?: boolean
  rows?: number
}

/** 首屏取回期间的占位版式，行高与真实条目一致，取回后不会跳版 */
export function FeedSkeleton({ showLead = false, rows = 6 }: Props) {
  return (
    <div aria-hidden>
      {showLead && (
        <div>
          <div className="ink-shimmer mask-fade-b h-42 w-full md:h-55 lg:h-70" />
          <div className="page-x -mt-6 pb-5 md:pb-6">
            <div className="ink-shimmer h-2 w-24 rounded-full" />
            <div className="ink-shimmer mt-3 h-4 w-[88%] rounded-full" />
            <div className="ink-shimmer mt-2 h-4 w-[62%] rounded-full" />
            <div className="ink-shimmer mt-3 h-2.5 w-[72%] rounded-full" />
          </div>
        </div>
      )}

      <div className="page-x flex items-center gap-3 pt-5 pb-2">
        <div className="ink-shimmer h-2 w-16 rounded-full" />
        <span className="h-px flex-1 bg-haze" />
      </div>

      <ul className="divide-y divide-haze md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-haze xl:grid-cols-3">
        {Array.from({ length: rows }, (_, index) => (
          <li
            key={index}
            className="flex items-center gap-3 bg-ink px-4 py-3.5 sm:gap-3.5 sm:px-5 sm:py-4"
            style={{ opacity: 1 - index * 0.11 }}
          >
            <span className="self-start mt-1.5 h-3.5 w-px shrink-0 bg-haze" />
            <span className="min-w-0 flex-1">
              <span className="ink-shimmer block h-2 w-28 rounded-full" />
              <span className="ink-shimmer mt-2.5 block h-3.5 w-[92%] rounded-full" />
              <span className="ink-shimmer mt-2 block h-3.5 w-[64%] rounded-full" />
              <span className="ink-shimmer mt-2.5 block h-2.5 w-[80%] rounded-full" />
            </span>
            <span className="ink-shimmer h-17 w-17 shrink-0 rounded-md md:h-22 md:w-22 lg:h-24 lg:w-24" />
          </li>
        ))}
      </ul>
    </div>
  )
}
