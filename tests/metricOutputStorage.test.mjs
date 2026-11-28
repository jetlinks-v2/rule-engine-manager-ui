import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, h, reactive, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, sourceRoot, walk, textContent } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({
  'vue-i18n':{useI18n:()=>({t:(key,values)=>key + (values ? JSON.stringify(values) : '')})},
  '@jetlinks-web/vite/dist/dynamic-remote':{dynamicRemoteManager:{}},
  '@jetlinks-web-core/utils/consts':{isSubApp:false},
  [resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}},
})
const fields = load('components/Metric/MetricOutputStorageFields.vue').default
const {metricOutputWithStorage,metricStorageOverride,metricStoredOutputCount,metricOutputHasCompleteHistory} = load('components/Metric/outputStorage.ts')
const {useMetricEditor} = load('components/Metric/useMetricEditor.ts')
const template = {id:'t',version:'1',name:'T',inputDefinitions:[],parameterDefinitions:[],parameters:{},definitions:[],outputs:[
  {metricId:'value',label:'Value',unit:'kW',persist:true},
  {metricId:'helper',label:'Helper',persist:false,latestOnly:true},
]}
const config = id=>({id,ownerType:'line',ownerId:'a',targetType:'line',targetId:'a',slot:id,templateId:'t',templateVersion:'1',revision:2,state:'disabled',inputMappings:{},parameters:{}})

test('storage overrides preserve identities and template defaults, including explicit full-history overrides',()=>{
  const original=structuredClone(template)
  const effective=metricOutputWithStorage(template.outputs[0],{mode:'interval',intervalMillis:60000})
  assert.deepEqual(metricStorageOverride(effective),{mode:'interval',intervalMillis:60000,deadband:0,maxIntervalMillis:0})
  assert.equal(effective.metricId,'value');assert.equal(effective.unit,'kW')
  assert.deepEqual(template,original)
  assert.equal(metricStoredOutputCount(template),1)
  assert.equal(metricStoredOutputCount(template,{value:{mode:'latest'},helper:{mode:'all'}}),1)
  assert.deepEqual(metricStorageOverride(template.outputs[0]),{mode:'all'})
  assert.equal(metricOutputHasCompleteHistory(template.outputs[0]),true)
  assert.equal(metricOutputHasCompleteHistory(effective),false)
})

test('the same editor updates the configuration draft and restores inheritance while enforcing history dependencies',async()=>{
  const state=reactive({overrides:{},constraints:['value']}),view=createMetricRenderer()
  const app=view.renderer.createApp({render:()=>h(fields,{template,modelValue:state.overrides,constraints:state.constraints,'onUpdate:modelValue':value=>{state.overrides=value}})})
  app.config.warnHandler=()=>{};app.mount(view.root)
  const selectors=()=>walk(view.root,node=>node.type==='external-shell' && node.props['component-props']?.['aria-label']==='historyRecording')
  try {
    assert.equal(selectors().length,2)
    assert.equal(selectors()[0].props['component-props'].options.find(item=>item.value==='latest').disabled,true)
    selectors()[0].props.onChange('latest');await flush();assert.deepEqual({...state.overrides},{})
    selectors()[1].props.onChange('all');await flush();assert.deepEqual({...state.overrides.helper},{mode:'all'})
    assert.ok(textContent(view.root).includes('storageOverride'))
    selectors()[1].props.onChange('inherit');await flush();assert.deepEqual({...state.overrides},{})
    state.constraints=[];await flush();selectors()[0].props.onChange('interval');await flush()
    assert.equal(state.overrides.value.intervalMillis,60000)
    assert.equal(template.outputs[0].history,undefined)
  } finally {app.unmount()}
})

test('storage shares save and template selection boundaries with parameters, and cancelled reads cannot replace another configuration',async()=>{
  const initial=ref(config('a')),scope=effectScope(),writes=[],pending=new Map()
  const other={...template,id:'other'}
  const editor=scope.run(()=>useMetricEditor(ref({ownerType:'line',ownerId:'a',editable:true}),initial,ref(),{
    getConfig:async id=>config(id),configTemplate:async()=>structuredClone(template),
    selectable:async()=>[{id:'other',template:other,revision:1,released:true,available:true}],
    saveConfig:async value=>{writes.push(structuredClone(value));return value},
    outputStorageConstraints:id=>new Promise(resolve=>pending.set(id,resolve)),
  }))
  try {
    await flush();assert.equal(editor.dirty.value,false)
    editor.draft.value.outputStorage={helper:{mode:'all'}}
    await editor.save(false);assert.deepEqual(writes[0].outputStorage,{helper:{mode:'all'}})
    const first=editor.loadStorageConstraints()
    initial.value=config('b');await flush()
    const second=editor.loadStorageConstraints()
    pending.get('b')(['helper']);await second
    pending.get('a')(['value']);await first
    assert.deepEqual([...editor.storageConstraints.value],['helper'])
    editor.templateSelection.value=JSON.stringify(['other','1'])
    assert.deepEqual({...editor.draft.value.outputStorage},{})
    assert.equal(editor.draft.value.templateId,'other')
  } finally {scope.stop()}
})
