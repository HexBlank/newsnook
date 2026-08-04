import { normalizeContentImages } from '../src/lib/normalizeImages.ts'

const sample = `
<p>自动优化</p>
<img src="//img.ithome.com/images/v2/t.png" alt="一键排版前" data-original="https://img.ithome.com/newsuploadfiles/2026/7/533c8d61-817c-4c78-9fef-0b3314e70d75.png" class="lazy">
<img src="//img.ithome.com/images/v2/t.png" alt="一键排版后" data-original="https://img.ithome.com/newsuploadfiles/2026/7/5ee69afc-82ec-4570-a1dd-c3d3d70503fa.png">
`

const out = normalizeContentImages(sample, 'https://www.ithome.com/0/983/971.htm', {
  proxyImages: true,
})
console.log(out)
console.log('has placeholder', out.includes('t.png'))
console.log('has proxy', out.includes('/api/image?url='))
console.log('has real', out.includes('533c8d61'))
