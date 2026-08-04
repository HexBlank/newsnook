import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Check,
  Cloud,
  CloudCog,
  Download,
  Eye,
  EyeOff,
  FileText,
  Languages,
  LoaderCircle,
  Smartphone,
  Trash2,
} from 'lucide-react'

import { SettingsHint, SettingsSection, SettingsShell } from '../../components/SettingsShell'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import {
  TRANSLATION_LANGUAGES,
  TRANSLATION_PROVIDERS,
  TRANSLATION_SOURCE_LANGUAGES,
  translationDisplayModeLabel,
  translationProviderLabel,
} from '../../features/translation/config'
import {
  isLocalTranslationAvailable,
  MlKitTranslation,
  type MlKitModelState,
} from '../../features/translation/native'
import { createTranslationProvider, mlKitLanguage } from '../../features/translation/providers'
import type {
  CloudTranslationConfig,
  TranslationLanguage,
  TranslationPrefs,
  TranslationProviderId,
  TranslationSourceLanguage,
} from '../../features/translation/types'

interface Props {
  prefs: TranslationPrefs
  onChange: (prefs: TranslationPrefs) => void
  onBack: () => void
}

type AsyncState = 'idle' | 'working' | 'success' | 'error'

const PROVIDER_ICONS: Record<TranslationProviderId, typeof Cloud> = {
  mlkit: Smartphone,
  google: Languages,
  azure: CloudCog,
  deepl: Cloud,
  deeplx: CloudCog,
}

function Field({
  label,
  value,
  placeholder,
  type = 'text',
  onChange,
  suffix,
}: {
  label: string
  value: string
  placeholder?: string
  type?: 'text' | 'password'
  onChange: (value: string) => void
  suffix?: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] tracking-[0.12em] text-paper-faint">
        {label}
      </span>
      <span className="flex min-h-12 items-center rounded-xl border border-haze bg-ink px-3.5 focus-within:border-cinnabar/55">
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent py-3 text-[13px] text-paper outline-none placeholder:text-paper-faint/65"
        />
        {suffix}
      </span>
    </label>
  )
}

export function TranslationScreen({ prefs, onChange, onBack }: Props) {
  const localTranslationAvailable = isLocalTranslationAvailable()
  const [modelState, setModelState] = useState<MlKitModelState | null>(null)
  const [modelAction, setModelAction] = useState<AsyncState>('idle')
  const [modelMessage, setModelMessage] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testState, setTestState] = useState<AsyncState>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [confirmDeleteModel, setConfirmDeleteModel] = useState(false)

  const autoSource = prefs.sourceLanguage === 'auto'
  const source = prefs.sourceLanguage === 'auto' ? null : mlKitLanguage(prefs.sourceLanguage)
  const target = mlKitLanguage(prefs.targetLanguage)

  useEffect(() => {
    let disposed = false
    setModelState(null)
    if (!localTranslationAvailable || !source) return
    void MlKitTranslation.getModelState({ sourceLanguage: source, targetLanguage: target })
      .then((state) => {
        if (!disposed) setModelState(state)
      })
      .catch(() => {
        if (!disposed) setModelState({ ready: false, downloadedLanguages: [] })
      })
    return () => {
      disposed = true
    }
  }, [localTranslationAvailable, source, target])

  const activeCloud = prefs.provider === 'mlkit' ? null : prefs.cloud[prefs.provider]
  const providerName = translationProviderLabel(prefs.provider)
  const availableProviders = TRANSLATION_PROVIDERS.filter(
    (provider) => provider.id !== 'mlkit' || localTranslationAvailable,
  )
  const apiKeyOptional = prefs.provider === 'deeplx'
  const modelCaption = useMemo(() => {
    if (!localTranslationAvailable) return '当前安装包不包含本地翻译'
    if (autoSource) {
      return '自动检测下将在翻译时按识别结果使用对应语言包；若要预下载，请先指定原文语言'
    }
    if (!modelState) return '正在检查语言包…'
    return modelState.ready ? '语言包已就绪，可离线翻译' : '尚未下载这组语言包'
  }, [autoSource, localTranslationAvailable, modelState])

  const updateCloud = (patch: Partial<CloudTranslationConfig>) => {
    if (prefs.provider === 'mlkit') return
    onChange({
      ...prefs,
      cloud: {
        ...prefs.cloud,
        [prefs.provider]: { ...prefs.cloud[prefs.provider], ...patch },
      },
    })
    setTestState('idle')
    setTestMessage('')
  }

  const downloadModel = async () => {
    if (!source) return
    setModelAction('working')
    setModelMessage('正在通过 Wi‑Fi 下载语言包（通常约 30 MB），请保持页面开启…')
    try {
      const state = await MlKitTranslation.downloadModel({
        sourceLanguage: source,
        targetLanguage: target,
        wifiOnly: true,
      })
      setModelState(state)
      setModelAction('success')
      setModelMessage('语言包下载完成，现在可以离线翻译。')
    } catch (error) {
      setModelAction('error')
      setModelMessage(error instanceof Error ? error.message : '语言包下载失败')
    }
  }

  const deleteModel = async () => {
    if (!source) return
    setModelAction('working')
    setModelMessage('正在删除语言包…')
    try {
      const state = await MlKitTranslation.deleteModel({
        sourceLanguage: source,
        targetLanguage: target,
      })
      setModelState(state)
      setModelAction('idle')
      setModelMessage('语言包已删除。')
    } catch (error) {
      setModelAction('error')
      setModelMessage(error instanceof Error ? error.message : '语言包删除失败')
    }
  }

  const testCloud = async () => {
    if (prefs.provider === 'mlkit') return
    setTestState('working')
    setTestMessage('正在连接…')
    try {
      const provider = createTranslationProvider(prefs.provider, prefs.cloud[prefs.provider])
      const [translated] = await provider.translate({
        texts: ['The world is full of stories.'],
        sourceLanguage: prefs.sourceLanguage,
        targetLanguage: prefs.targetLanguage,
      })
      setTestState('success')
      setTestMessage(`连接成功 · ${translated}`)
    } catch (error) {
      setTestState('error')
      setTestMessage(error instanceof Error ? error.message : '连接失败')
    }
  }

  return (
    <SettingsShell title="翻译" caption={`${providerName} · ${translationDisplayModeLabel(prefs.displayMode)}`} onBack={onBack}>
      <SettingsSection title="译文呈现">
        <ul className="grid grid-cols-2 gap-px border-y border-haze bg-haze">
          {([
            {
              id: 'compare' as const,
              label: '对比翻译',
              caption: '每段原文下方显示译文',
              icon: Languages,
            },
            {
              id: 'replace' as const,
              label: '全文替代',
              caption: '只显示译文，不保留原文',
              icon: FileText,
            },
          ]).map((mode) => {
            const Icon = mode.icon
            const checked = prefs.displayMode === mode.id
            return (
              <li key={mode.id} className="bg-ink">
                <button
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => onChange({ ...prefs, displayMode: mode.id })}
                  className="flex min-h-[104px] w-full flex-col items-start justify-between px-4 py-3.5 text-left"
                >
                  <span className="flex w-full items-center justify-between">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${checked ? 'border-cinnabar/60 bg-cinnabar/15' : 'border-haze bg-paper/5'}`}>
                      <Icon size={17} strokeWidth={1.6} className={checked ? 'text-cinnabar-soft' : 'text-paper-muted'} />
                    </span>
                    {checked && <Check size={15} strokeWidth={2.2} className="text-cinnabar" />}
                  </span>
                  <span>
                    <span className="block text-[14px] text-paper">{mode.label}</span>
                    <span className="mt-1 block text-[10.5px] leading-snug text-paper-faint">{mode.caption}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </SettingsSection>

      <SettingsSection title="语言">
        <div className="page-x grid grid-cols-[1fr_auto_1fr] items-end gap-2 border-y border-haze bg-ink py-4">
          <label>
            <span className="mb-1.5 block font-mono text-[10px] text-paper-faint">原文</span>
            <select
              value={prefs.sourceLanguage}
              onChange={(event) => {
                const sourceLanguage = event.target.value as TranslationSourceLanguage
                const targetLanguage =
                  sourceLanguage !== 'auto' && sourceLanguage === prefs.targetLanguage
                    ? sourceLanguage === 'en'
                      ? 'zh-Hans'
                      : 'en'
                    : prefs.targetLanguage
                onChange({ ...prefs, sourceLanguage, targetLanguage })
              }}
              className="h-12 w-full rounded-xl border border-haze bg-ink-raised px-3 text-[13px] text-paper outline-none"
            >
              {TRANSLATION_SOURCE_LANGUAGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <span className="pb-3 font-mono text-[12px] text-paper-faint">→</span>
          <label>
            <span className="mb-1.5 block font-mono text-[10px] text-paper-faint">译文</span>
            <select
              value={prefs.targetLanguage}
              onChange={(event) => {
                const targetLanguage = event.target.value as TranslationLanguage
                const sourceLanguage =
                  prefs.sourceLanguage !== 'auto' && targetLanguage === prefs.sourceLanguage
                    ? targetLanguage === 'en'
                      ? 'zh-Hans'
                      : 'en'
                    : prefs.sourceLanguage
                onChange({ ...prefs, sourceLanguage, targetLanguage })
              }}
              className="h-12 w-full rounded-xl border border-haze bg-ink-raised px-3 text-[13px] text-paper outline-none"
            >
              {TRANSLATION_LANGUAGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SettingsSection>

      <SettingsSection title="翻译方式">
        <ul className="divide-y divide-haze border-y border-haze md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-haze">
          {availableProviders.map((provider) => {
            const Icon = PROVIDER_ICONS[provider.id]
            const checked = prefs.provider === provider.id
            return (
              <li key={provider.id} className="bg-ink">
                <button
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => {
                    onChange({ ...prefs, provider: provider.id })
                    setTestState('idle')
                    setTestMessage('')
                  }}
                  className="page-x flex min-h-[72px] w-full items-center gap-3 py-3.5 text-left"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-cinnabar/60 bg-cinnabar/15' : 'border-haze bg-paper/5'}`}>
                    <Icon size={17} strokeWidth={1.6} className={checked ? 'text-cinnabar-soft' : 'text-paper-muted'} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-paper">{provider.label}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-paper-faint">{provider.caption}</span>
                  </span>
                  {checked && <Check size={15} strokeWidth={2.2} className="shrink-0 text-cinnabar" />}
                </button>
              </li>
            )
          })}
        </ul>
      </SettingsSection>

      {prefs.provider === 'mlkit' ? (
        <div className="page-x pt-5">
          <div className="mx-auto max-w-3xl rounded-2xl border border-haze bg-ink-raised p-5 shadow-[var(--shadow-lift)]">
            <div className="flex items-start gap-3">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${modelState?.ready ? 'bg-emerald-500' : 'bg-cinnabar'}`} />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[19px] text-paper">离线语言包</span>
                <span className="mt-1 block text-[11.5px] text-paper-faint">{modelCaption}</span>
              </span>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={
                  autoSource ||
                  !localTranslationAvailable ||
                  modelAction === 'working' ||
                  Boolean(modelState?.ready)
                }
                onClick={() => void downloadModel()}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-cinnabar/50 bg-cinnabar/12 px-4 text-[12.5px] text-paper disabled:opacity-35"
              >
                {modelAction === 'working' ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}
                {autoSource ? '请先指定原文' : modelState?.ready ? '已下载' : '使用 Wi‑Fi 下载'}
              </button>
              {!autoSource && modelState?.ready && (
                <button type="button" aria-label="删除语言包" disabled={modelAction === 'working'} onClick={() => setConfirmDeleteModel(true)} className="flex h-12 w-12 items-center justify-center rounded-full border border-haze disabled:opacity-35">
                  <Trash2 size={15} className="text-paper-faint" />
                </button>
              )}
            </div>
            {modelMessage && <p className={`mt-3 text-[11px] leading-relaxed ${modelAction === 'error' ? 'text-cinnabar-soft' : 'text-paper-faint'}`}>{modelMessage}</p>}
          </div>
        </div>
      ) : activeCloud ? (
        <div className="page-x pt-5">
          <div className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-haze bg-ink-raised p-5 shadow-[var(--shadow-lift)]">
            <Field
              label={prefs.provider === 'deeplx' ? 'DEEPLX API URL' : 'API URL'}
              value={activeCloud.endpoint}
              placeholder={prefs.provider === 'deeplx' ? 'https://你的服务/translate' : 'https://…'}
              onChange={(endpoint) => updateCloud({ endpoint })}
            />
            <Field
              label={apiKeyOptional ? '访问令牌（可选）' : 'API KEY'}
              value={activeCloud.apiKey}
              type={showKey ? 'text' : 'password'}
              placeholder={apiKeyOptional ? 'URL 已包含令牌时可留空' : '仅保存在这台设备'}
              onChange={(apiKey) => updateCloud({ apiKey })}
              suffix={
                <button type="button" aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} onClick={() => setShowKey((value) => !value)} className="ml-2 p-2">
                  {showKey ? <EyeOff size={15} className="text-paper-faint" /> : <Eye size={15} className="text-paper-faint" />}
                </button>
              }
            />
            {prefs.provider === 'azure' && (
              <Field label="AZURE REGION（可选）" value={activeCloud.region ?? ''} placeholder="例如 eastasia；全局单服务资源可留空" onChange={(region) => updateCloud({ region })} />
            )}
            <button
              type="button"
              disabled={
                testState === 'working' ||
                !activeCloud.endpoint.trim() ||
                (!apiKeyOptional && !activeCloud.apiKey.trim())
              }
              onClick={() => void testCloud()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-cinnabar/50 bg-cinnabar/12 px-4 text-[12.5px] text-paper disabled:opacity-35"
            >
              {testState === 'working' ? <LoaderCircle size={15} className="animate-spin" /> : <Cloud size={15} />}
              测试连接
            </button>
            {testMessage && <p className={`text-[11px] leading-relaxed ${testState === 'error' ? 'text-cinnabar-soft' : 'text-paper-faint'}`}>{testMessage}</p>}
            {prefs.provider === 'deeplx' && (
              <p className="text-[10.5px] leading-relaxed text-paper-faint">
                可直接粘贴包含路径令牌的完整 /translate 地址；若只填写域名，会自动补上 /translate。
              </p>
            )}
          </div>
        </div>
      ) : null}

      <SettingsHint>
        云服务的费用与配额由你的服务商账号承担，密钥只保存在本机并直接发往所填 API 地址。
      </SettingsHint>

      <ConfirmDialog
        open={confirmDeleteModel}
        title="删除语言包？"
        message="删除当前原文与译文语言包后，本地翻译需要重新下载才能使用。"
        confirmLabel="删除"
        danger
        onCancel={() => setConfirmDeleteModel(false)}
        onConfirm={() => {
          setConfirmDeleteModel(false)
          void deleteModel()
        }}
      />
    </SettingsShell>
  )
}
