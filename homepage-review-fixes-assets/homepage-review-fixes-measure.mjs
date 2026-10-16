import { chromium } from 'playwright'
import fs from 'node:fs/promises'

const URL_ = process.env.URL || 'http://127.0.0.1:8899/index.html'
const TAG = process.env.TAG || 'x'
const RUNS = Number(process.env.RUNS || 3)

const b = await chromium.launch()

async function run(view, { blockThirdParty = false, viewport }) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1, isMobile: view === 'mobile' })
  const p = await ctx.newPage()
  const failed = []
  const responses = []
  if (blockThirdParty) {
    await ctx.route('**/*', route => {
      const u = route.request().url()
      if (u.startsWith('http://127.0.0.1') || u.startsWith('data:')) return route.continue()
      return route.abort('failed')
    })
  }
  p.on('requestfailed', r => failed.push(r.url().slice(0, 90) + ' :: ' + (r.failure()?.errorText || '')))
  p.on('response', async r => {
    const u = r.url()
    let n = 0
    try { n = (await r.body()).length } catch {}
    responses.push({ url: u, status: r.status(), decoded: n })
  })
  await p.addInitScript(() => {
    window.__cls = 0; window.__lcp = 0; window.__lcpEl = null
    new PerformanceObserver(l => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue; window.__cls += e.value } }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver(l => { for (const e of l.getEntries()) { if (e.startTime > window.__lcp) { window.__lcp = e.startTime; window.__lcpEl = e.element ? e.element.tagName + '#' + (e.element.id || e.element.className || '') : '?' } } }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  await p.goto(URL_, { waitUntil: 'load', timeout: 60000 }).catch(e => failed.push('GOTO ' + e.message.slice(0, 80)))
  await p.waitForTimeout(2000)
  const m = await p.evaluate(() => {
    const res = performance.getEntriesByType('resource').map(r => ({ name: r.name, t: r.initiatorType, size: r.transferSize || r.encodedBodySize || 0, start: Math.round(r.startTime), dur: Math.round(r.duration) }))
    const nav = performance.getEntriesByType('navigation')[0] || {}
    const bg = document.getElementById('rin-bg')
    return {
      lcp: Math.round(window.__lcp || 0), lcpEl: window.__lcpEl, cls: +window.__cls.toFixed(4),
      load: Math.round(nav.loadEventEnd || 0), dcl: Math.round(nav.domContentLoadedEventEnd || 0), ttfb: Math.round(nav.responseStart || 0),
      docBytes: nav.transferSize || 0,
      total: res.reduce((a, r) => a + r.size, 0) + (nav.transferSize || 0),
      n: res.length, resources: res,
      compatMode: document.compatMode, h1: document.querySelectorAll('h1').length,
      desc: document.querySelector('meta[name=description]')?.content || null,
      og: [...document.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"]')].map(x => x.getAttribute('property') || x.getAttribute('name')),
      canonical: document.querySelector('link[rel=canonical]')?.href || null,
      themeColor: document.querySelector('meta[name=theme-color]')?.content || null,
      viewportMeta: document.querySelector('meta[name=viewport]')?.content,
      bgCss: bg ? getComputedStyle(bg).backgroundImage.slice(0, 160) : 'NO #rin-bg',
      bgColor: bg ? getComputedStyle(bg).backgroundColor : null,
      avatar: (() => { const i = document.querySelector('.rin-logo img'); return i ? { src: (i.currentSrc || i.src).slice(0, 120), nat: i.naturalWidth + 'x' + i.naturalHeight, disp: Math.round(i.clientWidth) + 'x' + Math.round(i.clientHeight), alt: i.alt, w: i.getAttribute('width'), h: i.getAttribute('height'), fp: i.getAttribute('fetchpriority'), loading: i.getAttribute('loading') } : null })(),
      h2: [...document.querySelectorAll('h2')].map(h => h.textContent.trim().slice(0, 12)),
    }
  })
  const shot = `/var/cache/orange-tmp/hp-audit/${TAG}-${view}${blockThirdParty ? '-blocked' : ''}.png`
  await p.screenshot({ path: shot })
  m.shot = shot
  m.failedRequests = failed
  m.responses = responses
  await ctx.close()
  return m
}

const out = { url: URL_, tag: TAG, runs: [] }
for (const view of ['desktop', 'mobile']) {
  const vp = view === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 }
  for (let i = 0; i < RUNS; i++) {
    const r = await run(view, { viewport: vp })
    out.runs.push({ view, i, ...r })
  }
  out.runs.push({ view, i: 'blocked', ...(await run(view, { viewport: vp, blockThirdParty: true })) })
}
await b.close()
await fs.writeFile(`/var/cache/orange-tmp/hp-audit/${TAG}.json`, JSON.stringify(out, null, 1))
const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0
for (const view of ['desktop', 'mobile']) {
  const rs = out.runs.filter(r => r.view === view && r.i !== 'blocked')
  const bl = out.runs.find(r => r.view === view && r.i === 'blocked')
  console.log(view, 'median LCP', med(rs.map(r => r.lcp)), 'median total', med(rs.map(r => r.total)), 'median load', med(rs.map(r => r.load)))
  console.log('   blocked-run: total', bl.total, 'failed', bl.failedRequests.length, 'lcp', bl.lcp, 'bg', bl.bgCss.slice(0, 60))
  for (const r of rs) console.log('   run', r.i, 'lcp', r.lcp, r.lcpEl, 'total', r.total, 'n', r.n, 'compat', r.compatMode, 'failed', r.failedRequests.length)
}
