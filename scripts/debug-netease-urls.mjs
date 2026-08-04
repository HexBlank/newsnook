const BASE = 'http://127.0.0.1:5173'
const urls = [
  'https://3g.163.com/news/video/VO27OC7D2.html',
  'https://www.163.com/v/video/VO27OC7D2.html',
  'https://c.m.163.com/news/video/VO27OC7D2.html',
  'http://c.m.163.com/nc/video/detail/VO27OC7D2.html',
  'https://3g.163.com/v/video/VO27OC7D2.html',
]

for (const url of urls) {
  const r = await fetch(`${BASE}/api/page?url=${encodeURIComponent(url)}`)
  const t = await r.text()
  console.log(r.status, t.length, url, t.slice(0, 120).replace(/\s+/g, ' '))
}

// also sample a normal article from same feed
const res = await fetch(`${BASE}/api/feed/netease`)
const data = await res.json()
const key = Object.keys(data).find((k) => Array.isArray(data[k]))
const normal = data[key].find((x) => x.skipType !== 'video' && x.url_3w)
console.log('\nnormal sample', {
  title: normal?.title,
  docid: normal?.docid,
  url: normal?.url,
  url_3w: normal?.url_3w,
  skipType: normal?.skipType,
})
if (normal?.docid) {
  const api = `http://c.m.163.com/nc/article/${normal.docid}/full.html`
  const r = await fetch(`${BASE}/api/page?url=${encodeURIComponent(api)}`)
  const t = await r.text()
  console.log('normal full', r.status, t.length, t.slice(0, 200).replace(/\s+/g, ' '))
}
