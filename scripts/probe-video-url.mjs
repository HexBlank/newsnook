const BASE = 'http://127.0.0.1:5173'
const res = await fetch(`${BASE}/api/feed/netease`)
const data = await res.json()
const key = Object.keys(data).find((k) => Array.isArray(data[k]))
const item = (data[key] || []).find((x) => x.videoinfo?.mp4_url && String(x.title || '').includes('吉林洪水'))
  || (data[key] || []).find((x) => x.videoinfo?.mp4_url)

const info = item.videoinfo
const urls = [
  info.mp4_url,
  info.m3u8_url,
  info.video_data?.sd_url,
  info.video_data?.hevc_url,
].filter(Boolean)

console.log('title', item.title)
for (const url of urls) {
  // direct
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://3g.163.com/',
        Range: 'bytes=0-1',
      },
    })
    console.log('direct', r.status, r.headers.get('content-type'), url.slice(0, 90))
  } catch (e) {
    console.log('direct FAIL', e.message, url.slice(0, 90))
  }

  // via vite page proxy
  try {
    const r = await fetch(`${BASE}/api/page?url=${encodeURIComponent(url)}`, {
      headers: { Range: 'bytes=0-1' },
    })
    console.log('proxy ', r.status, r.headers.get('content-type'), (await r.arrayBuffer()).byteLength)
  } catch (e) {
    console.log('proxy FAIL', e.message)
  }
}
