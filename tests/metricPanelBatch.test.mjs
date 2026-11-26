import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h, KeepAlive, ref } from 'vue'
import { createMetricLoader, createMetricRenderer, flush, sourceRoot } from './helpers/metricRuntime.mjs'
import { resolve } from 'node:path'
const api = {}
const load = createMetricLoader({ [resolve(sourceRoot, 'components/Metric/api.ts')]: { metricApi: api } })
const { useMetricPanel } = load('components/Metric/useMetricPanel.ts')
const config = index => ({ id: `config-${index}`, ownerType: 'line', ownerId: 'a', targetType: 'line', targetId: 'a', templateId: 'test', templateVersion: '1', slot: String(index), inputMappings: {}, parameters: {}, presentation: { unknown: false }, state: 'enabled', revision: 1 })
const template = { id: 'test', version: '1', name: 'Line metric', outputs: [{ metricId: 'value', label: 'Value' }], inputDefinitions: [], parameterDefinitions: [], parameters: {}, definitions: [] }

test('成功的空配置快照后台刷新不重现骨架，切换对象仍按首屏读取',async()=>{
  const prior=globalThis.document
  globalThis.document={hidden:true,addEventListener(){},removeEventListener(){}}
  const owner=ref({ownerType:'line',ownerId:'a'}),pending=[]
  let view
  const {renderer,root}=createMetricRenderer()
  const app=renderer.createApp({setup(){view=useMetricPanel(owner,{byOwner:()=>new Promise(resolve=>pending.push(resolve)),latest:async()=>[]});return()=>null}})
  try{
    app.mount(root)
    const initial=view.refresh();assert.equal(view.loading.value,true);pending.shift()([]);await initial
    const background=view.refresh();assert.equal(view.loading.value,false);pending.shift()([]);await background
    owner.value={ownerType:'line',ownerId:'b'};await flush()
    const switched=view.refresh();assert.equal(view.loading.value,true);pending.shift()([]);await switched
  }finally{app.unmount();globalThis.document=prior}
})

test('149配置按128分批且刷新不重入；失败批次保留错误，不把省略当撤权', async () => {
  const prior = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  let view
  let failed = false
  const calls = []
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup() {
    view = useMetricPanel(ref({ ownerType: 'line', ownerId: 'a', editable: true }), {
      byOwner: async () => Array.from({ length: 149 }, (_, index) => config(index)), resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate: async () => template,
      latest: async ids => { calls.push([...ids]); if (failed && ids[0] === 'config-128') throw new Error('batch storage unavailable'); return ids.filter(id => !failed || id !== 'config-0').map(configId => ({ configId, outputs: { value: { metricId: 'value', value: 0 } } })) }
    })
    return () => null
  } })
  try {
    app.mount(root)
    const first = view.refresh(), same = view.refresh()
    assert.equal(first, same)
    await first
    assert.deepEqual(calls.map(ids => ids.length), [128, 21])
    failed = true
    view.openEditor(config(128))
    await view.refresh(); await flush()
    assert.deepEqual(view.inaccessibleIds.value, ['config-0'])
    assert.equal(view.latestErrors.value['config-128'], 'batch storage unavailable')
    assert.equal(view.outputs.value['config-128'].value.value, 0)
    assert.equal(view.editorOpen.value, true)
    assert.equal(view.error.value, '')
  } finally { app.unmount(); globalThis.document = prior }
})

test('配置与最新值临时读取失败保留已打开详情，恢复不重开主动关闭的详情，成功撤权仍清理', async () => {
  const prior=globalThis.document
  globalThis.document={hidden:true,addEventListener(){},removeEventListener(){}}
  let view,failure='',denied=false
  const {renderer,root}=createMetricRenderer()
  const app=renderer.createApp({setup(){
    view=useMetricPanel(ref({ownerType:'line',ownerId:'a'}),{
      byOwner:async()=>{if(failure==='config')throw new Error('config timeout');return[config(1)]},
      resultTemplate(...args) { return this.configTemplate(...args) },
      configTemplate:async()=>template,
      latest:async ids=>{if(failure==='latest')throw new Error('latest timeout');return denied ? [] : ids.map(configId=>({configId,outputs:{value:{metricId:'value',value:7}}}))},
    });return()=>null
  }})
  try{
    app.mount(root);await view.refresh();view.select('config-1','value')
    for(const kind of ['latest','config']){
      failure=kind;await view.refresh()
      assert.equal(view.reference.value.configId,'config-1')
      assert.equal(view.selectedLatest.value.outputs.value.value,7)
      assert.equal(kind==='latest' ? view.latestErrors.value['config-1'] : view.error.value,`${kind} timeout`)
    }
    view.dismissDrawer();failure='';await view.refresh();assert.equal(view.reference.value,undefined)
    view.select('config-1','value');denied=true;await view.refresh()
    assert.equal(view.reference.value,undefined);assert.equal(view.outputs.value['config-1'],undefined)
  }finally{app.unmount();globalThis.document=prior}
})

test('同版本的固定修订分别缓存，升级后读取新修订且保留未升级配置的计算定义', async () => {
  const prior = globalThis.document
  globalThis.document = { hidden:true, addEventListener() {}, removeEventListener() {} }
  let items = [config(1), { ...config(2), templateRevision:2 }]
  const reads = []
  let view
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup() {
    view = useMetricPanel(ref({ ownerType:'line', ownerId:'a' }), {
      byOwner:async () => items,
      resultTemplate(...args) { return this.configTemplate(...args) },
      configTemplate:async id => {
        reads.push(id)
        const revision = items.find(item => item.id === id).templateRevision || 1
        return { ...template, definitions:[{ id:'value', expression:String(revision) }] }
      },
      latest:async ids => ids.map(configId => ({ configId, outputs:{} })),
    })
    return () => null
  } })
  try {
    app.mount(root); await view.refresh()
    assert.deepEqual(reads, ['config-1','config-2'])
    assert.equal(view.templates.value['config-1'].definitions[0].expression, '1')
    assert.equal(view.templates.value['config-2'].definitions[0].expression, '2')
    await view.refresh(); assert.equal(reads.length, 2)
    items = [items[0], { ...items[1], templateRevision:3 }]
    await view.refresh()
    assert.deepEqual(reads, ['config-1','config-2','config-2'])
    assert.equal(view.templates.value['config-1'].definitions[0].expression, '1')
    assert.equal(view.templates.value['config-2'].definitions[0].expression, '3')
    items = [{ ...items[0], templateRevision:3 }, items[1]]
    await view.refresh(); assert.equal(reads.length, 3)
    assert.equal(view.templates.value['config-1'].definitions[0].expression, '3')
  } finally { app.unmount(); globalThis.document = prior }
})

test('配置删除失败保留引用与配置，成功后清理并刷新，维护权限不可绕过', async () => {
  const prior = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  const owner = ref({ ownerType: 'line', ownerId: 'a', editable: true })
  let items = [config(1)]
  let failure = true
  let removes = 0
  let view
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup() {
    view = useMetricPanel(owner, {
      byOwner: async () => items, resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate: async () => template,
      latest: async ids => ids.map(configId => ({ configId, outputs: {} })),
      removeConfig: async () => { removes++; if (failure) throw new Error('Referenced by an enabled rule'); items = [] }
    })
    return () => null
  } })
  try {
    app.mount(root); await view.refresh()
    view.select('config-1', 'value')
    assert.equal(await view.remove(config(1)), false)
    assert.equal(view.reference.value.configId, 'config-1')
    assert.equal(view.configurations.value.length, 1)
    assert.equal(view.actionError.value, 'Referenced by an enabled rule')
    owner.value = { ...owner.value, editable: false }
    assert.equal(await view.remove(config(1)), false)
    assert.equal(removes, 1)
    owner.value = { ...owner.value, editable: true }
    failure = false
    assert.equal(await view.remove(config(1)), true)
    assert.equal(view.reference.value, undefined)
    assert.equal(view.configurations.value.length, 0)
  } finally { app.unmount(); globalThis.document = prior }
})

function initialReferenceFixture(initial, state = {}) {
  const previousDocument = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  const owner = ref({ ownerType: 'line', ownerId: 'a', editable: true })
  const metadata = { ...template, outputs: [...template.outputs, { metricId: 'second', label: 'Second output' }] }
  const options = { items: [config(1), { ...config(2), templateId: 'other' }], templateFailure: 'config-2', denied: [], missingOutput: false, ...state }
  let view
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup() {
    view = useMetricPanel(owner, {
      byOwner: async () => options.items,
      resultTemplate(...args) { return this.configTemplate(...args) },
      configTemplate: async id => {
        if (options.templateFailure === id) throw new Error('Fixed template temporarily unavailable')
        return options.missingOutput ? { ...metadata, outputs: [] } : metadata
      },
      latest: async ids => ids.filter(id => !options.denied.includes(id)).map(configId => ({ configId, outputs: {} })),
    }, ref(initial))
    return () => null
  } })
  app.mount(root)
  return { view, options, async refresh() { await view.refresh(); await flush() }, close() { app.unmount(); globalThis.document = previousDocument } }
}

test('返回引用固定模板首次失败可刷新重试，只打开指定配置/输出一次', async () => {
  const expected = { configId: 'config-2', outputId: 'second' }
  const fixture = initialReferenceFixture(expected)
  const { view, options } = fixture
  try {
    await fixture.refresh()
    assert.equal(view.reference.value, undefined)
    assert.equal(view.itemErrors.value['config-2'], 'Fixed template temporarily unavailable')
    assert.equal(view.latestErrors.value['config-2'], undefined)
    options.templateFailure = ''
    await fixture.refresh()
    assert.deepEqual(view.reference.value, expected)
    view.dismissDrawer()
    await fixture.refresh()
    assert.equal(view.reference.value, undefined)
  } finally { fixture.close() }
})

test('模板失败期间主动选择其他输出或关闭会消费返回引用，重试不重开', async () => {
  for (const action of ['select', 'close']) {
    const fixture = initialReferenceFixture({ configId: 'config-2', outputId: 'second' })
    try {
      await fixture.refresh()
      action === 'select' ? fixture.view.select('config-1', 'value') : fixture.view.dismissDrawer()
      fixture.options.templateFailure = ''
      await fixture.refresh()
      assert.deepEqual(fixture.view.reference.value, action === 'select' ? { configId: 'config-1', outputId: 'value' } : undefined)
    } finally { fixture.close() }
  }
})

test('确定不存在/没有输出/成功撤权会消费返回引用，其他配置模板失败不阻止定位', async () => {
  for (const reason of ['missing-config', 'missing-output', 'denied']) {
    const fixture = initialReferenceFixture({ configId: 'config-2', outputId: 'second' }, {
      templateFailure: reason === 'denied' ? 'config-2' : '',
      ...(reason === 'missing-config' ? { items: [config(1)] } : {}),
      ...(reason === 'missing-output' ? { missingOutput: true } : {}),
      ...(reason === 'denied' ? { denied: ['config-2'] } : {}),
    })
    try {
      await fixture.refresh(); assert.equal(fixture.view.reference.value, undefined)
      fixture.options.items = [config(1), { ...config(2), templateId: 'other' }]
      fixture.options.templateFailure = ''; fixture.options.missingOutput = false; fixture.options.denied = []
      await fixture.refresh(); assert.equal(fixture.view.reference.value, undefined)
    } finally { fixture.close() }
  }
  const fixture = initialReferenceFixture({ configId: 'config-1', outputId: 'value' })
  try {
    await fixture.refresh()
    assert.deepEqual(fixture.view.reference.value, { configId: 'config-1', outputId: 'value' })
    assert.ok(fixture.view.itemErrors.value['config-2'])
  } finally { fixture.close() }
})


test('批量latest保留运行反馈，成功缺字段和拒权清理旧反馈，失败批次不误撤权', async () => {
  const previousDocument = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  let runtime = { nodeId: 'node-a', state: 'failed', errorCode: 'load_failed' }; let fail = false; let denied = false
  let view
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup() {
    view = useMetricPanel(ref({ ownerType: 'line', ownerId: 'a' }), {
      byOwner: async () => [config(1)], resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate: async () => template,
      latest: async ids => { if (fail) throw new Error('temporary'); return denied ? [] : ids.map(configId => ({ configId, outputs: {}, ...(runtime ? { runtime } : {}) })) }
    }); return () => null
  } })
  try {
    app.mount(root); await view.refresh(); assert.deepEqual(view.runtimes.value['config-1'], runtime)
    fail = true; await view.refresh(); assert.equal(view.runtimes.value['config-1'].state, 'failed'); assert.deepEqual(view.inaccessibleIds.value, [])
    fail = false; runtime = undefined; await view.refresh(); assert.equal(view.runtimes.value['config-1'], undefined)
    runtime = { nodeId: 'node-a', state: 'loaded' }; await view.refresh(); assert.equal(view.runtimes.value['config-1'].state, 'loaded')
    denied = true; await view.refresh(); assert.equal(view.runtimes.value['config-1'], undefined); assert.deepEqual(view.inaccessibleIds.value, ['config-1'])
  } finally { app.unmount(); globalThis.document = previousDocument }
})

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function panelWriteFixture() {
  const previousDocument = globalThis.document
  globalThis.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
  const owner = ref({ ownerType: 'line', ownerId: 'a', editable: true })
  const visible = ref(true)
  const requests = [], reads = []
  let view, nextRead, mounted = true
  const request = () => { const task = deferred(); requests.push(task); return task.promise }
  const { renderer, root } = createMetricRenderer()
  const Panel = defineComponent({ setup() {
    view = useMetricPanel(owner, {
      byOwner: async (_type, id) => {
        reads.push(id)
        const pending = nextRead
        nextRead = undefined
        if (pending) await pending.promise
        return [1, 2].map(index => ({ ...config(index), ownerId: id, targetId: id }))
      },
      resultTemplate(...args) { return this.configTemplate(...args) },
      configTemplate: async () => template,
      latest: async ids => ids.map(configId => ({ configId, outputs: {} })),
      getConfig: async id => ({ ...config(Number(id.replace('config-', ''))), ownerId: owner.value.ownerId, targetId: owner.value.ownerId }),
      saveConfig: request, removeConfig: request,
    })
    return () => null
  } })
  const app = renderer.createApp({ setup: () => () => h(KeepAlive, null, { default: () => visible.value ? h(Panel) : null }) })
  app.mount(root)
  return {
    get view() { return view }, owner, requests, reads,
    run(action, index = 1) {
      const item = { ...config(index), ownerId: owner.value.ownerId, targetId: owner.value.ownerId }
      return action === 'remove' ? view.remove(item) : action === 'rename' ? view.rename(item, 'Updated') : view.setEnabled(item, false)
    },
    async switchOwner(id) { owner.value = { ...owner.value, ownerId: id }; await view.refresh() },
    holdNextRead() { nextRead = deferred(); return nextRead },
    async deactivate() { visible.value = false; await flush() },
    async activate() { visible.value = true; await flush() },
    unmount() { if (mounted) { app.unmount(); mounted = false } },
    close() { this.unmount(); globalThis.document = previousDocument },
  }
}

for (const action of ['setEnabled', 'rename', 'remove']) {
  for (const outcome of ['success', 'failure']) {
    test(`${action} ${outcome} 迟到回调不能修改 A→B 或 A→B→A 的新操作和详情`, async () => {
      for (const returnToA of [false, true]) {
        const fixture = panelWriteFixture()
        try {
          await fixture.view.refresh()
          const old = fixture.run(action)
          await flush()
          await fixture.switchOwner('b')
          if (returnToA) await fixture.switchOwner('a')
          fixture.view.select('config-1', 'value')
          const current = fixture.run('rename', 2)
          await flush()
          const reads = fixture.reads.length
          outcome === 'success' ? fixture.requests[0].resolve() : fixture.requests[0].reject(new Error('Old owner failure'))
          const result = await old
          if (action === 'remove') assert.equal(result, outcome === 'success')
          assert.equal(fixture.view.error.value, '')
          assert.equal(fixture.view.actionError.value, '')
          assert.equal(fixture.view.busyId.value, 'config-2')
          assert.equal(fixture.view.reference.value.configId, 'config-1')
          assert.equal(fixture.reads.length, reads)
          fixture.requests[1].resolve()
          await current
          assert.equal(fixture.view.busyId.value, '')
          assert.equal(fixture.reads.length, reads + 1)
        } finally { fixture.close() }
      }
    })
  }

  test(`${action} 与同一对象的新操作重叠时旧回调不清理忙碌状态、追加读取或覆盖错误`, async () => {
    for (const outcome of ['success', 'failure']) {
      const fixture = panelWriteFixture()
      try {
        await fixture.view.refresh()
        const old = fixture.run(action)
        await flush()
        const current = fixture.run('rename', 2)
        await flush()
        const reads = fixture.reads.length
        outcome === 'success' ? fixture.requests[0].resolve() : fixture.requests[0].reject(new Error('Old operation failure'))
        await old
        assert.equal(fixture.view.busyId.value, 'config-2')
        assert.equal(fixture.view.error.value, '')
        assert.equal(fixture.view.actionError.value, '')
        assert.equal(fixture.reads.length, reads)
        fixture.requests[1].reject(new Error('Current operation failure'))
        await current
        assert.equal(fixture.view.error.value, 'Current operation failure')
        assert.equal(fixture.view.busyId.value, '')
      } finally { fixture.close() }
    }
  })

  test(`${action} 在同对象读取刷新后仍可完成，读取代次不撤销写操作`, async () => {
    const fixture = panelWriteFixture()
    try {
      await fixture.view.refresh()
      const write = fixture.run(action)
      await flush()
      await fixture.view.refresh()
      const reads = fixture.reads.length
      fixture.requests[0].resolve()
      await write
      assert.equal(fixture.reads.length, reads + 1)
      assert.equal(fixture.view.busyId.value, '')
    } finally { fixture.close() }
  })
}

for (const lifecycle of ['deactivate', 'unmount']) {
  for (const outcome of ['success', 'failure']) {
    test(`${lifecycle} 撤销启停、改名与删除的 ${outcome} 回调，重新激活也不恢复旧操作`, async () => {
      for (const action of ['setEnabled', 'rename', 'remove']) {
        const fixture = panelWriteFixture()
        try {
          await fixture.view.refresh()
          const old = fixture.run(action)
          await flush()
          await fixture[lifecycle]()
          assert.equal(fixture.view.busyId.value, '')
          let current
          if (lifecycle === 'deactivate') {
            await fixture.activate()
            current = fixture.run('rename', 2)
            await flush()
          }
          const reads = fixture.reads.length
          outcome === 'success' ? fixture.requests[0].resolve() : fixture.requests[0].reject(new Error('Inactive operation failure'))
          await old
          assert.equal(fixture.view.error.value, '')
          assert.equal(fixture.view.actionError.value, '')
          assert.equal(fixture.reads.length, reads)
          assert.equal(fixture.view.busyId.value, current ? 'config-2' : '')
          if (current) { fixture.requests[1].resolve(); await current }
        } finally { fixture.close() }
      }
    })
  }
}

for (const action of ['rename', 'saved']) {
  test(`${action} 等待已有读取期间切换对象，读取结束后不为新对象追加刷新`, async () => {
    const fixture = panelWriteFixture()
    try {
      await fixture.view.refresh()
      const pendingRead = fixture.holdNextRead()
      const read = fixture.view.refresh()
      const write = action === 'saved' ? fixture.view.saved() : fixture.run(action)
      await flush()
      if (action !== 'saved') fixture.requests[0].resolve()
      await flush()
      await fixture.switchOwner('b')
      const reads = fixture.reads.length
      pendingRead.resolve()
      await read
      await write
      assert.equal(fixture.reads.length, reads)
      assert.equal(fixture.view.error.value, '')
    } finally { fixture.close() }
  })
}

test('编辑器保存回调等待读取时，后续面板写入接管刷新与忙碌状态', async () => {
  const fixture = panelWriteFixture()
  try {
    await fixture.view.refresh()
    const pendingRead = fixture.holdNextRead()
    const read = fixture.view.refresh()
    const saved = fixture.view.saved()
    const current = fixture.run('rename', 2)
    await flush()
    const reads = fixture.reads.length
    pendingRead.resolve()
    await read
    await saved
    assert.equal(fixture.reads.length, reads)
    assert.equal(fixture.view.busyId.value, 'config-2')
    fixture.requests[0].resolve()
    await current
    assert.equal(fixture.reads.length, reads + 1)
  } finally { fixture.close() }
})
