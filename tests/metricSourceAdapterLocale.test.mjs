import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { defineComponent, h, nextTick, ref } from 'vue'
import * as i18nRuntime from 'vue-i18n'
import { createMetricLoader, createMetricRenderer } from './helpers/metricRuntime.mjs'

test('source descriptions merge into an existing host composer and follow its locale', async () => {
  const calls = []
  const api = {
    loadMetricBuiltins:async (...args) => {
      calls.push(args)
      if (args[0] === 'device') return [{id:'alarmActive',name:'Active alarm',description:'Platform alarm state',valueType:'boolean'},
        {id:'longestAlarmDuration',name:'Longest active alarm',description:'Current cycle',valueType:'double',unit:'s'}]
      return [{ id:'deviceCount', name:'设备总数', description:'范围内的唯一设备', supportsChildren:true }]
    },
    loadMetricDevice:async () => { throw new Error('denied') },
  }
  const load = createMetricLoader({
    'vue-i18n':i18nRuntime,
    '../../../api/metricSources':api,
    [fileURLToPath(new URL('../api/metricSources.ts',import.meta.url))]:api,
    [fileURLToPath(new URL('../api/metricBusinessSources.ts',import.meta.url))]:{
      loadMetricEvents:async()=>[],loadMetricCommandServices:async()=>[],loadMetricCommands:async()=>[],loadMetricObjectTypes:async()=>[],queryMetricBusinessObjects:async()=>({data:[],total:0}),
    },
  })
  const adapterFile = fileURLToPath(new URL('../components/Metric/source-picker/useMetricSourceAdapter.ts', import.meta.url))
  const { useMetricSourceAdapter } = load(adapterFile)
  const i18n = i18nRuntime.createI18n({ legacy:false, locale:'zh', fallbackLocale:'en' })
  const context = ref({ ownerType:'deviceGroup', ownerId:'line', label:'产线' })
  let adapter, host
  const component = defineComponent({ setup() {
    host = i18nRuntime.useI18n({ useScope:'local', messages:{ zh:{ title:'宿主' }, en:{ title:'Host' } } })
    adapter = useMetricSourceAdapter(context)
    return () => h('div', host.t('title'))
  } })
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp(component)
  app.use(i18n)
  app.mount(root)
  const mappings = {
    direct:{ kind:'builtin', id:'deviceCount' },
    descendants:{ kind:'builtin', id:'deviceCount', includeChildren:true },
    missing:{ kind:'builtin', id:'removed' },
    denied:{ kind:'property', id:'power', thingId:'device' },
  }
  try {
    const zh = await adapter.pickSource.describe(context.value, mappings)
    assert.equal(zh.direct.detail,'仅当前 · 范围内的唯一设备')
    assert.equal(zh.descendants.detail,'包含子级 · 范围内的唯一设备')
    assert.equal(zh.missing.error,'当前对象未提供内置数据')
    assert.equal(zh.denied.error,'来源加载失败，请重试')
    assert.deepEqual(calls,[['deviceGroup','line']])
    assert.equal(host.t('title'),'宿主')
    const sourceKinds=adapter.pickSource.sourceOptions
    assert.equal(sourceKinds.find(option=>option.value === 'property').icon,'DatabaseOutlined')
    assert.equal(sourceKinds.find(option=>option.value === 'businessQuery').description,'计算时读取对象关联的业务数据')

    host.locale.value = 'en'
    await nextTick()
    const en = await adapter.pickSource.describe(context.value, mappings)
    assert.equal(en.direct.detail,'Direct only · 范围内的唯一设备')
    assert.equal(en.descendants.detail,'Include descendants · 范围内的唯一设备')
    assert.equal(en.missing.error,'No built-in data for this object')
    assert.equal(en.denied.error,'Unable to load source. Retry.')
    assert.equal(host.t('title'),'Host')
    assert.equal(adapter.pickSource.sourceOptions.find(option=>option.value === 'property').icon,'DatabaseOutlined')
    assert.equal(adapter.pickSource.sourceOptions.find(option=>option.value === 'businessQuery').description,'Read associated business data when calculating')
    assert.equal(calls.length,2)
    const alarm = await adapter.pickSource.describe({ownerType:'device',ownerId:'pump',label:'Pump'}, {
      active:{kind:'builtin',id:'alarmActive'},duration:{kind:'builtin',id:'longestAlarmDuration'},
    })
    assert.deepEqual(alarm.active.valueType,{type:'boolean'})
    assert.deepEqual(alarm.duration.valueType,{type:'double'})
    assert.equal(alarm.duration.unit,'s')
    assert.equal(alarm.active.detail,'Platform alarm state','device facts do not claim member scope')
    assert.equal(calls.length,3,'two alarm bindings share one metadata read')
    api.loadMetricOutput = async () => ({config:{id:'source',ownerType:'product',ownerId:'p',targetType:'device',scope:'children',state:'enabled',dataVersion:'v1'},
      template:{name:'Period statistics',inputDefinitions:[],parameterDefinitions:[],definitions:[],outputs:[{metricId:'seconds',label:'Energized',unit:'s',persist:true},{metricId:'from',persist:true},{metricId:'coverage',persist:true}]}})
    api.loadMetricProductName = async () => 'Machine'
    const statistical = {kind:'metric',configId:'source',id:'seconds',sourceDataVersion:'v1',statistics:{memberType:'device',sourceType:'product',sourceId:'p',operation:'count',operator:'gt',value:0,maxAge:'PT10M',period:'day',zone:'Asia/Shanghai',periodMetricId:'from',coverageMetricId:'coverage'}}
    const counts = await adapter.pickSource.describe(context.value, {count:statistical,seconds:{...statistical,statistics:{...statistical.statistics,operation:'sum',operator:undefined,value:undefined}},
      stale:{...statistical,sourceDataVersion:'v0'}})
    assert.equal(counts.count.unit,undefined)
    assert.equal(counts.seconds.unit,'s')
    assert.match(counts.count.detail,/Count matching devices.*Greater than 0.*Today/)
    assert.match(counts.count.detail,/Updated within 10 minutes/)
    assert.match(counts.count.detail,/Product Machine/)
    host.locale.value = 'zh'
    const localized = await adapter.pickSource.describe(context.value, {count:statistical})
    assert.match(localized.count.detail,/10 分钟内更新/)
    assert.doesNotMatch(localized.count.detail,/PT10M/)
    assert.match(counts.stale.error,/changed/)
    host.locale.value = 'ja'
    await nextTick()
    const japanese = await adapter.pickSource.describe(context.value, {count:statistical})
    assert.match(japanese.count.detail,/一致するデバイス数.*より大きい 0.*本日/)
    assert.match(japanese.count.detail,/10 分以内に更新/)
    assert.equal(adapter.pickSource.sourceOptions.find(option=>option.value === 'businessQuery').description,'計算時に関連する業務データを取得')
    host.locale.value = 'zh'
    const modelReads=[]
    api.loadMetricDevice=async id=>{modelReads.push(id);return {device:{id,name:'外部设备'},properties:[{id:'power',name:'外部功率'}],events:[{id:'alarm',name:'外部事件'}]}}
    api.loadMetricProductSources=async id=>{modelReads.push(id);return {properties:[{id:'power',name:'产品功率'}],events:[{id:'alarm',name:'产品事件'}]}}
    api.describeMetricProvider=async spec=>{assert.equal(spec.configuration.thingId,'*');return {name:'业务事件',schema:{type:'number'},capabilities:['subscribe']}}
    const inherited=await adapter.pickSource.describe({ownerType:'product',ownerId:'product',targetType:'device',scope:'children'}, {
      member:{kind:'property',id:'power'},external:{kind:'property',id:'power',thingId:'external'},
      memberEvent:{kind:'provider',id:'alarm',providerSource:{provider:'device-events',sourceType:'event',configuration:{}}},
      externalEvent:{kind:'provider',id:'alarm',thingId:'external',providerSource:{provider:'device-events',sourceType:'event',configuration:{}}},
      business:{kind:'provider',id:'$',providerSource:{provider:'events',sourceType:'assessment',configuration:{}}},
    })
    assert.equal(inherited.member.label,'当前设备 / 产品功率')
    assert.equal(inherited.external.label,'外部设备 / 外部功率')
    assert.equal(inherited.memberEvent.label,'当前设备 / 产品事件')
    assert.equal(inherited.externalEvent.label,'外部设备 / 外部事件')
    assert.equal(inherited.business.detail,'当前设备')
    assert.deepEqual(modelReads.sort(),['external','product'])
  } finally { app.unmount() }
})
