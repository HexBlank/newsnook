const url = 'http://flv0.bn.netease.com/videolib1/2607/31/97cgk1adl2u/SD/movie_index.m3u8'
for (const u of [url, url.replace('http://', 'https://')]) {
  try {
    const r = await fetch(u, { headers: { Range: 'bytes=0-200' } })
    console.log(r.status, r.headers.get('content-type'), u.slice(0, 70), (await r.text()).slice(0, 80))
  } catch (e) {
    console.log('FAIL', u.slice(0, 70), e.message)
  }
}
