import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeDetailedDraft,
  mergeEditorMode,
  mergeQuickDraft,
  createClearedDetailedDraft,
  resolveInitialEditorMode,
  resolveLockedTriggerProviders,
} from '../views/SceneLinkage/editor/editorMode'
import { hasUnsupportedLegacyAlarmAction } from '../views/SceneLinkage/sceneRule'
import {
  findSceneCondition,
  replaceManagedSceneCondition,
  toDetailedConditionGroups,
} from '../views/SceneLinkage/sceneRule'

test('SaaS always opens quick mode while private deployments honor persisted editor mode', () => {
  assert.equal(resolveInitialEditorMode({ options: { editorMode: 'detail' } }, false), 'quick')
  assert.equal(resolveInitialEditorMode({ options: { editorMode: 'quick' } }, true), 'quick')
  assert.equal(resolveInitialEditorMode({ options: { editorMode: 'unexpected' } }, true), 'detail')
  assert.equal(resolveInitialEditorMode({}, false), 'quick')
})

test('merging an editor mode does not overwrite unrelated rule options', () => {
  const rule = { options: { summary: '夜间联动', trigger: { productName: '温湿度传感器' } } }
  const result = mergeEditorMode(rule, 'detail')

  assert.deepEqual(result.options, {
    summary: '夜间联动',
    trigger: { productName: '温湿度传感器' },
    editorMode: 'detail',
    editorSchemaVersion: 2,
  })
  assert.equal('editorMode' in rule.options, false)
})

test('legacy scene alarm actions prevent a save until the rule is reconfigured', () => {
  assert.equal(hasUnsupportedLegacyAlarmAction({
    branches: [{ then: [{ actions: [{ executor: 'alarm', alarm: { mode: 'trigger' } }] }] }],
  }), true)
  assert.equal(hasUnsupportedLegacyAlarmAction({
    branches: [{ then: [{ actions: [{ executor: 'alarm-record-query' }] }] }],
  }), false)
})

test('switching to detailed mode starts from a cleared rule tree', () => {
  const result = createClearedDetailedDraft({ id: 'scene-1', name: '夜间联动', description: '说明' })

  assert.deepEqual(result, {
    id: 'scene-1',
    name: '夜间联动',
    description: '说明',
    triggerType: '',
    trigger: {},
    branches: [],
    options: { editorMode: 'detail', when: [], summary: '', summaryTitle: '' },
  })
})

test('editing keeps the persisted trigger provider while supporting multi leaves', () => {
  assert.deepEqual(resolveLockedTriggerProviders({ triggerType: 'device', trigger: { type: 'device' } }), ['device'])
  assert.deepEqual(resolveLockedTriggerProviders({
    triggerType: 'multi',
    trigger: { type: 'multi', multi: { triggers: [{ trigger: { type: 'device' } }, { trigger: { type: 'timer' } }] } },
  }), ['device', 'timer'])
})

test('detailed saves remove only UI fields while retaining unknown node metadata', () => {
  const result = mergeDetailedDraft({
    options: { source: 'legacy', trigger: { productName: '设备 A' } },
    branches: [{ branchId: 'branch-1', options: { branchSource: 'legacy' } }],
  }, {
    name: '已更新场景',
    options: { when: [{ branchName: '条件 1' }] },
    branches: [{
      branchId: 'branch-1',
      key: 'local-branch-key',
      options: { branchSource: 'legacy', localView: 'detail' },
      then: [{ actions: [{ actionId: 'action-1', key: 'local-action-key', error: true, options: { actionSource: 'legacy' } }] }],
    }],
  })

  assert.equal(result.options.editorMode, 'detail')
  assert.equal(result.options.editorSchemaVersion, 2)
  assert.equal(result.options.source, 'legacy')
  assert.deepEqual(result.options.trigger, { productName: '设备 A' })
  assert.equal(result.branches[0].key, undefined)
  assert.equal(result.branches[0].then[0].actions[0].key, undefined)
  assert.equal(result.branches[0].then[0].actions[0].error, undefined)
  assert.deepEqual(result.branches[0].then[0].actions[0].options, { actionSource: 'legacy' })
})

test('quick saves preserve metadata on nodes that remain in the quick projection', () => {
  const result = mergeQuickDraft({
    options: { existingOption: true },
    trigger: { type: 'device', legacyTriggerOption: 'keep' },
    branches: [{ branchId: 'branch-1', unknownBranchOption: 'keep', then: [{ parallel: false, actions: [{ actionId: 'action-1', executor: 'device', configuration: { legacyConfig: 'keep' }, options: { legacyOption: 'keep' } }] }] }],
  }, {
    options: { summary: '新摘要' },
    trigger: { type: 'device', device: { productId: 'product-1' } },
    branches: [{ branchId: 'branch-1', when: [], then: [{ parallel: false, actions: [{ actionId: 'action-1', executor: 'device', device: { messageType: 'WRITE_PROPERTY' }, options: { name: '控制设备' } }] }] }],
  })

  assert.equal(result.options.editorMode, 'quick')
  assert.equal(result.options.editorSchemaVersion, 2)
  assert.equal(result.options.existingOption, true)
  assert.equal(result.trigger.legacyTriggerOption, 'keep')
  assert.equal(result.branches[0].unknownBranchOption, 'keep')
  assert.deepEqual(result.branches[0].then[0].actions[0].configuration, { legacyConfig: 'keep' })
  assert.deepEqual(result.branches[0].then[0].actions[0].options, { legacyOption: 'keep', name: '控制设备' })
})

test('an empty quick baseline does not restore discarded detailed branches or actions', () => {
  const result = mergeQuickDraft({
    id: 'scene-1',
    name: '原详细场景',
    options: { editorMode: 'quick' },
  }, {
    id: 'scene-1',
    name: '重新配置的快速场景',
    trigger: { type: 'timer', timer: { cron: '0 * * * * ?' } },
    branches: [{ when: [], then: [{ parallel: false, actions: [{ executor: 'delay' }] }] }],
  })

  assert.equal(result.options.editorMode, 'quick')
  assert.equal(result.options.editorSchemaVersion, 2)
  assert.equal(result.branches.length, 1)
  assert.deepEqual(result.branches[0].then[0].actions, [{ executor: 'delay' }])
})

test('detailed draft wraps quick conditions without changing their rule semantics', () => {
  const conditions = toDetailedConditionGroups([
    { column: 'properties.temperature.current', termType: 'gt', value: 30, option: 'keep' },
  ])

  assert.deepEqual(conditions, [{
    type: 'and',
    terms: [{ column: 'properties.temperature.current', termType: 'gt', value: 30, option: 'keep' }],
  }])
})

test('specialized trigger conditions replace only their owned leaves', () => {
  const conditions = [{
    type: 'and',
    terms: [
      { column: 'bizId', termType: 'eq', value: 'old-scene-old-task' },
      { column: 'properties.temperature.current', termType: 'gt', value: 30 },
    ],
  }]
  const result = replaceManagedSceneCondition(
    conditions,
    term => term.column === 'bizId' && term.value === 'old-scene-old-task',
    { column: 'bizId', termType: 'eq', value: 'new-scene-new-task' },
  )

  assert.equal(findSceneCondition(result, term => term.column === 'bizId')?.value, 'new-scene-new-task')
  assert.equal(findSceneCondition(result, term => term.column === 'properties.temperature.current')?.value, 30)
  assert.deepEqual(conditions[0].terms[0], { column: 'bizId', termType: 'eq', value: 'old-scene-old-task' })
})
