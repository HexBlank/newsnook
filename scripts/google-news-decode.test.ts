import assert from 'node:assert/strict'

import {
  buildGoogleNewsDecodeForm,
  extractGoogleNewsDecodeParams,
  googleNewsArticleId,
  isGoogleNewsArticleUrl,
  parseGoogleNewsDecodeResponse,
  decodeGoogleNewsUrl,
  clearGoogleNewsDecodeCache,
} from '../src/lib/googleNewsDecode'

assert.equal(
  isGoogleNewsArticleUrl(
    'https://news.google.com/rss/articles/CBMidEFVX3lxTE83X1dXSk8zQW92dldGQzRwZzdPdWpRWDNFZ1RYdGJsTEVtVlZUNGhFYXg4LUJkRzFCbG1ONXlka2dMcXJlMHdfZjg0LXVLbmpHVnU2MEUybmtmUTVTSWxFMEVnRzZZYm80dkt4YUp5N0JMYnVK?oc=5',
  ),
  true,
)
assert.equal(isGoogleNewsArticleUrl('https://www.npr.org/2026/01/01/story'), false)

const id = googleNewsArticleId(
  'https://news.google.com/rss/articles/CBMidEFVX3lxTE83X1dXSk8zQW92dldGQzRwZzdPdWpRWDNFZ1RYdGJsTEVtVlZUNGhFYXg4LUJkRzFCbG1ONXlka2dMcXJlMHdfZjg0LXVLbmpHVnU2MEUybmtmUTVTSWxFMEVnRzZZYm80dkt4YUp5N0JMYnVK?oc=5',
)
assert.equal(
  id,
  'CBMidEFVX3lxTE83X1dXSk8zQW92dldGQzRwZzdPdWpRWDNFZ1RYdGJsTEVtVlZUNGhFYXg4LUJkRzFCbG1ONXlka2dMcXJlMHdfZjg0LXVLbmpHVnU2MEUybmtmUTVTSWxFMEVnRzZZYm80dkt4YUp5N0JMYnVK',
)

const params = extractGoogleNewsDecodeParams(
  `<div data-n-a-sg="sig_abc" data-n-a-ts="1785808225"></div>`,
)
assert.deepEqual(params, { signature: 'sig_abc', timestamp: '1785808225' })
assert.equal(extractGoogleNewsDecodeParams('<div></div>'), null)

const form = buildGoogleNewsDecodeForm(id!, '1785808225', 'sig_abc')
assert.ok(form['f.req'])
assert.ok(form['f.req'].includes('Fbv4je'))
assert.ok(form['f.req'].includes(id!))

const decoded = parseGoogleNewsDecodeResponse(
  `)]}'

[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.npr.org/2026/01/01/story\\"]",null,null,null,"generic"]]`,
)
assert.equal(decoded, 'https://www.npr.org/2026/01/01/story')
assert.equal(parseGoogleNewsDecodeResponse(")]}'\n\n[[\"di\",1]]"), null)

clearGoogleNewsDecodeCache()
const publisher = await decodeGoogleNewsUrl(
  'https://news.google.com/rss/articles/CBMidTESTARTICLEID?oc=5',
  {
    getText: async () => `<div data-n-a-sg="sig_x" data-n-a-ts="100"></div>`,
    postForm: async () =>
      `)]}'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.theguardian.com/world/a\\"]",null,null,null,"generic"]]`,
  },
)
assert.equal(publisher, 'https://www.theguardian.com/world/a')

console.log('google-news-decode: ok')
