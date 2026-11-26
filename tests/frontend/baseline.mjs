import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFixtureServer } from './server.mjs'
const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const uiRoot = path.resolve(moduleRoot, '../..')
const output = process.env.SCENE_TEST_OUTPUT || path.join(moduleRoot, 'target/scene-frontend')
const sourceRoot = process.env.SCENE_BASELINE_ROOT || path.join(output, 'baseline-2.12')
const require = createRequire(path.join(process.env.SCENE_PLAYWRIGHT_RUNTIME || uiRoot, 'package.json'))
const { chromium } = require('playwright')
await mkdir(output, { recursive: true })
const host = await startFixtureServer(uiRoot, moduleRoot, { sourceRoot, legacy: true })
// 原版创建接口先生成空场景，然后进入配置页；这里只模拟这一新建响应。
host.backend.state.rules.set('baseline-manual', {
  id: 'baseline-manual',
  name: '原版手动延迟',
  triggerType: 'manual',
  trigger: { type: 'manual', typeName: '手动触发' },
  options: { trigger: {}, when: [] },
})
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.SCENE_CHROME_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.setDefaultTimeout(15000)
const blockedRequests = []
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url())
  if (url.origin === host.url || ['data:', 'blob:'].includes(url.protocol)) return route.continue()
  blockedRequests.push(url.origin + url.pathname)
  await route.abort('blockedbyclient')
})
const errors = []
page.on('pageerror', (e) => {
  errors.push(e.message)
  console.error(e.message)
})
try {
  await page.goto(host.url, { timeout: 120000 })
  await page.waitForFunction(() => window.__fixtureReady, {}, { timeout: 90000 })
  await page.locator('.actions-add-list button').first().click()
  // 2.12 使用选择执行类型下拉框；实际控件及原版保存逻辑均从固定提交加载。
  await page.locator('.ant-modal:visible').getByText('延迟执行', { exact: true }).first().click()
  await page
    .locator('.ant-modal:visible')
    .last()
    .getByRole('button', { name: /OK|确\s*定/ })
    .click()
  await page.locator('.ant-modal:visible input').first().fill('7')
  await page
    .locator('.ant-modal:visible')
    .last()
    .getByRole('button', { name: /OK|确\s*定/ })
    .click()
  await page.locator('.scene-warp > button').click()
  await page.waitForFunction(() => location.hash.includes('/list'))
  const baseline = host.backend.state.saves.at(-1)
  assert.ok(baseline)
  const { executionShape } = await import('./contract.mjs')
  const currentRun = JSON.parse(await readFile(path.join(output, 'results.json'), 'utf8'))
  assert.ok(currentRun.results.some(item => item.id === 'UI-GATE' && item.status === 'PASS'), '先运行并通过当前版本浏览器测试')
  const current = currentRun.saves[0]
  assert.deepEqual(executionShape(current), executionShape(baseline))
  const comparisons = [{ id: 'BASELINE-01', case: '手动触发+串行延迟7秒', status: 'PASS', baseline, current }]
  console.log('PASS BASELINE-01 两个版本真实页面保存的共同执行字段一致')
  host.backend.state.rules.set('baseline-timer', {
    id: 'baseline-timer',
    name: '原版Cron',
    triggerType: 'timer',
    trigger: { type: 'timer', typeName: '定时触发' },
    options: { trigger: {}, when: [] },
  })
  await page.goto(host.url + '/#/editor?id=baseline-timer')
  await page.locator('.timer .add-button').first().click()
  await page.locator('.ant-modal:visible').getByText('cron表达式', { exact: true }).click()
  await page.locator('.ant-modal:visible input:not([type=radio])').first().fill('0 0 8 * * ?')
  await page
    .locator('.ant-modal:visible')
    .last()
    .getByRole('button', { name: /OK|确\s*定/ })
    .click()
  await page.locator('.actions-add-list button').first().click()
  await page.locator('.ant-modal:visible').getByText('延迟执行', { exact: true }).first().click()
  await page
    .locator('.ant-modal:visible')
    .last()
    .getByRole('button', { name: /OK|确\s*定/ })
    .click()
  await page.locator('.ant-modal:visible').last().locator('input:not([readonly])').first().fill('1')
  await page
    .locator('.ant-modal:visible')
    .last()
    .getByRole('button', { name: /OK|确\s*定/ })
    .click()
  await page.locator('.scene-warp > button').click()
  await page.waitForFunction(() => location.hash.includes('/list'))
  const baselineTimer = host.backend.state.saves.at(-1)
  const currentTimer = JSON.parse(await readFile(path.join(output, 'results.json'), 'utf8')).saves.find(
    (rule) => rule.triggerType === 'timer',
  )
  assert.ok(currentTimer)
  assert.deepEqual(executionShape(currentTimer), executionShape(baselineTimer))
  comparisons.push({
    id: 'BASELINE-02',
    case: 'Cron定时+默认串行延迟',
    status: 'PASS',
    baseline: baselineTimer,
    current: currentTimer,
  })
  assert.deepEqual(blockedRequests, [])
  assert.deepEqual(errors, [])
  assert.deepEqual(host.backend.state.unexpected, [])
  await writeFile(
    path.join(output, 'baseline-comparison.json'),
    JSON.stringify({ commit: '52399af70af89a337398a3cadc9258eff99c3568', comparisons }, null, 2),
    'utf8',
  )
  console.log('PASS BASELINE-02 Cron 场景共同执行字段一致')
} catch (error) {
  console.error(error.stack)
  process.exitCode = 1
  await page
    .screenshot({ path: path.join(output, 'baseline-failure.png'), fullPage: true, timeout: 5000 })
    .catch(() => {})
  await writeFile(path.join(output, 'baseline-failure.txt'), await page.locator('body').innerText(), 'utf8')
} finally {
  await writeFile(
    path.join(output, 'baseline-results.json'),
    JSON.stringify(
      { errors, blockedRequests, unexpected: host.backend.state.unexpected, saves: host.backend.state.saves },
      null,
      2,
    ),
    'utf8',
  )
  // 结果已写入；限制测试宿主关闭耗时，避免 Vite 预打包后台句柄阻止命令退出。
  const exitTimer = setTimeout(() => process.exit(process.exitCode || 0), 5000)
  await browser.close()
  await host.server.close()
  clearTimeout(exitTimer)
  process.exit(process.exitCode || 0)
}
