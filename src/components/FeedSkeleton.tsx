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
        <>
          {/* 移动端头条骨架 (Mobile: < lg) */}
          <div className="lg:hidden">
            <div className="ink-shimmer mask-fade-b h-42 w-full md:h-55" />
            <div className="page-x -mt-6 pb-5 md:pb-6">
              <div className="ink-shimmer h-2 w-24 rounded-full" />
              <div className="ink-shimmer mt-3 h-4 w-[88%] rounded-full" />
              <div className="ink-shimmer mt-2 h-4 w-[62%] rounded-full" />
              <div className="ink-shimmer mt-3 h-2.5 w-[72%] rounded-full" />
            </div>
          </div>

          {/* 桌面端头条骨架 (Desktop: >= lg) */}
          <div className="hidden lg:block my-6 px-6 xl:px-8 2xl:px-10">
            <div className="grid grid-cols-12 gap-8 items-center rounded-2xl border border-haze bg-ink-raised/60 p-6 xl:p-8">
              <div className="col-span-7 h-[300px] xl:h-[350px] 2xl:h-[400px] w-full rounded-xl ink-shimmer" />
              <div className="col-span-5 flex flex-col justify-between h-full py-2 space-y-4">
                <div>
                  <div className="ink-shimmer h-2.5 w-28 rounded-full" />
                  <div className="ink-shimmer mt-4 h-6 w-full rounded-lg" />
                  <div className="ink-shimmer mt-2.5 h-6 w-[80%] rounded-lg" />
                  <div className="ink-shimmer mt-4 h-3.5 w-full rounded-full" />
                  <div className="ink-shimmer mt-2 h-3.5 w-[90%] rounded-full" />
                </div>
                <div className="pt-4 border-t border-haze/60 flex justify-between">
                  <div className="ink-shimmer h-2.5 w-24 rounded-full" />
                  <div className="ink-shimmer h-2.5 w-16 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 分组日期条 */}
      <div className="page-x lg:px-6 xl:px-8 2xl:px-10 flex items-center gap-3 pt-5 pb-2">
        <div className="ink-shimmer h-2 w-16 rounded-full" />
        <span className="h-px flex-1 bg-haze" />
      </div>

      {/* 移动端列表骨架 (Mobile: < md) */}
      <ul className="divide-y divide-haze md:hidden">
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
            <span className="ink-shimmer h-17 w-17 shrink-0 rounded-md" />
          </li>
        ))}
      </ul>

      {/* 桌面端/平板端卡片网格骨架 (Desktop: >= md: 2列 -> 3列 -> 4列 -> 5列) */}
      <div className="hidden md:grid md:grid-cols-2 md:gap-4 md:px-6 md:py-3 xl:grid-cols-3 2xl:grid-cols-4 min-[2100px]:grid-cols-5 xl:px-8 2xl:px-10 min-[2100px]:gap-5">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="flex flex-col justify-between rounded-xl border border-haze bg-ink-raised/40 p-5 space-y-4"
            style={{ opacity: 1 - index * 0.1 }}
          >
            <div className="w-full space-y-3">
              <div className="ink-shimmer h-38 w-full rounded-lg" />
              <div className="flex justify-between items-center">
                <div className="ink-shimmer h-2 w-20 rounded-full" />
                <div className="ink-shimmer h-2 w-16 rounded-full" />
              </div>
              <div className="ink-shimmer h-4 w-full rounded-full" />
              <div className="ink-shimmer h-4 w-[75%] rounded-full" />
              <div className="ink-shimmer h-3 w-[85%] rounded-full" />
            </div>
            <div className="pt-3 border-t border-haze/50 flex justify-between">
              <div className="ink-shimmer h-2 w-20 rounded-full" />
              <div className="ink-shimmer h-2 w-6 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
