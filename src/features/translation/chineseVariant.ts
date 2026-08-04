import { Converter as fromSimplified } from 'opencc-js/cn2t'
import { Converter as fromTraditional } from 'opencc-js/t2cn'

import type { TranslationLanguage } from './types'

const toSimplified = fromTraditional({ from: 'tw', to: 'cn' })
const toTraditional = fromSimplified({ from: 'cn', to: 'tw' })

/** 目标为简/繁中文时，将译文规范到对应字形（覆盖 ML Kit 等同码导致不转换的情况）。 */
export function normalizeChineseVariant(
  text: string,
  targetLanguage: TranslationLanguage,
): string {
  if (targetLanguage === 'zh-Hans') return toSimplified(text)
  if (targetLanguage === 'zh-Hant') return toTraditional(text)
  return text
}

/**
 * 在已判定为中文的样本中区分简繁：统计「仅繁体形」与「仅简体形」字符。
 * 繁体字经 t2s 会变；简体字经 s2t 会变。
 */
export function classifyChineseVariant(sample: string): 'zh-Hans' | 'zh-Hant' {
  let traditionalMarks = 0
  let simplifiedMarks = 0

  for (const char of sample) {
    if (!/\p{Script=Han}/u.test(char)) continue
    if (toSimplified(char) !== char) traditionalMarks += 1
    if (toTraditional(char) !== char) simplifiedMarks += 1
  }

  if (traditionalMarks >= 2 && traditionalMarks > simplifiedMarks) return 'zh-Hant'
  if (traditionalMarks > 0 && simplifiedMarks === 0) return 'zh-Hant'
  return 'zh-Hans'
}
