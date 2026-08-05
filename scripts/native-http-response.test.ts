import assert from 'node:assert/strict'

import { decodeNativeResponse } from '../src/lib/http'
import { parseGoogleNewsDecodeResponse } from '../src/lib/googleNewsDecode'

// Capacitor Android 对 Content-Type 含 application/json 的响应强制走 parseJSON（忽略
// responseType），解析失败时把原始文本原样交回 JS——Google batchexecute 的 )]}' 前缀
// 响应正是这种情况，不能再被 JSON.stringify 包一层引号。
const batchExecuteBody =
  ')]}\'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.washingtonpost.com/world/2026/08/04/a/\\",1]",null,null,null,"generic"],["di",20],["af.httprm",20,"-6274295306949286194",2]]'

const rpcText = decodeNativeResponse(batchExecuteBody, 'application/json; charset=utf-8')
assert.equal(rpcText, batchExecuteBody)
assert.equal(
  parseGoogleNewsDecodeResponse(rpcText),
  'https://www.washingtonpost.com/world/2026/08/04/a/',
)

// 可解析的 JSON 仍需还原成 JSON 文本，供调用方 JSON.parse（网易 full.html 等）
const neteasePayload = { ABC123: { body: '<p>正文</p>' } }
assert.deepEqual(
  JSON.parse(decodeNativeResponse(neteasePayload, 'application/json; charset=utf-8')),
  neteasePayload,
)

// 非 JSON 响应继续走 base64 → 按字符集解码
const html = '<html><body>你好</body></html>'
assert.equal(
  decodeNativeResponse(Buffer.from(html, 'utf-8').toString('base64'), 'text/html; charset=utf-8'),
  html,
)

console.log('native-http-response: ok')
