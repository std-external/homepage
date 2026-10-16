import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:8897/index.html'
const FIX = 'http://127.0.0.1:8898/index.html'
const b = await chromium.launch()

async function shot(url, out, { blockExternals = false, blockBg = false, viewport = { width: 1440, height: 900 }, full = false } = {}) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1 })
  if (blockExternals) await ctx.route('**/*', r => r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort('failed'))
  if (blockBg) await ctx.route(/loliapi|eo-img|iloli|20240828|521799/, r => r.abort('failed'))
  const p = await ctx.newPage()
  await p.goto(url, { waitUntil: 'load', timeout: 60000 })
  await p.waitForTimeout(1800)
  const box = await p.evaluate(() => {
    const g = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
    return {
      scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth,
      left: g('.rin-left'), logo: g('.rin-logo img'), title: g('.rin-left-title'), slogan: g('.rin-left-slogan'),
      card: g('.rin-card'), btn: g('.rin-btn'), tr: g('.rin-tr'), footer: g('#footer'), sloganFW: getComputedStyle(document.querySelector('.rin-left-slogan')).fontWeight,
      titleFS: getComputedStyle(document.querySelector('.rin-left-title')).fontSize,
      h2box: [...document.querySelectorAll('h2,.rin-card-title2')].map(e => { const r = e.getBoundingClientRect(); return e.tagName + ':' + Math.round(r.y) + ',' + Math.round(r.height) }),
      h1fw: getComputedStyle(document.querySelector('h1,.rin-left-title')).fontWeight,
    }
  })
  await p.screenshot({ path: out, fullPage: full })
  await ctx.close()
  return box
}

const out = {}
out.base = await shot(BASE, '/var/cache/orange-tmp/hp-audit/cmp-base-desktop.png')
out.fix = await shot(FIX, '/var/cache/orange-tmp/hp-audit/cmp-fix-desktop.png')
out.baseMobile = await shot(BASE, '/var/cache/orange-tmp/hp-audit/cmp-base-mobile.png', { viewport: { width: 390, height: 844 } })
out.fixMobile = await shot(FIX, '/var/cache/orange-tmp/hp-audit/cmp-fix-mobile.png', { viewport: { width: 390, height: 844 } })
out.baseBgFail = await shot(BASE, '/var/cache/orange-tmp/hp-audit/cmp-base-bgfail.png', { blockBg: true })
out.baseBgFailMobile = await shot(BASE, '/var/cache/orange-tmp/hp-audit/cmp-base-bgfail-mobile.png', { blockBg: true, viewport: { width: 390, height: 844 } })
out.fixOffline = await shot(FIX, '/var/cache/orange-tmp/hp-audit/cmp-fix-offline.png', { blockExternals: true })
out.fixOfflineMobile = await shot(FIX, '/var/cache/orange-tmp/hp-audit/cmp-fix-offline-mobile.png', { blockExternals: true, viewport: { width: 390, height: 844 } })
console.log(JSON.stringify(out, null, 1))
await b.close()
