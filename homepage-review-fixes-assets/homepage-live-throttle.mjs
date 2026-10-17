import { chromium } from 'playwright'
const b = await chromium.launch()
for (const [label, lat, mbps] of [['4G 1.6Mbps/150ms', 150, 1.6], ['不限速', 0, 0]]) {
  for (const [view, vp, dsf] of [['桌面', { width: 1440, height: 900 }, 1], ['手机', { width: 390, height: 844 }, 3]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dsf, isMobile: view === '手机' })
    const p = await ctx.newPage()
    if (mbps) {
      const cdp = await ctx.newCDPSession(p)
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: lat, downloadThroughput: Math.round(mbps * 1024 * 1024 / 8), uploadThroughput: Math.round(0.75 * 1024 * 1024 / 8) })
    }
    const reqs = []
    p.on('response', async r => { let n = 0; try { n = (await r.body()).length } catch {} ; reqs.push({ u: r.url(), n, cl: r.headers()['content-length'] }) })
    await p.addInitScript(() => {
      window.__lcp = 0; window.__fcp = null; window.__fonts = null
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.startTime > window.__lcp) window.__lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = e.startTime }).observe({ type: 'paint', buffered: true })
      addEventListener('load', () => { const t = performance.now(); document.fonts.ready.then(() => { window.__fonts = Math.round(performance.now()) }) })
    })
    await p.goto('https://homepage.dolphinmiao.top/', { waitUntil: 'load', timeout: 120000 })
    await p.waitForTimeout(1500)
    const m = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { fcp: Math.round(window.__fcp || 0), lcp: Math.round(window.__lcp || 0), ttfb: Math.round(n.responseStart), load: Math.round(n.loadEventEnd), fonts: window.__fonts } })
    const tr = reqs.reduce((a, r) => a + (r.cl ? +r.cl : r.n), 0)
    console.log(`${label} ${view}: FCP ${m.fcp} LCP ${m.lcp} TTFB ${m.ttfb} load ${m.load} fontsReady@${m.fonts} | ${reqs.length} reqs, ${tr} B`)
    await ctx.close()
  }
}
await b.close()
