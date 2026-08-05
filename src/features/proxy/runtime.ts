import { Capacitor } from '@capacitor/core'
import type { ProxyRuntime } from './transport'

export function currentProxyRuntime(): ProxyRuntime {
  return {
    native: Capacitor.isNativePlatform(),
    // Vite 注入；单测 / Node 脚本下可能不存在
    dev: Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV),
  }
}
