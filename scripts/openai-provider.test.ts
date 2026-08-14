import assert from 'node:assert/strict'
import { normalizeTranslationPrefs } from '../src/features/translation/config'
import {
  assertOpenAiConfig,
  cleanOpenAiTranslation,
  extractOpenAiChatContent,
  normalizeOpenAiBaseUrl,
} from '../src/features/translation/openai'
import {
  openAiTranslationSystemPrompt,
  openAiTranslationUserPrompt,
} from '../src/features/translation/prompts'
import { OpenAiProvider } from '../src/features/translation/providers'

const empty = normalizeTranslationPrefs({})
assert.equal(empty.cloud.openai?.endpoint, 'https://api.openai.com/v1')
assert.equal(empty.cloud.openai?.apiKey, '')
assert.equal(empty.cloud.openai?.model ?? '', '')
assert.equal(empty.cloud.openai.concurrency, 2)

const saved = normalizeTranslationPrefs({
  provider: 'openai',
  cloud: {
    openai: {
      apiKey: 'sk-test',
      endpoint: 'https://gateway.example/v1/',
      model: 'gpt-4o-mini',
    },
  },
})
assert.equal(saved.provider, 'openai')
assert.equal(saved.cloud.openai.apiKey, 'sk-test')
assert.equal(saved.cloud.openai.endpoint, 'https://gateway.example/v1/')
assert.equal(saved.cloud.openai.model, 'gpt-4o-mini')

const withConcurrency = normalizeTranslationPrefs({
  cloud: {
    openai: {
      apiKey: 'k',
      endpoint: 'https://api.openai.com/v1',
      model: 'm',
      concurrency: 5,
    },
  },
})
assert.equal(withConcurrency.cloud.openai.concurrency, 5)

const clampedHigh = normalizeTranslationPrefs({
  cloud: { openai: { apiKey: '', endpoint: 'https://api.openai.com/v1', concurrency: 99 } },
})
assert.equal(clampedHigh.cloud.openai.concurrency, 2)

const clampedLow = normalizeTranslationPrefs({
  cloud: { openai: { apiKey: '', endpoint: 'https://api.openai.com/v1', concurrency: 0 } },
})
assert.equal(clampedLow.cloud.openai.concurrency, 2)

const clampedFloat = normalizeTranslationPrefs({
  cloud: { openai: { apiKey: '', endpoint: 'https://api.openai.com/v1', concurrency: 3.7 } },
})
assert.equal(clampedFloat.cloud.openai.concurrency, 2)

assert.equal(normalizeOpenAiBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1')
assert.equal(
  normalizeOpenAiBaseUrl('https://api.openai.com/v1/chat/completions'),
  'https://api.openai.com/v1',
)
assert.equal(
  normalizeOpenAiBaseUrl('https://gateway.example/v1/chat/completions/'),
  'https://gateway.example/v1',
)

assert.equal(cleanOpenAiTranslation('  你好世界  '), '你好世界')
assert.equal(cleanOpenAiTranslation('"你好世界"'), '你好世界')
assert.equal(cleanOpenAiTranslation('```\n你好世界\n```'), '你好世界')
assert.equal(cleanOpenAiTranslation('「你好」'), '「你好」')
assert.equal(cleanOpenAiTranslation('“你好”'), '你好')
assert.equal(cleanOpenAiTranslation('<source_text>关于</source_text>'), '关于')
assert.equal(cleanOpenAiTranslation('<translation>关于</translation>'), '关于')
assert.equal(cleanOpenAiTranslation('Translation: 关于'), '关于')
assert.equal(cleanOpenAiTranslation('译文：关于'), '关于')
assert.equal(cleanOpenAiTranslation('翻译结果：关于我们'), '关于我们')
assert.equal(
  cleanOpenAiTranslation('最终以69票的优势获胜。</center>'),
  '最终以69票的优势获胜。',
)
assert.equal(
  cleanOpenAiTranslation(
    '最终赢得 279 票。</target_text>< | hy_end__of__translation | >',
  ),
  '最终赢得 279 票。',
)
assert.equal(
  cleanOpenAiTranslation('<target_text>关于我们</target_text>'),
  '关于我们',
)

assert.equal(
  extractOpenAiChatContent(
    JSON.stringify({ choices: [{ message: { content: '手机端字符串体' } }] }),
  ),
  '手机端字符串体',
)
assert.equal(
  extractOpenAiChatContent({
    choices: [{ message: { content: [{ type: 'text', text: '分段' }, { type: 'text', text: '内容' }] } }],
  }),
  '分段内容',
)
assert.equal(extractOpenAiChatContent('not-json'), null)

assert.throws(
  () => assertOpenAiConfig({ apiKey: '', endpoint: 'https://api.openai.com/v1', model: 'x' }),
  /API Key/,
)
assert.throws(
  () => assertOpenAiConfig({ apiKey: 'k', endpoint: 'https://api.openai.com/v1', model: '' }),
  /Model/,
)
assert.throws(
  () => assertOpenAiConfig({ apiKey: 'k', endpoint: 'http://insecure.example/v1', model: 'x' }),
  /HTTPS/,
)

const systemAuto = openAiTranslationSystemPrompt('auto', 'zh-Hans', 'paragraph')
assert.match(systemAuto, /translate any source text provided by the user into Simplified Chinese/)
assert.match(systemAuto, /senior professional translation expert/)
assert.match(systemAuto, /Context & Domain Adaptation/)
assert.match(systemAuto, /Tone & Style Fidelity/)
assert.match(systemAuto, /Native Idiomaticity/)
assert.match(systemAuto, /Neutral & Objective Stance/)
assert.match(systemAuto, /Output the translation directly without any explanations/)
assert.match(systemAuto, /Do not wrap the translation in XML or HTML tags/)
assert.doesNotMatch(systemAuto, /信、达、雅|信达雅/)
assert.doesNotMatch(systemAuto, /from English/i)
assert.doesNotMatch(systemAuto, /Tehran|德黑兰|真主党|信达雅/)

const systemEn = openAiTranslationSystemPrompt('auto', 'en', 'paragraph')
assert.match(systemEn, /into English/)
assert.doesNotMatch(systemEn, /Simplified Chinese/)

const systemHeadline = openAiTranslationSystemPrompt('en', 'zh-Hans', 'headline')
assert.equal(systemHeadline, openAiTranslationSystemPrompt('en', 'zh-Hans', 'paragraph'))

const userHeadline = openAiTranslationUserPrompt('Hello world', 'zh-Hans', 'headline')
assert.match(userHeadline, /<source_text>\nHello world\n<\/source_text>/)
assert.equal(userHeadline, openAiTranslationUserPrompt('Hello world', 'zh-Hans', 'paragraph'))
assert.match(userHeadline, /^原文：/)

const userBody = openAiTranslationUserPrompt('Hello world', 'zh-Hans', 'paragraph')
assert.match(userBody, /原文：/)
assert.doesNotMatch(userBody, /信达雅|literal/i)

const originalFetch = globalThis.fetch
const requests: { url: string; body: Record<string, unknown>; authorization: string | null }[] = []

globalThis.fetch = async (input, init) => {
  const headers = new Headers(init?.headers)
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>
  requests.push({
    url: String(input),
    body,
    authorization: headers.get('Authorization'),
  })
  const messages = body.messages as { role: string; content: string }[]
  const user = messages.find((m) => m.role === 'user')?.content ?? ''
  // 提取 <source_text> 中的文本
  const match = user.match(/<source_text>\n([\s\S]*?)\n<\/source_text>/)
  const text = match ? match[1] : user
  return Response.json({
    choices: [{ message: { content: `AI:${text}` } }],
  })
}

const provider = new OpenAiProvider({
  apiKey: 'sk-test',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
})

const batchIndexes: number[] = []
const result = await provider.translate({
  texts: ['Hello', 'World'],
  sourceLanguage: 'en',
  targetLanguage: 'zh-Hans',
  onBatch: (_batch, startIndex) => {
    batchIndexes.push(startIndex)
  },
})

assert.deepEqual(result, ['AI:Hello', 'AI:World'])
assert.equal(requests.length, 2)
assert.equal(requests[0].url, 'https://api.openai.com/v1/chat/completions')
assert.equal(requests[0].authorization, 'Bearer sk-test')
assert.equal(requests[0].body.model, 'gpt-4o-mini')
assert.equal(requests[0].body.stream, false)
assert.equal(requests[0].body.temperature, 0.6)
assert.ok(Array.isArray(requests[0].body.messages))
assert.deepEqual(
  batchIndexes.sort((a, b) => a - b),
  [0, 1],
)

requests.length = 0
const mixed = await provider.translate({
  texts: ['Market rallies on rate cut hopes', 'Investors bought shares after the announcement.'],
  textKinds: ['headline', 'paragraph'],
  sourceLanguage: 'en',
  targetLanguage: 'zh-Hans',
})
assert.deepEqual(mixed, [
  'AI:Market rallies on rate cut hopes',
  'AI:Investors bought shares after the announcement.',
])
assert.equal(requests.length, 2)
const sys0 = (requests[0].body.messages as { role: string; content: string }[]).find(
  (m) => m.role === 'system',
)?.content
const sys1 = (requests[1].body.messages as { role: string; content: string }[]).find(
  (m) => m.role === 'system',
)?.content
assert.match(String(sys0), /senior professional translation expert/)
assert.match(String(sys0), /Output the translation directly/)
assert.equal(sys0, sys1)
assert.doesNotMatch(String(sys1), /信、达、雅|信达雅/)
assert.equal(requests[0].body.temperature, 0.6)

await assert.rejects(
  () =>
    provider.translate({
      texts: ['a', 'b'],
      textKinds: ['headline'],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hans',
    }),
  /textKinds/,
)

await assert.rejects(
  () =>
    new OpenAiProvider({
      apiKey: 'sk',
      endpoint: 'https://api.openai.com/v1',
      model: '',
    }).translate({ texts: ['x'], sourceLanguage: 'en', targetLanguage: 'zh-Hans' }),
  /Model/,
)

globalThis.fetch = async () =>
  Response.json({ error: { message: 'quota exceeded' } }, { status: 429 })
await assert.rejects(
  () =>
    provider.translate({ texts: ['x'], sourceLanguage: 'en', targetLanguage: 'zh-Hans' }),
  /AI 翻译：quota exceeded/,
)

let active = 0
let maxActive = 0
const many = Array.from({ length: 10 }, (_, i) => `P${i}`)
globalThis.fetch = async (_input, init) => {
  active++
  maxActive = Math.max(maxActive, active)
  const body = JSON.parse(String(init?.body)) as {
    messages: { role: string; content: string }[]
  }
  await new Promise((r) => setTimeout(r, 15))
  active--
  const user = body.messages.find((m) => m.role === 'user')?.content ?? ''
  return Response.json({ choices: [{ message: { content: user } }] })
}

const providerDefault = new OpenAiProvider({
  apiKey: 'sk-test',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
})
await providerDefault.translate({ texts: many, sourceLanguage: 'en', targetLanguage: 'zh-Hans' })
assert.ok(maxActive <= 2, `default max concurrent ${maxActive}`)

active = 0
maxActive = 0
const providerFive = new OpenAiProvider({
  apiKey: 'sk-test',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  concurrency: 5,
})
await providerFive.translate({ texts: many, sourceLanguage: 'en', targetLanguage: 'zh-Hans' })
assert.ok(maxActive <= 5, `custom max concurrent ${maxActive}`)
assert.ok(maxActive >= 2, `expected some parallelism, got ${maxActive}`)

globalThis.fetch = originalFetch

console.log('openai-provider: ok')
