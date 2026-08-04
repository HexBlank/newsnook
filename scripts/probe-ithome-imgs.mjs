const BASE = 'http://127.0.0.1:5173'
const html = await (await fetch(`${BASE}/api/page?url=${encodeURIComponent('https://www.ithome.com/0/983/971.htm')}`)).text()
const tags = [...html.matchAll(/<img\b[^>]*>/gi)].slice(0, 15)
for (const m of tags) {
  const tag = m[0]
  if (!/一键排版|data-advance|t\.png/.test(tag)) continue
  console.log('\nTAG', tag.slice(0, 500))
  const adv = tag.match(/data-advance=["']([^"']+)["']/i)?.[1]
  if (adv) {
    try {
      const json = Buffer.from(adv, 'base64').toString('utf8')
      console.log('advance', json.slice(0, 300))
    } catch (e) {
      console.log('adv decode fail', e.message)
    }
  }
}
