import assert from 'node:assert/strict'

import {
  buildPageLeadHtml,
  isSoftNotFoundHtml,
} from '../src/lib/pageLead'
import { stripEmbedNoise } from '../src/lib/sanitize'

const soft404 = `
<div class="a-loader-error">
  <div class="a-loader-error__content__title">Page not found</div>
  <p class="a-loader-error__content__message">The content you requested does not exist or is not available anymore.</p>
</div>
`
assert.equal(isSoftNotFoundHtml(soft404), true)
assert.equal(
  isSoftNotFoundHtml('<p>Almost all of the migrants who entered Ceuta had left.</p>'),
  false,
)

const page = `
<html><head>
<meta property="og:title" content="Ceuta enclave almost back to normal" />
<meta property="og:description" content="Almost all of the migrants who entered Spain’s enclave of Ceuta had left by Saturday, according to officials." />
</head><body>
${soft404}
<p class="t-content__chapo">Almost all of the migrants who entered Spain’s enclave of Ceuta had left by Saturday, according to officials.</p>
</body></html>
`

const lead = buildPageLeadHtml(page)
assert.match(lead, /Almost all of the migrants/)
assert.doesNotMatch(lead, /Page not found|does not exist or is not available/i)

const mixed = `
<p>Real reporting continues here with enough context for readers.</p>
<p>The content you requested does not exist or is not available anymore.</p>
`
assert.equal(
  stripEmbedNoise(mixed).includes('does not exist or is not available'),
  false,
  '软 404 文案也应被清洗掉',
)

console.log('soft-404 / page-lead tests passed')
