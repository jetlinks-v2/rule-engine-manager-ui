import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createMetricLoader } from './helpers/metricRuntime.mjs'

let types=[],dimensions=[],calls=[]
const load=createMetricLoader({
  '@jetlinks-web/core':{request:{
    get:async url=>{calls.push({url});return {result:url==='/metric/configs/sources/types' ? types : []}},
    post:async(url,body)=>{calls.push({url,body});return {result:{data:[{id:'old',name:'旧对象'}],total:1}}},
  }},
  [fileURLToPath(new URL('../components/Metric/extensions/registry.ts',import.meta.url))]:{collectMetricResources:()=>({dimensions})},
  [fileURLToPath(new URL('../components/Metric/readApi.ts',import.meta.url))]:{loadMetricObjectTypes:async()=>{calls.push({url:'/metric/configs/sources/types'});return types}},
})
const {loadMetricObjectTypes,queryMetricBusinessObjects,loadObjectSourceCapabilities}=load(fileURLToPath(new URL('../api/metricBusinessSources.ts',import.meta.url)))

test('根对象来自可用指标维度及显式来源声明，保留名称、图标、说明且不按业务类型黑名单过滤',async()=>{
  dimensions=[{provider:{ownerType:'device',label:()=> '设备',icon:'DesktopOutlined'}},{provider:{ownerType:'space',label:'空间',icon:'EnvironmentOutlined'}}]
  types=[{id:'device',name:'Device',description:'物联网设备'},
    {id:'space',name:'Space',metricSource:{root:false,icon:'HomeOutlined'}},
    {id:'alarm',name:'Alarm',i18nName:'告警中心',description:'已声明的业务根对象',metricSource:{root:true,icon:'BellOutlined'}},
    {id:'notificationAttempt',name:'通知尝试'},{id:'role',name:'角色',metricSource:{root:false}}]
  const roots=await loadMetricObjectTypes()
  assert.deepEqual(roots.map(item=>item.id),['device','space','alarm'])
  assert.equal(roots[0].name,'设备');assert.equal(roots[0].description,'物联网设备')
  assert.equal(roots[1].icon,'HomeOutlined');assert.equal(roots[2].name,'告警中心')
  assert.equal(roots[2].icon,'BellOutlined')
  types.reverse();assert.deepEqual((await loadMetricObjectTypes()).map(item=>item.id),['device','space','alarm'],'关系目录顺序不改变前端业务维度顺序')
  types=[{id:'device',name:'Device'}];assert.deepEqual((await loadMetricObjectTypes()).map(item=>item.id),['device'],'未声明的空间不因安装前端模块而出现')
  types=[];assert.deepEqual(await loadMetricObjectTypes(),[])
})

test('声明导入按原对象授权查询，来源目录不执行业务查询',async()=>{
  calls=[]
  assert.equal((await queryMetricBusinessObjects('notificationAttempt','历史')).total,1)
  assert.equal(calls[0].url,'/metric/configs/sources/objects/notificationAttempt/_query')
  assert.equal(calls[0].body.terms[0].value,'%历史%')
  calls=[];await queryMetricBusinessObjects('device',' 泵 ',2,[{column:'id',termType:'dev-group',value:'G1'}])
  assert.deepEqual(calls[0].body,{pageIndex:2,pageSize:20,sorts:[{name:'name',order:'asc'}],terms:[
    {column:'id',termType:'dev-group',value:'G1'},{column:'name',termType:'like',value:'%泵%'},
  ]})
  calls=[];await loadObjectSourceCapabilities('machine','M/1')
  assert.deepEqual(calls,[{url:'/metric/configs/sources/objects/machine/M%2F1/capabilities'}])
})
