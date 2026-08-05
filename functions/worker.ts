import { onRequest } from './api/[[path]].ts'

export interface Env {
  ASSETS?: {
    fetch: (request: Request | string, init?: RequestInit) => Promise<Response>
  }
}

export interface ExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void
  passThroughOnException?: () => void
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // 1. /api/* 请求交由反向代理逻辑处理
    if (url.pathname.startsWith('/api/')) {
      const pathSegments = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
      return onRequest({
        request,
        params: { path: pathSegments },
        functionPath: url.pathname,
        waitUntil: ctx?.waitUntil ? ctx.waitUntil.bind(ctx) : () => {},
        next: async () =>
          env.ASSETS
            ? env.ASSETS.fetch(request)
            : new Response('Not Found', { status: 404 }),
        env,
        data: {},
      })
    }

    // 2. 其余静态资源和前端 SPA 页面由 dist 静态资产服务
    if (env.ASSETS) {
      return env.ASSETS.fetch(request)
    }

    return new Response('Asset binding ASSETS not found', { status: 500 })
  },
}
