import { chromium } from 'playwright'
import fs from 'node:fs/promises'
const URL_ = 'https://homepage.dolphinmiao.top/'
const b = await chromium.launch()

async function run(view, vp, runIdx) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: view === 'mobile' ? 3 : 1, isMobile: view === 'mobile' })
  const p = await ctx.newPage()
  const reqs = []
  p.on('response', async r => {
    const req = r.request()
    const t = req.timing()
    let size = 0
    try { size = (await r.body()).length } catch {}
    reqs.push({
      url: r.url(), type: req.resourceType(), status: r.status(), size,
      start: Math.round(t.startTime), ttfb: Math.round(t.responseStart - t.startTime),
      end: Math.round(t.responseEnd - t.startTime),
      cf: r.headers()['cf-cache-status'] || '', xcache: r.headers()['x-cache'] || '', age: r.headers()['age'] || '',
      clen: r.headers()['content-length'] || '', enc: r.headers()['content-encoding'] || '',
    })
  })
  const failed = []
  p.on('requestfailed', r => failed.push(r.url().slice(0, 120) + ' :: ' + (r.failure()?.errorText || '')))
  await p.addInitScript(() => {
    window.__lcp = 0; window.__lcpEl = null
    new PerformanceObserver(l => { for (const e of l.getEntries()) { if (e.startTime > window.__lcp) { window.__lcp = e.startTime; window.__lcpEl = (e.element && (e.element.tagName + (e.element.className ? '.' + String(e.element.className).split(' ')[0] : ''))) } } }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  const t0 = Date.now()
  await p.goto(URL_, { waitUntil: 'load', timeout: 90000 })
  const loadWall = Date.now() - t0
  await p.waitForTimeout(2500)
  const m = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {}
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    return {
      lcp: Math.round(window.__lcp || 0), lcpEl: window.__lcpEl, fcp: fcp ? Math.round(fcp.startTime) : null,
      ttfb: Math.round(nav.responseStart || 0), dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0),
      docTransfer: nav.transferSize, docEncoded: nav.encodedBodySize, docDecoded: nav.decodedBodySize,
      bgVar: getComputedStyle(document.documentElement).getPropertyValue('--rin-bg-url').trim(),
      bgComputed: getComputedStyle(document.getElementById('rin-bg')).backgroundImage.slice(0, 140),
      preloadHrefs: [...document.querySelectorAll('link[rel=preload]')].map(l => l.href.split('/').pop()),
      conn: (() => { const e = performance.getEntriesByType('resource').filter(r => /bg-|avatar|mdui|font_|woff/.test(r.name)); return e.map(r => ({ n: r.name.split('/').pop().slice(0, 28), st: Math.round(r.startTime), dur: Math.round(r.duration), size: r.transferSize, enc: r.encodedBodySize, dec: r.decodedBodySize })) })(),
    }
  })
  const shot = `/var/cache/orange-tmp/live-${view}-${runIdx}.png`
  await p.screenshot({ path: shot })
  await ctx.close()
  return { view, runIdx, loadWall, shot, failed, reqs, ...m }
}

const out = []
for (const [view, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  for (let i = 0; i < 3; i++) out.push(await run(view, vp, i))
}
await b.close()
await fs.writeFile('/var/cache/orange-tmp/live-metrics.json', JSON.stringify(out, null, 1))
for (const r of out) {
  const third = r.reqs.filter(x => !x.url.startsWith('https://homepage.dolphinmiao.top'))
  const bg = r.reqs.filter(x => x.url.includes('/assets/bg/'))
  const totalBytes = r.reqs.reduce((a, x) => a + x.size, 0) + (r.docDecoded || 0)
  console.log(`${r.view}#${r.runIdx} LCP=${r.lcp} (${r.lcpEl}) FCP=${r.fcp} TTFB=${r.ttfb} load=${r.load} wall=${r.loadWall} reqs=${r.reqs.length} bytes=${totalBytes}`)
  console.log(`   bg: ${bg.map(x => x.url.split('/').pop() + ' ' + x.size + 'B t=' + x.start + '-' + x.end + ' cf=' + x.cf).join(' | ') || 'NONE'}`)
  console.log(`   preloads: ${JSON.stringify(r.preloadHrefs)} | bgVar=${r.bgVar.split('/').pop()}`)
  console.log(`   third-party: ${third.map(x => x.url.replace(/https:\/\//, '').split('/')[0] + ' ' + x.size + 'B ' + x.end + 'ms').join(' | ')}`)
  console.log(`   failed: ${JSON.stringify(r.failed)}`)
}
