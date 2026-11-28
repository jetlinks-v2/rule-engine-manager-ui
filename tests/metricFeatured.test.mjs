import assert from 'node:assert/strict'
import test from 'node:test'
import {h,reactive,ref,nextTick} from 'vue'
import {resolve} from 'node:path'
import {createMetricLoader,createMetricRenderer,sourceRoot,walk,flush} from './helpers/metricRuntime.mjs'

const load=createMetricLoader({[resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}}})
const {metricFeatured,compareMetricPresentation,moveMetric}=load('components/Metric/featured.ts')
const {useMetricPanel}=load('components/Metric/useMetricPanel.ts')
const config=(id,featured=false)=>({id,name:id,ownerType:'device',ownerId:'a',targetType:'device',targetId:'a',slot:id,
  templateId:'template',templateVersion:'1',inputMappings:{},parameters:{},revision:3,presentation:{featured},state:'disabled'})
const template={id:'template',version:'1',outputs:[{metricId:'value'}],inputDefinitions:[],parameterDefinitions:[],definitions:[]}

test('共享重点先展示、同组移动不改变星标、未设置位置排后',()=>{
  const items=[config('a'),{...config('b'),presentation:{order:0}},config('z',true)]
  assert.deepEqual([...items].sort(compareMetricPresentation).map(item=>item.id),['z','b','a'])
  assert.equal(metricFeatured({presentation:{featured:'true'}}),false)
  assert.deepEqual(moveMetric(['a','b','c'],'a','c',true),['b','c','a'])
  assert.deepEqual(moveMetric(['a','b'],'a','missing'),['a','b'])
})

test('失败保留星标与次序，排序请求带完整同组修订且继承项不可写',async()=>{
  const previous=globalThis.document
  globalThis.document={hidden:true,addEventListener(){},removeEventListener(){}}
  let items=[config('a'),config('b'),{...config('inherited'),ownerId:'parent'}],failed=true,view,submitted
  const {renderer,root}=createMetricRenderer()
  const app=renderer.createApp({setup(){view=useMetricPanel(ref({ownerType:'device',ownerId:'a',editable:true}),{
    byOwner:async()=>items,configTemplate:async()=>template,resultTemplate:async()=>template,latest:async()=>[],
    setFeatured:async(id,revision,featured)=>{assert.equal(revision,3);if(failed)throw new Error('save failed');items=items.map(item=>item.id===id?{...item,presentation:{featured},revision:4}:item);return items.find(item=>item.id===id)},
    orderConfigs:async request=>{submitted=request;throw new Error('order conflict')},
  });return()=>null}})
  try{
    app.mount(root);await view.refresh()
    assert.equal(await view.setFeatured(items[0]),false)
    assert.equal(view.actionError.value,'save failed');assert.equal(metricFeatured(view.configurations.value[0]),false)
    assert.equal(view.canFeature(items[2]),false);assert.equal(view.canOrder(items[2]),false)
    assert.equal(await view.reorder(items[0],['b','a']),false)
    assert.deepEqual(submitted,{ownerType:'device',ownerId:'a',featured:false,items:[{id:'b',revision:3},{id:'a',revision:3}]})
    assert.deepEqual(view.orderGroup(items[0]).map(item=>item.id),['a','b'])
    assert.equal(await view.reorder(items[0],['b','b']),false)
    failed=false;await view.setFeatured(items[0]);assert.equal(metricFeatured(view.configurations.value.find(item=>item.id==='a')),true)
  }finally{app.unmount();globalThis.document=previous}
})

for(const action of ['featured','order'])test(`${action} 保存确认即结束原位反馈，后台旧读取不能覆盖新状态`,async()=>{
  const previous=globalThis.document
  globalThis.document={hidden:true,addEventListener(){},removeEventListener(){}}
  const items=[config('a'),config('b')].map(item=>({...item,state:'enabled',parameters:{factor:2}}))
  const reads=[]
  let view,readCount=0,finishWrite
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup(){
    view=useMetricPanel(ref({ownerType:'device',ownerId:'a',editable:true}),{
      byOwner:async()=>++readCount===1 ? items : new Promise(resolve=>reads.push(resolve)),
      configTemplate:async()=>template,resultTemplate:async()=>template,
      latest:async ids=>ids.map(configId=>({configId,outputs:{value:{metricId:'value',value:7}}})),
      setFeatured:()=>new Promise(resolve=>finishWrite=resolve),orderConfigs:()=>new Promise(resolve=>finishWrite=resolve),
    });return()=>null
  }})
  try{
    app.mount(root);await view.refresh()
    const target=action==='featured' ? items[1] : items[0]
    const metadata=view.templates.value[target.id],reading=view.outputs.value[target.id]
    const oldRead=view.refresh();await flush()
    const write=action==='featured' ? view.setFeatured(target) : view.reorder(target,['b','a'])
    assert.equal(view.busyId.value,target.id);assert.equal(view.busyAction.value,action)
    const changed=action==='featured' ? [{...target,revision:4,presentation:{featured:true,order:0}}]
      : [...items].reverse().map((item,order)=>({...item,revision:4,presentation:{featured:false,order}}))
    finishWrite(action==='featured' ? changed[0] : changed)
    assert.equal(await write,true)
    assert.equal(view.busyId.value,'');assert.equal(reads.length,2,'older snapshot is replaced without delaying the save')
    assert.equal(view.loading.value,false)
    const confirmed=view.configurations.value.find(item=>item.id===target.id)
    assert.equal(confirmed.revision,4);assert.deepEqual(confirmed.parameters,{factor:2})
    assert.strictEqual(view.templates.value[target.id],metadata);assert.strictEqual(view.outputs.value[target.id],reading)
    reads[0](items);await oldRead
    assert.equal(view.configurations.value.find(item=>item.id===target.id).revision,4)
    reads[1](items.map(item=>changed.find(next=>next.id===item.id)||item));await view.refresh()
    assert.deepEqual(view.cardGroups.value.map(card=>card.config.id),action==='featured' ? ['a','b'] : ['b','a'])
    view.resetPresentationOrder()
    assert.deepEqual(view.cardGroups.value.map(card=>card.config.id),['b','a'])
  }finally{app.unmount();globalThis.document=previous}
})

test('连续收藏和后台刷新保持当前位置，显式拖拽仍调整同组，手动刷新才应用重点优先',async()=>{
  const previous=globalThis.document
  globalThis.document={hidden:true,addEventListener(){},removeEventListener(){}}
  let items=['a','b','c'].map(id=>config(id)),view
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup(){
    view=useMetricPanel(ref({ownerType:'device',ownerId:'a',editable:true}),{
      byOwner:async()=>items,configTemplate:async()=>template,resultTemplate:async()=>template,latest:async()=>[],
      setFeatured:async(id,revision,featured)=>{
        items=items.map(item=>item.id===id ? {...item,revision:revision+1,presentation:{featured,order:0}} : item)
        return items.find(item=>item.id===id)
      },
      orderConfigs:async request=>request.items.map(({id,revision},order)=>{
        const saved={...items.find(item=>item.id===id),revision:revision+1,presentation:{featured:request.featured,order}}
        items=items.map(item=>item.id===id ? saved : item);return saved
      }),
    });return()=>null
  }})
  const order=()=>view.cardGroups.value.map(card=>card.config.id)
  try{
    app.mount(root);await view.refresh()
    for(const id of ['b','c']){
      assert.equal(await view.setFeatured(view.configurations.value.find(item=>item.id===id)),true)
      await view.refresh(false);assert.deepEqual(order(),['a','b','c'])
    }
    assert.equal(await view.reorder(view.configurations.value.find(item=>item.id==='b'),['c','b']),true)
    assert.deepEqual(order(),['a','c','b'])
    view.resetPresentationOrder();await view.refresh();assert.deepEqual(order(),['c','b','a'])
  }finally{app.unmount();globalThis.document=previous}
})

test('原位保存只占用一个图标位置，其他操作保持更多图标',async()=>{
  const ui=createMetricLoader({'vue-i18n':{useI18n:()=>({t:key=>key})}})
  const Star=ui('components/Metric/MetricStar.vue').default,Actions=ui('components/Metric/MetricConfigActions.vue').default
  const state=reactive({busy:true}),{renderer,root}=createMetricRenderer()
  const app=renderer.createApp({setup:()=>()=>h('div',[
    h(Star,{featured:false,editable:true,busy:state.busy}),h(Actions,{configuration:config('b'),disabled:state.busy}),
  ])})
  try{
    app.mount(root)
    const icons=type=>walk(root,node=>node.props.type===type)
    const button=()=>walk(root,node=>node.props['aria-label']==='featureMetric')[0]
    assert.equal(icons('LoadingOutlined').length,1);assert.equal(icons('StarOutlined').length,0);assert.equal(icons('MoreOutlined').length,1)
    assert.equal(button().props.loading,undefined);assert.equal(button().props['aria-busy'],true)
    state.busy=false;await nextTick()
    assert.equal(icons('LoadingOutlined').length,0);assert.equal(icons('StarOutlined').length,1);assert.equal(icons('MoreOutlined').length,1)
  }finally{app.unmount()}
})

test('关联菜单确认后只解除引用，继承入口跳转来源，撤销写权限后不执行移除',async()=>{
  const confirmations=[],removed=[],opened=[]
  const Actions=createMetricLoader({
    'vue-i18n':{useI18n:()=>({t:key=>key})},
    'ant-design-vue':{Modal:{confirm:value=>confirmations.push(value)}},
    [resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}},
    [resolve(sourceRoot,'components/Metric/extensions/registry.ts')]:{collectMetricResources:()=>({dimensions:[]})},
  })('components/Metric/bindings/MetricBindingActions.vue').default
  const props=reactive({context:{ownerType:'device',ownerId:'here',editable:true},links:[
    {id:'local-link',reference:{objectType:'device',objectId:'here',configId:'original',outputId:'usage',targetType:'device',targetId:'source'}},
    {id:'inherited-link',addedAt:{type:'zone',id:'parent'},unavailable:true},
  ]})
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup:()=>()=>h(Actions,{...props,onRemove:id=>removed.push(id),onManageLocation:value=>opened.push(value)})})
  try{
    app.mount(root)
    const entries=()=>walk(root,node=>node.type==='a-menu-item')
    entries()[0].props.onClick();assert.equal(removed.length,0);assert.equal(confirmations.length,1)
    confirmations[0].onOk();assert.deepEqual(removed,['local-link'])
    entries()[1].props.onClick();assert.deepEqual(opened,[{ownerType:'zone',ownerId:'parent'}])
    props.context.editable=false;await nextTick();assert.equal(entries()[0].props.disabled,true)
    entries()[0].props.onClick();assert.equal(confirmations.length,1)
  }finally{app.unmount()}
})
