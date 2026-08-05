export type ProxyMode = 'auto' | 'always' | 'off'

export type ProxyProtocol = 'http' | 'https' | 'socks5' | 'socks5h' | 'web' | 'unknown'

export interface ParsedProxyAddress {
  raw: string
  protocol: ProxyProtocol
  host?: string
  port?: number
  username?: string
  password?: string
  webUrlTemplate?: string
  isValid: boolean
  errorMessage?: string
}

export interface ProxyPrefs {
  /** 代理工作模式：auto=智能分流（推荐，国际源走代理），always=全局代理，off=直连关闭 */
  mode: ProxyMode
  /** 用户填写的代理地址，支持 http/https/socks5/web 反代 */
  proxyUrl: string
  /** 自定义直连白名单域名（不走代理） */
  customBypassDomains: string[]
  /** 自定义强制代理域名 */
  customProxyDomains: string[]
}

export interface ProxyTestResult {
  target: 'intl' | 'cn'
  label: string
  url: string
  success: boolean
  latencyMs: number
  httpStatus?: number
  errorMessage?: string
}
