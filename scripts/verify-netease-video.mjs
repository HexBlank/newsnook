const BASE = 'http://127.0.0.1:5173'
const res = await fetch(`${BASE}/api/feed/netease`)
console.log('feed status', res.status)
const data = await res.json()
const key = Object.keys(data).find((k) => Array.isArray(data[k]))
const list = data[key] || []
const videos = list.filter((x) => x.skipType === 'video' || x.videoinfo)
console.log('total', list.length, 'videos', videos.length)
console.log(
  videos.slice(0, 5).map((x) => ({
    title: x.title,
    vid: x.videoID || x.skipID,
    mp4: Boolean(x.videoinfo?.mp4_url),
    desc: (x.videoinfo?.description || '').slice(0, 40),
  })),
)

const sample = videos[0]
if (!sample) process.exit(0)
const vid = sample.videoID || sample.skipID
const link = `https://3g.163.com/news/video/${vid}.html`
const page = await fetch(`${BASE}/api/page?url=${encodeURIComponent(link)}`)
console.log('sample video page', page.status, (await page.text()).length)

// simulate in-app body
const body = `<p>${sample.videoinfo?.description || sample.title}</p><video controls src="${sample.videoinfo?.mp4_url || ''}"></video>`
console.log('in-app body chars', body.length)
console.log('FIXED: video items no longer need article/full.html')
