import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const tempDir = await mkdtemp(join(tmpdir(), 'alarm-agent-data-'))
const outputFile = join(tempDir, 'alarmData.mapper.mjs')

try {
  await build({
    entryPoints: [fileURLToPath(new URL('./alarmData.mapper.ts', import.meta.url))],
    outfile: outputFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  })

  const {
    extractCount,
    extractPage,
    mergeAlarmHistory,
    normalizeAlarmRecord,
    normalizeHandleHistory,
  } = await import(`file://${outputFile}`)

  const page = extractPage({ result: { data: [{ id: 'record-1' }], total: 4 } })
  assert.equal(page.total, 4)
  assert.equal(page.data[0].id, 'record-1')
  assert.equal(extractCount({ result: { count: 6 } }), 6)

  const record = normalizeAlarmRecord({
    id: 'record-1',
    alarmConfigId: 'config-1',
    alarmName: '未戴安全帽',
    alarmTime: 1710000000000,
    lastAlarmTime: 1710000001000,
    level: { value: 1, text: '紧急' },
    state: { value: 'warning', text: '告警中' },
    sourceId: 'channel-1',
    sourceName: '一号通道',
    targetName: '未戴安全帽',
    bizType: 'helmet-scene',
    bizId: 'helmet-scene-helmet-missing',
    actualDesc: '检测到未佩戴安全帽',
  }, 'vision', [{
    level: 1,
    value: 1,
    label: '紧急',
    shortLabel: '紧急',
    tone: 'high',
    raw: {},
  }])
  assert.equal(record.id, 'record-1')
  assert.equal(record.status, 'open')
  assert.equal(record.pack, 'helmet-scene')
  assert.equal(record.algoId, 'helmet-missing')
  assert.equal(record.levelLabel, '紧急')
  assert.equal(record.handleContext.targetType, undefined)

  const latest = mergeAlarmHistory(record, {
    id: 'history-1',
    alarmTime: 1710000002000,
    alarmInfo: JSON.stringify({ alarmName: '安全帽告警', description: '最新识别结果' }),
  })
  assert.equal(latest.historyId, 'history-1')
  assert.equal(latest.summary, '最新识别结果')
  assert.equal(latest.ruleName, '安全帽告警')

  const handling = normalizeHandleHistory({
    alarmTime: 1710000000000,
    handleTime: 1710000003000,
    handleState: { value: 'processed', text: '已处理' },
    handleType: { value: 'user', text: '人工处理' },
    description: '已确认并关闭',
  })
  assert.equal(handling.state, 'normal')
  assert.equal(handling.handleType, '人工处理')
  assert.equal(handling.handleResult, '已确认并关闭')
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
