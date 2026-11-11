import assert from 'node:assert/strict'
import test from 'node:test'
import { withAlarmTermOptions } from '../views/Scene/Save/components/Terms/util'
import { detailedConditionSummaryParts } from '../views/SceneLinkage/editor/detail/detailedRuleSummaryParts'
import { summaryPartsText } from '../views/SceneLinkage/editor/summaryParts'

const definitions = {
  level: [{ id: 0, name: '自定义低级别' }, { id: 20, name: '自定义高级别' }],
  targetType: [{ id: 'device', name: '物联设备' }, { id: 'aiTaskMediaTarget', name: '视觉任务' }],
  alarmState: [{ id: 'trigger', name: '产生告警' }, { id: 'relieve', name: '告警解除' }],
}

test('alarm columns use configured level/target choices and preserve numeric IDs, operators and input metadata', () => {
  const original = [{ column: 'level', dataType: 'int', termTypes: [{ id: 'gt', name: '大于' }] }, { column: 'targetType', dataType: 'string' }, { column: 'alarmState', dataType: 'string' }, { column: 'targetName', dataType: 'string' }]
  const snapshot = structuredClone(original)
  const result = withAlarmTermOptions(original, 'alarm', definitions)
  assert.equal(result[0].dataType, 'enum')
  assert.deepEqual(result[0].options, definitions.level)
  assert.equal(result[0].options?.[0].id, 0)
  assert.deepEqual(result[0].termTypes, original[0].termTypes)
  assert.deepEqual(result[1].options, definitions.targetType)
  assert.deepEqual(result[2].options, definitions.alarmState)
  assert.equal(result[3].dataType, 'string')
  assert.deepEqual(original, snapshot)
})

test('mixed event sources only enrich alarm columns and retain backend enum choices', () => {
  const original = [{ column: 'level', dataType: 'int', others: { _multiTriggerIndex: 1, _multiTriggerType: 'device' } }, { column: 'alarm', others: { _multiTriggerIndex: 2, _multiTriggerType: 'alarm' }, children: [{ column: 'level', dataType: 'int' }] }]
  const result = withAlarmTermOptions(original, 'multi', definitions)
  assert.equal(result[0].dataType, 'int')
  assert.deepEqual(result[1].children?.[0].options, definitions.level)
  assert.equal(result[1].others?._multiTriggerIndex, 2)
  const enumColumn = { column: 'level', dataType: 'enum', options: [{ id: 1, name: '接口枚举' }] }
  assert.deepEqual(withAlarmTermOptions([enumColumn], 'alarm', definitions), [enumColumn])
})

test('alarm condition previews resolve configured enum names for individual and multi-select values', () => {
  const columns = withAlarmTermOptions([{ column: 'level', name: '告警级别' }, { column: 'targetType', name: '告警目标类型' }], 'alarm', definitions)
  const map = Object.fromEntries(columns.map(item => [item.column!, item]))
  const parts = detailedConditionSummaryParts([{ column: 'level', termType: 'in', value: { source: 'manual', value: [0, 20] } }, { column: 'targetType', termType: 'eq', value: { source: 'manual', value: 'aiTaskMediaTarget' } }], key => key, { columns: map })
  const text = summaryPartsText(parts)
  for (const name of ['自定义低级别', '自定义高级别', '视觉任务']) assert.ok(text.includes(name), text)
  assert.ok(!text.includes('aiTaskMediaTarget'))
})
