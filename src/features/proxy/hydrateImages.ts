import { Capacitor } from '@capacitor/core'
import { parseHTML } from 'linkedom'

import { getRuntimeProxyPrefs, nativeFetchBytes } from '../../lib/http'
import { currentProxyRuntime } from './runtime'
import { resolveProxyTransport } from './transport'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/**
 * App 在 native-tunnel 下把需代理的 <img> 换成 blob:，
 * 因 WebView 不会走 OkHttp 用户代理。
 */
export async function hydrateNativeTunnelImages(html: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) return html

  const prefs = getRuntimeProxyPrefs()
  const runtime = currentProxyRuntime()
  const { document } = parseHTML(`<div id="newsnook-hydrate">${html}</div>`)
  const root = document.getElementById('newsnook-hydrate')
  if (!root) return html

  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src')
      if (!src || !src.startsWith('http')) return

      const transport = resolveProxyTransport(src, undefined, prefs, runtime)
      if (transport.kind !== 'native-tunnel' || !transport.tunnel) return

      try {
        const result = await nativeFetchBytes(
          transport.requestUrl,
          {
            'User-Agent': BROWSER_UA,
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
          transport.tunnel,
        )
        if (result.status < 200 || result.status >= 300) return
        const type = result.contentType || 'image/jpeg'
        const blob = new Blob([result.data], { type })
        img.setAttribute('src', URL.createObjectURL(blob))
        img.removeAttribute('srcset')
      } catch {
        // 单图失败保留原地址
      }
    }),
  )

  return root.innerHTML
}
