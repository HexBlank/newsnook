const BASE = 'http://127.0.0.1:5173'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

async function inspect(feedId) {
  const xml = await (await fetch(`${BASE}/api/feed/${feedId}`)).text()
  const links = [...xml.matchAll(/<link>(https?:[^<]+)<\/link>/g)].map((m) => m[1])
  const post = links.find((u) => /post|article|\/\d+/.test(u)) || links[1]
  if (!post) return console.log(feedId, 'no link')
  const html = await (await fetch(`${BASE}/api/page?url=${encodeURIComponent(post)}`)).text()
  const { document } = parseHTML(html)
  const article = new Readability(document).parse()
  const content = article?.content || ''
  const imgs = [...content.matchAll(/<img\b[^>]*>/gi)].slice(0, 8)
  console.log('\n===', feedId, post.slice(0, 70), 'imgs', imgs.length)
  for (const m of imgs) console.log(m[0].slice(0, 180))

  const src = content.match(/src=["'](https?:[^"']+)["']/i)?.[1]
  if (!src) return
  for (const referer of [undefined, 'http://127.0.0.1:5173/']) {
    try {
      const r = await fetch(src, { headers: referer ? { Referer: referer } : {} })
      console.log('fetch', r.status, referer || 'none', src.slice(0, 90))
    } catch (e) {
      console.log('fetch FAIL', referer || 'none', e.message)
    }
  }
}

for (const id of ['sspai', 'ifanr', 'kr36', 'ithome', 'arstechnica']) {
  await inspect(id)
}
