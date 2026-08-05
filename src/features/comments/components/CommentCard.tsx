import { Flame, ThumbsDown, ThumbsUp, User } from 'lucide-react'
import type { CommentItem, CommentQuote } from '../types'

interface Props {
  comment: CommentItem
}

function QuoteTree({ quotes }: { quotes: CommentQuote[] }) {
  if (!quotes || quotes.length === 0) return null

  return (
    <div className="my-2.5 space-y-2 rounded-xl border border-haze bg-ink-raised p-3 text-[12px] leading-relaxed">
      {quotes.map((q, index) => (
        <div
          key={q.id || index}
          className={`${index > 0 ? 'border-t border-haze/60 pt-2' : ''}`}
        >
          <div className="flex items-center justify-between text-[11px] text-paper-faint">
            <span className="font-medium text-paper-muted">
              {q.floorNumber ? `${q.floorNumber}楼 ` : ''}
              {q.author}
              {q.location && <span className="ml-1 text-[10px]">[{q.location}]</span>}
            </span>
          </div>
          <p className="mt-0.5 text-paper-muted whitespace-pre-wrap">{q.content}</p>
        </div>
      ))}
    </div>
  )
}

export function CommentCard({ comment }: Props) {
  return (
    <div className="border-b border-haze/50 py-3.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        {/* 用户信息与头像 */}
        <div className="flex items-center gap-2.5 min-w-0">
          {comment.avatar ? (
            <img
              src={comment.avatar}
              alt={comment.author}
              className="size-7 shrink-0 rounded-full object-cover border border-haze"
              loading="lazy"
              onError={(e) => {
                ;(e.target as HTMLElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-haze text-paper-faint">
              <User size={14} />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-medium text-paper">
                {comment.author}
              </span>
              {comment.location && (
                <span className="shrink-0 text-[10px] text-paper-faint">
                  [{comment.location}]
                </span>
              )}
              {comment.isHot && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-medium bg-cinnabar/15 text-cinnabar">
                  <Flame size={10} />
                  热门
                </span>
              )}
            </div>
            <span className="block text-[10px] text-paper-faint">
              {comment.createTimeFormatted}
            </span>
          </div>
        </div>

        {/* 赞踩互动 */}
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-paper-faint">
          {comment.voteCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-paper-muted">
              <ThumbsUp size={12} className="text-cinnabar/80" />
              {comment.voteCount}
            </span>
          )}
          {Boolean(comment.againstCount && comment.againstCount > 0) && (
            <span className="inline-flex items-center gap-0.5 text-paper-faint">
              <ThumbsDown size={12} />
              {comment.againstCount}
            </span>
          )}
        </div>
      </div>

      {/* 盖楼引用 */}
      {comment.quotes && <QuoteTree quotes={comment.quotes} />}

      {/* 评论主正文 */}
      <div className="mt-2 text-[13px] leading-relaxed text-paper whitespace-pre-wrap break-words">
        {comment.content}
      </div>
    </div>
  )
}
