import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, nextTick, ref } from 'vue'
import { applyAiSourceConfiguration, mapAiMappingSources, loadAiMappingSources, aiEventSourceKey } from '../views/SceneLinkage/editor/aiEventSourceService'
import { queryAiSourceDevices, queryAiConfiguredSources, readAiSourceList, type AiSourceMapping } from '../api/scene-ai-sources'
import { buildRequest, defaultForm, defaultMultiTriggerForm, toForm } from '../views/SceneLinkage/utils'
import { setSceneTestRequestHandler } from './sceneTestHttp'
import { useAiEventMediaTargetSelector } from '../views/SceneLinkage/editor/useAiEventMediaTargetSelector'

const mappings: AiSourceMapping[] = [
  { id: 'event', deviceId: 'ordinary', type: 'event', eventId: 'snapshot', imageSource: 'image' },
  { id: 'property', deviceId: 'ordinary', type: 'property', channelId: 'virtual', propertyImageSource: 'picture' },
  { id: 'media', deviceId: 'media', type: 'event', channelId: 'camera', eventId: 'snapshot', imageSource: 'image' },
  { id: 'empty', deviceId: 'ordinary', type: 'property', propertyImageSource: ' ' },
  { id: 'denied', deviceId: 'denied', type: 'event', eventId: 'snapshot', imageSource: 'image' },
]
const devices = [{ id: 'ordinary', name: '普通设备', productId: 'iot' }, { id: 'media', productId: 'video' }]
const products = [{ id: 'iot', accessProvider: 'mqtt' }, { id: 'video', accessProvider: 'onvif' }]

test('mapped sources retain property/event identities and omit duplicate media channels and unusable mappings', () => {
  const result = mapAiMappingSources(mappings, devices, products)
  assert.deepEqual(result.map(source => [source.deviceId, source.channelId, source.mappingType]), [
    ['ordinary', undefined, 'event'], ['ordinary', 'virtual', 'property'],
  ])
  assert.equal(result[0].name, '普通设备')
})

test('cloud and edge configuration are combined without enabling other channels on a mapped device', () => {
  const sources = mapAiMappingSources(mappings, devices, products)
  const channels = [...sources, { id: 'camera', deviceId: 'media', channelId: 'camera' }]
  const result = applyAiSourceConfiguration(channels, [{ type: 'deviceDetector', deviceId: 'ordinary', channelId: null }], new Set(['camera']))
  assert.deepEqual(result.map(source => source.modelConfigured), [true, false, true])
  assert.equal(aiEventSourceKey({ deviceId: 'ordinary', channelId: '' }), aiEventSourceKey({ deviceId: 'ordinary' }))
  assert.notEqual(aiEventSourceKey({ deviceId: 'ordinary', channelId: 'virtual' }), aiEventSourceKey({ deviceId: 'ordinary' }))
})

test('device directory groups media OR mapping and keeps keyword search outside that group', async () => {
  let body: any
  setSceneTestRequestHandler((_method, _url, data) => { body = data; return Promise.resolve({ result: { total: 0, data: [] } }) })
  try {
    await queryAiSourceDevices(2, '测试')
    assert.equal(body.pageIndex, 2)
    assert.equal(body.terms[0].terms[1].termType, 'ai-device-event-mapping')
    assert.equal(body.terms[0].terms[1].type, 'or')
    assert.equal(body.terms[1].terms[0].value, '%测试%')
  } finally { setSceneTestRequestHandler() }
})

test('mapping catalog loads only referenced permitted devices and classifies media providers', async () => {
  const requested: string[] = []
  setSceneTestRequestHandler((_method, url, body: any) => {
    requested.push(String(url))
    if (String(url).startsWith('/ai/device-event-mapping')) return Promise.resolve({ result: mappings })
    if (String(url).startsWith('/device-instance')) {
      assert.deepEqual(body.terms[0].value, ['ordinary', 'media', 'denied'])
      return Promise.resolve({ result: { data: devices, total: devices.length } })
    }
    return Promise.resolve({ result: products })
  })
  try {
    assert.equal((await loadAiMappingSources()).length, 2)
    assert.equal(requested.length, 3)
  } finally { setSceneTestRequestHandler() }
})

test('cloud configuration queries enabled tasks in the chosen scene and rejects business failures', async () => {
  setSceneTestRequestHandler((_method, _url, body: any) => {
    assert.deepEqual(body.terms.map((term: any) => term.column), ['taskTarget', 'state', 'modelId'])
    assert.equal(body.terms[1].value, 'enabled')
    assert.deepEqual(body.terms[2].value, { sceneId: 'scene' })
    return Promise.resolve({ success: false, result: [] })
  })
  try { await assert.rejects(queryAiConfiguredSources('scene', 'PersonDetection')) }
  finally { setSceneTestRequestHandler() }
  assert.throws(() => readAiSourceList({ message: 'invalid' }))
})

test('source picker loads mapped devices and filters mappings by device and descendant spaces', async () => {
  const calls: Array<{ url: string; body: any }> = []
  setSceneTestRequestHandler((_method, url, body: any) => {
    calls.push({ url: String(url), body })
    let result: unknown = []
    if (url === '/space/detail/_tree') result = [{ id: 'region', children: [{ id: 'child' }] }]
    else if (String(url).startsWith('/ai/device-event-mapping')) result = mappings
    else if (url === '/device-instance/_query') result = { data: devices, total: devices.length }
    else if (String(url).startsWith('/device-product')) result = products
    else if (url === '/space/bind/_detail') result = [{ deviceId: 'ordinary', spaceId: 'child' }]
    else if (url === '/ai/cv/_sources') result = [{ deviceId: 'ordinary', channelId: null }]
    else if (url === '/media/channel/_query') result = { data: [], total: 0 }
    return Promise.resolve({ result })
  })
  const scope = effectScope()
  try {
    const picker = scope.run(() => useAiEventMediaTargetSelector(() => ({ sceneId: 'scene', taskTarget: 'PersonDetection' })))!
    await picker.loadDevices()
    await picker.selectAllChannels()
    assert.equal(picker.channelRows.value.length, 2)
    assert.deepEqual(picker.channelRows.value.map(source => source.modelConfigured), [true, false])
    await picker.selectTreeNode(['region:region'], { node: { key: 'region:region' } })
    assert.equal(picker.channelRows.value.length, 2)
    const regionQuery = calls.filter(call => call.url === '/media/channel/_query').at(-1)!
    assert.deepEqual(regionQuery.body.terms[0].value, ['region', 'child'])
    await picker.selectTreeNode(['device:media'], { node: { key: 'device:media' } })
    assert.equal(picker.channelRows.value.length, 0)
    const deviceQuery = calls.filter(call => call.url === '/media/channel/_query').at(-1)!
    assert.deepEqual(deviceQuery.body.terms, [{ column: 'deviceId', termType: 'eq', value: 'media' }])
  } finally { scope.stop(); setSceneTestRequestHandler() }
})

for (const combined of [false, true]) {
  test(`mapped source survives ${combined ? 'combined' : 'single'} trigger save and reload`, () => {
    const form = defaultForm()
    const visual = defaultMultiTriggerForm()
    visual.triggerKind = 'ai-event'
    visual.aiEvent = { sceneId: 'scene', taskTarget: 'PersonDetection',
      mediaTargets: [{ deviceId: 'ordinary', name: '属性图片', entityId: 'mapping:property' }] }
    Object.assign(form, visual)
    if (combined) {
      const timer = defaultMultiTriggerForm()
      timer.triggerKind = 'repeat'
      form.multiTriggers = [visual, timer]
    }
    const saved = JSON.parse(JSON.stringify(buildRequest(form)))
    const restored = toForm(saved)
    const config = combined ? restored.multiTriggers![0].aiEvent : restored.aiEvent
    assert.equal(config.mediaTargets?.[0].deviceId, 'ordinary')
    assert.equal(config.mediaTargets?.[0].channelId, undefined)
    assert.equal(config.mediaTargets?.[0].name, '属性图片')
    assert.equal(config.mediaTargets?.[0].entityId, 'mapping:property')
  })
}


test('changing recognition settings preserves sources while changing the algorithm refreshes them', async () => {
  let channelRequests = 0
  setSceneTestRequestHandler((_method, url) => {
    let result: unknown = []
    if (url === '/space/detail/_tree') result = []
    else if (String(url).startsWith('/ai/device-event-mapping')) result = mappings
    else if (url === '/device-instance/_query') result = { data: devices, total: devices.length }
    else if (String(url).startsWith('/device-product')) result = products
    else if (url === '/media/channel/_query') { channelRequests++; result = { data: [], total: 0 } }
    return Promise.resolve({ result })
  })
  const scope = effectScope()
  const draft = ref({ sceneId: 'scene', taskTarget: 'PersonDetection', recognitionRule: 'immediate' })
  try {
    const picker = scope.run(() => useAiEventMediaTargetSelector(() => draft.value))!
    await picker.loadDevices()
    await picker.selectAllChannels()
    picker.channelKeyword.value = '入口'
    const before = channelRequests
    draft.value = { ...draft.value, recognitionRule: 'hits' }
    await nextTick()
    assert.equal(channelRequests, before)
    assert.equal(picker.channelKeyword.value, '入口')
    draft.value = { ...draft.value, taskTarget: 'ClutterDetection' }
    await nextTick()
    assert.equal(channelRequests, before + 1)
  } finally { scope.stop(); setSceneTestRequestHandler() }
})
