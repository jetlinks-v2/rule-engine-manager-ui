import assert from 'node:assert/strict'
import test from 'node:test'
import { toSceneTemplate } from '../views/SceneLinkage/sceneCompatibility'

test('scene templates omit runtime statistics while preserving nested business parameters', () => {
  const source = {
    id: 'scene-1',
    name: '场景模板',
    runtimeInfo: { instanceId: 'scene-1', nodeId: 'scene-1', executor: 'scene', executionCount: 12, errorCount: 2, lastExecutionTime: 1790000000000 },
    executionCount: 12,
    lastExecutionTime: 1790000000000,
    options: { summary: '规则摘要' },
    actions: [{ configuration: { executionCount: 3, lastExecutionTime: 123 } }],
  }
  const template = toSceneTemplate(source) as Record<string, unknown>
  assert.equal('executionCount' in template, false)
  assert.equal('lastExecutionTime' in template, false)
  assert.equal('runtimeInfo' in template, false)
  assert.equal('id' in template, false)
  assert.deepEqual(template.actions, source.actions)
  assert.deepEqual(template.options, source.options)
  assert.equal(source.executionCount, 12)
  assert.equal(source.lastExecutionTime, 1790000000000)
  assert.deepEqual(toSceneTemplate([source]), [template])
})
