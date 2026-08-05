import assert from 'node:assert/strict'

import { normalizeTranslationPrefs, TRANSLATION_PROVIDERS } from '../src/features/translation/config'
import { BergamotProvider } from '../src/features/translation/providers'
import { isLocalTranslationProviderId } from '../src/features/translation/types'

assert.ok(TRANSLATION_PROVIDERS.some((provider) => provider.id === 'bergamot'))
assert.equal(isLocalTranslationProviderId('bergamot'), true)
assert.equal(isLocalTranslationProviderId('google'), false)

const normalized = normalizeTranslationPrefs({ provider: 'bergamot' })
assert.equal(normalized.provider, 'bergamot')

const provider = new BergamotProvider()
assert.equal(provider.id, 'bergamot')

let thrown = false
try {
  await provider.translate({
    texts: ['Hello'],
    sourceLanguage: 'en',
    targetLanguage: 'zh-Hans',
  })
} catch (error) {
  thrown = true
  assert.match(String(error), /Bergamot|安装包|插件|原生/)
}
assert.equal(thrown, true)

console.log('bergamot-provider: ok')
