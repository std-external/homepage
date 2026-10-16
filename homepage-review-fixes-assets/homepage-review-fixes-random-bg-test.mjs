import { chromium } from 'playwright'
const URL_ = process.env.URL || 'http://127.0.0.1:8898/index.html'
const b = await chromium.launch()

async function open(ctxOpts = {}, blockBg = false) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ...ctxOpts })
  if (blockBg) await ctx.route('**/assets/bg/**', r => r.abort('failed'))
  const p = await ctx.newPage()
  const bg = []
  p.on('response', r => { if (r.url().includes('/assets/bg/')) bg.push(r.url().split('/').pop()) })
  return { ctx, p, bg }
}

// 1) 12 次全新会话：随机是否生效
const picks = []
for (let i = 0; i < 12; i++) {
  const { ctx, p, bg } = await open()
  await p.goto(URL_, { waitUntil: 'load' }); await p.waitForTimeout(600)
  const v = await p.evaluate(() => getComputedStyle(document.getElementById('rin-bg')).backgroundImage.match(/bg-\d+-\d+\.webp/)?.[0])
  picks.push({ picked: v, requested: bg })
  await ctx.close()
}
console.log('fresh sessions:', JSON.stringify(picks.map(x => x.picked)))
console.log('distinct:', new Set(picks.map(x => x.picked)).size, '| 每次只请求 1 张背景:', picks.every(x => x.requested.length === 1), '| 请求=选中的:', picks.every(x => x.requested[0] === x.picked))

// 2) 同一会话内刷新 3 次：是否稳定
{
  const { ctx, p } = await open()
  await p.goto(URL_, { waitUntil: 'load' })
  const a = await p.evaluate(() => sessionStorage.getItem('rin-bg-index'))
  const vals = []
  for (let i = 0; i < 3; i++) { await p.reload({ waitUntil: 'load' }); vals.push(await p.evaluate(() => getComputedStyle(document.getElementById('rin-bg')).backgroundImage.match(/bg-\d+-\d+\.webp/)?.[0])) }
  console.log('same session index', a, '-> 3 次刷新:', JSON.stringify(vals), '稳定:', new Set(vals).size === 1)
  await ctx.close()
}

// 3) 移动端视图
{
  const { ctx, p, bg } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 3 })
  await p.goto(URL_, { waitUntil: 'load' }); await p.waitForTimeout(500)
  console.log('mobile requests:', bg, 'count', bg.length)
  await ctx.close()
}

// 4) 背景图全 404：兜底不是白屏
{
  const { ctx, p } = await open({}, true)
  await p.goto(URL_, { waitUntil: 'load' }); await p.waitForTimeout(800)
  await p.screenshot({ path: '/var/cache/orange-tmp/hp-audit/bgfix-404-desktop.png' })
  const g = await p.evaluate(() => { const cs = getComputedStyle(document.getElementById('rin-bg')); return { bi: cs.backgroundImage.slice(0, 90), bc: cs.backgroundColor } })
  console.log('all-bg-404 ->', JSON.stringify(g))
  await ctx.close()
}

// 5) 禁用 JS
{
  const { ctx, p, bg } = await open({ javaScriptEnabled: false })
  await p.goto(URL_, { waitUntil: 'load' }); await p.waitForTimeout(800)
  await p.screenshot({ path: '/var/cache/orange-tmp/hp-audit/bgfix-nojs-desktop.png' })
  console.log('no-JS requests:', bg)
  await ctx.close()
}
await b.close()
