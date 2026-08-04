const BASE = 'http://127.0.0.1:5173'

// 拉一篇带图的少数派文章，检查 img 属性
const feed = await fetch(`${BASE}/api/feed/sspai`)
const xml = await feed.text()
const links = [...xml.matchAll(/<link>(https?:[^<]+)<\/link>/g)].map((m) => m[1])
const articleUrl = links.find((u) => /\/post\//.test(u)) || links[0]
console.log('article', articleUrl)

const page = await fetch(`${BASE}/api/page?url=${encodeURIComponent(articleUrl)}`)
const html = await page.text()
const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].slice(0, 12)
for (const tag of imgs) {
  console.log('\n', tag[0].slice(0, 220))
}

// 抽几个 src 试直连
const srcs = [...html.matchAll(/\s(?:src|data-src|data-original)=["']([^"']+)["']/gi)]
  .map((m) => m[1])
  .filter((u) => /\.(png|jpe?g|webp|gif)/i.test(u) || u.includes('cdn') || u.includes('http'))
  .slice(0, 6)

for (const src of srcs) {
  const abs = src.startsWith('//') ? 'https:' + src : src.startsWith('http') ? src : new URL(src, articleUrl).toString()
  try {
    const r = await fetch(abs, { method: 'GET', headers: { Referer: 'https://sspai.com/' } })
    console.log('img', r.status, r.headers.get('content-type'), abs.slice(0, 100))
  } catch (e) {
    console.log('img FAIL', abs.slice(0, 100), e.message)
  }
}
