import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { build, transform } from 'esbuild'
import { fileURLToPath } from 'node:url'

const source = await readFile(new URL('../components/Metric/source-picker/metricSources.ts', import.meta.url), 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'esm' })
const { metricSourceTerms } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../api/metricSources.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'source-api-boundary', setup(builder) {
    builder.onResolve({ filter:/^@jetlinks-web\/core$/ }, () => ({ path:'platform',namespace:'source-mock' }))
    builder.onResolve({ filter:/hooks\/usePropertyUnits$/ }, () => ({ path:'units',namespace:'source-mock' }))
    builder.onResolve({ filter: /^\.\/(instance|product)$/ }, args => ({ path: args.path, namespace: 'source-mock' }))
    builder.onResolve({ filter: /^@jetlinks-web-core\/locales$/ }, () => ({ path: 'locale', namespace: 'source-mock' }))
    builder.onResolve({ filter: /components\/Metric\/api$/ }, () => ({ path: 'metric', namespace: 'source-mock' }))
    builder.onResolve({ filter: /^\.\/metricBusinessSources$/ }, () => ({ path: 'business', namespace: 'source-mock' }))
    builder.onLoad({ filter: /.*/, namespace: 'source-mock' }, args => ({ contents: args.path === 'platform' ? 'export const request={get:async(path)=>globalThis.__metricPlatformRequest ? globalThis.__metricPlatformRequest(path) : ({result:[{id:"$online",name:"平台连接状态",valueType:"int",history:true,icon:"PoweroffOutlined"},{id:"$lastCommunicationTime",name:"最近会话通信时间",valueType:"long",history:false,icon:"MessageOutlined"}]})}' : args.path === 'locale'
      ? 'export default {global:{t:(key)=>key,locale:{value:"zh"}}}'
      : args.path === 'business' ? 'export const queryMetricBusinessObjects=(...args)=>globalThis.__metricObjectQuery(...args)'
      : args.path === 'units' ? 'export const formatPropertyUnit=value=>value'
      : args.path === 'metric' ? 'export const metricApi={byOwner:(...args)=>globalThis.__metricSourceApi.byOwner(...args),getConfig:(...args)=>globalThis.__metricSourceApi.getConfig(...args),configTemplate:(...args)=>globalThis.__metricSourceApi.configTemplate(...args)}'
      : args.path === './product' ? 'export const detail=(...args)=>globalThis.__metricSourceApi.productDetail(...args); export const queryProductList=(...args)=>globalThis.__metricSourceApi.queryProducts(...args)'
      : 'export const query=(...args)=>globalThis.__metricSourceApi.query(...args);export const detail=(...args)=>globalThis.__metricSourceApi.detail(...args)' }))
  } }],
})
const { queryMetricDevices, queryMetricProducts, loadMetricDevice, loadMetricProduct, loadMetricProductSources, loadMetricOutputs, loadMetricOutput } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
globalThis.__metricSourceApi={detail:async id=>({result:{id,name:'设备名称'}}),productDetail:async id=>({result:{id,name:'产品名称'}})}

test('instance metadata errors stay visible and retry without a global platform directory cache', async () => {
  globalThis.__metricObjectQuery=async(type,keyword,page,terms)=>({data:[{id:terms[0].value,name:'设备名称'}],total:1})
  const calls=[]
  globalThis.__metricPlatformRequest=(path)=>{calls.push(path);return {status:403,message:'metadata denied'}}
  await assert.rejects(loadMetricDevice('offline'),/metadata denied/)
  globalThis.__metricPlatformRequest=(path)=>{calls.push(path);return {status:200,result:{properties:[{id:'$online',name:'连接状态',valueType:{type:'int'},expands:{metricSource:{platform:true,history:true}}}]}}}
  const data=await loadMetricDevice('offline')
  assert.equal(data.properties[0].platform,true)
  assert.equal(data.properties[0].history,true)
  assert.deepEqual(calls,Array(2).fill('/metric/configs/sources/objects/device/offline/metadata'))
  delete globalThis.__metricPlatformRequest
})

test('four hosts set the initial candidate scope without restricting offline devices', () => {
  const cases = [
    ['device', 'id', 'eq'], ['product', 'productId', 'eq'],
    ['deviceGroup', 'id', 'dev-group'], ['space', 'id', 'space-bind$device'],
  ]
  for (const [ownerType, column, termType] of cases) {
    assert.deepEqual(metricSourceTerms({ ownerType, ownerId: 'owner-1' }), [{ column, termType, value: 'owner-1' }])
  }
})

test('device and product inputs use authorized ontology metadata and retain source names', async () => {
  globalThis.__metricSourceApi={query:async()=>({status:500,message:'query unavailable'}), detail:async id=>({result:{id,name:'设备名称'}}),productDetail:async id=>({result:{id,name:'产品名称'}})}
  globalThis.__metricObjectQuery=async()=>{throw new Error('query unavailable')}
  await assert.rejects(queryMetricDevices({ownerType:'device',ownerId:'offline'},'',0,true),/query unavailable/)
  globalThis.__metricObjectQuery=async(type,keyword,page,terms)=>({data:[{id:terms[0].value,name:type==='device' ? '设备名称' : '产品名称'}],total:1})
  const paths=[]
  globalThis.__metricPlatformRequest=async path=>{paths.push(path);return {status:200,result:{properties:[{id:'energy',name:'累计电量',valueType:{type:'double',unit:'kWh'}}]}}}
  const device=await loadMetricDevice('offline')
  assert.equal(device.properties[0].id,'energy')
  assert.equal(device.device.name,'设备名称')
  assert.equal((await loadMetricProduct('pumps'))[0].unit,'kWh')
  assert.deepEqual(paths,['/metric/configs/sources/objects/device/offline/metadata','/metric/configs/sources/objects/product/pumps/metadata'])
  delete globalThis.__metricPlatformRequest
})

test('metric sources expose active concrete public outputs and propagate access failures', async () => {
  const calls = []
  const active = { id: 'active', state: 'enabled', scope: 'single' }
  const template = { outputs: [{ metricId: 'usage', persist: true }, { metricId: 'threshold', persist: false }] }
  globalThis.__metricSourceApi = {
    byOwner: async (...args) => { calls.push(args); return [active, { id: 'disabled', state: 'disabled' }, { id: 'inherited', state: 'enabled', scope: 'children' }] },
    getConfig: async id => { assert.equal(id, 'active'); return active },
    configTemplate: async id => { assert.equal(id, 'active'); return template },
  }
  assert.deepEqual((await loadMetricOutputs('device', 'meter')).map(item => [item.config.id, item.output.metricId]), [['active', 'usage'], ['active', 'threshold']])
  assert.deepEqual(calls, [['device', 'meter']])
  assert.deepEqual(await loadMetricOutput('active'), { config: active, template })
  globalThis.__metricSourceApi.configTemplate = async () => { throw new Error('source denied') }
  await assert.rejects(loadMetricOutputs('device', 'meter'), /source denied/)
  await assert.rejects(loadMetricOutput('active'), /source denied/)
})

test('设备与产品候选复用本体对象查询并保留宿主范围及分页',async()=>{
  const calls=[]
  globalThis.__metricObjectQuery=async(...args)=>{calls.push(args);return {data:[{id:'D1',name:'设备'}],total:1}}
  assert.equal((await queryMetricDevices({ownerType:'deviceGroup',ownerId:'G1'},'泵',2,true)).total,1)
  await queryMetricDevices({ownerType:'deviceGroup',ownerId:'G1'},'',0,false)
  await queryMetricProducts('产品',1)
  assert.deepEqual(calls,[['device','泵',2,[{column:'id',termType:'dev-group',value:'G1'}]],['device','',0,[]],['product','产品',1]])
  delete globalThis.__metricObjectQuery
})

test('inherited outputs are selected for the concrete object and use its authorized template',async()=>{
  const calls=[]
  globalThis.__metricSourceApi={
    byOwner:async()=>[{id:'inherited',state:'enabled',scope:'children',ownerType:'product',ownerId:'p',targetType:'device',targetId:'*'}],
    configTemplate:async(id,target)=>{calls.push([id,target]);return {outputs:[{metricId:'online'}]}},
  }
  const values=await loadMetricOutputs('device','d')
  assert.equal(values[0].config.targetId,'d')
  assert.deepEqual(calls,[['inherited',{targetType:'device',targetId:'d'}]])
})

test('产品属性与事件保留声明分组，未声明时不按名称推测分组',async()=>{
  globalThis.__metricObjectQuery=async(type,keyword,page,terms)=>({data:[{id:terms[0].value,name:'网关产品'}],total:1})
  globalThis.__metricPlatformRequest=async()=>({status:200,result:{
    properties:[{id:'temperature',name:'环境温度',expands:{groupName:'环境'},valueType:{type:'double',unit:'℃'}},{id:'smoke',name:'环境烟雾',valueType:{type:'boolean'}}],
    events:[{id:'alarm',name:'火警',group:'消防',valueType:{type:'object',properties:[]}}],
  }})
  const result=await loadMetricProductSources('gateway')
  assert.equal(result.properties.find(item=>item.id==='temperature').group,'环境')
  assert.equal(result.properties.find(item=>item.id==='smoke').group,undefined)
  assert.equal(result.events[0].group,'消防')
  delete globalThis.__metricPlatformRequest
})
