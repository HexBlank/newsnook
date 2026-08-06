import type { TranslationLanguage, TranslationSourceLanguage } from './types'

const LANGUAGE_LABELS: Record<TranslationLanguage, string> = {
  en: 'English',
  'zh-Hans': 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
}

export function openAiLanguageLabel(code: TranslationLanguage): string {
  return LANGUAGE_LABELS[code]
}

export function openAiTranslationSystemPrompt(
  sourceLanguage: TranslationSourceLanguage,
  targetLanguage: TranslationLanguage,
): string {
  const target = openAiLanguageLabel(targetLanguage)
  const direction =
    sourceLanguage === 'auto'
      ? `Detect the source language and translate into ${target}.`
      : `Translate from ${openAiLanguageLabel(sourceLanguage)} into ${target}.`

  return [
    'You are a professional news/article translator for a mobile RSS reader.',
    direction,
    'Output ONLY the translation. No preamble, labels, quotes, markdown fences, or explanations.',
    'Preserve proper nouns, numbers, URLs, email addresses, and inline code as appropriate.',
    'Match a clear journalistic tone suitable for news body text.',
    'If the input is empty or has no translatable content, return it unchanged.',
  ].join(' ')
}
