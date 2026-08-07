import type {
  TranslationLanguage,
  TranslationSourceLanguage,
  TranslationTextKind,
} from './types'

/** 写入通用中文提示词时的目标语名称（不预设译文必须是中文）。 */
const LANGUAGE_LABELS: Record<TranslationLanguage, string> = {
  en: '英语',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁体中文',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
}

export function openAiLanguageLabel(code: TranslationLanguage): string {
  return LANGUAGE_LABELS[code]
}

/**
 * 信息流标题与正文共用的通用翻译提示（不绑定中文「信达雅」或特定语对）。
 * `_sourceLanguage` / `_kind` 保留签名兼容，内容不再分支。
 */
export function openAiTranslationSystemPrompt(
  _sourceLanguage: TranslationSourceLanguage,
  targetLanguage: TranslationLanguage,
  _kind: TranslationTextKind = 'paragraph',
): string {
  const target = openAiLanguageLabel(targetLanguage)
  return [
    `请将以下内容翻译为${target}。`,
    '',
    '翻译前，先根据全文语境自动识别原文的文本类型、专业领域、具体场景、作者语气、写作目的和目标读者，并据此选择最合适的翻译风格。',
    '',
    '翻译时以准确传达原意为前提，不拘泥于原文句式和字面对应；充分考虑目标语言的表达习惯、文化语境、专业术语、固定译名及母语者的阅读习惯，对语序、句式、措辞和修辞进行必要调整。',
    '',
    '准确处理人名、地名、机构、术语、习语、隐喻、转喻、双关及上下文指代；已有公认译法的专有名词使用标准译名，不确定时不要臆造。',
    '',
    '最终译文应达到母语级水准：准确、自然、流畅，符合原文所属场景和文体，并尽可能保留原文的语气、力度、节奏和风格，让读者感觉文章本就是用目标语言写成的，而非翻译所得。',
    '',
    '只输出最终译文，不解释翻译过程。',
  ].join('\n')
}

export function openAiTranslationUserPrompt(
  text: string,
  _targetLanguage: TranslationLanguage,
  _kind: TranslationTextKind = 'paragraph',
): string {
  return `原文：\n<source_text>\n${text}\n</source_text>`
}
