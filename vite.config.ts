import { readFileSync } from 'node:fs'
import https from 'node:https'
import http from 'node:http'

import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import postcss from 'postcss'
import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { SocksProxyAgent } from 'socks-proxy-agent'

import { normalizeProxyPrefs } from './src/features/proxy/config.ts'
import { planNodeUpstream } from './src/features/proxy/nodeAgent.ts'
import type { ProxyPrefs } from './src/features/proxy/types.ts'
import { type NewsSource } from './src/sources/registry.ts'

const { version: appVersion } = JSON.parse(readFileSync('./package.json', 'utf-8')) as {
  version: string
}

/** 构建年月戳，如 2026.08 */
function buildStamp(): string {
  const now = new Date()
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** 浏览器经 POST /api/dev-proxy-prefs 同步到开发服务器内存 */
let activeDevProxyPrefs: ProxyPrefs | null = null

function tlsErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const direct = (error as { code?: string }).code
  if (typeof direct === 'string') return direct
  const cause = (error as { cause?: { code?: string } }).cause
  return typeof cause?.code === 'string' ? cause.code : undefined
}

function isTlsCertError(error: unknown): boolean {
  const code = tlsErrorCode(error)
  return (
    code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'CERT_HAS_EXPIRED' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID'
  )
}

type UpstreamResult = {
  status: number
  contentType: string | null
  buffer: Buffer
}

type UpstreamRequest = {
  method?: string
  headers: Record<string, string>
  body?: string
  sourceMeta?: { id?: string; group?: string }
}

/** 证书链不完整的站点（如晚点）Node fetch 会失败；回退到不校验证书的 https 请求。 */
function fetchInsecure(
  target: string,
  request: UpstreamRequest,
  redirectsLeft = 8,
  agent?: http.Agent | https.Agent,
): Promise<UpstreamResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(target)
    const transport = url.protocol === 'http:' ? http : https
    const method = request.method ?? 'GET'
    const req = transport.request(
      url,
      {
        method,
        headers: request.headers,
        agent,
        ...(url.protocol === 'https:' ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0
        const location = res.headers.location
        if (REDIRECT_STATUSES.has(status) && location && redirectsLeft > 0) {
          res.resume()
          resolve(
            fetchInsecure(
              new URL(location, url).href,
              { method: 'GET', headers: request.headers },
              redirectsLeft - 1,
              agent,
            ),
          )
          return
        }

        const chunks: Buffer[] = []
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        res.on('end', () => {
          const contentType = res.headers['content-type']
          resolve({
            status,
            contentType: typeof contentType === 'string' ? contentType : null,
            buffer: Buffer.concat(chunks),
          })
        })
      },
    )
    req.on('error', reject)
    req.end(request.body)
  })
}

async function fetchViaProxyUri(
  target: string,
  request: UpstreamRequest,
  proxyUri: string,
): Promise<UpstreamResult> {
  if (proxyUri.startsWith('socks')) {
    const agent = new SocksProxyAgent(proxyUri)
    try {
      return await fetchInsecure(target, request, 8, agent as http.Agent)
    } finally {
      agent.destroy()
    }
  }

  const dispatcher = new ProxyAgent(proxyUri)
  try {
    const upstream = await undiciFetch(target, {
      method: request.method ?? 'GET',
      redirect: 'follow',
      headers: request.headers,
      body: request.body,
      dispatcher,
    })
    return {
      status: upstream.status,
      contentType: upstream.headers.get('content-type'),
      buffer: Buffer.from(await upstream.arrayBuffer()),
    }
  } finally {
    await dispatcher.close()
  }
}

async function fetchUpstream(target: string, request: UpstreamRequest): Promise<UpstreamResult> {
  const plan = planNodeUpstream(target, activeDevProxyPrefs ?? undefined, request.sourceMeta)
  const fetchUrl = plan.url
  const proxyUri = plan.proxyUri

  try {
    if (proxyUri) {
      return await fetchViaProxyUri(fetchUrl, request, proxyUri)
    }

    const upstream = await fetch(fetchUrl, {
      method: request.method ?? 'GET',
      redirect: 'follow',
      headers: request.headers,
      body: request.body,
    })
    return {
      status: upstream.status,
      contentType: upstream.headers.get('content-type'),
      buffer: Buffer.from(await upstream.arrayBuffer()),
    }
  } catch (error) {
    if (!isTlsCertError(error)) throw error
    if (proxyUri?.startsWith('socks')) {
      const agent = new SocksProxyAgent(proxyUri)
      try {
        return await fetchInsecure(fetchUrl, request, 8, agent as http.Agent)
      } finally {
        agent.destroy()
      }
    }
    return fetchInsecure(fetchUrl, request)
  }
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function encodeFormBody(form?: Record<string, string | number>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(form ?? {})) {
    params.set(key, String(value))
  }
  return params.toString()
}

function feedRequestHeaders(
  source: NewsSource,
  method: string,
  resolveUa: (source: NewsSource) => string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': resolveUa(source),
    Accept:
      'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, application/json, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(source.requestHeaders ?? {}),
  }
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
  }
  return headers
}

/**
 * Feed 代理改成请求时按 id 查 registry，而不是启动时冻结 proxy 表。
 * 只改 registry 时 Vite 往往会「重启」却不重算 server.proxy，新源会落到 SPA fallback。
 * 用 ssrLoadModule 取最新 registry，避免 Node 模块缓存卡住旧 SOURCES。
 */
function feedProxyPlugin(): Plugin {
  return {
    name: 'newsnook-feed-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = req.url?.split('?')[0] ?? ''
        const match = pathOnly.match(/^\/api\/feed\/([^/]+)$/)
        if (!match) {
          next()
          return
        }

        try {
          const registry = (await server.ssrLoadModule('/src/sources/registry.ts')) as {
            findSource: (id: string) => NewsSource | undefined
            userAgentFor: (source: NewsSource) => string
            offsetPageRequest: (
              source: NewsSource,
              page: number,
            ) => { url: string; requestForm?: Record<string, string | number> }
          }
          const source = registry.findSource(match[1])
          if (!source) {
            res.statusCode = 404
            res.end(`unknown source: ${match[1]}`)
            return
          }

          const incoming = new URL(req.url ?? '/', 'http://localhost')
          const pageRaw = incoming.searchParams.get('page')
          const page = pageRaw != null && pageRaw !== '' ? Number(pageRaw) : 0
          const paged = Number.isFinite(page)
            ? registry.offsetPageRequest(source, page)
            : { url: source.url, requestForm: source.requestForm }

          const method = (req.method ?? 'GET').toUpperCase()
          const wantPost = method === 'POST' || source.requestMethod === 'POST'
          let body: string | undefined
          if (wantPost) {
            // 优先用浏览器传来的 body；否则按翻页后的 requestForm 组装
            if (method === 'POST') {
              body = await readRequestBody(req)
            }
            if (!body) body = encodeFormBody(paged.requestForm ?? source.requestForm)
          }

          const headers = feedRequestHeaders(source, wantPost ? 'POST' : 'GET', registry.userAgentFor)
          const upstream = await fetchUpstream(paged.url, {
            method: wantPost ? 'POST' : 'GET',
            headers,
            body,
            sourceMeta: { id: source.id, group: source.group },
          })

          res.statusCode = upstream.status
          res.setHeader(
            'Content-Type',
            upstream.contentType || 'application/octet-stream',
          )
          res.setHeader('Cache-Control', 'no-store')
          res.end(upstream.buffer)
        } catch (error) {
          res.statusCode = 502
          res.end(error instanceof Error ? error.message : 'feed proxy failed')
        }
      })
    },
  }
}

/** 开发态：浏览器同步用户代理偏好，供 fetchUpstream 使用 */
function devProxyPrefsPlugin(): Plugin {
  return {
    name: 'newsnook-dev-proxy-prefs',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = req.url?.split('?')[0] ?? ''
        if (pathOnly !== '/api/dev-proxy-prefs') {
          next()
          return
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }

        try {
          const raw = await readRequestBody(req)
          const parsed = JSON.parse(raw || '{}') as unknown
          activeDevProxyPrefs = normalizeProxyPrefs(parsed)
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end()
        } catch (error) {
          res.statusCode = 400
          res.end(error instanceof Error ? error.message : 'invalid prefs')
        }
      })
    },
  }
}

/** 任意原文页 / 正文 API / 图片的开发态代理 */
function upstreamProxy(): Plugin {
  return {
    name: 'newsnook-upstream-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (
          !req.url?.startsWith('/api/page?') &&
          !req.url?.startsWith('/api/image?') &&
          !req.url?.startsWith('/api/media?') &&
          !req.url?.startsWith('/api/post?')
        ) {
          next()
          return
        }

        try {
          const incoming = new URL(req.url, 'http://localhost')
          const target = incoming.searchParams.get('url')
          if (!target) {
            res.statusCode = 400
            res.end('missing url')
            return
          }

          const targetUrl = new URL(target)
          const requestedUa = incoming.searchParams.get('ua')
          const isPost = incoming.pathname === '/api/post' || req.url.startsWith('/api/post?')
          const isImage = incoming.pathname === '/api/image' || req.url.startsWith('/api/image?')
          const isMedia = incoming.pathname === '/api/media' || req.url.startsWith('/api/media?')
          const isNetease =
            target.includes('163.com') ||
            target.includes('netease.com') ||
            target.includes('126.net')

          if (isPost) {
            const body = await readRequestBody(req)
            const upstream = await fetchUpstream(target, {
              method: 'POST',
              headers: {
                'User-Agent': requestedUa || BROWSER_UA,
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                Accept: '*/*',
                Referer: 'https://news.google.com/',
              },
              body,
            })
            res.statusCode = upstream.status
            res.setHeader(
              'Content-Type',
              upstream.contentType || 'text/plain; charset=utf-8',
            )
            res.setHeader('Cache-Control', 'no-store')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(upstream.buffer)
            return
          }

          // 微信图床：带他站 / localhost Referer 会返回「未经允许不可引用」占位图；不传 Referer 即可
          const isWechatImage =
            isImage &&
            /(?:^|\.)(?:mmbiz\.qpic\.cn|mmecoa\.qpic\.cn|qlogo\.cn)$/i.test(targetUrl.hostname)
          // 网易 flv CDN：带 localhost Origin 会 403，代理侧不传 Origin，只带站点 Referer
          const headers: Record<string, string> = {
            'User-Agent': isNetease && !isMedia ? 'NewsApp' : requestedUa || BROWSER_UA,
            Accept: isImage
              ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
              : isMedia
                ? '*/*'
                : 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          }
          if (!isWechatImage) {
            headers.Referer = isMedia
              ? 'https://3g.163.com/'
              : targetUrl.hostname.endsWith('.translate.goog')
                ? 'https://translate.google.com/'
                : `${targetUrl.origin}/`
          }

          const upstream = await fetchUpstream(target, { headers })
          res.statusCode = upstream.status
          const contentType =
            upstream.contentType ||
            (isImage ? 'image/jpeg' : isMedia ? 'application/octet-stream' : 'text/html; charset=utf-8')
          res.setHeader('Content-Type', contentType)
          res.setHeader('Cache-Control', isImage || isMedia ? 'public, max-age=3600' : 'no-store')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(upstream.buffer)
        } catch (error) {
          res.statusCode = 502
          res.end(error instanceof Error ? error.message : 'proxy failed')
        }
      })
    },
  }
}

const staticColorRgb: Record<string, string> = {
  black: '0 0 0',
  white: '255 255 255',
  'rose-300': '255 162 174',
  'rose-400': '255 102 127',
  'rose-500': '255 35 87',
  'rose-600': '231 0 68',
  'rose-950': '77 2 24',
  'emerald-500': '0 187 127',
}

function colorMixToRgb(val: string): string {
  return val
    .replace(
      /color-mix\(\s*in\s+oklab\s*,\s*var\(--color-([a-z0-9-]+)\)\s+([0-9.]+)%\s*,\s*transparent\s*\)/g,
      (_match, colorName, pct) => {
        const alpha = Number((Number(pct) / 100).toFixed(4))
        if (staticColorRgb[colorName]) {
          return `rgb(${staticColorRgb[colorName]} / ${alpha})`
        }
        if (colorName === 'haze') {
          return `rgb(var(--tone-paper-rgb) / ${Number((alpha * 0.08).toFixed(4))})`
        }
        return `rgb(var(--tone-${colorName}-rgb) / ${alpha})`
      },
    )
    .replace(
      /color-mix\(\s*in\s+oklab\s*,\s*var\(--color-([a-z0-9-]+)\)\s*,\s*transparent\s*\)/g,
      (_match, colorName) => {
        if (staticColorRgb[colorName]) {
          return `rgb(${staticColorRgb[colorName]})`
        }
        return `rgb(var(--tone-${colorName}-rgb))`
      },
    )
}

function unlayerCssPlugin(): Plugin {
  const unlayer = {
    postcssPlugin: 'postcss-unlayer-plugin',
    AtRule: {
      layer(atRule: any) {
        if (atRule.nodes && atRule.nodes.length > 0) {
          atRule.replaceWith(atRule.nodes)
        } else {
          atRule.remove()
        }
      },
      supports(atRule: any) {
        if (typeof atRule.params === 'string' && atRule.params.includes('color-mix')) {
          atRule.walkDecls((decl: any) => {
            decl.value = colorMixToRgb(decl.value)
          })
          if (atRule.nodes && atRule.nodes.length > 0) {
            atRule.replaceWith(atRule.nodes)
          } else {
            atRule.remove()
          }
        }
      },
    },
    Declaration(decl: any) {
      if (typeof decl.value === 'string') {
        if (decl.value.includes('color-mix')) {
          decl.value = colorMixToRgb(decl.value)
        }
        // 移除渐变中的 in oklab，防止 Chrome < 111 无法解析渐变
        if (decl.value.includes('in oklab')) {
          decl.value = decl.value.replace(/\s+in\s+oklab/g, '')
        }
        // 补充 -webkit-backdrop-filter 前缀以兼容旧版 WebView 毛玻璃
        if (decl.prop === 'backdrop-filter') {
          decl.cloneBefore({ prop: '-webkit-backdrop-filter' })
        }
      }
    },
  }

  return {
    name: 'vite-plugin-unlayer-css',
    enforce: 'post',
    async generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (
          file.type === 'asset' &&
          file.fileName.endsWith('.css') &&
          typeof file.source === 'string'
        ) {
          const res = await postcss([unlayer]).process(file.source, { from: undefined })
          file.source = res.css
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    unlayerCssPlugin(),
    feedProxyPlugin(),
    upstreamProxy(),
    devProxyPrefsPlugin(),
  ],
  // 与 Android Gradle 同源：打包时把 package.json version 写进前端常量
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD__: JSON.stringify(buildStamp()),
  },
  build: {
    target: ['chrome80', 'es2020'],
    cssTarget: 'chrome80',
    // hls.js is loaded only when an HLS video is opened; keep first paint lean.
    chunkSizeWarningLimit: 550,
  },
})

