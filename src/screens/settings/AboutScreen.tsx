import { useState } from 'react'
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Browser } from '@capacitor/browser'

import { SettingsSection, SettingsShell } from '../../components/SettingsShell'

interface Props {
  onBack: () => void
  updateSupported?: boolean
  updateCaption?: string
  onCheckUpdate?: () => void
}

const ABOUT_CONFIG = {
  appName: '有所闻',
  appEnName: 'News Nook',
  version: __APP_VERSION__,
  build: __APP_BUILD__,
  subtitle: '静态源新闻阅读客户端',
  repoUrl: 'https://github.com/t59688/newsnook',
  wechatArticleUrl: 'https://mp.weixin.qq.com/s/d8fJvLQ4o7wjr_4YBXGgqQ',
  wechatArticleTitle: '[有所闻]',
}

function GithubIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  )
}

async function openExternalUrl(url: string) {
  try {
    await Browser.open({ url })
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function AboutScreen({
  onBack,
  updateSupported = false,
  updateCaption,
  onCheckUpdate,
}: Props) {
  const [copiedRepo, setCopiedRepo] = useState(false)

  const copyRepo = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(ABOUT_CONFIG.repoUrl)
      setCopiedRepo(true)
      setTimeout(() => setCopiedRepo(false), 2000)
    } catch {
      // 忽略剪贴板写入异常
    }
  }

  return (
    <SettingsShell
      title="关于"
      caption={`版本 ${ABOUT_CONFIG.version} · 构建 ${ABOUT_CONFIG.build}`}
      onBack={onBack}
    >
      {/* 顶部概览卡片 */}
      <div className="page-x pt-6 pb-4">
        <div className="relative overflow-hidden rounded-2xl border border-haze bg-gradient-to-b from-ink-raised/70 to-ink p-6 text-center shadow-xs">
          <img
            src="/logo.svg"
            alt=""
            width={72}
            height={72}
            className="mx-auto mb-4 h-[72px] w-[72px] rounded-2xl shadow-xs"
            draggable={false}
          />
          <h2 className="font-display text-[20px] font-medium text-paper">
            {ABOUT_CONFIG.appName}
            <span className="ml-2 font-mono text-[11px] font-normal tracking-widest text-paper-faint">
              {ABOUT_CONFIG.appEnName}
            </span>
          </h2>

          <p className="mt-1 font-mono text-[11px] tracking-[0.12em] text-cinnabar">
            {ABOUT_CONFIG.subtitle}
          </p>

          <p className="mt-3 text-[12px] leading-relaxed text-paper-muted">
            客户端直接请求各媒体源站 RSS / JSON 并解析全文。阅读记录及偏好设置均保存在本地设备。
          </p>
        </div>
      </div>

      {/* 官方渠道与文章 */}
      {updateSupported ? (
        <SettingsSection title="更新">
          <ul className="divide-y divide-haze border-y border-haze bg-ink">
            <li className="transition-colors hover:bg-ink-raised/30 active:bg-ink-raised/50">
              <button
                type="button"
                onClick={() => onCheckUpdate?.()}
                className="page-x flex w-full items-center gap-3.5 py-4 text-left"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-raised/60 text-paper">
                  <RefreshCw size={18} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[14px] font-medium text-paper">检查更新</span>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-paper-faint">
                    {updateCaption ?? `当前 v${ABOUT_CONFIG.version}`}
                  </p>
                </div>
              </button>
            </li>
          </ul>
        </SettingsSection>
      ) : null}

      <SettingsSection title="项目与文档">
        <ul className="divide-y divide-haze border-y border-haze bg-ink">
          {/* 开源仓库 */}
          <li className="transition-colors hover:bg-ink-raised/30 active:bg-ink-raised/50">
            <div
              role="button"
              tabIndex={0}
              onClick={() => openExternalUrl(ABOUT_CONFIG.repoUrl)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openExternalUrl(ABOUT_CONFIG.repoUrl)
              }}
              className="page-x flex w-full cursor-pointer items-center gap-3.5 py-4 text-left"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-raised/60 text-paper">
                <GithubIcon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-paper">Github仓库</span>
                  <span className="inline-flex items-center rounded bg-ink-raised px-1.5 py-0.5 font-mono text-[9px] text-paper-muted">
                    GitHub
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-paper-faint">
                  {ABOUT_CONFIG.repoUrl.replace(/^https?:\/\//, '')}
                </p>
              </div>

              {/* 复制按钮 */}
              <button
                type="button"
                onClick={copyRepo}
                title="复制仓库链接"
                aria-label="复制仓库链接"
                className="shrink-0 rounded-lg p-2 text-paper-faint transition-colors hover:bg-ink-raised hover:text-paper"
              >
                {copiedRepo ? (
                  <Check size={14} strokeWidth={2} className="text-emerald-500" />
                ) : (
                  <Copy size={14} strokeWidth={1.6} />
                )}
              </button>

              <ExternalLink size={14} strokeWidth={1.5} className="shrink-0 text-paper-faint" />
            </div>
          </li>

          {/* 公众号 */}
          <li className="transition-colors hover:bg-ink-raised/30 active:bg-ink-raised/50">
            <button
              type="button"
              onClick={() => openExternalUrl(ABOUT_CONFIG.wechatArticleUrl)}
              className="page-x flex w-full items-center gap-3.5 py-4 text-left"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-raised/60 text-paper">
                <BookOpen size={18} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-paper">公众号</span>
                  <span className="inline-flex items-center rounded bg-cinnabar/10 px-1.5 py-0.5 font-mono text-[9px] text-cinnabar">
                    专栏
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-paper-faint">
                  {ABOUT_CONFIG.wechatArticleTitle}
                </p>
              </div>
              <ExternalLink size={14} strokeWidth={1.5} className="shrink-0 text-paper-faint" />
            </button>
          </li>
        </ul>
      </SettingsSection>

      {/* 架构与特性 */}
      <SettingsSection title="架构特性">
        <div className="page-x grid grid-cols-2 gap-2.5 pt-1">
          <div className="rounded-xl border border-haze bg-ink/60 p-3.5">
            <div className="flex items-center gap-1.5 text-cinnabar">
              <ShieldCheck size={15} strokeWidth={1.75} />
              <span className="font-mono text-[10px] tracking-wider">本地存储 / LOCAL</span>
            </div>
            <p className="mt-1.5 font-display text-[13px] text-paper">数据本地化</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-paper-faint">
              不设服务端数据库，阅读历史、稍后读与配置项均保存在本地存储。
            </p>
          </div>

          <div className="rounded-xl border border-haze bg-ink/60 p-3.5">
            <div className="flex items-center gap-1.5 text-cinnabar">
              <Zap size={15} strokeWidth={1.75} />
              <span className="font-mono text-[10px] tracking-wider">离线优先 / OFFLINE</span>
            </div>
            <p className="mt-1.5 font-display text-[13px] text-paper">离线正文</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-paper-faint">
              浏览过的文章与稍后读自动缓存解析正文，支持无网环境阅读。
            </p>
          </div>

          <div className="rounded-xl border border-haze bg-ink/60 p-3.5">
            <div className="flex items-center gap-1.5 text-cinnabar">
              <Layers size={15} strokeWidth={1.75} />
              <span className="font-mono text-[10px] tracking-wider">静态源表 / REGISTRY</span>
            </div>
            <p className="mt-1.5 font-display text-[13px] text-paper">多源聚合</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-paper-faint">
              内置静态信源注册表与分类管理，支持按需启用、排序与单源浏览。
            </p>
          </div>

          <div className="rounded-xl border border-haze bg-ink/60 p-3.5">
            <div className="flex items-center gap-1.5 text-cinnabar">
              <Sparkles size={15} strokeWidth={1.75} />
              <span className="font-mono text-[10px] tracking-wider">双语翻译 / TRANSLATION</span>
            </div>
            <p className="mt-1.5 font-display text-[13px] text-paper">并发翻译</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-paper-faint">
              支持本地模型与云端 API，分段并发请求并实时渲染对照段落。
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* 底部版权信息 */}
      <footer className="page-x pt-10 pb-4 text-center">
        <p className="font-mono text-[10px] tracking-widest text-paper-faint">
          NEWSNOOK
        </p>
        <p className="mt-1 font-mono text-[9px] text-paper-faint/60">
          Open Sourced under MIT License
        </p>
      </footer>
    </SettingsShell>
  )
}
