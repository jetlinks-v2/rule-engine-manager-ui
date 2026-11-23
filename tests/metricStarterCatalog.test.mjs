import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, sourceRoot } from './helpers/metricRuntime.mjs'

const load=createMetricLoader({[resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}}})
const {useMetricTemplates}=load('components/Metric/template/useMetricTemplates.ts')
const {mergeTemplateStarters,starterCatalog,starterCategories}=load('components/Metric/template/templateCatalog.ts')
const starter=(providerId='iot',version='1')=>({providerId,id:'same',providerName:'物联',providerNameI18n:{en:'IoT'},groupId:'state',groupName:'状态',groupNameI18n:{en:'States'},industries:[{id:'manufacturing',name:'制造',nameI18n:{en:'Manufacturing'}}],
  template:{id:'state',version,name:'状态时长',inputDefinitions:[],parameterDefinitions:[],definitions:[],outputs:[],options:{i18nMessages:{name:{en:'State durations'}}}}})

test('provider and version distinguish references while duplicate identities block the merged catalog',()=>{
  const first=starter(),business=starter('business'),version=starter('iot','2')
  assert.equal(mergeTemplateStarters([first,business],[version]).items.length,3)
  const duplicate=mergeTemplateStarters([first],[structuredClone(first)])
  assert.equal(duplicate.items.length,0)
  assert.deepEqual(duplicate.conflicts,['iot / same / 1'])
})

test('module groups fill absent categories without overwriting administrator labels, and selection uses the localized copy',()=>{
  const original=starter(),snapshot=JSON.stringify(original)
  assert.deepEqual(starterCategories([{value:'state',label:'Custom'}],[original],'en'),[{value:'state',label:'Custom'}])
  const groups=starterCatalog([original],'en',[],'Other')
  assert.equal(groups[0].label,'States')
  const item=groups[0].items[0]
  assert.equal(item.starter.template.name,'State durations')
  assert.equal(item.starter.providerName,'IoT')
  assert.equal(item.starter.industries[0].name,'Manufacturing')
  assert.equal(JSON.stringify(original),snapshot)
  const scope=effectScope(),model=scope.run(()=>useMetricTemplates(ref(true),{}))
  try {
    model.open(undefined,item.starter)
    assert.equal(model.draft.value.name,'State durations')
    assert.equal(model.draft.value.options.authoring.reference.providerId,'iot')
    assert.notEqual(model.draft.value.id,original.template.id)
  } finally {scope.stop()}
})

test('catalog errors and removed providers clear discovery, preserve drafts, and ignore stale or disposed requests',async()=>{
  const pending=[],scope=effectScope(),model=scope.run(()=>useMetricTemplates(ref(true),{templateStarters:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}))
  model.open()
  const draft=model.draft.value
  const first=model.loadStarters(),second=model.loadStarters()
  pending[1].resolve([starter('new')]);await second
  pending[0].resolve([starter('old')]);await first
  assert.equal(model.discoveredStarters.value[0].providerId,'new')
  const failed=model.loadStarters();pending[2].reject(new Error('403'));await failed
  assert.equal(model.starterError.value,'403')
  assert.deepEqual(model.discoveredStarters.value,[])
  assert.equal(model.draft.value,draft)
  const removed=model.loadStarters();pending[3].resolve([]);await removed
  assert.equal(model.starterError.value,'')
  const disposed=model.loadStarters();scope.stop();pending[4].resolve([starter()]);await disposed
  assert.deepEqual(model.discoveredStarters.value,[])
})
