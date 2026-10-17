import { chromium } from 'playwright'
const b = await chromium.launch()
const SITES = { old: 'http://127.0.0.1:8897/index.html', new: 'http://127.0.0.1:8898/index.html' }

async function run(url, view, vp, throttle) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: view === 'mobile' })
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  if (throttle) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: Math.round(1.6 * 1024 * 1024 / 8), uploadThroughput: Math.round(750 * 1024 / 8) })
  const reqs = []
  p.on('response', async r => { let n = 0; try { n = (await r.body()).length } catch {} ; reqs.push({ u: r.url(), n, cl: r.headers()['content-length'] }) })
  const failed = []
  p.on('requestfailed', r => failed.push(r.url().slice(0, 60)))
  await p.addInitScript(() => {
    window.__lcp = 0; window.__lcpEl = null; window.__fcp = null
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.startTime > window.__lcp) { window.__lcp = e.startTime; window.__lcpEl = e.element ? e.element.tagName : '?' } }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = e.startTime }).observe({ type: 'paint', buffered: true })
  })
  await p.goto(url, { waitUntil: 'load', timeout: 120000 }).catch(e => failed.push('goto ' + e.message.slice(0, 40)))
  await p.waitForTimeout(1200)
  const m = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {}
    return { lcp: Math.round(window.__lcp || 0), lcpEl: window.__lcpEl, fcp: Math.round(window.__fcp || 0), load: Math.round(nav.loadEventEnd || 0), ttfb: Math.round(nav.responseStart || 0) }
  })
  const transfer = reqs.reduce((a, r) => a + (r.cl ? +r.cl : r.n), 0)
  await ctx.close()
  return { ...m, reqs: reqs.length, transfer, failed: failed.length }
}

for (const view of ['desktop', 'mobile']) {
  const vp = view === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 }
  for (const [name, url] of Object.entries(SITES)) {
    const rows = []
    for (let i = 0; i < 3; i++) rows.push(await run(url, view, vp, true))
    const med = k => rows.map(r => r[k]).sort((a, b) => a - b)[1]
    console.log(`${view} ${name}: FCP ${med('fcp')} LCP ${med('lcp')} TTFB ${med('ttfb')} load ${med('load')} | transfer ${med('transfer')}B reqs ${med('reqs')} failed ${rows.map(r=>r.failed).join('/')} | runs ${rows.map(r=>r.fcp+'/'+r.lcp).join(' ')}`)
  }
}
await b.close()
