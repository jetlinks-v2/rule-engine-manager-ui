import assert from 'node:assert/strict'
import test from 'node:test'
import * as vue from 'vue'
import { createMetricLoader } from './helpers/metricRuntime.mjs'
const load = createMetricLoader({
  '@jetlinks-web/vite/dist/dynamic-remote': { dynamicRemoteManager: {} },
  '@jetlinks-web-core/utils/consts': { isSubApp: false },
  './api': { metricApi: {} },
})
const subject = {
  ...load('components/Metric/service.ts'), ...load('components/Metric/presentation.ts'),
  ...load('components/Metric/template/configurationText.ts'), ...load('components/Metric/template/parameters.ts'),
  ...load('components/Metric/useMetricResult.ts'), ...load('components/Metric/useMetricEditor.ts'),
  ...load('components/Metric/useMetricPanel.ts'), ...vue,
}
const { outputId, saveAndActivate, MetricActivationError, parameterOverrides, metricState, metricChartPoints,
  configurationObject, encodeConfiguration, updateTemplateParameter, removeTemplateParameter,
  metricResultKey, useMetricResult, useMetricEditor, useMetricPanel, effectScope, ref, nextTick, createRenderer, h, onScopeDispose } = subject
const flush = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)); await nextTick() }
const config = () => ({
  id: 'config-a', ownerType: 'space', ownerId: 'floor2', targetType: 'space', targetId: 'floor2', slot: 'main',
  templateId: 'energy', templateVersion: '1', inputMappings: { meter: { kind: 'property', thingType: 'device', thingId: 'meter1', id: 'energy' } },
  parameters: {}, state: 'disabled', revision: 1
})
const template = () => ({
  id: 'energy', version: '1', name: '楼层电量', inputDefinitions: [{ id: 'meter', name: '总表' }],
  parameterDefinitions: [{ id: 'area', expands: { editable: true } }, { id: 'constant', expands: { editable: false } }],
  parameters: { area: 500, constant: 1 }, definitions: [],
  outputs: [{ metricId: 'hourEnergy', property: 'stored_energy', label: '小时电量', unit: 'kWh' }]
})

test('旧模板缺类型时按已绑定来源声明筛选，不改写模板；失效来源不提供类型', async () => {
  const scope=effectScope(), requests=[], raw=template()
  const picker=Object.assign(async request=>{requests.push(request)}, {describe:async()=>({meter:{valueType:{type:'double'}}})})
  const view=scope.run(()=>useMetricEditor(ref({ownerType:'space',ownerId:'floor2',editable:true}),ref(config()),ref(picker),{
    getConfig: async () => (config()),
    selectable:async()=>[],resultTemplate(...args) { return this.configTemplate(...args) },configTemplate:async()=>raw,
  }))
  try {
    await flush();await view.choose(raw.inputDefinitions[0])
    assert.equal(requests[0].input.valueType.type,'double');assert.equal(raw.inputDefinitions[0].valueType,undefined)
    view.sourceDescriptions.value.meter.error='denied';await view.choose(raw.inputDefinitions[0])
    assert.equal(requests[1].input.valueType,undefined)
    view.sourceDescriptions.value.meter={valueType:{type:'double'}}
    await view.choose({...raw.inputDefinitions[0],valueType:{type:'boolean'}})
    assert.equal(requests[2].input.valueType.type,'boolean')
    await view.choose({id:'unbound'});assert.equal(requests[3].input.valueType,undefined)
  }finally{scope.stop()}
})

test('公开输出 ID 与存储属性不同：批量最新值及历史仍用 metricId', async () => {
  const output = template().outputs[0]
  assert.equal(outputId(output), 'hourEnergy')
  const calls = []
  const scope = effectScope()
  const value = { metricId: output.metricId, value: 25, evaluationTime: 12000, status: 'success' }
  const api = {
    getResultConfig(...args) { return this.getConfig(...args) },
    getConfig: async () => config(),
    latest: async ids => { calls.push(['latest', ids]); return [{ configId: 'config-a', outputs: { hourEnergy: value } }] },
    history: async (id, query) => { calls.push(['history', id, query]); return [value] }
  }
  const view = scope.run(() => useMetricResult(ref({ configId: 'config-a', outputId: outputId(output) }), api))
  await flush()
  assert.equal(view.current.value.value, 25)
  assert.equal(view.values.value[0].value, 25)
  assert.deepEqual(calls[0], ['latest', ['config-a']])
  assert.deepEqual(calls[1][2].outputs, ['hourEnergy'])
  assert.equal(JSON.stringify(calls).includes('stored_energy'), false)
  scope.stop()
})

test('先保存后启用：第二步失败保留 ID/revision，输入草稿不被改写', async () => {
  const draft = { ...config(), id: undefined, revision: 0 }
  const calls = []
  await assert.rejects(saveAndActivate({ saveConfig: async value => {
    calls.push(structuredClone(value))
    if (calls.length === 1) return { ...value, id: 'saved-once', revision: 2 }
    throw new Error('activation failed')
  } }, draft, true), error => {
    assert.ok(error instanceof MetricActivationError)
    assert.equal(error.configuration.id, 'saved-once')
    assert.equal(error.configuration.revision, 2)
    return true
  })
  assert.equal(calls[0].state, 'disabled')
  assert.equal(calls[1].id, 'saved-once')
  assert.equal(calls[1].revision, 2)
  assert.equal(calls[1].state, 'enabled')
  assert.equal(draft.id, undefined)
})

test('业务参数仅提交明确可编辑的覆盖，固定参数不随表单回写', () => {
  assert.deepEqual(parameterOverrides(template(), { area: 400, constant: 999, other: 3 }), { area: 400 })
})

test('模板表单参数改名同步迁移默认值，保留零值、false及其他参数', () => {
  const original = { ...template(), parameterDefinitions: [{ id: 'area' }, { id: 'estimated' }, { id: 'constant' }],
    parameters: { area: 0, estimated: false, constant: 1 } }
  const renamed = updateTemplateParameter(updateTemplateParameter(original, 0, { id: 'floorArea' }), 1, { id: 'allowEstimate' })
  assert.deepEqual(renamed.parameterDefinitions.map(item => item.id), ['floorArea', 'allowEstimate', 'constant'])
  assert.deepEqual(renamed.parameters, { floorArea: 0, allowEstimate: false, constant: 1 })
  assert.deepEqual(original.parameters, { area: 0, estimated: false, constant: 1 })
})

test('模板表单删除参数同步移除默认值，未删除的false和零值不丢失', () => {
  const original = { ...template(), parameterDefinitions: [{ id: 'area' }, { id: 'estimated' }, { id: 'constant' }],
    parameters: { area: 0, estimated: false, constant: 1 } }
  const withoutArea = removeTemplateParameter(original, 0)
  assert.deepEqual(withoutArea.parameterDefinitions.map(item => item.id), ['estimated', 'constant'])
  assert.deepEqual(withoutArea.parameters, { estimated: false, constant: 1 })
  const withoutEstimated = removeTemplateParameter(original, 1)
  assert.deepEqual(withoutEstimated.parameters, { area: 0, constant: 1 })
  assert.deepEqual(removeTemplateParameter(withoutArea, 0).parameters, { constant: 1 })
  assert.deepEqual(original.parameters, { area: 0, estimated: false, constant: 1 })
})

test('已启用配置继续启用直接保存，改名不制造停用周期；显式停用仍提交停用', async () => {
  const calls = []
  const api = { saveConfig: async value => { calls.push(JSON.parse(JSON.stringify(value))); return { ...value, revision: value.revision + 1 } } }
  const initial = { ...config(), state: 'enabled', enabledAt: 100, dataVersion: 'v1', name: '新名称' }
  const saved = await saveAndActivate(api, initial, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].state, 'enabled')
  assert.equal(saved.enabledAt, 100)
  assert.equal(saved.dataVersion, 'v1')
  await saveAndActivate(api, saved, false)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].state, 'disabled')
})

test('未知质量和真实零值保留；不适用、过期和坏质量在趋势中留断点', () => {
  assert.equal(metricState({ metricId: 'energy', value: 0, status: 'success' }).key, 'unknownQuality')
  const values = [
    { metricId: 'x', value: 0, evaluationTime: 1, status: 'success' },
    { metricId: 'x', value: 8, evaluationTime: 2, status: 'success', reason: 'notApplicable' },
    { metricId: 'x', value: 9, evaluationTime: 3, status: 'success', reason: 'inputExpired' },
    { metricId: 'x', value: 10, evaluationTime: 4, status: 'invalid', quality: { valid: false } },
    { metricId: 'x', value: 11, evaluationTime: 5, status: 'partial', reason: 'inputTimeSkew' }
  ]
  assert.deepEqual(metricChartPoints(values), [[1, 0], [2, null], [3, null], [4, null], [5, null]])
})

test('停用结果仍读取历史，空 latest 不冒充历史当前值', async () => {
  const scope = effectScope()
  const view = scope.run(() => useMetricResult(ref({ configId: 'config-a', outputId: 'hourEnergy' }), {
    getResultConfig(...args) { return this.getConfig(...args) },
    getConfig: async () => config(),
    latest: async () => [{ configId: 'config-a', outputs: {} }],
    history: async () => [{ metricId: 'hourEnergy', value: 25, evaluationTime: 12000 }]
  }))
  await flush()
  assert.equal(view.configuration.value.state, 'disabled')
  assert.equal(view.current.value, undefined)
  assert.equal(view.values.value[0].value, 25)
  scope.stop()
})

test('批量 latest 区分有权无值、无权省略和真实存储错误，撤权后清除旧值', async () => {
  const priorDocument = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  const renderer = createRenderer({
    insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setComment() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {}
  })
  let response = [{ configId: 'config-a', outputs: { hourEnergy: { metricId: 'hourEnergy', value: 25 } } }]
  let failure
  let view
  const app = renderer.createApp({ setup() {
    view = useMetricPanel(ref({ ownerType: 'space', ownerId: 'floor2' }), {
      byOwner: async () => [{...config(),state:'enabled'}], resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate: async () => template(),
      latest: async () => { if (failure) throw failure; return response }
    })
    return () => null
  } })
  try {
    app.mount({})
    await view.refresh()
    assert.equal(view.outputs.value['config-a'].hourEnergy.value, 25)
    response = [{ configId: 'config-a', outputs: {} }]
    await view.refresh()
    assert.deepEqual(view.inaccessibleIds.value, [])
    assert.deepEqual(view.outputs.value['config-a'], {})
    response = []
    await view.refresh()
    assert.deepEqual(view.inaccessibleIds.value, ['config-a'])
    assert.equal(view.outputs.value['config-a'], undefined)
    failure = new Error('storage unavailable')
    await view.refresh()
    assert.equal(view.error.value, '')
    assert.equal(view.latestErrors.value['config-a'], 'storage unavailable')
  } finally { app.unmount(); globalThis.document = priorDocument }
})

test('返回引用首次定位非首配置及非首输出，轮询尊重后续用户选择', async () => {
  const priorDocument = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  const renderer = createRenderer({
    insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setComment() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {}
  })
  const metadata = { ...template(), outputs: [...template().outputs, { metricId: 'dayEnergy', property: 'stored_day', label: '日电量' }] }
  const initial = ref({ configId: 'config-b', outputId: 'dayEnergy' })
  let view
  let finishLatest
  let response = new Promise(resolve => { finishLatest = resolve })
  let failure = true
  const app = renderer.createApp({ setup() {
    view = useMetricPanel(ref({ ownerType: 'space', ownerId: 'floor2' }), {
      byOwner: async () => [config(), { ...config(), id: 'config-b' }],
      resultTemplate(...args) { return this.configTemplate(...args) },
      configTemplate: async () => metadata, latest: async () => { if (failure) throw new Error('temporary failure'); return response }
    }, initial)
    return () => null
  } })
  try {
    app.mount({})
    await view.refresh()
    assert.equal(view.reference.value, undefined)
    failure = false
    const loading = view.refresh()
    await flush()
    assert.equal(view.reference.value, undefined)
    const latest = [{ configId: 'config-a', outputs: {} }, { configId: 'config-b', outputs: {} }]
    finishLatest(latest)
    await loading
    await flush()
    assert.equal(view.selectedId.value, 'config-b')
    assert.equal(view.selectedOutputId.value, 'dayEnergy')
    assert.deepEqual(view.reference.value, { configId: 'config-b', outputId: 'dayEnergy' })
    view.select('config-a', 'hourEnergy')
    initial.value = { configId: 'config-b', outputId: 'hourEnergy' }
    response = latest
    await view.refresh()
    await flush()
    assert.deepEqual(view.reference.value, { configId: 'config-a', outputId: 'hourEnergy' })
  } finally { app.unmount(); globalThis.document = priorDocument }
})

test('默认概览及无效或被撤权的返回引用不打开详情，也不请求历史', async () => {
  const priorDocument = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  const renderer = createRenderer({
    insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setComment() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {}
  })
  const initialCases = [undefined, { configId: 'missing', outputId: 'dayEnergy' },
    { configId: 'config-a', outputId: 'missing' }, { configId: 'config-b', outputId: 'dayEnergy' }]
  const metadata = { ...template(), outputs: [...template().outputs, { metricId: 'dayEnergy', property: 'stored_day' }] }
  const requests = []
  try {
    for (const initial of initialCases) {
      let view
      const api = {
        byOwner: async () => [config(), { ...config(), id: 'config-b' }],
        resultTemplate(...args) { return this.configTemplate(...args) },
        configTemplate: async id => { requests.push(['template', id]); return metadata },
        getResultConfig(...args) { return this.getConfig(...args) },
        getConfig: async id => ({ ...config(), id }),
        latest: async () => [{ configId: 'config-a', outputs: {} }],
        history: async (id, query) => { requests.push(['history', id, query.outputs]); return [] }
      }
      const result = { setup() { useMetricResult(ref({ ...view.reference.value }), api); return () => null } }
      const app = renderer.createApp({ setup() {
        view = useMetricPanel(ref({ ownerType: 'space', ownerId: 'floor2' }), api, ref(initial))
        return () => view.reference.value ? h(result, { key: `${view.reference.value.configId}:${view.reference.value.outputId}` }) : null
      } })
      try {
        app.mount({})
        await view.refresh()
        await flush()
        assert.equal(view.reference.value, undefined)
      } finally { app.unmount() }
    }
    assert.equal(requests.filter(item => item[0] === 'history').length, 0)
  } finally { globalThis.document = priorDocument }
})

test('只读结果被 latest 省略时清除当前值和历史，不继续读取历史', async () => {
  const scope = effectScope()
  let authorized = true
  let historyCalls = 0
  const view = scope.run(() => useMetricResult(ref({ configId: 'config-a', outputId: 'hourEnergy' }), {
    getResultConfig(...args) { return this.getConfig(...args) },
    getConfig: async () => config(),
    latest: async () => authorized ? [{ configId: 'config-a', outputs: { hourEnergy: { metricId: 'hourEnergy', value: 25 } } }] : [],
    history: async () => { historyCalls++; return [{ metricId: 'hourEnergy', value: 25 }] }
  }))
  await flush()
  assert.equal(view.current.value.value, 25)
  authorized = false
  await view.refresh()
  assert.equal(view.inaccessible.value, true)
  assert.equal(view.current.value, undefined)
  assert.deepEqual(view.values.value, [])
  assert.equal(historyCalls, 1)
  scope.stop()
})

test('选中配置改口径、启用周期或状态会重建结果；仅改名不重读历史', async () => {
  const selected = ref({ ...config(), state: 'enabled', dataVersion: 'v1', enabledAt: 1 })
  const renderer = createRenderer({
    insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setComment() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {}
  })
  let historyCalls = 0
  let view
  const result = { setup() {
    view = useMetricResult(ref({ configId: 'config-a', outputId: 'hourEnergy' }), {
      getResultConfig(...args) { return this.getConfig(...args) },
      getConfig: async () => JSON.parse(JSON.stringify(selected.value)),
      latest: async () => [{ configId: 'config-a', outputs: selected.value.state === 'enabled' ? { hourEnergy: { metricId: 'hourEnergy', value: selected.value.dataVersion === 'v1' ? 1 : 2 } } : {} }],
      history: async () => { historyCalls++; return [] }
    })
    return () => null
  } }
  const app = renderer.createApp({ setup: () => () => h(result, { key: metricResultKey(selected.value, 'hourEnergy') }) })
  try {
    app.mount({})
    await flush()
    assert.equal(view.current.value.value, 1)
    selected.value = { ...selected.value, name: '新名称', revision: 2 }
    await flush()
    assert.equal(historyCalls, 1)
    selected.value = { ...selected.value, dataVersion: 'v2' }
    await flush()
    assert.equal(view.current.value.value, 2)
    assert.equal(historyCalls, 2)
    selected.value = { ...selected.value, state: 'disabled' }
    await flush()
    assert.equal(view.configuration.value.state, 'disabled')
    assert.equal(view.current.value, undefined)
    assert.equal(historyCalls, 3)
    selected.value = { ...selected.value, state: 'enabled', enabledAt: 2 }
    await flush()
    assert.equal(view.configuration.value.enabledAt, 2)
    assert.equal(historyCalls, 4)
  } finally { app.unmount() }
})

test('旧结果请求晚到时不能覆盖新对象', async () => {
  let resolveOld
  const old = new Promise(resolve => { resolveOld = resolve })
  const scope = effectScope()
  const reference = ref({ configId: 'old', outputId: 'hourEnergy' })
  const view = scope.run(() => useMetricResult(reference, {
    getResultConfig(...args) { return this.getConfig(...args) },
    getConfig: async id => ({ ...config(), id }),
    latest: async ids => ids[0] === 'old' ? old : [{ configId: 'new', outputs: { hourEnergy: { metricId: 'hourEnergy', value: 2 } } }],
    history: async id => [{ metricId: 'hourEnergy', value: id === 'new' ? 2 : 1, evaluationTime: 12000 }]
  }))
  reference.value = { configId: 'new', outputId: 'hourEnergy' }
  await flush()
  resolveOld([{ configId: 'old', outputs: { hourEnergy: { metricId: 'hourEnergy', value: 1 } } }])
  await flush()
  assert.equal(view.current.value.value, 2)
  assert.equal(view.values.value[0].value, 2)
  assert.equal(view.configuration.value.id, 'new')
  scope.stop()
})

test('不可选固定版本仍可编辑，所有输入必须绑定来源，presence仅决定缺数据行为', async () => {
  const scope = effectScope()
  const initial = { ...config(), inputMappings: {} }
  const view = scope.run(() => useMetricEditor(ref({ ownerType: 'space', ownerId: 'floor2', editable: true }), ref(initial), ref(undefined), {
    getConfig: async () => (initial),
    selectable: async () => [], resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate: async () => ({ ...template(), inputDefinitions: [...template().inputDefinitions, {id:'optional', presence:'optional'}] })
  }))
  await flush()
  assert.equal(view.selectedTemplate.value.version, '1')
  assert.equal(view.ready(), false)
  assert.equal(view.errorKind.value, 'binding')
  view.draft.value.inputMappings.meter = config().inputMappings.meter
  assert.equal(view.ready(), false)
  view.draft.value.inputMappings.optional = config().inputMappings.meter
  assert.equal(view.ready(), true)
  assert.equal(view.draft.value.id, 'config-a')
  scope.stop()
})

test('revision 冲突不覆盖编辑内容，重新读取先保存为比较快照', async () => {
  const scope = effectScope()
  const view = scope.run(() => useMetricEditor(ref({ ownerType: 'space', ownerId: 'floor2', editable: true }), ref(config()), ref(undefined), {
    selectable: async () => [], resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate: async () => template(),
    saveConfig: async () => { throw new Error('revision conflict') },
    getResultConfig(...args) { return this.getConfig(...args) },
    getConfig: async () => ({ ...config(), name: '同事已保存', revision: 3 })
  }))
  await flush()
  view.draft.value.name = '我的修改'
  await view.save(true)
  assert.equal(view.draft.value.name, '我的修改')
  await view.readSaved()
  assert.equal(view.draft.value.name, '我的修改')
  assert.equal(view.savedSnapshot.value.name, '同事已保存')
  view.useSaved()
  assert.equal(view.draft.value.name, '同事已保存')
  assert.equal(view.draft.value.revision, 3)
  scope.stop()
})

test('重新打开配置恢复授权来源名称，映射修改后旧名称与迟到响应不回填', async () => {
  const scope = effectScope(), pending = [], reads = []
  const picker = Object.assign(async () => undefined, { describe:(owner, mappings) => {
    reads.push([owner, mappings]); return new Promise(resolve => pending.push(resolve))
  } })
  let saves = 0
  const context = ref({ ownerType:'space', ownerId:'floor2', editable:true })
  const view = scope.run(() => useMetricEditor(context, ref(config()), ref(picker), {
    getConfig: async () => (config()),
    selectable:async () => [], resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate:async () => template(), saveConfig:async next => { saves++; return next }
  }))
  try {
    await flush(); assert.equal(reads.length, 1)
    assert.equal(reads[0][1].meter.id, 'energy')
    view.draft.value.inputMappings.meter.id = 'power'; await flush()
    pending[0]({ meter:{ label:'旧设备 / 电量' } }); await flush()
    assert.equal(view.sourceLabels.value.meter, undefined)
    pending[1]({ meter:{ label:'电表 / 功率', unit:'kW' } }); await flush()
    assert.equal(view.sourceLabels.value.meter, '电表 / 功率')
    assert.equal(view.dirty.value, true)
    view.draft.value.inputMappings.meter.id = 'removed'; await flush()
    assert.equal(view.sourceLabels.value.meter, undefined)
    pending[2]({ meter:{ error:'属性已移除' } }); await flush()
    assert.equal(await view.save(false), undefined)
    assert.equal(view.errorKind.value, 'binding'); assert.equal(saves, 0)
    context.value.editable = false; await flush()
    assert.equal(view.sourcesLoading.value, false)
    assert.deepEqual(view.sourceDescriptions.value, {})
  } finally { scope.stop() }
})

test('未发起来源选择的编辑器初始化和销毁不取消其他入口的选择', async () => {
  const scope = effectScope(); let cancelled = 0
  const picker = Object.assign(async () => undefined, { cancel:() => cancelled++ })
  scope.run(() => useMetricEditor(ref({ ownerType:'space',ownerId:'floor2',editable:true }), ref(config()), ref(picker), {
    getConfig: async () => (config()),
    resultTemplate(...args) { return this.configTemplate(...args) },
    configTemplate:async () => template(), selectable:async () => []
  }))
  await flush()
  assert.equal(cancelled, 0)
  scope.stop()
  assert.equal(cancelled, 0)
})

test('销毁正在选择来源的编辑器取消选择且忽略迟到结果', async () => {
  const scope = effectScope(); let finish; let cancelled = 0
  const picker = Object.assign(() => new Promise(resolve => { finish = resolve }), { cancel:() => cancelled++ })
  const view = scope.run(() => useMetricEditor(ref({ ownerType:'space',ownerId:'floor2',editable:true }), ref(config()), ref(picker), {
    getConfig: async () => (config()),
    resultTemplate(...args) { return this.configTemplate(...args) },
    configTemplate:async () => template(), selectable:async () => []
  }))
  await flush()
  const choosing = view.choose(template().inputDefinitions[0])
  scope.stop()
  assert.equal(cancelled, 1)
  finish({ mapping:{ kind:'property', id:'late' }, label:'迟到来源' }); await choosing
  assert.equal(view.draft.value.inputMappings.meter.id, 'energy')
})

test('切换模板取消原位来源选择，迟到选择不能覆盖新模板', async () => {
  const scope = effectScope(); let finish; let cancelled = 0
  const picker = Object.assign(() => new Promise(resolve => { finish = resolve }), { cancel:() => cancelled++, editor:{} })
  const nextTemplate = { ...template(), id:'next' }
  const view = scope.run(() => useMetricEditor(ref({ ownerType:'space',ownerId:'floor2',editable:true }), ref(config()), ref(picker), {
    getConfig: async () => (config()),
    resultTemplate(...args) { return this.configTemplate(...args) },
    configTemplate:async () => template(), selectable:async () => [{ id:'next', template:nextTemplate, released:true, available:true }]
  }))
  try {
    await flush()
    const choosing = view.choose(template().inputDefinitions[0], true)
    view.templateSelection.value = JSON.stringify(['next','1'])
    finish({ mapping:{ kind:'property', id:'late' }, label:'迟到来源' }); await choosing
    assert.equal(view.draft.value.templateId, 'next')
    assert.deepEqual(view.draft.value.inputMappings, {})
    assert.equal(view.choosing.value, '')
    assert.ok(cancelled > 0)
  } finally { scope.stop() }
})

test('YAML/JSON 编辑使用同一模板 DTO，保留单位、布尔和来源要求', () => {
  const value = { ...template(), enabled: false }
  value.inputDefinitions[0].source = { kind: 'property', lookback: 'PT1H', maxPoints: 200 }
  for (const format of ['yaml', 'json']) {
    assert.deepEqual(configurationObject(encodeConfiguration(value, format), format), value)
  }
})


test('卡片详情按需装载；关闭、撤权、owner切换和保存均不重开历史', async () => {
  const priorDocument = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  const renderer = createRenderer({
    insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setComment() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {}
  })
  const owner = ref({ ownerType: 'space', ownerId: 'floor2', editable: true })
  const initial = ref({ configId: 'config-b', outputId: 'dayEnergy' })
  const metadata = { ...template(), outputs: [...template().outputs, { metricId: 'dayEnergy', label: '日电量' }] }
  let allowed = true
  let view
  const history = []
  const api = {
    byOwner: async () => [config(), { ...config(), id: 'config-b', name: '车间B' }],
    resultTemplate(...args) { return this.configTemplate(...args) },
    configTemplate: async () => metadata, getResultConfig(...args) { return this.getConfig(...args) }, getConfig: async id => ({ ...config(), id }),
    latest: async ids => ids.filter(id => allowed || id !== 'config-b').map(configId => ({ configId, outputs: {} })),
    history: async (id, request) => { history.push([id, ...request.outputs]); return [] }
  }
  const result = { setup() { useMetricResult(ref({ ...view.reference.value }), api); return () => null } }
  const app = renderer.createApp({ setup() {
    view = useMetricPanel(owner, api, initial)
    return () => view.reference.value ? h(result, { key: `${view.reference.value.configId}:${view.reference.value.outputId}` }) : null
  } })
  try {
    app.mount({})
    assert.equal(view.reference.value, undefined)
    assert.deepEqual(history, [])
    await view.refresh(); await flush()
    assert.deepEqual(history, [['config-b', 'dayEnergy']])
    assert.deepEqual(view.cards.value.map(card => card.reference), [
      { configId: 'config-a', outputId: 'hourEnergy' }, { configId: 'config-a', outputId: 'dayEnergy' },
      { configId: 'config-b', outputId: 'hourEnergy' }, { configId: 'config-b', outputId: 'dayEnergy' }
    ])
    view.closeDetail(); await flush()
    initial.value = { configId: 'config-a', outputId: 'hourEnergy' }
    await view.refresh(); await flush()
    assert.equal(view.reference.value, undefined)
    assert.equal(history.length, 1)
    view.select('config-b', 'hourEnergy'); await flush()
    assert.deepEqual(history.at(-1), ['config-b', 'hourEnergy'])
    allowed = false
    await view.refresh(); await flush()
    assert.equal(view.reference.value, undefined)
    assert.equal(view.selectedId.value, '')
    allowed = true
    await view.refresh(); await flush()
    assert.equal(view.reference.value, undefined)
    assert.equal(history.length, 2)
    view.select('config-a', 'dayEnergy'); await flush()
    owner.value = { ...owner.value, ownerId: 'floor3' }
    assert.equal(view.reference.value, undefined)
    await view.refresh(); await flush()
    assert.equal(view.reference.value, undefined)
    view.openEditor({ ...config(), ownerId: owner.value.ownerId })
    assert.equal(view.editorOpen.value, true)
    owner.value = { ...owner.value, ownerId: 'floor4' }
    assert.equal(view.editorOpen.value, false)
    assert.equal(view.editing.value, undefined)
    await view.refresh()
    view.select('config-a', 'hourEnergy'); await flush()
    view.openEditor({ ...config(), ownerId: owner.value.ownerId }); await flush()
    assert.equal(view.reference.value, undefined)
    await view.saved(); await flush()
    assert.equal(view.editorOpen.value, false)
    assert.equal(view.reference.value, undefined)
    assert.equal(history.length, 4)
  } finally { app.unmount(); globalThis.document = priorDocument }
})

test('详情卸载后的latest晚到不继续发出历史请求', async () => {
  let finishLatest
  const pending = new Promise(resolve => { finishLatest = resolve })
  const scope = effectScope()
  let historyCalls = 0
  scope.run(() => useMetricResult(ref({ configId: 'config-a', outputId: 'hourEnergy' }), {
    getResultConfig(...args) { return this.getConfig(...args) },
    getConfig: async () => config(), latest: async () => pending,
    history: async () => { historyCalls++; return [] }
  }))
  scope.stop()
  finishLatest([{ configId: 'config-a', outputs: {} }])
  await flush()
  assert.equal(historyCalls, 0)
})

test('已有配置编辑按成功刷新后的可读集合卸载，临时失败和新增草稿保留', async () => {
  const priorDocument = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  const renderer = createRenderer({
    insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setComment() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {}
  })
  try {
    for (const revokedBy of ['byOwner', 'latest']) {
      const owner = ref({ ownerType: 'space', ownerId: 'floor2', editable: true })
      const existing = { ...config(), id: 'config-b' }
      let revoked = false
      let failure = ''
      let view
      let editor
      let unmounted = 0
      const api = {
        byOwner: async () => {
          if (failure === 'byOwner') throw new Error('temporary owner failure')
          return [config(), ...(!revoked || revokedBy !== 'byOwner' ? [existing] : [])]
        },
        resultTemplate(...args) { return this.configTemplate(...args) },
        configTemplate: async () => template(), selectable: async () => [],
        latest: async ids => {
          if (failure === 'latest') throw new Error('temporary storage failure')
          return ids.filter(id => !revoked || revokedBy !== 'latest' || id !== existing.id)
            .map(configId => ({ configId, outputs: {} }))
        }
      }
      const editorComponent = { setup() {
        editor = useMetricEditor(owner, ref(view.editing.value), ref(undefined), api)
        onScopeDispose(() => { unmounted++ })
        return () => null
      } }
      const app = renderer.createApp({ setup() {
        view = useMetricPanel(owner, api)
        return () => view.editorOpen.value ? h(editorComponent) : null
      } })
      try {
        app.mount({})
        await view.refresh()
        view.openEditor(existing); await flush()
        editor.draft.value.name = '未保存修改'
        for (const phase of ['byOwner', 'latest']) {
          failure = phase
          await view.refresh(); await flush()
          assert.equal(view.editorOpen.value, true)
          assert.equal(view.editing.value.id, existing.id)
          assert.equal(editor.draft.value.name, '未保存修改')
          assert.equal(unmounted, 0)
        }
        failure = ''
        revoked = true
        await view.refresh(); await flush()
        assert.equal(view.editorOpen.value, false)
        assert.equal(view.editing.value, undefined)
        assert.equal(unmounted, 1)
        view.openEditor(); await flush()
        editor.draft.value.name = '新增未保存'
        await view.refresh(); await flush()
        assert.equal(view.editorOpen.value, true)
        assert.equal(editor.draft.value.name, '新增未保存')
        assert.equal(unmounted, 1)
        owner.value = { ...owner.value, ownerId: 'floor3' }
        await flush()
        assert.equal(view.editorOpen.value, false)
        assert.equal(view.editing.value, undefined)
        assert.equal(unmounted, 2)
      } finally { app.unmount() }
    }
  } finally { globalThis.document = priorDocument }
})

test('退场回焦仅消费同对象的可读目标，撤权、切换对象或重新打开均撤销', async () => {
  const priorDocument = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  const renderer = createRenderer({
    insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setComment() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {}
  })
  const owner = ref({ ownerType: 'space', ownerId: 'floor2', editable: true })
  const target = { configId: 'config-b', outputId: 'dayEnergy' }
  let allowed = true
  let included = true
  let view
  const app = renderer.createApp({ setup() {
    view = useMetricPanel(owner, {
      byOwner: async () => [config(), ...(included ? [{ ...config(), id: 'config-b' }] : [])],
      resultTemplate(...args) { return this.configTemplate(...args) },
      configTemplate: async () => ({ ...template(), outputs: [...template().outputs, { metricId: 'dayEnergy', label: '日电量' }] }),
      latest: async ids => ids.filter(id => allowed || id !== target.configId).map(configId => ({ configId, outputs: {} }))
    }, ref(target))
    return () => null
  } })
  try {
    app.mount({})
    await view.refresh()
    view.dismissDrawer()
    assert.equal(view.reference.value, undefined)
    assert.deepEqual(view.takeFocusReference(), target)
    assert.equal(view.takeFocusReference(), undefined)
    view.select('config-a', 'hourEnergy')
    view.dismissDrawer()
    assert.deepEqual(view.takeFocusReference(), { configId: 'config-a', outputId: 'hourEnergy' })
    view.select(target.configId, target.outputId)
    view.dismissDrawer()
    owner.value = { ...owner.value, ownerId: 'floor3' }
    owner.value = { ...owner.value, ownerId: 'floor2' }
    await view.refresh()
    assert.equal(view.takeFocusReference(), undefined)
    view.select(target.configId, target.outputId)
    view.dismissDrawer()
    allowed = false
    await view.refresh()
    allowed = true
    await view.refresh()
    assert.equal(view.takeFocusReference(), undefined)
    view.select(target.configId, target.outputId)
    view.dismissDrawer()
    included = false
    await view.refresh()
    included = true
    await view.refresh()
    assert.equal(view.takeFocusReference(), undefined)
    view.select(target.configId, target.outputId)
    view.dismissDrawer()
    view.select('config-a', 'hourEnergy')
    assert.equal(view.takeFocusReference(), undefined)
    view.dismissDrawer()
    view.openEditor(config())
    assert.equal(view.takeFocusReference(), undefined)
    view.closeDrawer()
    view.dismissDrawer()
    assert.equal(view.takeFocusReference(), undefined)
  } finally { app.unmount(); globalThis.document = priorDocument }
})


test('面板批量快照更新详情当前反馈，迟到的详情读取不覆盖较新快照；手动刷新仍可更新', async () => {
  let finish; let calls = 0; let histories = 0
  const snapshot = ref()
  const scope = effectScope()
  const expected = { configId: 'config-a', outputs: { hourEnergy: { metricId: 'hourEnergy', value: 2, quality: { valid: true, stale: true } } }, runtime: { nodeId: 'node-a', state: 'loaded' } }
  const view = scope.run(() => useMetricResult(ref({ configId: 'config-a', outputId: 'hourEnergy' }), {
    getResultConfig(...args) { return this.getConfig(...args) },
    getConfig: async () => config(),
    latest: async () => { calls++; return calls === 1 ? new Promise(resolve => { finish = resolve }) : [{ ...expected, outputs: { hourEnergy: { metricId: 'hourEnergy', value: 3 } } }] },
    history: async () => { histories++; return [] }
  }, snapshot))
  try {
    snapshot.value = expected; await flush()
    assert.equal(view.current.value.value, 2); assert.equal(view.runtime.value.state, 'loaded')
    finish([{ ...expected, outputs: { hourEnergy: { metricId: 'hourEnergy', value: 1 } }, runtime: { nodeId: 'node-a', state: 'failed' } }]); await flush()
    assert.equal(view.current.value.value, 2); assert.equal(view.current.value.quality.stale, true); assert.equal(view.runtime.value.state, 'loaded')
    assert.equal(histories, 1)
    await view.refresh(); assert.equal(view.current.value.value, 3); assert.equal(calls, 2)
  } finally { scope.stop() }
})


test('latest授权与值运行反馈共享版本：新拒权清理快照和历史，迟到可读不能撤销拒权', async () => {
  let finishOld; let calls = 0; let histories = 0
  const scope = effectScope()
  const item = { configId: 'config-a', outputs: { hourEnergy: { metricId: 'hourEnergy', value: 1 } }, runtime: { nodeId: 'node-a', state: 'loaded' } }
  const snapshot = ref(item)
  const view = scope.run(() => useMetricResult(ref({ configId: 'config-a', outputId: 'hourEnergy' }), {
    getResultConfig(...args) { return this.getConfig(...args) },
    getConfig: async () => config(),
    latest: async () => { calls++; return calls === 1 ? new Promise(resolve => { finishOld = resolve }) : [] },
    history: async () => { histories++; return [{ metricId: 'hourEnergy', value: 1 }] }
  }, snapshot))
  try {
    await flush(); assert.equal(view.current.value.value, 1); assert.equal(view.inaccessible.value, false)
    await view.refresh()
    assert.equal(view.inaccessible.value, true); assert.equal(view.current.value, undefined); assert.equal(view.runtime.value, undefined)
    assert.deepEqual(view.values.value, [])
    finishOld([item]); await flush()
    assert.equal(view.inaccessible.value, true); assert.equal(view.current.value, undefined); assert.equal(view.runtime.value, undefined)
    assert.equal(histories, 0)
    snapshot.value = { ...item, outputs: { hourEnergy: { metricId: 'hourEnergy', value: 3 } } }; await flush()
    assert.equal(view.inaccessible.value, false); assert.equal(view.current.value.value, 3); assert.equal(view.runtime.value.state, 'loaded')
  } finally { scope.stop() }
})


test('迟到detail拒权不清理较新panel授权趋势，也不阻断本次合法范围历史读取', async () => {
  let finishOld; let finishHistory; let calls = 0; const histories = []
  const scope = effectScope(); const snapshot = ref()
  const expected = { configId: 'config-a', outputs: { hourEnergy: { metricId: 'hourEnergy', value: 2 } }, runtime: { nodeId: 'node-a', state: 'loaded' } }
  const previous = { metricId: 'hourEnergy', value: 11, evaluationTime: 1000 }
  const point = { ...previous, value: 22 }
  const view = scope.run(() => useMetricResult(ref({ configId: 'config-a', outputId: 'hourEnergy' }), {
    getResultConfig(...args) { return this.getConfig(...args) },
    getConfig: async () => config(),
    latest: async () => { calls++; return calls === 1 ? [expected] : new Promise(resolve => { finishOld = resolve }) },
    history: async (_id, request) => { histories.push(request); return histories.length === 1 ? [previous] : new Promise(resolve => { finishHistory = resolve }) }
  }, snapshot))
  try {
    await flush(); assert.deepEqual(view.values.value, [previous])
    const refreshed = view.refresh()
    snapshot.value = expected; await flush()
    finishOld([]); await flush()
    assert.equal(view.inaccessible.value, false); assert.equal(view.current.value.value, 2); assert.equal(view.runtime.value.state, 'loaded')
    assert.deepEqual(view.values.value, [previous])
    assert.equal(histories.length, 2); assert.deepEqual(histories[1].outputs, ['hourEnergy'])
    finishHistory([point]); await refreshed
    assert.deepEqual(view.values.value, [point])
  } finally { scope.stop() }
})
