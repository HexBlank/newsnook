/**
 * 回归：非网易 /article/{id}.html 不得被当成网易 docid。
 * 用法：npx tsx scripts/netease-docid.test.ts
 */
import assert from 'node:assert/strict'

import { candidateNeteaseIds } from '../src/lib/resolveBody'
import type { Article } from '../src/lib/types'

function stub(partial: Partial<Article> & Pick<Article, 'originUrl' | 'sourceId'>): Article {
  return {
    id: 't',
    title: 't',
    summary: '',
    publishedAt: 0,
    hasRealDate: false,
    sourceName: 't',
    sourceLabel: 't',
    sourceGroup: 'cn',
    ...partial,
  }
}

assert.deepEqual(
  candidateNeteaseIds(
    stub({
      sourceId: 'huxiu',
      originUrl: 'https://www.huxiu.com/article/4880230.html?f=rss',
    }),
  ),
  [],
  'huxiu numeric article id must not become netease docid',
)

assert.deepEqual(
  candidateNeteaseIds(
    stub({
      sourceId: 'netease',
      originUrl: 'https://m.163.com/news/article/L35E0QFF00019B3E.html',
      neteaseDocId: 'L35E0QFF00019B3E',
    }),
  ),
  ['L35E0QFF00019B3E'],
)

assert.deepEqual(
  candidateNeteaseIds(
    stub({
      sourceId: 'netease-tech',
      originUrl: 'https://www.163.com/dy/article/ABCD1234EFGH5678.html',
    }),
  ),
  ['ABCD1234EFGH5678'],
)

console.log('netease-docid: ok')
