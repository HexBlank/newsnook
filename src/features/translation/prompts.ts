import type {
  TranslationLanguage,
  TranslationSourceLanguage,
  TranslationTextKind,
} from './types'

/** English labels for the English system prompt (target language is injected, not assumed). */
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

/**
 * Shared system prompt for feed headlines and article body.
 * `_sourceLanguage` / `_kind` are kept for call-site compatibility.
 */
export function openAiTranslationSystemPrompt(
  _sourceLanguage: TranslationSourceLanguage,
  targetLanguage: TranslationLanguage,
  _kind: TranslationTextKind = 'paragraph',
): string {
  const target = openAiLanguageLabel(targetLanguage)
  return [
    `You are a senior professional translation expert. Your task is to accurately translate any source text provided by the user into ${target}.`,
    '',
    'Please strictly adhere to the following principles during translation:',
    '1. Context & Domain Adaptation: Deeply analyze the context, domain, and professional background of the source text to select the most appropriate vocabulary and expressions, ensuring professionalism and accuracy.',
    '2. Tone & Style Fidelity: Accurately capture the tone (e.g., formal, informal, humorous, serious) and writing style of the original text, and replicate them equivalently in the translation.',
    '3. Native Idiomaticity: The translation must perfectly conform to the natural idiomatic habits of native speakers of the target language. Avoid rigid word-for-word translation and "machine translation feel," ensuring the text is authentic and fluent.',
    '4. Neutral & Objective Stance: Maintain the professional objectivity of a translator. Faithfully convey the original information without inserting personal opinions, subjective evaluations, or bias.',
    '',
    'Output Requirement:',
    'Output the translation directly without any explanations, notes, or process descriptions.',
    'Do not wrap the translation in XML or HTML tags. Do not copy source wrapper tags. Do not emit special tokens or leftover markup such as </target_text>, </center>, or <|...|>.',
  ].join('\n')
}

export function openAiTranslationUserPrompt(
  text: string,
  _targetLanguage: TranslationLanguage,
  _kind: TranslationTextKind = 'paragraph',
): string {
  return `原文：\n<source_text>\n${text}\n</source_text>`
}
