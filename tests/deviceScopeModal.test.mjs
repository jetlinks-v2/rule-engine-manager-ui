import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { effectScope, nextTick, reactive } from 'vue'

const require = createRequire(import.meta.url)
const editor = new URL('../views/SceneLinkage/editor/', import.meta.url)
function load(url, mocks = {}) {
  const code = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', code)(id => id in mocks ? mocks[id] : require(id), exports)
  return exports
}
const settle = async () => { await nextTick(); await new Promise(setImmediate); await nextTick() }
const copy = value => JSON.parse(JSON.stringify(value))
const row = (id, productId = 'p1') => ({ id, name: `设备${id}`, productId, productName: `产品${productId}`, state: { value: 'online', text: '在线' } })

function fixture(t, options = {}) {
  const calls = [], counts = [], events = []
  const privateDeployment = options.privateDeployment !== false
  const products = [{ id: 'p1', name: '温控产品' }, { id: 'p2', name: '照明产品' }]
  const fields = load(new URL('../../device-manager-ui/deviceListFilter.ts', import.meta.url), {
    '@jetlinks-web-core/locales': { default: { global: { t: key => key } } },
    '@jetlinks-web-core/store/menu': { useMenuStore: () => ({ hasMenu: () => false }) },
    '@jetlinks-web-core/utils/deployment': { isPrivateDeployment: () => privateDeployment },
    '@jetlinks-web-core/utils/utils': { isNoCommunity: false },
    '@jetlinks-web-core/components/ConditionFilter': {},
    './api/device': { queryDeviceProductById_api: async id => products.find(product => product.id === id) },
    './api/category': {},
    './api/product': { queryNoPagingPost: async ({ terms }) => ({ result: products.filter(product =>
      !terms.length || terms[0].termType === 'in' && terms[0].value.includes(product.id)
    ) }) },
    './utils/i18n': { getI18nText: (item, key) => item[key] },
    './views/device/data': { deviceStateList: [{ label: '在线', value: 'online' }, { label: '离线', value: 'offline' }] },
    './views/device/Instance/components/TagSearch.vue': { default: {} },
  })
  const props = reactive({
    open: true, title: '', width: 1180, embedded: false, detailed: false,
    multiple: false, lockProduct: false, scopeModes: ['fixed'], productId: '',
    modelValue: { selector: 'fixed', selectorValues: [] }, ...options.props,
  })
  let libraryCalls = 0
  const { useDeviceScopeModal } = load(new URL('detail/useDeviceScopeModal.ts', editor), {
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    '../../../../api/scene-linkage': { queryDevicesPage: async params => {
      calls.push(copy(params))
      return options.query ? options.query(params) : { result: { data: [row('d1'), row('d2', 'p2')], total: 60 } }
    } },
    '../../../../api/scene-resources': {
      queryProjectSpaceAreaSettings_api: async () => ({ areas: [{ id: 'space', name: '园区' }, { id: 'floor', parentId: 'space', name: '一楼' }] }),
    },
    '../../../../api/others': {},
    '@jetlinks-web-core/utils/deployment': { isPrivateDeployment: () => privateDeployment },
    '@jetlinks-web-core/utils/project-runtime': { getProjectIdFromLocation: () => 'project' },
    '@device-manager-ui/deviceListFilter': fields,
    '@device-manager-ui/api/device-library': { queryDeviceLibraryProductFilterOptions_api: async () => {
      ++libraryCalls
      if (options.libraryError) throw new Error('unavailable')
      return [{ templateId: 't1', productId: 'p1', productName: '温控产品', accessProvider: 'mqtt', accessName: 'MQTT' }]
    } },
    '@device-manager-ui/api/deviceGroup': { batchDeviceNodeSummary_api: async (requests, terms) => { counts.push(copy(terms)); return [] } },
    '../deviceScopeTree': load(new URL('deviceScopeTree.ts', editor)),
  })
  const scope = effectScope()
  const state = scope.run(() => useDeviceScopeModal(props, (event, value) => {
    events.push([event, copy(value)])
    if (event === 'select-device') {
      props.productId = value.productId
      props.modelValue = { ...props.modelValue, productId: value.productId, productName: value.productName }
    }
  }))
  t.after(() => scope.stop())
  const search = terms => { state.filterTerms.value = copy(terms); state.handleFilterSearch({ terms, filter: { terms }, where: '' }) }
  return { state, props, calls, counts, events, search, libraryCalls: () => libraryCalls }
}

test('combined conditions stay grouped inside the selected space and reset pagination', async t => {
  const f = fixture(t)
  await settle()
  f.state.selectSpace(['space'])
  await settle()
  await f.state.changePage(3)
  const terms = [{ column: 'productId', termType: 'in', value: ['p1'] }, { column: 'state', termType: 'eq', value: 'online', type: 'or' }]
  f.search(terms)
  await settle()
  assert.equal(f.calls.at(-1).pageIndex, 0)
  assert.deepEqual(f.calls.at(-1).terms, [
    { column: 'id', termType: 'space-bind$device', value: ['space', 'floor'] }, { terms },
  ])
  assert.deepEqual(f.counts.at(-1), [{ terms }])
  f.search([])
  await settle()
  assert.equal(f.calls.at(-1).terms.length, 1)
})

test('device pages contain twenty rows and preserve named selections across three pages', async t => {
  const devices = Array.from({ length: 45 }, (_, i) => row(`d${i + 1}`))
  const f = fixture(t, { props: { multiple: true }, query: params => ({ result: {
    data: devices.slice(params.pageIndex * params.pageSize, (params.pageIndex + 1) * params.pageSize), total: devices.length,
  } }) })
  await settle()
  assert.equal(f.state.pageSize, 20)
  assert.equal(f.state.total.value, 45)
  assert.equal(f.state.deviceOptions.value.length, 20)
  f.state.deviceRowSelection.value.onChange(['d1'])
  await f.state.changePage(2)
  assert.equal(f.calls.at(-1).pageIndex, 1)
  assert.equal(f.state.deviceOptions.value[0].id, 'd21')
  f.state.deviceRowSelection.value.onChange(['d1', 'd21'])
  await f.state.changePage(3)
  assert.equal(f.state.deviceOptions.value.length, 5)
  assert.deepEqual(copy(f.state.deviceRowSelection.value.selectedRowKeys), ['d1', 'd21'])
  await f.state.save()
  assert.deepEqual(f.events.find(([event]) => event === 'save')[1].selectorValues, [
    { value: 'd1', name: '设备d1' }, { value: 'd21', name: '设备d21' },
  ])
})

test('selecting a device updates action product without changing the search or raw ID labels', async t => {
  const f = fixture(t)
  await settle()
  const terms = [{ column: 'productId', termType: 'in', value: ['p1', 'p2'] }]
  f.search(terms)
  await settle()
  f.state.deviceRowSelection.value.onChange(['d2'])
  await settle()
  assert.equal(f.state.draft.productId, 'p2')
  assert.equal(f.state.productFilter.value, undefined)
  assert.deepEqual(copy(f.state.filterTerms.value), terms)
  const panel = f.state.filterFields.value.find(field => field.dataIndex === 'productId').search.optionPanel
  assert.deepEqual(await panel.loadSelectedOptions(['p2']), [{ label: '照明产品', value: 'p2' }])
  await f.state.changePage(2)
  assert.deepEqual(f.calls.at(-1).terms, [{ terms }])
  await f.state.save()
  const saved = f.events.find(([event]) => event === 'save')[1]
  assert.equal(saved.productId, 'p2')
  assert.deepEqual(saved.selectorValues, [{ value: 'd2', name: '设备d2' }])
})

test('locked product remains an outer restriction across OR searches and clearing', async t => {
  const f = fixture(t, { props: { lockProduct: true, productId: 'locked' } })
  await settle()
  assert.equal(f.state.filterFields.value.some(field => field.dataIndex === 'productId'), false)
  f.search([{ column: 'name', termType: 'like', value: '%设备%' }, { column: 'id', termType: 'eq', value: 'd1', type: 'or' }])
  await settle()
  assert.deepEqual(f.calls.at(-1).terms[0], { column: 'productId', termType: 'eq', value: 'locked' })
  assert.equal(f.calls.at(-1).terms[1].terms[1].type, 'or')
  f.search([])
  await settle()
  assert.deepEqual(f.calls.at(-1).terms, [{ column: 'productId', termType: 'eq', value: 'locked' }])
})

test('device-list field conversion preserves nested OR and product relation filters', async t => {
  const f = fixture(t)
  await settle()
  f.search([{ terms: [{ column: 'classifiedId', termType: 'in', value: ['c1'] }, { column: 'accessId', termType: 'eq', value: 'mqtt', type: 'or' }] }])
  await settle()
  const group = f.calls.at(-1).terms[0].terms[0].terms
  assert.equal(group[0].column, 'productId$product-info')
  assert.deepEqual(group[0].value, [{ column: 'classifiedId', termType: 'in', value: ['c1'] }])
  assert.equal(group[1].type, 'or')
})

test('reopening resets search without turning a saved action product into a filter', async t => {
  const f = fixture(t, { props: { productId: 'p1', modelValue: { selector: 'fixed', selectorValues: [{ value: 'd1', name: '设备d1' }], productId: 'p1' } } })
  await settle()
  f.search([{ column: 'state', termType: 'eq', value: 'online' }])
  await settle()
  f.props.open = false
  await settle()
  f.props.open = true
  await settle()
  assert.deepEqual(copy(f.state.filterTerms.value), [])
  assert.deepEqual(f.calls.at(-1).terms, [])
  assert.equal(f.state.selectedDevice.value.id, 'd1')
})

test('SaaS reuses device-list option sources and option failures leave device search available', async t => {
  for (const libraryError of [false, true]) {
    const f = fixture(t, { privateDeployment: false, libraryError })
    await settle()
    assert.equal(f.libraryCalls(), 1)
    assert.equal(f.calls.length, 1)
    assert.deepEqual(f.state.filterFields.value.map(field => field.dataIndex), ['name', 'id', 'deviceType', 'accessProvider', 'productId'])
    if (!libraryError) assert.deepEqual(f.state.filterFields.value.at(-1).search.options, [{ label: '温控产品', value: 'p1' }])
  }
})
