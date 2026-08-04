const BASE = 'http://127.0.0.1:5173'
const res = await fetch(`${BASE}/api/feed/netease`)
const data = await res.json()
const key = Object.keys(data).find((k) => Array.isArray(data[k]))
const item = data[key].find((x) => x.title && x.title.includes('非洲移民'))
console.log(JSON.stringify(item, null, 2))

const candidates = []
if (item?.docid) candidates.push(`http://c.m.163.com/nc/article/${item.docid}/full.html`)
if (item?.postid) candidates.push(`http://c.m.163.com/nc/article/${item.postid}/full.html`)
if (item?.url) candidates.push(item.url)
if (item?.url_3w) candidates.push(item.url_3w)
if (item?.skipID) candidates.push(`https://c.m.163.com/news/v/${item.skipID.replace(/^V/, '')}.html`)

for (const url of candidates) {
  try {
    const r = await fetch(`${BASE}/api/page?url=${encodeURIComponent(url)}`)
    const text = await r.text()
    console.log('\nURL', url)
    console.log('status', r.status, 'bytes', text.length, 'head', text.slice(0, 180).replace(/\s+/g, ' '))
  } catch (e) {
    console.log('fail', url, e.message)
  }
}
