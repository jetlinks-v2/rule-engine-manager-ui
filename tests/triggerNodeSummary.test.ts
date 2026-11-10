import assert from 'node:assert/strict'
import test from 'node:test'
import { deviceTriggerNodeSummary, triggerNodeTitle } from '../views/SceneLinkage/editor/triggerNodeSummary'
import type { SceneMultiTriggerForm } from '../views/SceneLinkage/utils'

const messages: Record<string, string> = {
  'IotSceneLinkage.node.deviceTrigger': '物联设备触发', 'IotSceneLinkage.triggerType.timer': '定时触发',
  'IotSceneLinkage.stateCondition.any': '任意状态变化', 'IotSceneLinkage.stateCondition.online': '在线',
  'IotSceneLinkage.deviceState.online': '在线', 'IotSceneLinkage.deviceState.offline': '离线',
  'IotSceneLinkage.term.gt': '大于', 'IotSceneLinkage.term.eq': '等于',
  'IotSceneLinkage.node.allProductTarget': '所有的 {product}', 'IotSceneLinkage.node.scopedProductTarget': '{scope} 所有的 {product}',
  'IotSceneLinkage.scope.all': '全部设备', 'IotSceneLinkage.scope.areaGroupFull': '所属空间：{names}',
}
const t = (key: string, params: Record<string, unknown> = {}) => (messages[key] || key).replace(/\{([^}]+)\}/g, (_, name) => String(params[name] ?? ''))
const form = (values: Partial<SceneMultiTriggerForm> = {}) => ({ triggerKind: 'online', deviceIds: ['d1'], groupIds: [], scopeOptions: { names: ['TCP'] }, productName: 'TCP产品', ...values }) as SceneMultiTriggerForm

test('trigger headers describe the category and device body describes the state', () => {
  assert.equal(triggerNodeTitle('online', t), '物联设备触发')
  assert.equal(triggerNodeTitle('property', t), '物联设备触发')
  assert.equal(triggerNodeTitle('repeat', t), '定时触发')
  assert.equal(deviceTriggerNodeSummary(form(), t), 'TCP 在线')
  assert.equal(deviceTriggerNodeSummary(form({ triggerKind: 'offline' }), t), 'TCP 离线')
  assert.equal(deviceTriggerNodeSummary(form({ triggerKind: 'state', deviceState: 'any' }), t), 'TCP 任意状态变化')
  assert.equal(deviceTriggerNodeSummary(form({ triggerKind: 'state', deviceState: 'online' }), t), 'TCP 在线')
})

test('detailed fixed-device names come from the original selector without adding device counts', () => {
  const input = form({ scopeOptions: {} })
  const source = { selector: 'fixed', selectorValues: [{ value: 'd1', name: 'TCP' }, { value: 'd2', name: 'TCP2' }] }
  const snapshot = structuredClone(source)
  assert.equal(deviceTriggerNodeSummary(input, t, source), 'TCP、TCP2 在线')
  assert.deepEqual(source, snapshot)
})

test('property and event summaries retain operators, zero and false values', () => {
  assert.equal(deviceTriggerNodeSummary(form({ triggerKind: 'property', propertyName: '温度', termType: 'gt', termValue: 0 }), t), 'TCP 温度 大于 0')
  assert.equal(deviceTriggerNodeSummary(form({ triggerKind: 'property', propertyName: '开关', termType: 'eq', termValue: false }), t), 'TCP 开关 等于 false')
  assert.equal(deviceTriggerNodeSummary(form({ triggerKind: 'event', eventName: '告警', eventOutputName: '级别', eventTermType: 'eq', eventTermValue: 0 }), t), 'TCP 告警 级别 等于 0')
})

test('all-device and dynamic ranges remain identifiable instead of showing a fixed-device label', () => {
  assert.equal(deviceTriggerNodeSummary(form({ allDevices: true }), t), '所有的 TCP产品 在线')
  assert.equal(deviceTriggerNodeSummary(form({ dynamicScope: true, dynamicScopeType: 'space', groupIds: ['f1'], scopeOptions: { names: ['一层'] } }), t), '一层 所有的 TCP产品 在线')
})
