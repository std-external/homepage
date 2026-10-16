import { chromium } from 'playwright'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const b = await chromium.launch()
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
const L = (r, g, bl) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl)
const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)

async function measure(url, overlay, vp, regions) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  if (overlay) await p.addInitScript(a => {
    addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style')
      s.textContent = `#rin-bg:after{background-color: rgba(66,66,66,${a})!important}
                       .rin-left-title,.rin-left-title2,.rin-left-slogan{text-shadow:none!important}`
      document.head.appendChild(s)
    })
  }, overlay)
  await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1500)
  const boxes = await p.evaluate(sels => sels.map(s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }), regions)
  await p.evaluate(() => { document.querySelectorAll('.rin-left-title,.rin-left-title2,.rin-left-slogan').forEach(e => e.style.visibility = 'hidden') })
  await p.waitForTimeout(200)
  const buf = await p.screenshot()
  await ctx.close()
  const img = await loadImage(buf)
  const c = createCanvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0)
  return boxes.map(([x, y, w, h], i) => {
    const d = g.getImageData(x, y, w, h).data
    const ls = []
    for (let k = 0; k < d.length; k += 4) ls.push(L(d[k], d[k + 1], d[k + 2]))
    ls.sort((a, c) => a - c)
    const q = t => ls[Math.min(ls.length - 1, Math.floor(t * ls.length))]
    const rs = ls.map(l => ratio(1.0, l)).sort((a, c) => a - c)
    return { region: regions[i], minRatio: +rs[0].toFixed(2), p05: +rs[Math.floor(rs.length * .05)].toFixed(2), median: +rs[Math.floor(rs.length / 2)].toFixed(2), maxRatio: +rs[rs.length - 1].toFixed(2) }
  })
}

const regions = ['.rin-left-title', '.rin-left-slogan']
const FIX = 'http://127.0.0.1:8898/index.html'
for (const [tag, overlay, vp] of [['desktop a=0.60 (原来)', 0.6, { width: 1440, height: 900 }], ['desktop a=0.72 (改后)', 0.72, { width: 1440, height: 900 }], ['mobile a=0.60', 0.6, { width: 390, height: 844 }], ['mobile a=0.72', 0.72, { width: 390, height: 844 }]]) {
  console.log(tag, JSON.stringify(await measure(FIX, overlay, vp, regions)))
}
await b.close()
