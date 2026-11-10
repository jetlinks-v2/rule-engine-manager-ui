import assert from 'node:assert/strict'
import test from 'node:test'
import detailedTemplate from './fixtures/sceneDetailedTemplate.json'
import { parseSceneTemplate, toSceneTemplate } from '../views/SceneLinkage/sceneCompatibility'
import type { SceneRuleRecord } from '../views/SceneLinkage/editor/editorMode'

const quickRule = () => ({
  name: '快速模板',
  trigger: { type: 'manual' },
  branches: [{ when: [], then: [{ parallel: false, actions: [{ executor: 'delay', delay: 1 }] }] }],
  options: { editorMode: 'quick' },
})

test('exported detailed device-online rule imports with its custom timestamp condition and collector action', () => {
  const source = structuredClone(detailedTemplate)
  const before = structuredClone(source)
  const result = parseSceneTemplate(source, true)
  assert.equal(result.supported, true)
  assert.deepEqual(result.data?.trigger, source.trigger)
  assert.deepEqual(result.data?.branches, source.branches)
  assert.deepEqual(result.data?.options, source.options)
  assert.deepEqual(result.data?.branches[0].when[0].terms[0], {
    column: 'timestamp', value: { source: 'manual', value: '22:41:23' },
    type: 'and', termType: 'neq', options: [], terms: [],
  })
  assert.equal(result.data?.branches[0].then[0].actions[0].collector.pointSelectInfos[0].pointIds[0], 'point-1')
  assert.deepEqual(source, before)
})

test('detailed export/import round trip retains branches, parallel actions, action conditions, debounce and parameter references', () => {
  const rule: SceneRuleRecord = {
    ...structuredClone(detailedTemplate), id: 'source-scene', executionCount: 12, lastExecutionTime: 123,
    branches: [{
      branchId: 100,
      when: [{ type: 'or', terms: [{ column: 'alarmTargetName', termType: 'like', value: { source: 'manual', value: 'AAA' } }] }],
      shakeLimit: { enabled: true, time: 60, threshold: 2, continuous: false, outputFirst: true },
      then: [{ parallel: false, actions: [{
        actionId: 101, executor: 'collector',
        collector: { handlerType: 'write', source: 'upper', value: 'branch_1_group_1_action_1.temperature', pointSelectInfos: [{ collectorId: 'collector-1', pointIds: ['point-1'] }] },
        terms: [{ column: 'branch_1_group_1_action_1.state', termType: 'eq', value: { source: 'manual', value: false } }],
      }] }, { parallel: true, actions: [{ executor: 'delay', delay: 0 }] }],
    }, {
      when: [], executeAnyway: true,
      then: [{ parallel: false, actions: [{ executor: 'sceneNotify', configuration: { notifyChannelIds: ['channel-1'], userIds: ['user-1'] } }] }],
    }],
  }
  const result = parseSceneTemplate(JSON.parse(JSON.stringify(toSceneTemplate(rule))), true)
  assert.equal(result.supported, true)
  assert.equal(result.data?.id, undefined)
  assert.equal(result.data?.executionCount, undefined)
  assert.equal(result.data?.lastExecutionTime, undefined)
  assert.deepEqual(result.data?.branches[0].when, rule.branches[0].when)
  assert.deepEqual(result.data?.branches[0].shakeLimit, rule.branches[0].shakeLimit)
  assert.deepEqual(result.data?.branches[0].then[0].actions[0].collector, rule.branches[0].then[0].actions[0].collector)
  assert.deepEqual(result.data?.branches[0].then[0].actions[0].terms, rule.branches[0].then[0].actions[0].terms)
  assert.deepEqual(result.data?.branches[0].then[1], rule.branches[0].then[1])
  assert.deepEqual(result.data?.branches[1], rule.branches[1])
})

test('private imports use the same mode fallback as the editor and retain native trigger providers', () => {
  const triggers = [
    { type: 'manual' },
    { type: 'timer', timer: { cron: '0 0 8 * * ?' } },
    detailedTemplate.trigger,
    { type: 'alarm', configuration: { modes: ['trigger', 'relieve'], alarmConfigId: 'alarm-1' } },
    { type: 'ai-event', configuration: { taskId: 'task-1' } },
    { type: 'multi', multi: { triggers: [{ index: 1, trigger: detailedTemplate.trigger }, { index: 2, trigger: { type: 'ai-event', configuration: { taskId: 'task-1' } } }] } },
    { type: 'collector', collector: { pointSelectInfos: [{ collectorId: 'collector-1', pointIds: ['point-1'] }] } },
  ]
  for (const trigger of triggers) {
    const source = { ...detailedTemplate, trigger, options: {} }
    const result = parseSceneTemplate(source, true)
    assert.equal(result.supported, true, trigger.type)
    assert.deepEqual(result.data?.trigger, trigger)
  }
})

test('SaaS and explicitly quick templates retain quick-editor compatibility limits', () => {
  assert.equal(parseSceneTemplate(quickRule(), true).supported, true)
  assert.equal(parseSceneTemplate(quickRule(), false).supported, true)
  assert.equal(parseSceneTemplate(detailedTemplate, false).reason, 'IotSceneLinkage.message.unsupportedCondition')
  assert.equal(parseSceneTemplate({ ...detailedTemplate, options: { editorMode: 'quick' } }, true).reason, 'IotSceneLinkage.message.unsupportedCondition')
  const withCollector = { ...detailedTemplate, branches: [{ when: [], then: detailedTemplate.branches[0].then }], options: { editorMode: 'quick' } }
  assert.equal(parseSceneTemplate(withCollector, true).reason, 'IotSceneLinkage.message.unsupportedAction')
})

test('invalid template envelopes are rejected in both deployment modes', () => {
  for (const privateDeployment of [true, false]) {
    for (const source of [null, [], {}, { ...quickRule(), name: ' ' }, { ...quickRule(), name: 12 },
      { ...quickRule(), trigger: {} }, { ...quickRule(), trigger: { type: '' } }, { ...quickRule(), branches: {} }]) {
      const result = parseSceneTemplate(source, privateDeployment)
      assert.equal(result.supported, false)
      assert.equal(result.data, undefined)
      assert.equal(result.reason, 'IotSceneLinkage.message.invalidTemplate')
    }
  }
})
