import assert from 'node:assert/strict'
import test from 'node:test'
import {defineComponent,h,inject,provide,ref} from 'vue'
import {resolve} from 'node:path'
import {createMetricLoader,createMetricRenderer,flush,walk,sourceRoot,passthrough} from './helpers/metricRuntime.mjs'

test('关联卡片共用原展示上下文和有界历史，详情隔离宿主快照，刷新保留卡片',async()=>{
  const priorElement=globalThis.Element
  globalThis.Element=Object
  const api={},calls=[]
  let key,hold=false,finish
  const content=defineComponent({props:['context','configuration','template','output','value','runtime','history','hideTrend'],setup:props=>()=>h('card-content',{...props})})
  const detail=defineComponent({props:['reference','output','template','context'],setup:props=>{const shared=inject(key);return()=>h('detail',{...props,shared})}})
  const load=createMetricLoader({
    'vue-i18n':{useI18n:()=>({t:key=>key,locale:ref('en')})},
    [resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:api},
    [resolve(sourceRoot,'components/Metric/extensions/registry.ts')]:{collectMetricResources:()=>({dimensions:[]})},
    [resolve(sourceRoot,'components/Metric/extensions/MetricCardContent.vue')]:{__esModule:true,default:content},
    [resolve(sourceRoot,'components/Metric/MetricResult.vue')]:{__esModule:true,default:detail},
  })
  key=load('components/Metric/useMetricTrends.ts').metricHistoryKey
  const Bindings=load('components/Metric/bindings/MetricObjectBindings.vue').default
  const link=(id,outputId)=>({id,reference:{objectType:'space',objectId:'room',configId:'shared',outputId,targetType:'device',targetId:'source'}})
  const links=[link('a','usage'),link('b','count')]
  const template={id:'t',options:{icon:'WifiOutlined'},inputDefinitions:[],parameterDefinitions:[],definitions:[],outputs:[{metricId:'usage',label:'Usage',persist:true},{metricId:'count',label:'Count',persist:true}]}
  Object.assign(api,{
    latest:async()=>hold ? new Promise(resolve=>{finish=resolve}) : [{configId:'shared',outputs:{usage:{value:7},count:{value:2}}}],
    getResultConfig(...args) { return this.getConfig(...args) },
    getConfig:async()=>({id:'shared',state:'enabled',ownerType:'product',ownerId:'product'}),resultTemplate(...args) { return this.configTemplate(...args) },configTemplate:async()=>template,
    history:async(id,request)=>{calls.push([id,request]);return [{metricId:'usage',value:7},{metricId:'count',value:2}]},
  })
  const page=ref({items:links}),state={page:{data:page,state:ref({status:'ready'})},busy:ref(false),mutationError:ref(''),pendingAdd:ref(),refresh:async()=>{}}
  const shared={range:ref(3600000),customRange:ref([10,20]),configurations:ref([]),entries:ref({}),refresh(){},refreshLatest:async()=>{}}
  const {renderer,root}=createMetricRenderer()
  const app=renderer.createApp({setup(){provide(key,shared);return()=>h(Bindings,{state,context:{ownerType:'space',ownerId:'room',editable:true}})}})
  for(const name of ['a-alert','a-skeleton','a-button','a-tooltip','a-popconfirm'])app.component(name,passthrough(name))
  app.config.warnHandler=()=>{}
  try{
    app.mount(root);await flush();await flush()
    const cards=walk(root,node=>node.type==='card-content')
    assert.equal(cards.length,2);assert.equal(cards[0].props.context.ownerType,'device');assert.equal(cards[0].props.context.ownerId,'source')
    assert.equal(cards[0].props.context.editable,false);assert.notEqual(cards[0].props.hideTrend,true)
    assert.equal(calls.length,1,'one bounded history request covers linked outputs of the same concrete target')
    assert.equal(calls[0][0],'shared');assert.deepEqual(calls[0][1].outputs,['usage','count']);assert.equal(calls[0][1].targetId,'source')
    assert.deepEqual(calls[0][1].query.terms[0].value,[10,20]);assert.equal(calls[0][1].query.pageSize,200)
    assert.strictEqual(cards[0].props.history,cards[1].props.history)
    const body=walk(root,node=>node.type==='button' && node.props.class==='binding-card__body')[0]
    body.props.onClick();await flush()
    const opened=walk(root,node=>node.type==='detail')[0]
    assert.ok(opened);assert.notEqual(opened.props.shared,shared);assert.equal(opened.props.shared.entries.value.shared,cards[0].props.history);assert.equal(opened.props.shared.configurations.value[0].id,'shared');assert.equal(opened.props.reference.targetId,'source');assert.equal(opened.props.output.metricId,'usage')
    hold=true;page.value={items:links.map(item=>({...item}))};await flush()
    assert.strictEqual(walk(root,node=>node.type==='card-content')[0],cards[0]);assert.equal(cards[0].props.value.value,7)
    finish([{configId:'shared',inaccessible:true,outputs:{}}]);await flush()
    assert.equal(walk(root,node=>node.type==='card-content').length,0);assert.equal(walk(root,node=>node.type==='detail').length,0)
  }finally{app.unmount();globalThis.Element=priorElement}
})
