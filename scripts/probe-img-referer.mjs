const BASE = 'http://127.0.0.1:5173'
const url = 'https://cdnfile.sspai.com/2026/07/31/article/fab75e3453a837ef7feb17525dc50568.png?imageView2/2/w/1120/q/90/interlace/1/ignore-error/1'

// 模拟浏览器从 localhost 带 Referer
for (const referer of [undefined, 'http://127.0.0.1:5173/', 'https://sspai.com/']) {
  const r = await fetch(url, {
    headers: referer ? { Referer: referer } : {},
  })
  console.log('status', r.status, 'referer', referer || '(none)', r.headers.get('content-type'))
}
