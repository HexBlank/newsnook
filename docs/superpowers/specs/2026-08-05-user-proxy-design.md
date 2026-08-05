# 用户代理（网络与代理）设计

> 日期：2026-08-05  
> 范围：设置页代理偏好、分流规则、Web / Android 传输层、开发态 Vite 上游代理  
> 不改：系统 VPN 替代、iOS、自建公网 SOCKS 中转、CORS 防盗链 Referer/UA 语义

## 1. 目标

让「网络与代理」设置真正影响应用内请求：

1. **智能分流 / 全局 / 关闭** 按域名与信源生效
2. **Web 反向代理** 在浏览器与 App 均可通过 URL 改写工作
3. **HTTP / SOCKS5** 在 Android App 经 OkHttp 隧道工作；开发态浏览器经 Vite 上游代理工作
4. **生产静态网页** 明确不支持 HTTP/SOCKS，UI 给出提示

## 2. 能力矩阵

| 运行时 | HTTP/HTTPS 代理 | SOCKS5 | Web 反向代理 |
|--------|-----------------|--------|--------------|
| 浏览器（生产静态站） | 不支持（提示仅 App） | 不支持 | 支持 |
| 浏览器 + `npm run dev` | Vite `/api/*` 上游经代理 | 同上 | 支持 |
| Android App | OkHttp `Proxy.HTTP` | OkHttp `Proxy.SOCKS` | URL 改写后原生 HTTP |
| iOS | 不在范围 | — | — |

## 3. 传输决策

统一出口 `resolveProxyTransport(targetUrl, sourceMeta?, prefs, runtime)`：

| kind | 含义 |
|------|------|
| `direct` | 不经用户代理 |
| `web-wrap` | `wrapProxiedUrl` 后直连包装地址 |
| `native-tunnel` | 原 URL + 隧道参数，走 `ProxiedHttp` 插件 |
| `dev-vite` | 浏览器开发态：仍请求 `/api/*`，由 Vite 按 prefs 连上游 |
| `unsupported` | 生产网页填了 HTTP/SOCKS；请求回退 CORS 代理且不宣称已走用户代理 |

运行时由调用方注入：`native`（Capacitor）、`dev`（`import.meta.env.DEV`）。

## 4. 组件边界

- `features/proxy/service.ts`：解析、分流、URL 包装、连通性测试
- `features/proxy/transport.ts`：运行时 × 协议 → transport kind
- `features/proxy/nodeAgent.ts`：Vite/Node 侧构造 HTTP/SOCKS agent（不进客户端 bundle）
- `features/proxy/nativeHttp.ts`：Capacitor `ProxiedHttp` TS 封装
- `lib/http.ts` / `mediaFetch.ts` / `normalizeImages.ts`：唯一消费 transport 的抓取出口
- Android `ProxiedHttpPlugin`：OkHttp + 可选 Proxy
- Vite：`POST /api/dev-proxy-prefs` 同步 prefs；`fetchUpstream` 应用 agent

## 5. 图片

- 浏览器开发态：继续 `/api/image`（Vite 可带上游代理）；Web 反代时改写为包装 URL
- App + `native-tunnel`：阅读器 `<img>` 经插件拉字节后换 `blob:`（WebView 不会走 OkHttp）
- 国内直连图保持原 URL

## 6. 安全

- 代理账号仅存本机 preferences，不写日志
- Vite prefs 同步仅开发服务器内存，不落盘
- 不改变现有任意 URL 代理的 SSRF 边界（仍仅本地开发使用）

## 7. 非目标

- iOS
- 为生产网页部署公网 SOCKS/HTTP 中转
- 替换或检测系统 VPN；`mode: off` = 应用内完全直连
- 改变 Vite 对网易 / 微信图床的 Referer 与 UA 特例
