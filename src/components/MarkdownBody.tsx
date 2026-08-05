import { Browser } from '@capacitor/browser'
import type { MouseEvent } from 'react'

import { markdownToSafeHtml } from '../lib/markdown'

type Props = {
  markdown: string
  className?: string
}

async function openExternalUrl(url: string) {
  try {
    await Browser.open({ url })
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/** 安全渲染 Markdown；外链点击走系统浏览器 */
export function MarkdownBody({ markdown, className }: Props) {
  const html = markdownToSafeHtml(markdown)

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || !/^https?:/i.test(href)) return
    event.preventDefault()
    void openExternalUrl(href)
  }

  return (
    <div
      className={['changelog-md', className].filter(Boolean).join(' ')}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
