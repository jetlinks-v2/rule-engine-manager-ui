import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, reactive, ref } from 'vue'
import { useMultiSceneTrigger } from '../views/SceneLinkage/editor/useMultiSceneTrigger'
import { buildRequest, defaultForm, defaultMultiTriggerForm, toForm } from '../views/SceneLinkage/utils'

const visualLeaf = () => {
  const leaf = defaultMultiTriggerForm()
  leaf.triggerKind = 'ai-event'
  leaf.aiEvent = {
    sceneId: 'vision-scene', sceneName: '人员检测', taskTarget: 'PersonDetection', taskTargetName: '人员识别',
    mediaTargets: [{ deviceId: 'camera-1', channelId: 'channel-1', entityId: 'media-1', name: '入口摄像头' }],
    condition: { column: 'maxTargetScore', termType: 'gte', value: 90 },
  }
  return leaf
}

test('visual and timer leaves retain independent conditions and camera display information', () => {
  const form = defaultForm()
  const visual = visualLeaf()
  const timer = defaultMultiTriggerForm()
  timer.triggerKind = 'repeat'
  timer.repeatTime = '09:30'
  Object.assign(form, visual, { multiTriggers: [visual, timer] })
  const request = buildRequest(form)
  assert.equal(request.trigger.type, 'multi')
  const leaves = request.trigger.multi.triggers
  assert.equal(leaves[0].trigger.type, 'ai-event')
  assert.deepEqual(leaves[0].terms, [{ column: 'maxTargetScore', termType: 'gte', value: 90 }])
  assert.equal(leaves[1].trigger.type, 'timer')
  assert.deepEqual(leaves[1].terms, [])
  const restored = toForm(request)
  assert.deepEqual(restored.multiTriggers?.[0].aiEvent, visual.aiEvent)
  assert.equal(restored.multiTriggers?.[1].repeatTime, '09:30')
  // 详细模式只传触发器，不含 branches 时也必须还原叶子的结果条件。
  assert.equal(toForm({ trigger: request.trigger }).multiTriggers?.[0].aiEvent.condition?.value, 90)
})

test('recognition windows belong to visual leaves instead of the shared action branch', () => {
  for (const rule of [{ type: 'hits', time: 60, threshold: 3 }, { type: 'missed', time: 120 }] as const) {
    const form = defaultForm()
    const visual = visualLeaf()
    visual.aiEvent.condition = undefined
    visual.aiEvent.recognitionRule = rule
    const timer = defaultMultiTriggerForm()
    timer.triggerKind = 'interval'
    Object.assign(form, visual, { multiTriggers: [visual, timer] })
    const request = buildRequest(form)
    assert.equal(request.branches[0].shakeLimit.enabled, false)
    assert.equal(request.trigger.multi.triggers[0].shakeLimit.time, rule.time)
    assert.equal(request.trigger.multi.triggers[1].shakeLimit.enabled, false)
    const restored = toForm(request)
    assert.deepEqual(restored.multiTriggers?.[0].aiEvent.recognitionRule, rule)
    assert.equal(restored.multiTriggers?.[1].aiEvent.recognitionRule, undefined)
  }
})

test('multi-trigger entry follows agreed types and registered providers, retaining the manual restriction', () => {
  const scope = effectScope()
  scope.run(() => {
    const form = reactive(defaultForm())
    form.triggerKind = 'ai-event'
    const providers = ref<string[]>(['multi'])
    const editor = useMultiSceneTrigger(form, providers, () => {}, () => false, () => {})
    assert.equal(editor.showMultiTriggerControl.value, false)
    providers.value.push('ai-event')
    assert.equal(editor.showMultiTriggerControl.value, true)
    form.triggerKind = 'manual'
    assert.equal(editor.showMultiTriggerControl.value, false)
  })
  scope.stop()
})
