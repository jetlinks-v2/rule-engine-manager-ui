import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, flush, sourceRoot } from './helpers/metricRuntime.mjs'

const load=createMetricLoader({
  '@jetlinks-web/vite/dist/dynamic-remote':{dynamicRemoteManager:{}},
  '@jetlinks-web-core/utils/consts':{isSubApp:false},
  [resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}},
})
const {useMetricEditor}=load('components/Metric/useMetricEditor.ts')
const {useMetricPanel}=load('components/Metric/useMetricPanel.ts')
const template={id:'t',version:'1',name:'T',inputDefinitions:[{id:'reading'}],parameterDefinitions:[{id:'factor',expands:{editable:true}}],parameters:{factor:1},definitions:[],outputs:[{metricId:'value'}]}
const full=id=>({id,ownerType:'line',ownerId:'a',targetType:'line',targetId:'a',slot:'s',templateId:'t',templateVersion:'1',revision:9,state:'enabled',inputMappings:{reading:{kind:'property',id:'temperature'}},parameters:{factor:7}})
const summary=id=>({...full(id),inputMappings:{},parameters:{}})
const context=()=>ref({ownerType:'line',ownerId:'a',editable:true})
const metadata={selectable:async()=>[],configTemplate:async()=>template}

test('opening a result summary authorizes the full configuration before describing or saving its bindings',async()=>{
  let finish,descriptions=0;const saved=[]
  const picker=Object.assign(async()=>undefined,{describe:async()=>{descriptions++;return {}}})
  const scope=effectScope(),editor=scope.run(()=>useMetricEditor(context(),ref(summary('c')),ref(picker),{
    ...metadata,getConfig:()=>new Promise(resolve=>{finish=resolve}),saveConfig:async value=>{saved.push(value);return value},
  }))
  try {
    await flush();assert.equal(descriptions,0);assert.equal(await editor.save(false),undefined)
    finish(full('c'));await flush()
    assert.deepEqual(editor.draft.value.inputMappings,full('c').inputMappings)
    assert.deepEqual(editor.draft.value.parameters,{factor:7});assert.equal(editor.draft.value.revision,9)
    assert.equal(editor.dirty.value,false);assert.equal(descriptions,1)
    await editor.save(false)
    assert.equal(saved.length,1);assert.deepEqual(saved[0].inputMappings,full('c').inputMappings)
    assert.deepEqual(saved[0].parameters,{factor:7})
  } finally {scope.stop()}
})

test('a denied management read never describes stale inputs or writes the result summary',async()=>{
  let descriptions=0,writes=0
  const picker=Object.assign(async()=>undefined,{describe:async()=>{descriptions++;return {}}})
  const scope=effectScope(),editor=scope.run(()=>useMetricEditor(context(),ref(full('c')),ref(picker),{
    ...metadata,getConfig:async()=>{throw new Error('denied')},saveConfig:async()=>{writes++},
  }))
  try {await flush();assert.equal(editor.errorKind.value,'load');assert.equal(await editor.save(false),undefined);assert.equal(descriptions,0);assert.equal(writes,0)}
  finally {scope.stop()}
})

test('late full configuration reads cannot replace another selected configuration',async()=>{
  const pending=new Map(),initial=ref(summary('a')),scope=effectScope()
  const editor=scope.run(()=>useMetricEditor(context(),initial,ref(),{...metadata,getConfig:id=>new Promise(resolve=>pending.set(id,resolve))}))
  try {
    initial.value=summary('b');await flush();pending.get('b')(full('b'));await flush()
    pending.get('a')(full('a'));await flush();assert.equal(editor.draft.value.id,'b');assert.equal(editor.dirty.value,false)
  } finally {scope.stop()}
})

test('enable and rename preserve bindings, parameter overrides and revisions omitted from result summaries',async()=>{
  const prior=globalThis.document;globalThis.document={hidden:true,addEventListener(){},removeEventListener(){}}
  let stored=full('c'),reads=0;const writes=[],scope=effectScope()
  const panel=scope.run(()=>useMetricPanel(context(),{
    ...metadata,byOwner:async()=>[summary('c')],latest:async()=>[],
    getConfig:async()=>{reads++;return structuredClone(stored)},
    saveConfig:async value=>{writes.push(value);stored=value;return value},
  }))
  try {
    await panel.refresh();await panel.setEnabled(summary('c'),false);await panel.rename(summary('c'),'Updated')
    assert.equal(reads,2);assert.equal(writes[1].state,'disabled');assert.equal(writes[1].name,'Updated')
    for(const write of writes){assert.deepEqual(write.inputMappings,full('c').inputMappings);assert.deepEqual(write.parameters,{factor:7});assert.equal(write.revision,9)}
  } finally {scope.stop();globalThis.document=prior}
})
