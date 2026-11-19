import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope } from 'vue'
import { queryAiVisualAlarmTasks, type AiVisualAlarmTask } from '../api/scene-linkage'
import { setSceneTestRequestHandler } from './sceneTestHttp'
import { loadVisualAlarmTaskPage, toVisualAlarmTaskOption } from '../views/SceneLinkage/editor/aiVisualAlarmTaskService'
import { createAiVisualAlarmTaskResourceOption } from '../views/SceneLinkage/editor/aiEventResourceOptions'
import { useAiEventResources } from '../views/SceneLinkage/editor/useAiEventResources'

const task = (id: string): AiVisualAlarmTask => ({
  id, name: `Task ${id}`, type: 'visualAlarm', enabled: true,
  trigger: { type: 'ai-history', config: { sceneId: 'scene', taskTarget: 'PersonDetection', targets: [{ deviceId: 'device' }] } },
  actions: [{ type: 'alarm', config: { alarmLevel: 3, timerPeriodSpec: { trigger: 'week', periods: [{ when: 1, from: '08:00', to: '18:00' }] } } }],
})

test('visual alarm query filters native task type and JSON scope before pagination', async () => {
  setSceneTestRequestHandler((_method, url, body: any) => {
    assert.equal(url, '/ai/trigger/tasks/_query')
    assert.equal(body.pageIndex, 2)
    assert.deepEqual(body.terms, [
      { column: 'type', termType: 'eq', value: 'visualAlarm' },
      { column: 'trigger', termType: 'json_value', value: { path: '$.config.sceneId', termType: 'eq', value: 'scene' } },
      { column: 'trigger', termType: 'json_value', value: { path: '$.config.taskTarget', termType: 'eq', value: 'PersonDetection' } },
      { terms: [{ column: 'name', termType: 'like', value: '%test%', type: 'or' }] },
    ])
    return Promise.resolve({ result: { data: [], total: 0 } })
  })
  try {
    await queryAiVisualAlarmTasks({ pageIndex: 2, terms: [{ column: 'name', termType: 'like', value: '%test%', type: 'or' }] },
      { sceneId: 'scene', taskTarget: 'PersonDetection' })
  } finally { setSceneTestRequestHandler() }
})

test('native task fields map to unchanged alarm references and the first alarm operation', () => {
  const raw = task('migrated-id')
  raw.actions!.unshift({ type: 'notification', config: {} })
  raw.actions!.push({ type: 'alarm', config: { alarmLevel: 5 } })
  const option = toVisualAlarmTaskOption(raw)!
  assert.equal(option.id, 'migrated-id')
  assert.equal(option.sceneId, 'scene')
  assert.equal(option.sourceCount, 1)
  assert.equal(option.alarmLevel, 3)
  assert.equal(option.timerPeriodSpec?.trigger, 'week')
  const translate = (key: string) => key
  assert.match(createAiVisualAlarmTaskResourceOption(option, {}, translate).description!, /activeCustom/)
  delete raw.actions
  assert.match(createAiVisualAlarmTaskResourceOption(toVisualAlarmTaskOption(raw)!, {}, translate).description!, /activeAllDay/)
  raw.trigger!.config!.sceneId = undefined
  assert.equal(toVisualAlarmTaskOption(raw), undefined)
})

test('selected migrated task is read by ID outside the current page and keeps server pagination', async () => {
  const calls: string[] = []
  setSceneTestRequestHandler((_method, url, body: any) => {
    calls.push(String(url))
    if (url === '/ai/trigger/tasks/_query') {
      assert.equal(body.pageIndex, 0)
      return Promise.resolve({ result: { data: [task('first')], total: 31 } })
    }
    assert.equal(url, '/ai/trigger/tasks/old%2Fid')
    return Promise.resolve({ result: task('old/id') })
  })
  try {
    const page = await loadVisualAlarmTaskPage(0, { sceneId: 'scene', taskTarget: 'PersonDetection' }, 'old/id')
    assert.deepEqual(page.data.map(item => item.id), ['old/id', 'first'])
    assert.equal(page.hasMore, true)
    assert.equal(page.total, 31)
    assert.equal(calls.length, 2)
  } finally { setSceneTestRequestHandler() }
})

test('task dropdown appends pages and resolves target names from the selected scene', async () => {
  const scope = effectScope()
  setSceneTestRequestHandler((_method, url, body: any) => {
    if (url === '/ai/scene/tree/_query/no-paging') return Promise.resolve({ result: [{ id: 'scene', name: 'Scene', children: [{ value: 'PersonDetection', text: '人员检测' }] }] })
    assert.equal(url, '/ai/trigger/tasks/_query')
    return Promise.resolve({ result: { data: [task(body.pageIndex ? 'second' : 'first')], total: 31 } })
  })
  try {
    const resources = scope.run(() => useAiEventResources('alarm'))!
    await resources.loadSceneTree()
    await resources.loadAggregateTasks('scene', 'PersonDetection')
    assert.equal(resources.hasMoreAggregateTasks.value, true)
    await resources.loadAggregateTasks('scene', 'PersonDetection', undefined, true)
    assert.deepEqual(resources.aggregateTasks.value.map(item => item.id), ['first', 'second'])
    assert.equal(resources.aggregateTasks.value[0].taskTargets[0].text, '人员检测')
    assert.equal(resources.hasMoreAggregateTasks.value, false)
  } finally { scope.stop(); setSceneTestRequestHandler() }
})

test('business failures do not become an empty task list', async () => {
  setSceneTestRequestHandler(() => Promise.resolve({ success: false, result: [] }))
  try { await assert.rejects(loadVisualAlarmTaskPage(0)) }
  finally { setSceneTestRequestHandler() }
})
