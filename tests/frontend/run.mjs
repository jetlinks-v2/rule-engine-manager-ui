import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFixtureServer } from './server.mjs'
const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const uiRoot = path.resolve(moduleRoot, '../..')
const output = process.env.SCENE_TEST_OUTPUT || path.join(moduleRoot, 'target/scene-frontend')
await mkdir(output, { recursive: true })
const runtime = process.env.SCENE_PLAYWRIGHT_RUNTIME
const require = createRequire(
  runtime ? path.join(runtime, 'package.json') : path.join(uiRoot, 'package.json'),
)
const { chromium } = require('playwright')
const host = await startFixtureServer(uiRoot, moduleRoot)
let browser
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.SCENE_CHROME_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  })
  console.log('BROWSER: 已启动')
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.setDefaultTimeout(12000)
  const errors = []
  const blockedRequests = []
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === host.url || ['data:', 'blob:'].includes(url.protocol)) return route.continue()
    blockedRequests.push(url.origin + url.pathname)
    await route.abort('blockedbyclient')
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
    console.error('PAGE', error.message)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('CONSOLE', msg.text())
  })
  console.log('BROWSER: 加载 ' + host.url)
  const results = []
  const check = async (id, name, work) => {
    const start = Date.now()
    try {
      await work()
      if (['UI-06', 'UI-22', 'UI-26'].includes(id)) await page.screenshot({ path: path.join(output, id + '-passed.png'), fullPage: true })
      results.push({ id, name, status: 'PASS', durationMs: Date.now() - start })
      console.log('PASS ' + id + ' ' + name)
    } catch (error) {
      results.push({ id, name, status: 'FAIL', error: error.stack })
      await page.screenshot({ path: path.join(output, id + '-failure.png'), fullPage: true, timeout: 5000 })
      await writeFile(path.join(output, id + '-failure.txt'), await page.locator('body').innerText(), 'utf8')
      throw error
    }
  }
  let stamp = 0
  do {
    const next = (await stat(new URL('./cases.mjs', import.meta.url))).mtimeMs
    if (next !== stamp) {
      stamp = next
      results.length = 0
      errors.length = 0
      host.backend.state.rules.clear()
      host.backend.state.saves.length = 0
      host.backend.state.unexpected.length = 0
      host.backend.state.requests.length = 0
      blockedRequests.length = 0
      process.exitCode = 0
      try {
        await page.goto(host.url, { waitUntil: 'domcontentloaded', timeout: 180000 })
        await page.waitForFunction(() => window.__fixtureReady, {}, { timeout: 90000 })
        await page.locator('.scene-editor').waitFor({ timeout: 60000 })
        await (await import('./cases.mjs?' + stamp)).runCases({ page, host, check })
        await check('UI-GATE', '无浏览器异常、未声明接口或外部服务访问', async () => {
          assert.deepEqual(errors, [])
          assert.deepEqual(host.backend.state.unexpected, [])
          assert.deepEqual(blockedRequests, [])
        })
      } catch (error) {
        console.error(error.stack)
        process.exitCode = 1
        await page.screenshot({ path: path.join(output, 'latest.png'), fullPage: true, timeout: 5000 })
        await writeFile(path.join(output, 'latest.txt'), await page.locator('body').innerText(), 'utf8')
      }
      await writeFile(
        path.join(output, 'results.json'),
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            results,
            errors,
            unexpected: host.backend.state.unexpected,
            blockedRequests,
            requests: host.backend.state.requests,
            saves: host.backend.state.saves,
          },
          null,
          2,
        ),
        'utf8',
      )
      console.log('RESULTS ' + JSON.stringify({ results, errors, unexpected: host.backend.state.unexpected }))
    }
    if (process.env.SCENE_WATCH === '1') await new Promise((r) => setTimeout(r, 1000))
  } while (process.env.SCENE_WATCH === '1')
} catch (error) {
  console.error(error.stack)
  process.exitCode = 1
} finally {
  // 结果已写入；限制测试宿主关闭耗时，避免 Vite 预打包后台句柄阻止命令退出。
  const exitTimer = setTimeout(() => process.exit(process.exitCode || 0), 5000)
  await browser?.close()
  await host.server.close()
  clearTimeout(exitTimer)
  process.exit(process.exitCode || 0)
}
