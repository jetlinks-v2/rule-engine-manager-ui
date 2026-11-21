import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref, nextTick } from 'vue'
import { setImmediate } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
import { queryAiVisualAlarmTasks, type AiVisualAlarmTask } from '../api/scene-linkage'
import { setSceneTestRequestHandler } from './sceneTestHttp'
import { loadVisualAlarmTaskPage, toVisualAlarmTaskOption } from '../views/SceneLinkage/editor/aiVisualAlarmTaskService'
import { createAiVisualAlarmTaskResourceOption } from '../views/SceneLinkage/editor/aiEventResourceOptions'
import { useAiEventResources } from '../views/SceneLinkage/editor/useAiEventResources'
import { useAlarmConditionModel, type AlarmConditionOptions } from '../views/SceneLinkage/editor/alarm/useAlarmConditionModel'
import { iotAlarmSummary } from '../views/SceneLinkage/editor/alarm/utils'
import { loadIotAlarmRules } from '../views/SceneLinkage/editor/alarm/alarmConditionResourceService'

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

for (const status of [403, 404, 500]) {
  test(`unreadable selected task (${status}) preserves the authorized page and reports its own issue`, async () => {
    setSceneTestRequestHandler((_method, url) => url === '/ai/trigger/tasks/_query'
      ? Promise.resolve({ result: { data: [task('available')], total: 31 } })
      : Promise.reject({ response: { status } }))
    try {
      const page = await loadVisualAlarmTaskPage(0, {}, 'old')
      assert.deepEqual(page.data.map(item => item.id), ['available'])
      assert.equal(page.hasMore, true)
      assert.equal(page.selectedTaskIssue, status === 500 ? 'loadFailed' : 'unavailable')
    } finally { setSceneTestRequestHandler() }
  })
}

test('selected task business failures and empty responses cannot become selectable historical options', async () => {
  for (const selected of [{ status: 403, result: null }, { status: 200, result: null }]) {
    setSceneTestRequestHandler((_method, url) => Promise.resolve(url === '/ai/trigger/tasks/_query'
      ? { result: { data: [task('available')], total: 1 } } : selected))
    try {
      const page = await loadVisualAlarmTaskPage(0, {}, 'old')
      assert.equal(page.selectedTaskIssue, 'unavailable')
      assert.deepEqual(page.data.map(item => item.id), ['available'])
    } finally { setSceneTestRequestHandler() }
  }
})

test('task search applies name or ID inside the server scene and algorithm scope before paging', async () => {
  setSceneTestRequestHandler((_method, url, body: any) => {
    assert.equal(url, '/ai/trigger/tasks/_query')
    assert.equal(body.pageIndex, 0)
    assert.equal(body.pageSize, 30)
    assert.equal(body.terms[1].value.path, '$.config.sceneId')
    assert.deepEqual(body.terms.at(-1), { terms: [
      { column: 'name', termType: 'like', value: '%target on page 2%' },
      { column: 'id', termType: 'like', value: '%target on page 2%', type: 'or' },
    ] })
    return Promise.resolve({ result: { data: [task('page-2-target')], total: 1 } })
  })
  try {
    const page = await loadVisualAlarmTaskPage(0, { sceneId: 'scene', taskTarget: 'PersonDetection' }, undefined, ' target on page 2 ')
    assert.equal(page.data[0].id, 'page-2-target')
  } finally { setSceneTestRequestHandler() }
})

test('task search debounces, resets pagination, keeps the keyword on append and ignores older responses', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const scope = effectScope()
  const queries: any[] = []
  let resolveOld: (value: unknown) => void = () => {}
  setSceneTestRequestHandler((_method, _url, body: any) => {
    queries.push(body)
    const keyword = body.terms.at(-1)?.terms?.[0]?.value
    if (keyword === '%old%') return new Promise(resolve => { resolveOld = resolve })
    return Promise.resolve({ result: { data: [task(keyword ? `new-${body.pageIndex}` : 'initial')], total: 31 } })
  })
  try {
    const resources = scope.run(() => useAiEventResources('alarm'))!
    await resources.loadAggregateTasks('scene', 'PersonDetection')
    resources.searchAggregateTasks('o')
    resources.searchAggregateTasks('old')
    context.mock.timers.tick(249)
    assert.equal(queries.length, 1)
    context.mock.timers.tick(1)
    await setImmediate()
    resources.searchAggregateTasks('new')
    context.mock.timers.tick(250)
    await setImmediate()
    assert.deepEqual(resources.aggregateTasks.value.map(item => item.id), ['new-0'])
    resolveOld({ result: { data: [task('stale')], total: 1 } })
    await setImmediate()
    assert.deepEqual(resources.aggregateTasks.value.map(item => item.id), ['new-0'])
    await resources.loadAggregateTasks('scene', 'PersonDetection', undefined, true)
    assert.equal(queries.at(-1).pageIndex, 1)
    assert.equal(queries.at(-1).terms.at(-1).terms[0].value, '%new%')
    assert.deepEqual(resources.aggregateTasks.value.map(item => item.id), ['new-0', 'new-1'])
    resources.searchAggregateTasks('cancelled')
    scope.stop()
    context.mock.timers.tick(250)
    assert.equal(queries.length, 4)
  } finally { scope.stop(); setSceneTestRequestHandler() }
})

test('changing task scope cancels pending search and clears the previous keyword', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const scope = effectScope()
  const queries: any[] = []
  setSceneTestRequestHandler((_method, _url, body: any) => {
    queries.push(body)
    return Promise.resolve({ result: { data: [], total: 0 } })
  })
  try {
    const resources = scope.run(() => useAiEventResources('alarm'))!
    await resources.loadAggregateTasks('scene', 'PersonDetection')
    resources.searchAggregateTasks('old search')
    await resources.loadAggregateTasks('another-scene', 'ClutterDetection')
    context.mock.timers.tick(250)
    assert.equal(queries.length, 2)
    assert.equal(queries[1].terms[1].value.value, 'another-scene')
    assert.equal(queries[1].terms.length, 3)
  } finally { scope.stop(); setSceneTestRequestHandler() }
})

test('invalid historical rule stays visible but cannot be saved until a readable rule is selected', async () => {
  const scope = effectScope()
  setSceneTestRequestHandler((_method, url) => {
    if (url === '/ai/scene/alarm/tree/_query') return Promise.resolve({ result: [] })
    if (url === '/ai/trigger/tasks/_query') return Promise.resolve({ result: { data: [task('replacement')], total: 1 } })
    return Promise.reject({ status: 404 })
  })
  try {
    const options = ref<AlarmConditionOptions>({ open: false, mode: 'condition', sourceKind: 'visual-ai', modelValue: {
      sourceKind: 'visual-ai', targetType: 'aiTaskMediaTarget', alarmConfigId: 'deleted', modes: [], state: 'normal',
      options: { alarmConfigName: 'Historical rule' },
    } })
    const model = scope.run(() => useAlarmConditionModel(() => options.value, key => key))!
    await model.resetAndLoad()
    assert.equal(model.loadError.value, false)
    assert.equal(model.selectedTaskIssue.value, 'unavailable')
    assert.equal(model.selectedRule.value?.name, 'Historical rule')
    assert.equal(model.getValue(), undefined)
    model.selectRule(model.filteredRules.value.find(rule => rule.id === 'replacement')!)
    assert.equal(model.selectedTaskIssue.value, undefined)
    assert.equal(model.getValue()?.alarmConfigId, 'replacement')
    assert.equal(model.getValue()?.state, 'normal')
    assert.equal(options.value.modelValue.alarmConfigId, 'deleted')
  } finally { scope.stop(); setSceneTestRequestHandler() }
})

test('modal close and reopen ignore delayed responses from the previous session', async () => {
  const scope = effectScope()
  let resolveOld: (value: unknown) => void = () => {}
  let pages = 0
  setSceneTestRequestHandler((_method, url) => {
    if (url === '/ai/scene/alarm/tree/_query') return Promise.resolve({ result: [] })
    if (++pages === 1) return new Promise(resolve => { resolveOld = resolve })
    return Promise.resolve({ result: { data: [task('new')], total: 1 } })
  })
  try {
    const options = ref<AlarmConditionOptions>({ open: true, sourceKind: 'visual-ai', mode: 'trigger', modelValue: { modes: [], state: 'warning' } })
    const model = scope.run(() => useAlarmConditionModel(() => options.value, key => key))!
    await setImmediate()
    options.value.open = false
    await nextTick()
    options.value.open = true
    await nextTick()
    await setImmediate()
    assert.equal(model.getValue()?.alarmConfigId, 'new')
    assert.deepEqual(model.getValue()?.modes, ['trigger'])
    resolveOld({ result: { data: [task('stale')], total: 1 } })
    await setImmediate()
    assert.equal(model.getValue()?.alarmConfigId, 'new')
  } finally { scope.stop(); setSceneTestRequestHandler() }
})

test('extracted IoT alarm loading keeps preprocessor IDs, product-wide scope and readable names', async () => {
  setSceneTestRequestHandler((_method, url) => {
    if (url === '/message/preprocessor/device-alarm/_query') return Promise.resolve({ result: { data: [{ templateId: 'product', propertyName: 'temperature',
      alarm: { id: 'preprocessor', thingId: '@all', configuration: { processors: [{ provider: 'device-alarm', configuration: { alarmName: 'High temperature', alarmLevel: 3 } }] } },
    }], total: 1 } })
    if (url === '/device/product/_query') return Promise.resolve({ result: { data: [{ id: 'product', name: 'Product' }] } })
    throw new Error(`Unexpected request ${url}`)
  })
  try {
    const rules = await loadIotAlarmRules('normal', key => key)
    assert.equal(rules[0].id, 'preprocessor')
    assert.equal(rules[0].value.options?.productName, 'Product')
    assert.equal(rules[0].value.options?.deviceId, undefined)
    assert.equal(rules[0].value.state, 'normal')
    const scope = effectScope()
    try {
      const options: AlarmConditionOptions = { open: false, sourceKind: 'iot-device', mode: 'trigger', modelValue: {
        alarmConfigId: 'preprocessor', modes: ['relieve'], state: 'normal', options: { alarmConfigName: 'temperature' },
      } }
      const model = scope.run(() => useAlarmConditionModel(() => options, key => key))!
      await model.resetAndLoad()
      assert.equal(model.selectedRule.value?.name, 'High temperature')
      assert.equal(model.getValue()?.options?.alarmConfigName, 'High temperature')
      assert.deepEqual(model.getValue()?.modes, ['relieve'])
      assert.equal(model.getValue()?.state, 'normal')
      assert.equal(options.modelValue.options?.alarmConfigName, 'temperature')
    } finally { scope.stop() }
  } finally { setSceneTestRequestHandler() }
})

test('empty IoT alarms do not issue product or device lookups', async () => {
  let calls = 0
  setSceneTestRequestHandler((_method, url) => {
    calls += 1
    assert.equal(url, '/message/preprocessor/device-alarm/_query')
    return Promise.resolve({ result: { data: [], total: 0 } })
  })
  try {
    assert.deepEqual(await loadIotAlarmRules('warning', key => key), [])
    assert.equal(calls, 1)
  } finally { setSceneTestRequestHandler() }
})

test('IoT composite alarms display the alarm branch name, level and comparison, ignoring recovery', () => {
  const summary = iotAlarmSummary({ propertyName: '电压', alarm: { provider: 'composite', configuration: { processors: [
    { provider: 'simple', configuration: { matcher: { provider: 'number-compare', configuration: { operator: 'lte', value: 0 } },
      processors: [{ provider: 'device-alarm-relieve', configuration: { alarmName: '恢复', alarmLevel: 5 } }] } },
    { provider: 'simple', configuration: { matcher: { provider: 'number-compare', configuration: { operator: 'gt', value: 0 } },
      processors: [{ provider: 'notify' }, { provider: 'device-alarm', configuration: { alarmName: '电压过高', alarmLevel: 2 } }] } },
  ] } } })
  assert.deepEqual(summary, { name: '电压过高', level: 2, condition: '电压 > 0' })
})

test('IoT matcher readback covers numeric comparisons, default range, string sets and false', () => {
  const condition = (provider: string, configuration: object) => iotAlarmSummary({ propertyName: '属性', alarm: {
    configuration: { matcher: { provider, configuration }, processors: [{ provider: 'device-alarm' }] },
  } }).condition
  for (const [operator, symbol] of Object.entries({ gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠' })) {
    assert.equal(condition('number-compare', { operator, value: -1.5 }), `属性 ${symbol} -1.5`)
  }
  assert.equal(condition('number-range', { min: 0, max: 60 }), '属性在 [0, 60] 之间')
  assert.equal(condition('number-range', { min: 30, max: 60, not: true }), '属性不在 [30, 60] 之间')
  assert.equal(condition('value-set', { values: [false] }), '属性 = false')
  assert.equal(condition('value-set', { values: [0], not: true }), '属性 ≠ 0')
  assert.equal(condition('value-set', { values: ['on', 'off'] }), '属性属于 ["on"、"off"]')
  assert.equal(condition('value-set', { values: ['on', 'off'], not: true }), '属性不属于 ["on"、"off"]')
  assert.equal(condition('unknown', {}), '属性')
})

test('IoT rule names use two deduplicated ID batch queries with no per-product requests', async () => {
  const calls: string[] = []
  setSceneTestRequestHandler((_method, url, body: any) => {
    calls.push(String(url))
    if (url === '/message/preprocessor/device-alarm/_query') return Promise.resolve({ result: { data: Array.from({ length: 200 }, (_, i) => ({
      templateId: `p${i % 2}`, propertyName: `property${i}`, alarm: { id: `alarm${i}`, thingId: i % 2 ? 'd' : '@all', provider: 'composite', configuration: { processors: [
        { provider: 'simple', configuration: { matcher: { provider: 'value-set', configuration: { values: [false] } },
          processors: [{ provider: 'device-alarm', configuration: { alarmName: `name${i}`, alarmLevel: 3 } }] } },
      ] } },
    })), total: 200 } })
    if (url === '/device/product/_query') {
      assert.deepEqual(body.terms.find((term: any) => term.column === 'id'), { column: 'id', termType: 'in', value: ['p0', 'p1'] })
      assert.equal(body.pageSize, 2)
      return Promise.resolve({ result: { data: [{ id: 'p0', name: 'Product 0' }] } })
    }
    assert.equal(url, '/device-instance/_query')
    assert.deepEqual(body.terms, [{ column: 'id', termType: 'in', value: ['d'] }])
    return Promise.resolve({ result: { data: [{ id: 'd', name: 'Device' }] } })
  })
  try {
    const rules = await loadIotAlarmRules('warning', key => key)
    assert.equal(calls.length, 3)
    assert.equal(rules.length, 200)
    assert.equal(rules[0].name, 'name0')
    assert.equal(rules[0].value.options?.alarmConfigName, 'name0')
    assert.equal(rules[0].value.options?.productName, 'Product 0')
    assert.equal(rules[1].value.options?.productName, 'p1')
    assert.equal(rules[1].value.options?.deviceName, 'Device')
  } finally { setSceneTestRequestHandler() }
})

test('scenario menu grants only read access to mapped sources and cloud source configuration', () => {
  type Menu = { code?: string; permissions?: Array<{ permission: string; actions: string[] }>; children?: Menu[] }
  const find = (nodes: Menu[]): Menu | undefined => {
    for (const node of nodes) {
      if (node.code === 'rule-engine/Scene') return node
      const nested = find(node.children || [])
      if (nested) return nested
    }
  }
  const menus = JSON.parse(readFileSync('baseMenu.json', 'utf8'))
  const scene = find(Array.isArray(menus) ? menus : menus.children)!
  for (const permission of ['ai_device_event_mapping', 'ai_cv']) {
    assert.deepEqual(scene.permissions?.find(item => item.permission === permission)?.actions, ['query'])
  }
})
