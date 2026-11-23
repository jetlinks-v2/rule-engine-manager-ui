import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { effectScope, ref } from 'vue'
import { createMetricLoader, flush, sourceRoot } from './helpers/metricRuntime.mjs'

const pending = () => { let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject} }
let discover=async()=>[]
const load=createMetricLoader({
  '@jetlinks-web/vite/dist/dynamic-remote':{dynamicRemoteManager:{}},
  '@jetlinks-web-core/utils/consts':{isSubApp:false},
  [resolve(sourceRoot,'components/Metric/api.ts')]:{loadMetricObjectTypes:()=>discover()},
})
const {moduleRegistry}=load('utils/module-registry.ts')
const {useMetricWorkspace}=load('components/Metric/workspace/useMetricWorkspace.ts')
const dimension=ownerType=>({ownerType,label:ownerType,navigator:{render(){}},useSourcePicker:()=>({pickSource:async()=>undefined})})
function fixture(selection, identity=ref('user-a')) {
  moduleRegistry.clear();moduleRegistry.register('business',{metricDimensions:{space:dimension('space'),device:dimension('device')}})
  const scope=effectScope(),changes=[]
  const view=scope.run(()=>useMetricWorkspace(identity,ref(selection),ref(true),value=>changes.push(value)))
  return{scope,view,changes,identity}
}

test('后端未声明空间时不加载空间导航或指标，未知路由不自动跳到其他对象',async()=>{
  const request=pending();discover=()=>request.promise
  const {scope,view}=fixture({ownerType:'space',ownerId:'west-gate'})
  try{
    assert.equal(view.discoveryLoading.value,true);assert.equal(view.context.value,undefined)
    assert.deepEqual(view.resources.value.dimensions,[])
    assert.equal(view.selection.value.ownerId,'west-gate','发现完成前保留路由，避免误清选择')
    request.resolve([{id:'device'}]);await flush()
    assert.deepEqual(view.resources.value.dimensions.map(item=>item.provider.ownerType),['device'])
    assert.equal(view.selection.value,undefined);assert.equal(view.unavailable.value,true)
    view.confirmObject({ownerId:'west-gate',label:'西门'});assert.equal(view.context.value,undefined)
  }finally{scope.stop()}
})

test('成功空目录与发现失败分开，失败可重试且不会回退前端类型',async()=>{
  discover=async()=>{throw Error('catalog unavailable')}
  const {scope,view}=fixture({ownerType:'space',ownerId:'west-gate'})
  try{
    await flush();assert.match(view.discoveryError.value,/catalog unavailable/)
    assert.equal(view.unavailable.value,false);assert.equal(view.selection.value.ownerId,'west-gate')
    assert.deepEqual(view.resources.value.dimensions,[])
    discover=async()=>[{id:'space'}];view.reloadDimensions();await flush()
    assert.equal(view.discoveryError.value,'');assert.equal(view.dimension.value.provider.ownerType,'space')
    view.confirmObject({ownerId:'west-gate',label:'西门'});assert.equal(view.context.value.label,'西门')
    discover=async()=>[];view.reloadDimensions();assert.equal(view.context.value,undefined);await flush()
    assert.equal(view.discoveryError.value,'');assert.equal(view.unavailable.value,true)
    assert.deepEqual(view.resources.value.dimensions,[])
  }finally{scope.stop()}
})

test('首次仅预选已发现类型，身份切换和卸载后迟到目录不能恢复旧能力',async()=>{
  discover=async()=>[{id:'device'},{id:'serverOnly'}]
  const {scope,view,identity}=fixture()
  try{
    await flush();assert.deepEqual(view.selection.value,{ownerType:'device',ownerId:''})
    view.confirmObject({ownerId:'D1',label:'设备'});assert.ok(view.context.value)
    const old=pending(),latest=pending();discover=()=>old.promise;view.reloadDimensions()
    discover=()=>latest.promise;identity.value='user-b'
    assert.equal(view.context.value,undefined);assert.deepEqual(view.resources.value.dimensions,[])
    latest.resolve([{id:'space'}]);await flush()
    old.resolve([{id:'device'}]);await flush()
    assert.deepEqual(view.resources.value.dimensions.map(item=>item.provider.ownerType),['space'])
    const after=pending();discover=()=>after.promise;view.reloadDimensions();scope.stop()
    after.resolve([{id:'device'}]);await flush()
    assert.deepEqual(view.resources.value.dimensions,[])
  }finally{scope.stop()}
})
