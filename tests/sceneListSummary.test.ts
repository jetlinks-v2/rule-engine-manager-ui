import assert from 'node:assert/strict'
import test from 'node:test'
import zh from '../locales/lang/zh.json'
import en from '../locales/lang/en.json'
import { formatSceneSummaryClauses, splitSceneSummaryParts } from '../views/SceneLinkage/sceneSummary'
const translate = (messages: Record<string, string>) => (key: string) => messages[key] || key
const t = translate(zh)

test('saved detailed summaries split into the existing colored list keywords without connecting colons', () => {
  const text = '当：TCP在线；且：（上报时间 等于 22:41:23）；就：读取modbus风扇中1号排风扇的开关'
  const parts = splitSceneSummaryParts(text, t)
  assert.deepEqual(parts.map(part => [part.keyword, part.kind]), [['当', 'trigger'], ['且', 'condition'], ['就', 'action']])
  assert.equal(parts[1].value, '（上报时间 等于 22:41:23）')
  assert.equal(formatSceneSummaryClauses(parts.map(part => ({ label: part.keyword, value: part.value }))), '当 TCP在线，且 （上报时间 等于 22:41:23），就 读取modbus风扇中1号排风扇的开关')
})

test('existing quick summaries retain their text, keyword kinds and full recipient list', () => {
  const text = '当 每天 15:00，且 工作时间 09:00-18:00、晚间 20:00-08:00，就 发送 站内信 给 超级管理员、测试用户'
  const parts = splitSceneSummaryParts(text, t)
  assert.equal(parts.length, 3)
  assert.equal(formatSceneSummaryClauses(parts.map(part => ({ label: part.keyword, value: part.value }))), text)
  assert.ok(parts[2].value.includes('超级管理员、测试用户'))
})

test('otherwise and debounce are recognized while nested conditions and parallel action punctuation remain intact', () => {
  const text = '当 手动执行，且 （温度 等于 0 或 （开关 等于 false 且 时间 等于 08:00）），就 同时执行：延迟 1 秒、延迟 2 秒，延迟 3 秒，开启防抖 30 秒内发生 3 次，否则 未满足以上条件时，且 告警名称 包含 AAA，就 获取 TCP 的设备信息'
  const parts = splitSceneSummaryParts(text, t)
  assert.deepEqual(parts.map(part => part.keyword), ['当', '且', '就', '开启防抖', '否则', '且', '就'])
  assert.ok(parts[1].value.includes('false 且 时间'))
  assert.equal(parts[2].value, '同时执行：延迟 1 秒、延迟 2 秒，延迟 3 秒')
  assert.equal(parts[6].value, '获取 TCP 的设备信息')
})

test('persisted summary writer follows quick format for branches and action continuation lines', () => {
  const lines = [{ label: '当', value: 'TCP 在线' }, { label: '且', value: '名称 包含 AAA' }, { label: '就', value: '读取通道中采集器的点位' }, { value: '延迟 1 秒' }, { label: '否则', value: '未满足以上条件时' }, { label: '就', value: '发送通知' }]
  const before = structuredClone(lines)
  const text = formatSceneSummaryClauses(lines)
  assert.equal(text, '当 TCP 在线，且 名称 包含 AAA，就 读取通道中采集器的点位，延迟 1 秒，否则 未满足以上条件时，就 发送通知')
  assert.ok(!/[当且就][:：]/.test(text))
  assert.deepEqual(lines, before)
})

test('English saved and newly generated keywords are supported regardless of Then capitalization', () => {
  const parts = splitSceneSummaryParts('When: TCP online; And: (Time equals 22:41:23); then: Read point; Otherwise: No match; Then: Notify', translate(en))
  assert.deepEqual(parts.map(part => part.kind), ['trigger', 'condition', 'action', 'otherwise', 'action'])
  assert.equal(parts[1].value, '(Time equals 22:41:23)')
})

test('keywords inside resource names are kept as ordinary text', () => {
  const parts = splitSceneSummaryParts('当 就业设备 在线，就 读取 名称（当 测试 且 名称 就 参数）的数据', t)
  assert.equal(parts.length, 2)
  assert.equal(parts[0].value, '就业设备 在线')
  assert.equal(parts[1].value, '读取 名称（当 测试 且 名称 就 参数）的数据')
})


test('old free-text trigger prefixes remain visible when only later clauses have keywords', () => {
  const parts = splitSceneSummaryParts('历史定时规则，就 发送通知', t)
  assert.deepEqual(parts.map(part => part.value), ['历史定时规则', '发送通知'])
})
