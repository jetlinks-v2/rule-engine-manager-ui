import assert from 'node:assert/strict'
import test from 'node:test'
import zh from '../locales/lang/zh.json'
import en from '../locales/lang/en.json'
import { detailedConditionSummaryParts, detailedDebounceSummaryParts } from '../views/SceneLinkage/editor/detail/detailedRuleSummaryParts'
import { detailedTriggerSummaryParts } from '../views/SceneLinkage/editor/detailedTriggerSummary'
import { summaryPartsText, type SummaryTranslate } from '../views/SceneLinkage/editor/summaryParts'

const translate = (messages: Record<string, string>): SummaryTranslate => (key, params = {}) => (messages[key] || key).replace(/\{([^}]+)\}/g, (_, name) => String(params[name] ?? ''))
const t = translate(zh)
const leaf = (column: string, value: unknown, type = 'and') => ({ column, termType: 'eq', value: { source: 'manual', value }, type })
const columns = { a: '告警目标名称', b: '告警级别', c: '告警状态', d: '温度' }
const text = (conditions: unknown) => summaryPartsText(detailedConditionSummaryParts(conditions, t, { columns }))

test('custom conditions highlight the parameter and value using the common summary fields', () => {
  const parts = detailedConditionSummaryParts([{ ...leaf('a', 'AAA'), termType: 'like' }], t, { columns })
  assert.equal(summaryPartsText(parts), '告警目标名称 包含 AAA')
  assert.deepEqual(parts.filter(part => part.field).map(part => part.text), ['告警目标名称', 'AAA'])
})

test('all combinations of group and leaf AND/OR preserve their own sibling relation', () => {
  for (const outer of ['and', 'or']) for (const left of ['and', 'or']) for (const right of ['and', 'or']) {
    const terms = [{ type: 'or', terms: [leaf('a', 0), leaf('b', false, left)] }, { type: outer, terms: [leaf('c', 1), leaf('d', 2, right)] }]
    const before = structuredClone(terms)
    const op = (type: string) => type === 'or' ? '或' : '且'
    assert.equal(text(terms), `（告警目标名称 等于 0 ${op(left)} 告警级别 等于 false） ${op(outer)} （告警状态 等于 1 ${op(right)} 温度 等于 2）`)
    assert.deepEqual(terms, before)
  }
  assert.equal(text([{ terms: [leaf('a', 'A'), { type: 'or', terms: [{ terms: [leaf('b', 'B'), leaf('c', 'C', 'or')] }, leaf('d', 'D')] }] }]), '（告警目标名称 等于 A 或 （（告警级别 等于 B 或 告警状态 等于 C） 且 温度 等于 D））')
})

test('ranges, lists, null operators, zero, false and incomplete fields remain readable', () => {
  assert.equal(text([{ ...leaf('d', [0, 20]), termType: 'btw' }]), '温度 在范围内 0 ～ 20')
  assert.equal(text([{ ...leaf('a', ['A', 'B']), termType: 'nin' }]), '告警目标名称 不在列表中 A、B')
  for (const operator of ['isnull', 'notnull']) assert.ok(!text([{ ...leaf('a', 'SHOULD_NOT_SHOW'), termType: operator }]).includes('SHOULD_NOT_SHOW'))
  assert.equal(text([{ terms: [{}] }, {}, leaf('a', undefined)]), '告警目标名称 等于 暂未配置')
  assert.equal(text([{ terms: [{}] }]), '')
  assert.equal(text([leaf('a', '')]), '告警目标名称 等于 空字符串')
})

test('native editor options resolve saved field and enum labels when parsing is unavailable', () => {
  const conditions = [{ terms: [leaf('internal.column', 1)] }]
  const options = { terms: [{ terms: [['告警状态', '等于', { 0: '告警中' }, '且']] }] }
  const parts = detailedConditionSummaryParts(conditions, t, { options })
  assert.equal(summaryPartsText(parts), '（告警状态 等于 告警中）')
  assert.deepEqual(parts.filter(part => part.field).map(part => part.text), ['告警状态', '告警中'])
})

test('column metadata supplies enum, boolean, metric and custom operator display names', () => {
  const parts = detailedConditionSummaryParts([
    leaf('enum', 'warning'), leaf('bool', false),
    { column: 'metric', termType: 'custom', value: { source: 'metric', metric: 'm1', value: 'INTERNAL' } },
  ], t, { columns: {
    enum: { name: '状态', options: [{ id: 'warning', name: '告警中' }] },
    bool: { name: '开关', others: { bool: { falseValue: false, falseText: '关闭', trueValue: true, trueText: '开启' } } },
    metric: { name: '温度', termTypes: [{ id: 'custom', name: '超过' }], metrics: [{ id: 'm1', name: '温度上限' }] },
  } })
  assert.equal(summaryPartsText(parts), '状态 等于 告警中 且 开关 等于 关闭 且 温度 超过 温度上限')
})

test('unresolved and variable conditions never leak IDs, object text or translation keys', () => {
  for (const value of [{ source: 'upper', value: 'branch_1_group_1_action_1.configs.state' }, { source: 'metric', metric: 'INTERNAL' }, { source: 'fixed', value: { unknown: 'INTERNAL' } }]) {
    const parts = detailedConditionSummaryParts([{ column: 'INTERNAL_COLUMN', termType: 'CUSTOM_OPERATOR', value }], t)
    const content = summaryPartsText(parts)
    assert.ok(!/INTERNAL|branch_1|\[object Object\]|IotSceneLinkage/.test(content), content)
    assert.ok(content.includes('未解析参数'))
  }
  assert.ok(text([{ ...leaf('a', { filter: [] }), termType: 'complex_exists' }]).includes('已配置的数组条件'))
})

test('detailed debounce preserves all 16 mode combinations and disabled configurations', () => {
  for (const continuous of [true, false]) for (const alarmFirst of [true, false]) for (const outputFirst of [true, false]) for (const rolling of [true, false]) {
    const limit = { enabled: true, time: 30, threshold: 3, continuous, alarmFirst, outputFirst, rolling }
    const before = structuredClone(limit)
    const parts = detailedDebounceSummaryParts(limit, t)
    assert.equal(summaryPartsText(parts), `30 秒内${continuous ? '连续' : '累计'}发生 3 次及以上时，${alarmFirst ? '立即' : '延迟'}执行${outputFirst ? '第一次' : '最后一次'}动作，并${rolling ? '立即结束当前周期' : '等待当前周期结束'}，开启新的周期`)
    assert.deepEqual(limit, before)
    assert.ok(!summaryPartsText(detailedDebounceSummaryParts(limit, translate(en))).includes('IotSceneLinkage.'))
  }
  assert.deepEqual(detailedDebounceSummaryParts({ enabled: false, time: 60 }, t), [])
  assert.deepEqual(detailedDebounceSummaryParts(undefined, t), [])
})

test('multi triggers keep each leaf filter and debounce inside its OR group with indexed column metadata', () => {
  const trigger = { type: 'multi', multi: { triggers: [
    { index: 0, trigger: { type: 'manual' }, terms: [leaf('a', 'FIRST')], shakeLimit: { enabled: true, time: 30, threshold: 3 } },
    { index: 1, trigger: { type: 'manual' }, terms: [leaf('a', 'SECOND')] },
  ] } }
  const before = structuredClone(trigger)
  const parts = detailedTriggerSummaryParts(trigger, {}, t, '', {}, { a: '旧字段', '0:a': '第一个字段', '1:a': '第二个字段' })
  const content = summaryPartsText(parts)
  assert.ok(content.includes('第一个字段 等于 FIRST）；开启防抖：'))
  assert.ok(content.includes('） 或 （手动执行 且（第二个字段 等于 SECOND））'))
  assert.ok(!content.includes('旧字段'))
  assert.deepEqual(trigger, before)
})


test('a multi leaf OR filter is grouped under its event rather than becoming another event source', () => {
  const parts = detailedTriggerSummaryParts({ type: 'multi', multi: { triggers: [{ trigger: { type: 'manual' }, terms: [leaf('a', 1), leaf('b', 2, 'or')] }] } }, {}, t, '', {}, columns)
  assert.equal(summaryPartsText(parts), '（手动执行 且（告警目标名称 等于 1 或 告警级别 等于 2））')
})


test('parameter references reuse available names without rendering their stored path', () => {
  const parts = detailedConditionSummaryParts([{ column: 'a', termType: 'eq', value: { source: 'upper', value: 'properties.expected' } }], t, { columns: { ...columns, 'properties.expected': { fullName: '期望值' } } })
  assert.equal(summaryPartsText(parts), '告警目标名称 等于 期望值')
})
