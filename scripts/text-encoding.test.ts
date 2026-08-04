import assert from 'node:assert/strict'

import {
  decodeResponseBytes,
  hasBrokenTextEncoding,
} from '../src/lib/textEncoding'

const encoder = new TextEncoder()

assert.equal(
  decodeResponseBytes(encoder.encode('<p>银行风险</p>'), 'text/html; charset=gb2312'),
  '<p>银行风险</p>',
  '有效 UTF-8 不应被错误的旧式响应头破坏',
)

const gbkHtml = Uint8Array.from([
  ...encoder.encode('<meta charset="gb2312"><p>'),
  0xd2, 0xf8, 0xd0, 0xd0, 0xb7, 0xe7, 0xcf, 0xd5,
  ...encoder.encode('</p>'),
])
assert.equal(
  decodeResponseBytes(gbkHtml, 'text/html'),
  '<meta charset="gb2312"><p>银行风险</p>',
  '应按 HTML meta 解码 GB2312/GBK 页面',
)

const headerOnlyGbk = Uint8Array.from([
  ...encoder.encode('<p>'),
  0xd2, 0xf8, 0xd0, 0xd0, 0xb7, 0xe7, 0xcf, 0xd5,
  ...encoder.encode('</p>'),
])
assert.equal(
  decodeResponseBytes(headerOnlyGbk, 'text/html; charset=gbk'),
  '<p>银行风险</p>',
  '应按 HTTP charset 解码 GBK 页面',
)

const mislabeledGbk = Uint8Array.from([
  ...encoder.encode('<p>'),
  0xd2, 0xf8, 0xd0, 0xd0, 0xb7, 0xe7, 0xcf, 0xd5,
  0xd2, 0xf8, 0xd0, 0xd0, 0xb7, 0xe7, 0xcf, 0xd5,
  ...encoder.encode('</p>'),
])
assert.equal(
  decodeResponseBytes(mislabeledGbk, 'text/html; charset=utf-8'),
  '<p>银行风险银行风险</p>',
  '应纠正错误标为 UTF-8 的中文旧站响应',
)

const bomUtf8 = Uint8Array.from([0xef, 0xbb, 0xbf, ...encoder.encode('正文')])
assert.equal(decodeResponseBytes(bomUtf8), '正文', '应去掉 UTF-8 BOM 且保留首字符')

assert.equal(hasBrokenTextEncoding('正常正文里偶尔出现一个 � 不应误杀'), false)
assert.equal(hasBrokenTextEncoding('��正文����已经��不可逆'), true)

console.log('text encoding tests passed')
