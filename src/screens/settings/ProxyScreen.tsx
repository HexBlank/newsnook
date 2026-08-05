import { useId, useMemo, useState } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  LoaderCircle,
  Shield,
  XCircle,
  Zap,
} from 'lucide-react'

import { SettingsHint, SettingsSection, SettingsShell } from '../../components/SettingsShell'
import { proxyModeLabel, proxyProtocolLabel } from '../../features/proxy/config'
import { currentProxyRuntime } from '../../features/proxy/runtime'
import { parseProxyAddress } from '../../features/proxy/service'
import { testProxyConnection } from '../../features/proxy/testConnection'
import { browserTunnelUnsupportedReason, isTunnelProtocol } from '../../features/proxy/transport'
import type { ProxyMode, ProxyPrefs, ProxyTestResult } from '../../features/proxy/types'

interface Props {
  prefs: ProxyPrefs
  onChange: (prefs: ProxyPrefs) => void
  onBack: () => void
}

const MODES: {
  id: ProxyMode
  label: string
  caption: string
  icon: typeof Zap
}[] = [
  {
    id: 'auto',
    label: '智能分流',
    caption: '推荐 · 国际源走代理，国内源直连',
    icon: Zap,
  },
  {
    id: 'always',
    label: '全局代理',
    caption: '全部信源与正文抓取均经代理',
    icon: Globe,
  },
  {
    id: 'off',
    label: '直连关闭',
    caption: '不用应用内代理 · 适合系统 VPN',
    icon: Shield,
  },
]

export function ProxyScreen({ prefs, onChange, onBack }: Props) {
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<ProxyTestResult[] | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const proxyInputId = useId()

  const parsedAddress = useMemo(() => parseProxyAddress(prefs.proxyUrl), [prefs.proxyUrl])
  const runtime = useMemo(() => currentProxyRuntime(), [])
  const tunnelUnsupportedHint = useMemo(
    () => browserTunnelUnsupportedReason(prefs, runtime),
    [prefs, runtime],
  )
  const showDevTunnelNote =
    !runtime.native &&
    runtime.dev &&
    parsedAddress.isValid &&
    isTunnelProtocol(parsedAddress.protocol)

  const caption = useMemo(() => {
    const mode = proxyModeLabel(prefs.mode)
    if (prefs.mode === 'off') return `${mode} · 不经应用代理`
    if (!prefs.proxyUrl.trim()) return `${mode} · 尚未填写地址`
    if (!parsedAddress.isValid) return `${mode} · 地址格式需检查`
    if (tunnelUnsupportedHint) return `${mode} · 网页不支持此协议`
    return `${mode} · ${proxyProtocolLabel(parsedAddress.protocol)}`
  }, [parsedAddress, prefs.mode, prefs.proxyUrl, tunnelUnsupportedHint])

  const handleModeSelect = (mode: ProxyMode) => {
    onChange({ ...prefs, mode })
  }

  const handleUrlChange = (url: string) => {
    onChange({ ...prefs, proxyUrl: url })
    setTestResults(null)
  }

  const splitDomains = (text: string) =>
    [
      ...new Set(
        text
          .split(/[\n,，;\s]+/)
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean),
      ),
    ]

  const runTest = async () => {
    setTesting(true)
    setTestResults(null)
    try {
      setTestResults(await testProxyConnection(prefs))
    } finally {
      setTesting(false)
    }
  }

  return (
    <SettingsShell title="网络与代理" caption={caption} onBack={onBack}>
      <SettingsSection title="工作模式">
        <ul className="divide-y divide-haze border-y border-haze">
          {MODES.map((item) => {
            const checked = prefs.mode === item.id
            const Icon = item.icon
            return (
              <li key={item.id} className="bg-ink">
                <button
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => handleModeSelect(item.id)}
                  className="page-x flex w-full items-center gap-3 py-4 text-left"
                >
                  <span
                    className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                      checked ? 'border-cinnabar/60 bg-cinnabar/15' : 'border-haze bg-paper/5'
                    }`}
                  >
                    <Icon
                      size={15}
                      strokeWidth={1.6}
                      className={checked ? 'text-cinnabar-soft' : 'text-paper-muted'}
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] text-paper">{item.label}</span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-paper-faint">
                      {item.caption}
                    </span>
                  </span>

                  {checked && (
                    <Check size={15} strokeWidth={2.2} className="shrink-0 text-cinnabar" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </SettingsSection>

      {prefs.mode !== 'off' && (
        <SettingsSection title="代理地址">
          <div className="page-x">
            <div className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-haze bg-ink-raised p-5 shadow-[var(--shadow-lift)]">
              <label htmlFor={proxyInputId} className="block">
                <span className="mb-1.5 flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.12em] text-paper-faint">
                  <span>PROXY URL</span>
                  {prefs.proxyUrl.trim() ? (
                    <span
                      className={
                        parsedAddress.isValid ? 'text-emerald-500' : 'text-cinnabar-soft'
                      }
                    >
                      {parsedAddress.isValid
                        ? proxyProtocolLabel(parsedAddress.protocol)
                        : parsedAddress.errorMessage || '格式需检查'}
                    </span>
                  ) : (
                    <span>留空则无法启用代理</span>
                  )}
                </span>
                <span className="flex min-h-12 items-center rounded-xl border border-haze bg-ink px-3.5 focus-within:border-cinnabar/55">
                  <input
                    id={proxyInputId}
                    type="text"
                    value={prefs.proxyUrl}
                    placeholder="http://127.0.0.1:7890"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent py-3 font-mono text-[13px] text-paper outline-none placeholder:text-paper-faint/65"
                  />
                </span>
              </label>

              <p className="text-[10.5px] leading-relaxed text-paper-faint">
                支持{' '}
                <code className="text-paper-muted">http://host:port</code>
                、{' '}
                <code className="text-paper-muted">socks5://user:pass@host:port</code>
                （仅 Android App
                {runtime.dev ? '；开发态网页经 Vite 上游代理' : ''}），以及{' '}
                <code className="text-paper-muted">https://proxy/?url=</code> 反向代理（网页与
                App 均可）。省略协议时按 HTTP 处理。
              </p>

              {tunnelUnsupportedHint ? (
                <p className="rounded-xl border border-cinnabar/35 bg-cinnabar/10 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-cinnabar-soft">
                  {tunnelUnsupportedHint}
                </p>
              ) : null}

              {showDevTunnelNote ? (
                <p className="rounded-xl border border-haze bg-paper/5 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-paper-muted">
                  开发服务器将把需代理的上游请求经此 HTTP/SOCKS 发出；生产静态网页不支持，请改用 Web
                  反向代理或系统 VPN。
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => void runTest()}
                disabled={testing || !prefs.proxyUrl.trim()}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-cinnabar/50 bg-cinnabar/12 px-4 text-[12.5px] text-paper disabled:opacity-35"
              >
                {testing ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : null}
                {testing ? '测试中…' : '测试连通性'}
              </button>

              {testResults && (
                <ul className="divide-y divide-haze border-t border-haze pt-1">
                  {testResults.map((res) => (
                    <li
                      key={`${res.target}-${res.label}`}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <span className="min-w-0 truncate text-[12.5px] text-paper-muted">
                        {res.label}
                      </span>
                      {res.success ? (
                        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-emerald-500">
                          <CheckCircle2 size={13} strokeWidth={1.8} />
                          {res.latencyMs}ms
                        </span>
                      ) : (
                        <span className="flex max-w-[46%] shrink-0 items-center gap-1.5 truncate font-mono text-[11px] text-cinnabar-soft">
                          <XCircle size={13} strokeWidth={1.8} className="shrink-0" />
                          <span className="truncate">{res.errorMessage || '超时'}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </SettingsSection>
      )}

      {prefs.mode === 'auto' && (
        <SettingsSection title="高级分流">
          <div className="border-y border-haze bg-ink">
            <button
              type="button"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((value) => !value)}
              className="page-x flex w-full items-center gap-3 py-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] text-paper">自定义域名规则</span>
                <span className="mt-0.5 block font-mono text-[10px] text-paper-faint">
                  直连白名单与强制代理域名
                </span>
              </span>
              {showAdvanced ? (
                <ChevronUp size={16} strokeWidth={1.6} className="shrink-0 text-paper-faint" />
              ) : (
                <ChevronDown size={16} strokeWidth={1.6} className="shrink-0 text-paper-faint" />
              )}
            </button>

            {showAdvanced && (
              <div className="page-x space-y-4 border-t border-haze pb-5 pt-4">
                <label className="block">
                  <span className="mb-1.5 block font-mono text-[10px] tracking-[0.12em] text-paper-faint">
                    直连白名单
                  </span>
                  <textarea
                    rows={2}
                    value={prefs.customBypassDomains.join(', ')}
                    placeholder="example.com, mycdn.org"
                    onChange={(e) =>
                      onChange({ ...prefs, customBypassDomains: splitDomains(e.target.value) })
                    }
                    className="w-full rounded-xl border border-haze bg-ink-raised px-3.5 py-3 text-[12.5px] leading-relaxed text-paper outline-none focus:border-cinnabar/55 placeholder:text-paper-faint/65"
                  />
                  <span className="mt-1.5 block text-[10.5px] text-paper-faint">
                    这些域名始终直连，逗号或换行分隔
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1.5 block font-mono text-[10px] tracking-[0.12em] text-paper-faint">
                    强制代理
                  </span>
                  <textarea
                    rows={2}
                    value={prefs.customProxyDomains.join(', ')}
                    placeholder="blocked-site.com"
                    onChange={(e) =>
                      onChange({ ...prefs, customProxyDomains: splitDomains(e.target.value) })
                    }
                    className="w-full rounded-xl border border-haze bg-ink-raised px-3.5 py-3 text-[12.5px] leading-relaxed text-paper outline-none focus:border-cinnabar/55 placeholder:text-paper-faint/65"
                  />
                  <span className="mt-1.5 block text-[10.5px] text-paper-faint">
                    这些域名始终走代理，逗号或换行分隔
                  </span>
                </label>
              </div>
            )}
          </div>
        </SettingsSection>
      )}

      <SettingsHint>
        工作模式与地址会保存在本机。智能分流只影响应用内的信源与正文请求；系统已开启 VPN / TUN
        时可直接选「直连关闭」。
      </SettingsHint>
    </SettingsShell>
  )
}
