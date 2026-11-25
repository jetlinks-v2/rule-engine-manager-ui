import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, effectScope, h, inject, provide, onUnmounted, reactive, ref, nextTick } from 'vue'
import { useEventListener, onClickOutside, useIntervalFn } from '@vueuse/core'
import { theme, Empty } from 'ant-design-vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent, sourceRoot } from './helpers/metricRuntime.mjs'
const api = {}
const confirmations = []
const workspaceWidth = ref(1200)
let discoverObjectTypes=async()=>[...moduleRegistry.getAllModules().values()].flatMap(module=>Object.keys(module.metricDimensions || {}).map(id=>({id})))
const componentStubs = {
  '@vueuse/core': { useEventListener, onClickOutside, useIntervalFn, useElementSize: () => ({ width:workspaceWidth, height:ref(800) }) },
  '@jetlinks-web/vite/dist/dynamic-remote': { dynamicRemoteManager: {} },
  '@jetlinks-web-core/utils/consts': { isSubApp: false },
  'vue-i18n': { useI18n: () => ({ t: key => key, locale: ref('zh') }) },
  'ant-design-vue': { theme, Empty, Modal: { confirm: value => { confirmations.push(value);return { destroy() {} } } } },
  [resolve(sourceRoot, 'components/Editable/index.vue')]: { __esModule:true, default:defineComponent({ setup:(_, { attrs, slots, expose }) => { expose({ edit:async () => {} }); return () => h('external-shell', attrs, Object.entries(slots).flatMap(([key,slot]) => key === 'option' ? [] : slot?.())) } }) },
  [resolve(sourceRoot, 'components/Metric/api.ts')]: { metricApi: api, loadMetricObjectTypes:()=>discoverObjectTypes() },
  [resolve(sourceRoot, 'components/ConditionFilter/index.ts')]: { __esModule:true, default:defineComponent({ props:['modelValue','fields'], setup:(props,{emit})=>()=>h('condition-filter',{...props,'onUpdate:modelValue':value=>emit('update:modelValue',value)}) }) },
  [resolve(sourceRoot, 'components/Echarts/index.ts')]: { __esModule: true, default: defineComponent({ props: ['option','events'], setup: props => () => h('chart', { option: props.option, events:props.events }) }) },
}
const load = createMetricLoader(componentStubs)
const { moduleRegistry } = load('utils/module-registry.ts')
const Workspace = load('components/Metric/workspace/MetricWorkspace.vue').default
const WorkspaceNavigation = load('components/Metric/workspace/MetricWorkspaceNavigation.vue').default
const Panel = load('components/Metric/MetricPanel.vue').default
const AggregateCard = load('components/Metric/collection/MetricAggregateCard.vue').default
const AggregateTrend = load('components/Metric/collection/MetricAggregateTrend.vue').default
const Collection = load('components/Metric/collection/MetricCollection.vue').default
const Editor = load('components/Metric/MetricConfigEditor.vue').default
const Manager = load('components/Metric/template/MetricTemplateManager.vue').default
const Publication = load('components/Metric/template/TemplatePublication.vue').default
const { useTemplateUpdates } = load('components/Metric/template/useTemplateUpdates.ts')
const DisplayFields = load('components/Metric/extensions/MetricDisplayFields.vue').default
const Trend = load('components/Metric/MetricTrend.vue').default
const StateMatrix = load('components/Metric/history/MetricStateMatrix.vue').default
const OutputSwitch = load('components/Metric/MetricOutputSwitch.vue').default
const Graph = load('components/Metric/template/TemplateGraph.vue').default
const Lineage = load('components/Metric/MetricLineage.vue').default
const ExecutionEvidence = load('components/Metric/MetricExecutionEvidence.vue').default
const ExecutionProcess = load('components/Metric/MetricExecutionProcess.vue').default
const Explanation = load('components/Expression/ExpressionExplanation.vue').default
const FormulaWorkspace = load('components/Expression/ExpressionWorkspace.vue').default
const { evidenceValue, evidenceGroups } = load('components/Metric/evidence.ts')
const template = { id: 'power', version: '1', name: 'Power', outputs: [{ metricId: 'value', label: 'Consumption', unit: 'kW', publish: true }], inputDefinitions: [], parameterDefinitions: [{ id: 'factor', expands: { editable: true } }], parameters: { factor: 1 }, definitions: [], options: { presentation: { provider: 'line/status', settings: { decimals: 2, warning: true } } } }
const config = { id: 'c', name: 'Room', ownerType: 'line', ownerId: 'a', targetType: 'line', targetId: 'a', slot: 'c', templateId: 'power', templateVersion: '1', inputMappings: {}, parameters: {}, presentation: { decimals: 0, warning: false, unknown: 7 }, state: 'enabled', revision: 2, dataVersion: 'same' }
const value = { metricId: 'value', value: 5.815, unit: 'kW', eventTime: 1000, quality: { valid: true } }
const controls = ['a-popover','a-space','a-button','a-select','a-select-option','a-alert','a-spin','a-empty','a-tag','a-dropdown','a-menu','a-menu-item','a-steps','a-form','a-form-item','a-input','a-input-number','a-descriptions','a-descriptions-item','a-popconfirm','a-collapse','a-collapse-panel','a-radio-group','a-radio-button','a-range-picker','a-pagination','a-segmented','a-tabs','a-tab-pane','a-checkbox','a-switch']
function mount(component, props = {}) {
  const previousDocument = globalThis.document
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup: () => () => h(component, props) })
  for (const name of controls) app.component(name, defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots }) => () => h(name, attrs, Object.entries(slots).flatMap(([key, slot]) => key === 'option' ? [] : slot?.())) }))
  app.component('a-drawer', defineComponent({ props:['open','forceRender'], inheritAttrs:false, setup:(props,{attrs,slots})=>()=>h('a-drawer', { ...attrs, open:props.open }, props.open || props.forceRender ? slots.default?.() : []) }))
  app.config.warnHandler = () => {}
  app.mount(root)
  return { root, close() { app.unmount(); globalThis.document = previousDocument } }
}
const nodes = (root, type) => walk(root, node => node.type === type)
const findText = (root, type, text) => nodes(root, type).find(node => node.props['aria-label'] === text)
  || nodes(root, type).find(node => textContent(node).includes(text) || node.props['aria-label']?.includes(text))
const click = async node => { assert.ok(node); await node.props.onClick?.(); await flush() }
const inspectNode = async node => {
  const popover=nodes(node.parent,'a-popover')[0]
  assert.ok(popover,'node has its own inspection trigger')
  assert.deepEqual(popover.props.trigger,['hover','focus'])
  popover.props.onOpenChange(true);await flush()
}

test('状态矩阵保留少数异常和不同类型，同桶点击与键盘只下钻范围；刷新清除选择',async()=>{
  const selected=[]
  const props=reactive({bounds:[1500,4000],buckets:[{from:1000,to:2000,states:[{state:false,count:500},{state:null,count:1},{state:1,count:1},{state:'1',count:1}]},{from:3000,to:4000,states:[{state:true,count:1}]}],onDrilldown:range=>selected.push(range)})
  props.labels=[{value:false,name:'未成立',icon:'color:#112233'}]
  const view=mount(StateMatrix,props)
  try{
    const cells=walk(view.root,node=>node.props.class?.split(' ').includes('state-matrix__cell'))
    assert.equal(cells.length,5)
    assert.equal(cells[0].props.style.background,'#112233','declared colors are shared by the matrix')
    assert.equal(walk(view.root,node=>node.props.class==='state-matrix__row').length,5)
    assert.ok(walk(view.root,node=>node.props.class?.includes('is-unknown')).length)
    cells[0].props.onPointerenter();await flush()
    assert.ok(nodes(view.root,'a-tooltip')[0].props.title.includes('stateRecordCount'))
    assert.ok(textContent(view.root).includes('500'))
    await click(cells[0]);assert.deepEqual(selected,[[1500,2000]])
    const body=walk(view.root,node=>node.props.class==='state-matrix__body')[0]
    const key=key=>body.props.onKeydown({key,preventDefault(){},stopPropagation(){}})
    key('End');key('Enter');await flush();assert.deepEqual(selected.at(-1),[3000,4000])
    props.buckets=[];await flush();assert.equal(nodes(view.root,'a-tooltip').length,0)
    assert.ok(textContent(view.root).includes('noHistory'))
  }finally{view.close()}
})

test('布尔状态颜色独立于持续记录，编辑只保存展示映射，禁用时不可修改',async()=>{
  const StateTracking=load('components/Metric/template/TemplateStateTracking.vue').default,patches=[]
  const props=reactive({rule:{id:'condition',temporalCondition:{},options:{other:true}},booleanResult:true,labelsOnly:true,disabled:false,onPatch:patch=>patches.push(patch)})
  const view=mount(StateTracking,props)
  try{
    assert.equal(nodes(view.root,'a-switch').length,0)
    assert.equal(walk(view.root,node=>node.props.class==='state-tracking__label').length,2)
    const picker=nodes(view.root,'external-shell').find(node=>node.props['preview-size']===28 || node.props.previewSize===28)
    assert.ok(picker)
    picker.props['onUpdate:modelValue']('color:#ff9900');await flush()
    assert.equal(patches.length,1);assert.equal(patches[0].options.other,true)
    assert.deepEqual(patches[0].options.stateLabels.map(item=>item.value),[true,false])
    assert.equal(patches[0].options.stateLabels[0].icon,'color:#ff9900')
    assert.equal(Object.hasOwn(patches[0],'stateTracking'),false)
    props.disabled=true;await flush();assert.equal(walk(view.root,node=>node.props.class==='state-tracking__icon').length,0)
  }finally{view.close()}
})

test('已过期的保留结果明确标为上次结果，新鲜数据恢复后移除标识',async()=>{
  const Value=load('components/Metric/MetricValue.vue').default
  const props=reactive({summary:true,value:{metricId:'condition',value:false,status:'success',quality:{stale:true}}})
  const view=mount(Value,props)
  try{
    assert.ok(textContent(view.root).includes('lastKnownResult'))
    assert.ok(textContent(view.root).includes('conditionFalse'))
    props.value={...props.value,quality:{valid:true}};await flush()
    assert.equal(textContent(view.root).includes('lastKnownResult'),false)
  }finally{view.close()}
})

test('窄卡片密集采样切换同一矩阵，仍只代表已返回记录',async()=>{
  const previous=workspaceWidth.value;workspaceWidth.value=240
  const values=Array.from({length:60},(_,index)=>({metricId:'state',value:index===29 ? null : false,evaluationTime:1000+index*1000}))
  const view=mount(Trend,{values,output:{metricId:'state',metricKind:'boolean',valueType:'boolean'},compact:true})
  try{
    assert.ok(walk(view.root,node=>node.props.class?.split(' ').includes('state-matrix')).length)
    assert.equal(walk(view.root,node=>node.props.class?.includes('state-samples__point')).length,0)
    assert.ok(walk(view.root,node=>node.props.class?.includes('is-unknown')).length,'single invalid sample remains visible')
    assert.ok(textContent(view.root).includes('stateSamples'))
  }finally{view.close();workspaceWidth.value=previous}
})

test('公式放大时可切换原公式与代入值，切换保持同一公式内容与参与数据',async()=>{
  const node={type:'reference',id:'value',path:[]},context={references:[{...node,label:'Reading',schema:{type:'double'}}],functions:[]}
  const wrapper=defineComponent({setup:()=>()=>h(FormulaWorkspace,{node,context,stationary:true,explanation:{kind:'read',path:['value'],state:'available',value:25,children:[]},format:item=>({text:String(item.value)})},{default:({substitute})=>h('formula-mode',{substitute})})})
  const view=mount(wrapper)
  try{
    assert.equal(nodes(view.root,'formula-mode')[0].props.substitute,false)
    await click(nodes(view.root,'a-button').find(node=>node.props['aria-expanded']===false))
    const toggle=nodes(view.root,'a-segmented')[0]
    assert.ok(toggle);assert.deepEqual(toggle.props.options.map(item=>item.value),['original','recorded'])
    toggle.props['onUpdate:value']('original');await flush()
    assert.equal(nodes(view.root,'formula-mode')[0].props.substitute,false)
    assert.match(textContent(view.root),/25/,'the recorded data sidebar remains available')
    toggle.props['onUpdate:value']('recorded');await flush()
    assert.equal(nodes(view.root,'formula-mode')[0].props.substitute,true)
    assert.equal(nodes(view.root,'formula-mode').length,1)
  }finally{view.close()}
})

test('同一聚合卡片切换最高最低与平均值同步更新主值和趋势，刷新保留方式',async()=>{
  const first={time:1000,observed:2,valid:2,sum:80,min:20,max:60,distribution:{}}
  const latest={time:2000,observed:2,valid:2,sum:240,min:60,max:180,distribution:{}}
  const group={id:'g',templateName:'Readings',output:{metricId:'value',label:'Reading'},operations:['average','min','max'],defaultOperation:'average',latest,points:[first,latest]}
  const props=reactive({groups:[group],bounds:[1000,3000],interval:1000,visible:true})
  const view=mount(AggregateCard,props)
  const main=()=>textContent(nodes(walk(view.root,node=>node.props.class==='aggregate-card__body')[0],'strong')[0])
  async function expectReading(value) {
    assert.equal(main(),String(value))
    const plot=walk(view.root,node=>node.props.class==='metric-trend-mini__plot')[0]
    plot.props.onPointermove({clientX:150,currentTarget:{getBoundingClientRect:()=>({left:0,width:300})}});await flush()
    assert.equal(textContent(nodes(walk(view.root,node=>node.props.role==='tooltip')[0],'b')[0]),String(value))
  }
  async function choose(key) {
    nodes(view.root,'a-segmented')[0].props.onChange(key);await flush()
    assert.equal(nodes(view.root,'a-segmented')[0].props.value,key)
  }
  try{
    await expectReading(120)
    assert.deepEqual(nodes(view.root,'a-segmented')[0].props.options.map(item=>item.value),['average','min','max'],'available statistics are directly selectable beside the result')
    await choose('max');await expectReading(180)
    await choose('min');await expectReading(60)
    const refreshed={...latest,sum:300,min:100,max:200}
    props.groups=[{...group,latest:refreshed,points:[first,refreshed]}];await flush()
    await expectReading(100)
    await choose('average');await expectReading(150)
  }finally{view.close()}
})

test('聚合数值趋势保留独立点与空桶，零值和单点不消失',()=>{
  const group={output:{metricId:'score',metricKind:'score'},points:[
    {time:123,observed:2,valid:2,sum:0,min:0,max:0,distribution:{}},
    {time:2123,observed:2,valid:2,sum:193.161,min:96,max:97.161,distribution:{}},
  ]}
  const props=reactive({group,operation:'average',bounds:[123,4123],interval:1000,compact:false})
  const view=mount(AggregateTrend,props)
  try{
    const option=nodes(view.root,'chart')[0].props.option,series=option.series[0]
    assert.deepEqual(series.data,[[123,0],[1123,null],[2123,96.5805]])
    assert.equal(series.showSymbol,false)
    assert.deepEqual(option.series[1].data,[[123,0],[2123,96.5805]],'only isolated values need persistent markers')
    assert.equal(series.connectNulls,false,'missing time must not become a continuous result')
    assert.equal(option.tooltip.valueFormatter(96.5805),'96.6')
  }finally{view.close()}
})

test('孤立点不使相连曲线铺满圆点，孤点仍能选择原始结果',async()=>{
  const selected=[]
  const props=reactive({output:{metricId:'value',valueType:'double'},values:[
    {...value,resultId:'isolated',evaluationTime:1000,value:0},
    {...value,resultId:'gap',evaluationTime:2000,value:null},
    {...value,resultId:'a',evaluationTime:3000,value:2},
    {...value,resultId:'b',evaluationTime:4000,value:3}],onSelect:entry=>selected.push(entry)})
  const view=mount(Trend,props)
  try{
    const chart=nodes(view.root,'chart')[0]
    assert.equal(chart.props.option.series[0].showSymbol,false)
    assert.deepEqual(chart.props.option.series[1].data,[[1000,0]])
    chart.props.events.click({seriesIndex:1,dataIndex:0});await flush()
    assert.equal(selected[0].value.resultId,'isolated')
    props.values=Array.from({length:200},(_,index)=>({...value,evaluationTime:1000+index*1000}))
    await flush();assert.deepEqual(chart.props.option.series[1].data,[])
    assert.equal(chart.props.option.series[0].connectNulls,false)
  }finally{view.close()}
})

test('聚合数值缩略图复用单个指标的几何、峰值、时间与评分读数',async()=>{
  const points=[{time:1000,observed:1,valid:1,sum:90,distribution:{}},{time:3000,observed:1,valid:1,sum:96.58,distribution:{}}]
  const output={metricId:'score',metricKind:'score'},bounds=[1000,4000]
  const aggregate=mount(AggregateTrend,{group:{output,points},operation:'average',bounds,interval:1000,compact:true})
  const direct=mount(Trend,{values:points.map(point=>({metricId:'score',value:point.sum,evaluationTime:point.time})),output,bounds,sampleInterval:1000,compact:true})
  try{
    assert.equal(nodes(aggregate.root,'chart').length,0,'compact numeric summaries share the existing lightweight trend')
    assert.deepEqual(nodes(aggregate.root,'path').map(node=>node.props.d),nodes(direct.root,'path').map(node=>node.props.d))
    assert.deepEqual(nodes(aggregate.root,'time').map(textContent),nodes(direct.root,'time').map(textContent))
    for(const view of [aggregate,direct]){
      const plot=walk(view.root,node=>node.props.class==='metric-trend-mini__plot')[0]
      assert.equal(nodes(view.root,'circle').length,2,'both isolated samples remain visible')
      plot.props.onPointermove({clientX:199,currentTarget:{getBoundingClientRect:()=>({left:0,width:300})}});await flush()
      assert.match(textContent(walk(view.root,node=>node.props.role==='tooltip')[0]),/96\.6/)
    }
  }finally{direct.close();aggregate.close()}
})

test('数值聚合操作与时长使用同一读数格式，保留原始单位数据',()=>{
  const point={time:1000,observed:2,valid:2,sum:240,min:60,max:180,distribution:{}}
  for(const [operation,expected] of [['average',120],['min',60],['max',180],['sum',240]]){
    const view=mount(AggregateTrend,{group:{output:{metricId:'duration',unit:'s'},points:[point]},operation,bounds:[1000,3000],interval:1000})
    try{
      const option=nodes(view.root,'chart')[0].props.option
      assert.deepEqual(option.series[0].data,[[1000,expected]])
      assert.equal(option.tooltip.valueFormatter(expected),'intervalMinutes')
      assert.equal(option.yAxis.axisLabel.formatter(expected),'intervalMinutes')
    }finally{view.close()}
  }
  const view=mount(AggregateTrend,{group:{output:{metricId:'power',unit:'kW'},points:[point]},operation:'max',bounds:[1000,3000],interval:1000})
  try{assert.equal(nodes(view.root,'chart')[0].props.option.tooltip.valueFormatter(180),'180 kW')}finally{view.close()}
})

test('枚举与布尔聚合显示业务状态和对象数，未确认不变成零',()=>{
  for(const [output,stateLabels,distribution,names] of [
    [{metricId:'state',valueType:'enum'},[{value:0,name:'Offline'},{value:1,name:'Online'}],{'0':1,'1':1},['Offline','Online']],
    [{metricId:'alarm',valueType:'boolean'},[],{false:1,true:1},['conditionFalse','conditionTrue']],
  ]){
    const group={output,stateLabels,points:[{time:1000,observed:3,valid:2,distribution}]}
    const view=mount(AggregateTrend,{group,operation:'distribution',bounds:[1000,3000],interval:1000})
    try{
      const option=nodes(view.root,'chart')[0].props.option
      assert.deepEqual(option.series.map(item=>item.name),[...names,'unknown'])
      for(const series of option.series){assert.equal(series.type,'bar');assert.deepEqual(series.data,[[1000,1],[2000,null]])}
      assert.equal(option.yAxis.minInterval,1)
    }finally{view.close()}
  }
})

test('无有效数值趋势显示空态，状态全无效时仍保留未确认数量',async()=>{
  const props=reactive({group:{output:{metricId:'value'},points:[]},operation:'average',bounds:[1000,3000],interval:1000,compact:true})
  const view=mount(AggregateTrend,props)
  try{
    assert.equal(nodes(view.root,'chart').length,0);assert.match(textContent(view.root),/noTrendPoints/)
    props.group.points=[{time:1000,observed:2,valid:0,distribution:{}}];await flush()
    assert.equal(nodes(view.root,'chart').length,0)
    props.operation='distribution';await flush()
    assert.deepEqual(nodes(view.root,'chart')[0].props.option.series[0].data,[[1000,2],[2000,null]])
    props.operation='average';props.group.points=[{time:1000,observed:1,valid:1,sum:0,distribution:{}}];await flush()
    assert.equal(nodes(view.root,'chart').length,0)
    assert.equal(nodes(view.root,'circle').length,1,'a valid zero uses the same single-point sparkline as an individual metric')
  }finally{view.close()}
})

test('布尔聚合卡片沿用声明名称，未声明时显示本地化真伪',()=>{
  const group={id:'alarm',templateName:'Alarm',output:{metricId:'alarm',valueType:'boolean'},operations:['distribution'],defaultOperation:'distribution',latest:{time:1000,observed:2,valid:2,distribution:{false:1,true:1}},points:[]}
  for(const [stateLabels,expected] of [[[],/conditionFalse.*conditionTrue/],[[{value:false,name:'No alarm'},{value:true,name:'Alarm detected'}],/No alarm.*Alarm detected/]]){
    const view=mount(AggregateCard,{groups:[{...group,stateLabels}],bounds:[1000,3000],interval:1000,visible:false})
    try{assert.match(textContent(view.root),expected)}finally{view.close()}
  }
})

test('聚合主值与摘要复用单个指标的时长和评分展示',()=>{
  const duration={id:'duration',templateName:'Duration',output:{metricId:'duration',unit:'s',metricKind:'duration'},operations:['max'],defaultOperation:'max',displaySettings:{summaryOutputs:['score']},latest:{time:1000,observed:2,valid:2,max:180,distribution:{}},points:[]}
  const score={...duration,id:'score',output:{metricId:'score',metricKind:'score'},defaultOperation:'average',latest:{time:1000,observed:2,valid:2,sum:193.161,distribution:{}}}
  const view=mount(AggregateCard,{groups:[duration,score],bounds:[1000,3000],interval:1000,visible:false})
  try{
    assert.ok(nodes(view.root,'strong').some(node=>textContent(node)==='intervalMinutes'))
    assert.ok(nodes(view.root,'strong').some(node=>textContent(node)==='96.6'))
    assert.equal(nodes(view.root,'span').some(node=>textContent(node)==='s'),false,'formatted durations must not repeat their source unit')
  }finally{view.close()}
})

test('发布引用以业务名称展示，单项更新与批量选择独立，历史修订可切换且清除旧选择',async()=>{
  moduleRegistry.clear()
  const scope=effectScope(),writes=[],updates=scope.run(()=>useTemplateUpdates(ref({id:'key',released:true,revision:2}),ref(true),{
    templateReferences:async()=>[
      {id:'a',ownerType:'device',ownerId:'d',slot:'internal-slot',revision:3,templateRevision:1},
      {id:'b',name:'Usage',ownerType:'device',ownerId:'e',revision:4,templateRevision:2},
    ],
    templateRevisions:async()=>[{revision:2,publishedAt:2000},{revision:1,publishedAt:1000}],
    applyTemplateRevision:async(id,revision,expected)=>{writes.push([id,revision,expected]);return {...updates.references.value.find(item=>item.id===id),templateRevision:revision}},
    latest:async()=>[],
  }))
  moduleRegistry.register('devices',{metricDimensions:{device:{ownerType:'device',label:'Device',icon:'DesktopOutlined',
    navigator:{},useSourcePicker:()=>({}),resolveObjects:async ids=>ids.map(ownerId=>({ownerId,label:ownerId==='d'?'Gateway':'Meter'}))}}})
  await updates.load()
  const view=mount(Publication,{template,entity:{id:'key',released:true,revision:2},editable:true,pending:true,saving:false,updates})
  try{
    await flush()
    assert.match(textContent(view.root),/Gateway/);assert.doesNotMatch(textContent(view.root),/internal-slot/)
    assert.equal(nodes(view.root,'a-button').filter(node=>node.props.type==='primary').length,1)
    const rows=()=>nodes(view.root,'article')
    assert.match(textContent(rows()[0]),/Power/)
    assert.equal(nodes(rows()[1],'a-checkbox')[0].props.disabled,true)
    nodes(rows()[0],'a-checkbox')[0].props['onUpdate:checked'](true);await flush()
    assert.ok(findText(view.root,'a-button','applySelected'))
    await click(findText(rows()[0],'a-button','publicationUpdate'))
    assert.deepEqual(writes,[['a',2,3]])
    assert.deepEqual(updates.selectedIds.value,[])
    updates.outcomes.value.a={error:'Load failed'};await flush()
    assert.equal(findText(rows()[0],'a-button','retry').props.disabled,false,'an applied revision can retry failed load feedback')
    updates.outcomes.value={};await flush()
    await click(nodes(view.root,'a-button').find(node=>textContent(node)==='publicationChooseRevision'&&!node.props.disabled))
    assert.equal(updates.targetRevision.value,1);assert.deepEqual(updates.selectedIds.value,[])
    assert.ok(findText(view.root,'a-button','publicationLatest'))
    assert.ok(findText(rows()[1],'a-button','publicationApplyRevision'))
    await click(findText(view.root,'a-button','publicationLatest'));assert.equal(updates.targetRevision.value,2)
  }finally{view.close();scope.stop();moduleRegistry.clear()}
})
function defaults() {
  Object.assign(api, { templateCategories: async () => [], calculators: async () => [], byOwner: async () => [config], resultTemplate(...args) { return this.configTemplate(...args) }, configTemplate: async () => template,
    latest: async ids => ids.map(configId => ({ configId, outputs: { value } })), getResultConfig(...args) { return this.getConfig(...args) }, getConfig: async () => config,
    history: async () => [value], selectable: async () => [{ id: 't', name: 'Power', available: true, released: true, template }],
    saveConfig: async next => ({ ...next, revision: next.revision + 1 }), queryTemplates: async () => ({ data: [], total: 0 }) })
}

test('公共公式在原位显示分支状态文字、命中返回值与可展开的未参与项，未知不高亮默认分支',async()=>{
  const View=load('components/Expression/ExpressionView.vue').default
  const lit=value=>({type:'literal',valueType:'int',value})
  const recorded=value=>({kind:'literal',state:'available',value,children:[]})
  const skipped={kind:'unsupported',state:'skipped',children:[]}
  const props=reactive({node:{type:'conditional',condition:lit(true),whenTrue:lit(10),whenFalse:{type:'conditional',condition:lit(false),whenTrue:lit(20),whenFalse:lit(30)}},context:{references:[],functions:[]},
    explanation:{kind:'condition',state:'available',value:10,children:[recorded(true),recorded(10),skipped]},format:record=>({text:String(record.value)})})
  const view=mount(View,props)
  const rows=()=>walk(view.root,node=>String(node.props.class).split(' ').includes('expression-branch'))
  const selected=()=>rows().filter(node=>String(node.props.class).includes('is-selected'))
  try {
    await flush()
    assert.equal(rows().length,1);assert.match(textContent(selected()[0]),/10/)
    assert.ok(walk(view.root,node=>node.props['aria-label']==='conditionTrue' && textContent(node)==='outcomeMet').length)
    const toggle=nodes(view.root,'a-button').find(node=>node.props.class==='expression-branches__toggle')
    assert.equal(toggle.props['aria-expanded'],false);await click(toggle)
    assert.equal(rows().length,3);assert.equal(toggle.props['aria-expanded'],true)
    await click(toggle);assert.equal(rows().length,1)
    props.explanation={...props.explanation,children:[{...recorded(false),state:'unknown'},skipped,skipped]};await flush()
    assert.equal(selected().length,0)
    assert.ok(walk(view.root,node=>node.props['aria-label']==='conditionUnknown').length)
    props.explanation=undefined;await flush()
    assert.equal(rows().length,0,'ordinary formulas use the same native syntax without inferred decisions')
    assert.equal(selected().length,0)
    assert.equal(walk(view.root,node=>node.props['aria-label']==='conditionUnknown').length,0)
    assert.match(textContent(view.root),/20/)
  }finally{view.close()}
})

test('条件解释集中展示命中条件，未命中项折叠；未知不能表示采用默认结果',async()=>{
  const literal=value=>({kind:'literal',state:'available',value,path:[],children:[]})
  const condition=(value,next)=>({kind:'condition',state:'available',path:[],children:[literal(value),literal('selected'),next]})
  const props=reactive({explanation:condition(false,condition(true,literal('default'))),format:node=>({text:String(node.value)})})
  const view=mount(Explanation,props)
  try {
    const selected=walk(view.root,node=>node.props.class==='expression-explanation__decision')[0]
    assert.match(textContent(selected),/trueyes/)
    assert.match(textContent(nodes(view.root,'details')[0]),/false/)
    assert.notEqual(nodes(view.root,'details')[0].props.open,true)
    assert.equal(walk(view.root,node=>node.props.class==='expression-explanation__default').length,0)
    props.explanation=condition(false,literal('default'));await flush()
    assert.equal(walk(view.root,node=>node.props.class==='expression-explanation__default').length,1)
    props.explanation={...condition(false,literal('default')),children:[{...literal(false),state:'unknown'},literal('yes'),literal('default')]};await flush()
    assert.equal(walk(view.root,node=>node.props.class==='expression-explanation__default').length,0)
    assert.match(textContent(walk(view.root,node=>node.props.class==='expression-explanation__decision')[0]),/unknown/)
  } finally {view.close()}
})

test('模板聚合与设备卡片共享标题外壳，缺少聚合记录时不显示伪造数值', async () => {
  const groups=[{id:'summary',cardId:'template',templateId:'t',templateName:'Communication',version:'1',revision:1,
    output:{metricId:'score',label:'Score',valueType:'double'},operations:['average'],defaultOperation:'average',
    availability:'noRecords',latest:{valid:0,observed:0,distribution:{}},points:[]}]
  const view=mount(AggregateCard,{groups,bounds:[0,3000],interval:1000,visible:false})
  try {
    assert.equal(textContent(walk(view.root,node=>node.props.class==='metric-card-shell__title')[0]),'Communication')
    assert.match(textContent(view.root),/noAggregateRecords/)
    assert.equal(walk(view.root,node=>node.props.class==='aggregate-card__value').length,0)
    assert.ok(findText(view.root,'a-button','viewCurrent'))
  } finally {view.close()}
})

test('模板成员钻取按设备合并多项结果，翻页仍请求成员分页且不混算输出', async () => {
  const calls=[],target={type:'device',id:'a',name:'Gateway A'}
  const groups=['score','uptime'].map(id=>({id,cardId:'shared',templateId:'t',templateName:'Communication',version:'1',output:{metricId:id,label:id},operations:['collection','average']}))
  api.collection=async query=>{calls.push(query);return {readTime:1,visibleMembers:2,total:2,groups,data:groups.map(group=>({kind:'metric',key:group.id,group:group.id,target,configId:'c',ownerType:'device',ownerId:'a',output:group.output,value:{value:20,quality:{valid:true}}}))}}
  const view=mount(Collection,{context:{ownerType:'product',ownerId:'p'},scope:{memberType:'device',icon:'DesktopOutlined'},selection:{templateId:'t'}})
  try {
    await flush()
    assert.equal(calls[0].pageByMember,true);assert.equal(calls[0].operation,'collection')
    assert.equal(walk(view.root,node=>node.props.class==='metric-collection__member').length,1)
    assert.equal(walk(view.root,node=>node.props.class==='metric-collection__value').length,2)
    nodes(view.root,'a-pagination')[0].props.onChange(2);await flush()
    assert.equal(calls.at(-1).pageIndex,1);assert.equal(calls.at(-1).pageByMember,true)
  } finally {view.close()}
})

test('聚合卡片切换只保存浏览器偏好，恢复需符合输出允许操作且不跨身份',async()=>{
  const previousStorage=globalThis.localStorage,stored=new Map()
  globalThis.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)}
  const props=reactive({groups:['score','uptime'].map(id=>({id,cardId:'t',templateId:'t',templateName:'Communication',version:'1',revision:1,
    output:{metricId:id,label:id,valueType:'double'},operations:['average','min','max'],defaultOperation:'average',latest:{time:1,observed:2,valid:2,sum:30,min:10,max:20,distribution:{}},points:[]})),bounds:[0,3000],interval:1000,visible:false,preferenceKey:'user-a'})
  let view=mount(AggregateCard,props)
  try {
    nodes(view.root,'a-segmented')[0].props.onChange('max');await flush()
    assert.equal(JSON.parse(stored.get('user-a')).operations.score,'max')
    const outputMenu=nodes(view.root,'a-menu').find(node=>node.props['aria-label']==='allOutputs')
    outputMenu.props.onClick({key:'uptime'});await flush()
    assert.equal(JSON.parse(stored.get('user-a')).output,'uptime')
    view.close();view=mount(AggregateCard,props);await flush()
    assert.match(textContent(view.root),/uptime/)
    nodes(view.root,'a-segmented')[0].props.onChange('sum');await flush()
    assert.equal(JSON.parse(stored.get('user-a')).operations.uptime,undefined,'browser state cannot grant sum')
    props.preferenceKey='user-b';await flush()
    assert.equal(stored.has('user-b'),false)
    assert.ok(findText(view.root,'button','score'))
  } finally {view.close();globalThis.localStorage=previousStorage}
})

test('真实工作区在目录待定或缺少路由类型时不装配该对象，也不发送指标请求',async()=>{
  defaults();moduleRegistry.clear()
  const previous=discoverObjectTypes
  let release,queries=0,navigationMounts=0,pickerMounts=0
  discoverObjectTypes=()=>new Promise(resolve=>{release=resolve})
  api.byOwner=async()=>{queries++;return[]}
  const provider=ownerType=>({ownerType,label:ownerType,
    navigator:defineComponent({setup:()=>{navigationMounts++;return()=>h('navigator')}}),
    useSourcePicker:()=>{pickerMounts++;return{pickSource:async()=>undefined}},
  })
  moduleRegistry.register('discovery',{metricDimensions:{space:provider('space'),device:provider('device')}})
  const view=mount(Workspace,{scopeKey:'missing-backend',selection:{ownerType:'space',ownerId:'west-gate'}})
  try{
    await flush();assert.equal(navigationMounts,0);assert.equal(pickerMounts,0);assert.equal(queries,0)
    release([{id:'device'}]);await flush()
    assert.deepEqual(nodes(view.root,'a-select-option').map(item=>item.props.value),['device'])
    assert.equal(navigationMounts,0);assert.equal(pickerMounts,0);assert.equal(queries,0)
    assert.ok(nodes(view.root,'a-alert').some(node=>node.props.message==='dimensionUnavailable'))
  }finally{view.close();moduleRegistry.clear();discoverObjectTypes=previous}
})

test('维度入口显示业务注册图标，旧扩展回退通用图标并保持选择事件', async () => {
  const navigator = defineComponent({ setup: () => () => h('navigator') })
  const dimensions = [{ moduleId:'custom', provider:{ ownerType:'line', label:'Line', icon:'PartitionOutlined', navigator } }, { moduleId:'legacy', provider:{ ownerType:'area', label:'Area', navigator } }]
  const chosen = []
  const props = reactive({ scopeKey:'icons', dimensions, dimension:dimensions[0], selection:{ ownerType:'line', ownerId:'a' }, onDimension:value=>chosen.push(value) })
  const view = mount(WorkspaceNavigation, props)
  const icon = () => walk(view.root, node => node.props.class === 'metric-navigation__icon')[0]
  try {
    assert.equal(icon().props.type, 'PartitionOutlined')
    const select = nodes(view.root, 'a-select')[0]
    assert.equal(select.props['option-label-prop'], 'label')
    select.props['onUpdate:value']('area')
    assert.deepEqual(chosen, ['area'])
    props.dimension = dimensions[1]; props.selection = { ownerType:'area', ownerId:'b' }; await flush()
    assert.equal(icon().props.type, 'AppstoreOutlined')
    assert.equal(nodes(view.root, 'a-select-option')[1].props.label, 'Area')
  } finally { view.close() }
})

test('相同对象上下文重新渲染保留结果、草稿与在途请求，仅对象身份变化重新加载', async () => {
  defaults(); moduleRegistry.clear()
  const props = reactive({ context:{ ownerType:'line', ownerId:'a', label:'Line A', editable:true } })
  let queries = 0, release
  api.byOwner = async () => { queries++; return new Promise(resolve => { release = resolve }) }
  const view = mount(Panel, props)
  try {
    await flush(); assert.equal(queries, 1)
    props.context = { ...props.context, label:'Renamed line' }; await flush()
    assert.equal(queries, 1)
    release([config]); await flush()
    assert.equal(nodes(view.root, 'article').length, 1)
    await click(findText(view.root, 'a-button', 'edit'))
    const editor = nodes(view.root, 'external-shell').find(node => node.props.open)
    assert.equal(editor.props.open, true)
    props.context = { ...props.context }; await flush()
    assert.equal(queries, 1)
    assert.equal(nodes(view.root, 'external-shell').some(node => node.props.open), true)
    props.context = { ...props.context, editable:false }; await flush()
    assert.equal(queries, 1)
    assert.equal(nodes(view.root, 'external-shell').some(node => node.props.open), false)
    props.context = { ...props.context, ownerId:'b' }; await flush()
    assert.equal(queries, 2)
    assert.equal(nodes(view.root, 'article').length, 0)
    release([]); await flush()
    props.context = { ...props.context, ownerType:'area' }; await flush()
    assert.equal(queries, 3)
    release([]); await flush()
  } finally { view.close(); moduleRegistry.clear() }
})

test('跨日缩略趋势显示日期，避免24小时两端同一时刻产生歧义', () => {
  const start = new Date(2026, 10, 3, 9).getTime(), end = new Date(2026, 10, 4, 9).getTime()
  const view = mount(Trend, { compact: true, values: [{ ...value, evaluationTime: end }], bounds: [start, end] })
  try {
    const labels = nodes(view.root, 'time').map(textContent)
    assert.equal(labels.length, 2)
    assert.notEqual(labels[0], labels[1])
  } finally { view.close() }
})

test('缩略趋势悬停展示真实时间与读数，离开后收起；密集样本只保留峰值和一个悬停标记', async () => {
  const rows = Array.from({ length:200 },(_,i) => ({ ...value, value:i, evaluationTime:1000+i }))
  const view = mount(Trend, { compact:true, values:rows, bounds:[1000,1199], unit:'kW' })
  try {
    const plot = walk(view.root,node => node.props.class === 'metric-trend-mini__plot')[0]
    const peak = walk(view.root,node => node.props.class === 'metric-trend-mini__peak')[0]
    assert.ok(peak.props['aria-label'].includes('samplePeak')); assert.ok(peak.props.title.includes('199 kW'))
    plot.props.onPointermove({ clientX:150, currentTarget:{ getBoundingClientRect:() => ({ left:0,width:300 }) } }); await flush()
    const tip = walk(view.root,node => node.props.role === 'tooltip')[0]
    assert.ok(tip); assert.ok(textContent(tip).includes('99 kW'))
    assert.equal(nodes(view.root,'circle').length,1)
    plot.props.onPointermove({ clientX:296, currentTarget:{ getBoundingClientRect:() => ({ left:0,width:300 }) } }); await flush()
    assert.ok(textContent(walk(view.root,node => node.props.role === 'tooltip')[0]).includes('samplePeak'))
    plot.props.onPointerleave(); await flush()
    assert.equal(walk(view.root,node => node.props.role === 'tooltip').length,0)
    assert.equal(nodes(view.root,'circle').length,0)
  } finally { view.close() }
})

test('数字枚举状态使用有界的状态采样点和图例，详情复用离散时间轴；普通评分仍用数值趋势', () => {
  const rows = Array.from({length:200},(_,index) => ({...value,value:index % 3,evaluationTime:1000 + index,resultId:String(index)}))
  const labels = [{value:0,name:'正常',icon:'color:#22c55e'},{value:1,name:'异常',icon:'color:#ff4d4f'},{value:2,name:'等待',icon:'font:ClockCircleOutlined'}]
  const view = mount(Trend,{compact:true,values:rows,bounds:[1,3600000],labels})
  try {
    const marks = walk(view.root,node => node.props.class?.includes('state-samples__point'))
    assert.equal(marks.length,60,'many metrics must not render every historical sample')
    assert.equal(nodes(view.root,'path').length,0,'numeric state codes are not connected by a numeric line')
    assert.ok(marks.some(node => node.props.style?.color === '#22c55e'))
    const labelsShown=walk(view.root,node => node.props.class === 'state-samples__label').map(textContent)
    assert.deepEqual(labelsShown.sort(),labels.map(label => label.name).sort())
  } finally {view.close()}
  const detail = mount(Trend,{values:rows,bounds:[1,3600000],labels})
  try {
    const option=nodes(detail.root,'chart')[0].props.option
    assert.equal(option.series[0].type,'custom');assert.equal(option.series[1].data.length,0)
  } finally {detail.close()}
  const score = mount(Trend,{compact:true,values:rows})
  try {assert.ok(walk(score.root,node => node.props.class === 'metric-trend-mini__plot').length)} finally {score.close()}
})

test('状态缩略图和详情按真实时间定位不等间隔采样，悬停不按样本数量均分', async () => {
  const rows=[1000,1100,10000].map((time,index)=>({...value,value:0,evaluationTime:time,resultId:String(index)}))
  const labels=[{value:0,name:'正常'},{value:1,name:'异常'},{value:2,name:'等待'}]
  const compact=mount(Trend,{compact:true,values:rows,labels,bounds:[0,20000]})
  const detail=mount(Trend,{values:rows,labels,bounds:[0,20000]})
  try {
    const plot=walk(compact.root,node=>node.props.class==='state-samples__plot')[0]
    const marks=walk(plot,node=>node.props.class?.includes('state-samples__point'))
    assert.equal(marks[0].props.style.left,'clamp(4px, 0%, calc(100% - 4px))')
    assert.ok(marks[1].props.style.left.startsWith('clamp(4px, 1.1111111111111112%'))
    assert.equal(marks[2].props.style.left,'clamp(4px, 100%, calc(100% - 4px))')
    const tooltip=()=>nodes(compact.root,'a-tooltip').find(node=>Object.hasOwn(node.props,'open'))
    plot.props.onPointermove({clientX:30,currentTarget:{getBoundingClientRect:()=>({left:0,width:300})}});await flush()
    assert.ok(tooltip().props.title.includes('正常'))
    assert.equal(tooltip().props.open,true)
    assert.ok(marks[1].props.class.includes('is-inspected'))
    plot.props.onPointerleave();await flush()
    assert.equal(tooltip().props.title,undefined)
    assert.equal(tooltip().props.open,false)
    plot.props.onFocus();await flush()
    assert.ok(marks[2].props.class.includes('is-inspected'))
    let prevented=false,stopped=false
    plot.props.onKeydown({key:'ArrowLeft',preventDefault(){prevented=true},stopPropagation(){stopped=true}});await flush()
    assert.ok(prevented && stopped);assert.ok(marks[1].props.class.includes('is-inspected'))
    plot.props.onKeydown({key:'Home',preventDefault(){},stopPropagation(){}});await flush()
    assert.ok(marks[0].props.class.includes('is-inspected'))
    plot.props.onKeydown({key:'End',preventDefault(){},stopPropagation(){}});await flush()
    assert.ok(marks[2].props.class.includes('is-inspected'))
    plot.props.onKeydown({key:'Escape',preventDefault(){},stopPropagation(){}});await flush()
    assert.equal(tooltip().props.open,false)
    plot.props.onBlur();await flush()
    assert.equal(tooltip().props.title,undefined)
    const option=nodes(detail.root,'chart')[0].props.option
    assert.deepEqual(option.series[0].data.map(point=>point.value[0]),[1000,1100,10000])
    assert.equal(option.series[1].data.length,0,'neither view manufactures continuous state intervals')
  } finally {compact.close();detail.close()}
})

test('结果切换菜单以语义区分图标，保留当前选中项和切换事件', async () => {
  const outputs = [{metricId:'state',label:'连接状态',metricKind:'state',valueType:'int'},
    {metricId:'score',label:'评分',metricKind:'score'}, {metricId:'ratio',label:'在线率',unit:'%'},
    {metricId:'duration',label:'离线时长',unit:'s'}, {metricId:'tracked',label:'本次状态',valueType:'int'}]
  const spec={...template,outputs,definitions:[{id:'tracked',stateTracking:{}}]}
  const chosen=[]
  const view=mount(OutputSwitch,{template:spec,output:outputs[0],outputId:'state',onChange:id=>chosen.push(id)})
  try {
    const options=nodes(view.root,'external-shell').filter(node=>node.props.icon)
    assert.deepEqual(options.map(node=>node.props.icon),['SwitcherOutlined','DashboardOutlined','PercentageOutlined','ClockCircleOutlined','FieldTimeOutlined'])
    const menu=nodes(view.root,'a-menu')[0]
    assert.deepEqual(menu.props['selected-keys'],['state'])
    await menu.props.onClick({key:'duration'});await flush()
    assert.deepEqual(chosen,['duration'])
  } finally {view.close()}
})

test('声明枚举沿用状态图；文本与对象仅展示真实记录，不显示缩放操作', () => {
  for (const valueType of ['string','object']) {
    const raw=valueType==='object' ? {temperature:26} : 'ready'
    const view=mount(Trend,{output:{metricId:'v',valueType},values:[{metricId:'v',value:raw,evaluationTime:1000}],bounds:[0,2000]})
    try {
      assert.equal(nodes(view.root,'chart').length,0)
      assert.equal(nodes(view.root,'article').length,1)
      assert.ok(textContent(view.root).includes(valueType==='object' ? 'temperature' : 'ready'))
      assert.equal(nodes(view.root,'a-button').filter(node=>['historyBrush','historyResetFocus','historyOverview'].includes(node.props['aria-label'])).length,0)
    } finally {view.close()}
    const compact=mount(Trend,{compact:true,output:{metricId:'v',valueType},values:Array.from({length:200},(_,index)=>({metricId:'v',value:raw,evaluationTime:1000+index}))})
    try {
      const preview=walk(compact.root,node=>node.props.class==='metric-trend-mini__records')[0]
      assert.ok(preview);assert.equal(preview.children.filter(node=>node.type==='div').length,2)
      assert.equal(textContent(compact.root).includes('noHistory'),false)
      assert.equal(nodes(compact.root,'svg').length,0)
    } finally {compact.close()}
  }
  const view=mount(Trend,{output:{metricId:'v',valueType:'enum'},values:[{metricId:'v',value:3,evaluationTime:1000}],bounds:[0,2000]})
  try {assert.equal(nodes(view.root,'chart')[0].props.option.series[0].type,'custom')} finally {view.close()}
})

test('布尔缩略图复用有界状态采样，详情保留完整查询范围，不推断持续时长', () => {
  const rows = Array.from({ length: 200 }, (_, index) => ({ ...value, value: index > 100, evaluationTime: 1000 + index }))
  const compact = mount(Trend, { compact: true, values: rows, bounds: [1, 3600000], limited: true })
  try {
    const text = textContent(compact.root)
    assert.equal(text.includes('resultsLimit'), false, 'query limit stays out of the main content')
    const hint = nodes(compact.root, 'a-tooltip').find(node => node.props.title === 'trendSampleRangeHint')
    assert.deepEqual(hint.props.trigger, ['hover', 'click'])
    assert.equal(walk(compact.root, node => node.props.class === 'metric-trend-mini__scope').length, 0)
    const axis = walk(compact.root, node => node.props.class?.includes('metric-trend-mini__times'))[0]
    let stopped = false
    axis.props.onClick({ stopPropagation: () => { stopped = true } })
    assert.ok(stopped, 'opening the range hint must not open the metric drawer')
    assert.equal(nodes(compact.root, 'circle').length, 0)
    assert.equal(nodes(compact.root, 'path').length, 0)
    assert.equal(walk(compact.root,node=>node.props.class?.includes('state-samples__point')).length,60)
    assert.equal(nodes(compact.root, 'time').map(textContent)[1], new Date(1199).toLocaleString('zh', { hour: '2-digit', minute: '2-digit' }))
  } finally { compact.close() }
  const detail = mount(Trend, { values: rows, bounds: [1, 3600000], limited: true })
  try {
    const option=nodes(detail.root,'chart')[0].props.option
    assert.equal(option.series[0].type,'custom','boolean facts retain discrete marks, not a numeric scatter plot')
    assert.equal(option.series[0].data.length,200)
    assert.equal(option.series[1].data.length,0,'boolean samples never fill gaps as continuous states')
    assert.equal(option.xAxis.min,1);assert.equal(option.xAxis.max,3600000)
    assert.deepEqual(option.series[0].data.map(point=>point.value[0]),rows.map(point=>point.evaluationTime))
    assert.ok(nodes(detail.root, 'a-tooltip').some(node => node.props.title?.includes('resultsLimit')))
  } finally { detail.close() }
})

test('缩略图和详情只绘制所选时段，旧记录不挤压状态或数值趋势', () => {
  for(const boolean of [true,false]) {
    const rows=[{...value,evaluationTime:1,value:boolean ? false : 9999},
      {...value,evaluationTime:2000,value:boolean ? true : 2},
      {...value,evaluationTime:3000,value:boolean ? false : 3},
      {...value,evaluationTime:9000,value:boolean ? true : -9999}]
    const compact=mount(Trend,{compact:true,values:rows,bounds:[1000,4000],limited:true})
    const detail=mount(Trend,{values:rows,bounds:[1000,4000]})
    try {
      const chart=nodes(detail.root,'chart')[0].props.option
      assert.deepEqual(chart.series[0].data.map(point=>boolean ? point.value[0] : point[0]),[2000,3000])
      if(boolean) {
        const marks=walk(compact.root,node=>node.props.class?.includes('state-samples__point'))
        assert.equal(marks.length,2)
        assert.equal(marks.filter(node=>node.props.class?.includes('is-false')).length,1)
      } else {
        const peak=walk(compact.root,node=>node.props.class==='metric-trend-mini__peak')[0]
        assert.ok(peak.props.title.endsWith('3'))
      }
    } finally {compact.close();detail.close()}
  }
})

test('布尔详情在空刷新帧中保留时间轴和固定身份，恢复后仍展示同一条记录', async () => {
  const rows = [{ ...value, resultId:'a', value:false, evaluationTime:1000 }, { ...value, resultId:'b', value:true, evaluationTime:2000 }]
  const props = reactive({ values:rows, current:rows[1], bounds:[0,3000] })
  const view = mount(Trend, props)
  try {
    const plot = walk(view.root,node=>node.props.class?.includes('history-timeline__plot'))[0]
    plot.props.onKeydown({ key:'Home', preventDefault() {} }); await flush()
    props.values = []; props.current = undefined; await flush()
    assert.ok(textContent(view.root).includes('historySelectionMissing'))
    props.values = [...rows,{ ...value,resultId:'c',value:true,evaluationTime:2500 }]; await flush()
    const record = walk(view.root,node=>node.props.class === 'history-record')[0]
    assert.ok(textContent(record).includes('conditionFalse'))
    assert.ok(nodes(record,'a-button').some(node=>node.props['aria-label']==='historyUnpin'))
    assert.equal(textContent(record).includes('historySelectionMissing'),false)
  } finally { view.close() }
})

test('来源详情仅展示当前输出实际引用的输入与计算，不夹带其他输出的来源', async () => {
  const spec = { ...template, inputDefinitions: [{ id: 'cpu', name: 'CPU' }, { id: 'unused', name: 'Unrelated sensor' }],
    definitions: [{ id: 'score', name: 'Pressure', type: 'composite', expression: 'cpu * 2', dependsOn: ['cpu'] }, { id: 'other', name: 'Other result', type: 'composite', expression: 'unused', dependsOn: ['unused'] }],
    outputs: [{ metricId: 'score', label: 'Pressure', persist: true }, { metricId: 'other', label: 'Other result' }] }
  const configuration = { ...config, inputMappings: { cpu: { kind: 'property', thingId: 'a', id: 'cpuSystemUsage' } } }
  const view = mount(Lineage, { configuration, template: spec, output: spec.outputs[0], context: { ownerType: 'device', ownerId: 'a', label: 'Mac' } })
  try {
    await flush()
    const text = textContent(view.root)
    assert.ok(text.includes('Mac / CPU')); assert.ok(text.includes('Pressure')); assert.ok(text.includes('outputHistory'))
    assert.equal(text.includes('Unrelated sensor'), false); assert.equal(text.includes('Other result'), false)
  } finally { view.close() }
})

test('结果解释展示执行快照、输入时间与默认值，当前参数变化不替换历史依据', async () => {
  const spec = { ...template, parameters:{ limit:999 }, parameterDefinitions:[{ id:'limit',name:'Threshold',valueType:{type:'int'} }],
    inputDefinitions:[{ id:'cpu',name:'CPU' }], definitions:[{id:'score',inputs:[{id:'reading',metricId:'cpu'}]}] }
  const result = {metricId:'score',evaluationTime:2000,evidence:{
    inputs:[{inputId:'reading',count:2,cutoff:2000,inputTimeStart:1000,inputTimeEnd:1500}],
    execution:{truncated:false,values:[{kind:'input',id:'reading',path:'/value',type:'number',value:'7',state:'defaulted'},
      {kind:'parameter',id:'limit',path:'',type:'number',value:'12',state:'available'}]},
    facts:[{code:'rule',text:'Recorded evidence'}]}}
  const view = mount(ExecutionEvidence,{template:spec,output:{metricId:'score'},value:result})
  try {
    const text=textContent(view.root)
    assert.match(text,/CPU/);assert.match(text,/Threshold/);assert.match(text,/12/)
    assert.match(text,/evidenceInput_defaulted/);assert.match(text,/evidenceSamples/);assert.match(text,/Recorded evidence/)
    assert.match(text,/evidenceSnapshotHint/)
    assert.equal(text.includes('999'),false);assert.equal(text.includes('evidenceNotRecorded'),false)
  } finally { view.close() }
})

test('旧结果只展示已记录时间与算法事实，不从当前输入或参数倒推', async () => {
  const spec={...template,inputDefinitions:[{id:'cpu',name:'CPU'}],parameters:{limit:999}}
  const view=mount(ExecutionEvidence,{template:spec,output:{metricId:'score'},value:{metricId:'score',evidence:{inputs:[{inputId:'cpu',count:1,cutoff:2000,inputTimeStart:1000,inputTimeEnd:1000}],facts:[{code:'old',text:'Existing provider fact'}]}}})
  try {
    const text=textContent(view.root)
    assert.match(text,/evidenceNotRecorded/);assert.match(text,/evidenceValuesMissing/);assert.match(text,/Existing provider fact/)
    assert.equal(text.includes('evidenceSnapshotHint'),false,'no snapshot explanation without a recorded snapshot')
    assert.equal(text.includes('999'),false)
  } finally {view.close()}
})

test('算法过程展开实际对象字段并按目录格式化快照参数，整轮参数折叠且样本不冒充窗口',()=>{
  const descriptor={id:'duration',name:'状态统计',configuration:{provider:'state',providerVersion:'1',outputType:{type:'object',properties:[
    {id:'activeDuration',name:'运行时长',valueType:{type:'long',unit:'s'}},{id:'inactiveCount',name:'停止次数',valueType:{type:'int'}},{id:'coverage',name:'时间覆盖率',valueType:{type:'double'}}]}},
    parameterDefinitions:[{id:'duration',name:'统计范围',valueType:{type:'string'},expands:{editor:'duration'}},{id:'activeValue',name:'运行值',valueType:{type:'int'},expands:{typeFromInput:'state'}}]}
  const spec={...template,inputDefinitions:[{id:'connection',name:'平台连接状态',valueType:{type:'enum',elements:[{value:0,text:'离线'},{value:1,text:'在线'}]}}],parameterDefinitions:[{id:'limit',name:'无关评分阈值',valueType:{type:'int'}}],
    definitions:[{id:'stats',name:'连接统计',inputs:[{id:'state',metricId:'connection'}],calculator:{provider:'state',providerVersion:'1',inputTypes:{state:{type:'array',elementType:{type:'int'}}},parameters:{duration:'PT8H',activeValue:0}}}]}
  const leaf=(kind,id,type,value)=>({kind,id,path:'',type,value,state:'available'})
  const result={metricId:'stats',value:{activeDuration:60,inactiveCount:0,coverage:.5,extra:false},evidence:{inputs:[{inputId:'state',metricId:'connection',count:8,inputTimeStart:1000,inputTimeEnd:5000}],
    execution:{truncated:false,values:[{...leaf('input','state','number','1'),path:'/value'},leaf('calculatorParameter','duration','string','PT5M'),leaf('calculatorParameter','activeValue','number','1'),leaf('calculatorParameter','extraFlag','boolean','false'),leaf('parameter','limit','number','7')]}}}
  const key=load('components/Metric/calculatorContext.ts').metricCalculatorsKey
  const Wrapper=defineComponent({setup(){provide(key,ref([descriptor]));return ()=>h(ExecutionEvidence,{template:spec,output:{metricId:'stats'},value:result})}})
  const view=mount(Wrapper)
  try {
    const fields=walk(view.root,node=>String(node.props.class).includes('metric-evidence__result'))[0]
    assert.match(textContent(fields),/运行时长/);assert.match(textContent(fields),/停止次数0/);assert.match(textContent(fields),/时间覆盖率0.5/)
    assert.match(textContent(fields),/extra/)
    const method=walk(view.root,node=>node.props.class==='metric-evidence__algorithm')[0]
    assert.match(textContent(method),/统计范围/);assert.match(textContent(method),/运行值在线/)
    assert.equal(textContent(method).includes('PT5M'),false);assert.equal(textContent(method).includes('PT8H'),false)
    assert.equal(textContent(method).includes('无关评分阈值'),false)
    const parameters=walk(view.root,node=>node.props.class==='metric-evidence__parameters')[0]
    assert.equal(parameters.type,'details');assert.notEqual(parameters.props.open,true)
    assert.match(textContent(parameters),/无关评分阈值7/);assert.match(textContent(parameters),/extraFlag/)
    assert.match(textContent(view.root),/evidenceLastSample/);assert.match(textContent(view.root),/evidenceSourceTime/)
    assert.equal(textContent(view.root).includes('evidenceSampleTime'),false)
    const recorded=leaf('calculatorParameter','duration','string','PT5M')
    assert.equal(evidenceGroups(result.evidence,spec,'calculatorParameter','stats',[descriptor])[0].name,'统计范围')
    assert.equal(evidenceValue(recorded,'duration',spec,'zh',key=>key,[],'stats').text,'PT5M','missing metadata preserves the recorded raw value')
    assert.equal(evidenceValue({...recorded,value:'not-duration'},'duration',spec,'zh',key=>key,[descriptor],'stats').text,'not-duration')
  }finally{view.close()}
})

test('结构化解释沿字段类型展示名称，已记录对象不会冒充缺失输入',()=>{
  const spec={...template,definitions:[{id:'stats',name:'连接统计',calculator:{outputType:{type:'object',properties:[{id:'coverage',name:'覆盖率',valueType:{type:'double'}}]}}},{id:'state',inputs:[{id:'source',metricId:'stats'}]}]}
  const read={kind:'read',state:'available',path:['source','coverage'],value:1,children:[]}
  const literal={kind:'literal',state:'available',path:[],value:.95,children:[]}
  const explanation={kind:'operator',operation:'>=',state:'available',value:true,path:[],children:[read,literal]}
  const view=mount(ExecutionEvidence,{template:spec,output:{metricId:'state'},value:{metricId:'state',value:true,evidence:{execution:{values:[],truncated:false}}},explanation})
  try {
    assert.match(textContent(view.root),/连接统计 · 覆盖率/)
    assert.equal(textContent(view.root).includes('evidenceValuesMissing'),false)
  } finally {view.close()}
})

test('过程公式复用编辑引用目录，计算时间和来源日期使用一致格式，数字不猜测为日期',()=>{
  const time=1794102526000
  const spec={...template,inputDefinitions:[{id:'lastCommunication',name:'最近通信时间',valueType:{type:'date',format:'timestamp'}}],
    definitions:[{id:'age',expression:'sample.getProcessTime() - last',dependsOn:['lastCommunication'],inputs:[{id:'last',metricId:'lastCommunication'}]}],outputs:[{metricId:'age'}]}
  const explanation={kind:'operator',operation:'-',state:'available',value:34,path:[],children:[
    {kind:'read',state:'available',path:['sample','processTime'],value:time+34,children:[]},
    {kind:'read',state:'available',path:['last'],value:time,children:[]}]}
  const view=mount(ExecutionEvidence,{template:spec,output:{metricId:'age'},value:{metricId:'age',value:34,evidence:{execution:{values:[],truncated:false}}},explanation})
  try {
    const formula=walk(view.root,node=>String(node.props.class || '').includes('expression-document'))[0]
    assert.ok(formula)
    const text=textContent(formula)
    assert.equal((text.match(/2026-11-08/g) || []).length,2)
    assert.match(text,/2026-11-08 \d{2}:\d{2}:\d{2}\.034/)
    assert.match(text,/2026-11-08 \d{2}:\d{2}:\d{2}\.000/)
    assert.doesNotMatch(text,/1,794,102|179410252/)
    assert.match(text,/计算时间/)
  } finally {view.close()}
})

test('真实计算图直接展示数据，默认折叠未参与节点，可展开置灰且只读，截断记录保留未知节点', async () => {
  const spec={...template,inputDefinitions:[{id:'connection',name:'Connection',valueType:{type:'enum',elements:[{value:1,text:'Online'}]}}],
    definitions:[{id:'status',name:'Status',inputs:[{id:'source',metricId:'connection'}]},{id:'other',name:'Unused'}],outputs:[{metricId:'status',label:'Status'}]}
  const output={metricId:'status',value:1,resultId:'first',evaluationTime:2000,evidence:{inputs:[{inputId:'source',metricId:'actual-state',count:1,inputTimeEnd:1000}],
    execution:{values:[{kind:'input',id:'source',path:'/value',type:'number',value:'1',state:'available'}],truncated:false}}}
  const observation=reactive({loading:false,snapshot:{resultId:'first',evaluationTime:2000,truncated:false,
    steps:[{id:0,definitionId:'status',name:'Status',state:'produced',value:output,outputs:[output]}]},refresh(){}})
  const view=mount(ExecutionProcess,{template:spec,output:spec.outputs[0],value:output,observation})
  try {
    const graph=()=>walk(view.root,node=>node.type==='button' && node.props['data-node'])
    assert.equal(graph().length,3)
    assert.ok(textContent(graph().find(node=>node.props['data-node']==='input-0')).includes('Online'))
    await click(findText(view.root,'a-button','executionShowUnused'))
    assert.equal(graph().length,4)
    assert.ok(graph().find(node=>node.props['data-node']==='rule-1').props.class.includes('is-muted'))
    await click(findText(view.root,'a-button','executionHideUnused'))
    assert.equal(graph().length,3)
    assert.ok(findText(view.root,'a-button','canvasFit'))
    assert.ok(findText(view.root,'a-button','refresh'))
    assert.equal(walk(view.root,node=>node.props['data-add-root'] || node.props['data-add-from']).length,0)
    assert.equal(findText(view.root,'a-button','executionPause'),undefined)
    assert.equal(walk(view.root,node=>node.props.class==='metric-node-inspect__detail').length,0)
    await graph().find(node=>node.props['data-node']==='rule-0').props.onClick({currentTarget:{}});await flush()
    assert.equal(walk(view.root,node=>node.props.class==='metric-node-inspect__detail').length,0,'selecting the node only focuses dependencies')
    await inspectNode(graph().find(node=>node.props['data-node']==='rule-0'))
    assert.equal(walk(view.root,node=>node.props.class==='metric-node-inspect__detail').length,1)
    const firstPopover=nodes(view.root,'a-popover').find(node=>node.props.open)
    await inspectNode(graph().find(node=>node.props['data-node']==='input-0'))
    firstPopover.props.onOpenChange(false);await flush()
    assert.equal(walk(view.root,node=>node.props.class==='metric-node-inspect__detail').length,1,'late close cannot close another node')
    assert.equal(walk(view.root,node=>node.type==='button'&&nodes(node,'button').length>1).length,0,'inspection buttons are siblings, never nested')
    assert.ok(textContent(view.root).includes('Online'))
    assert.equal(walk(view.root,node=>node.props.class==='template-graph__flow').length,0,'process does not imply real execution timing')
    observation.snapshot={...observation.snapshot,truncated:true};await flush()
    assert.equal(graph().length,4)
    assert.ok(graph().find(node=>node.props['data-node']==='rule-1').props.class.includes('is-incomplete'))
    assert.equal(findText(view.root,'a-button','executionShowUnused'),undefined)
    assert.equal(walk(view.root,node=>node.props.class==='metric-process__stamp').length,0)
    const tools=walk(view.root,node=>node.props.class==='template-graph__toolbar')[0]
    assert.ok(walk(tools,node=>node.type==='time').length)
    assert.equal(findText(tools,'a-button','executionLatest'),undefined,'latest navigation belongs to the shared history selection')
  } finally {view.close()}
})

test('计算节点被下游读取时仍展示自身的计算方式与输入，不被消费记录替换',async()=>{
  const spec={...template,inputDefinitions:[{id:'reading',name:'测量值'}],definitions:[
    {id:'base',name:'加倍',expression:'reading * 2',inputs:[{id:'reading',metricId:'reading'}]},
    {id:'next',name:'下游计算',expression:'upstream + 1',inputs:[{id:'upstream',metricId:'base'}]},
  ],outputs:[{metricId:'next'}]}
  const recorded=(id,alias,metricId,result,input)=>({id:id === 'base' ? 0 : 1,definitionId:id,state:'produced',outputs:[],value:{metricId:id,value:result,evaluationTime:2000,
    evidence:{inputs:[{inputId:alias,metricId,count:1,inputTimeEnd:1000}],execution:{truncated:false,values:[{kind:'input',id:alias,path:'/value',type:'number',value:String(input),state:'available'}]}}}})
  const observation={loading:false,snapshot:{resultId:'round',evaluationTime:2000,truncated:false,steps:[recorded('base','reading','reading',8,4),recorded('next','upstream','base',9,8)]},refresh(){}}
  const view=mount(ExecutionProcess,{template:spec,output:spec.outputs[0],value:{metricId:'next',resultId:'round'},observation})
  try {
    await inspectNode(walk(view.root,node=>node.props['data-node']==='rule-0')[0])
    const detail=walk(view.root,node=>node.props.class==='metric-node-inspect__detail')[0]
    assert.equal(walk(detail,node=>node.props.class==='metric-evidence__method').length,1)
    assert.match(textContent(detail),/测量值.*\*.*2/)
    assert.ok(walk(detail,node=>node.props.class==='metric-evidence__value').some(node=>textContent(node).includes('4')))
    assert.equal(walk(detail,node=>node.props.class==='metric-node-inspect__reads').length,0)
  } finally {view.close()}
})

test('匿名结果按执行引用展示同一轮计算图，不将无身份或其他轮次的快照当作当前过程',async()=>{
  const spec={...template,inputDefinitions:[],definitions:[{id:'value',name:'Value'}],outputs:[{metricId:'value'}]}
  const result={metricId:'value',executionId:'round-one',value:3,evaluationTime:1000}
  const observation=reactive({loading:false,snapshot:{executionId:'round-one',evaluationTime:1000,steps:[{id:0,definitionId:'value',state:'produced',value:result,outputs:[result]}]},refresh(){}})
  const props=reactive({template:spec,output:spec.outputs[0],value:result,observation})
  const view=mount(ExecutionProcess,props)
  const graph=()=>walk(view.root,node=>node.type==='button' && node.props['data-node'])
  try {
    assert.equal(graph().length,2)
    observation.snapshot={...observation.snapshot,executionId:'round-two'};await flush()
    assert.equal(graph().length,0)
    props.value={...result,executionId:'round-two'};await flush()
    assert.equal(graph().length,2)
    props.value={...result,executionId:undefined};observation.snapshot={...observation.snapshot,executionId:undefined};await flush()
    assert.equal(graph().length,0,'two missing identities are not a match')
  } finally {view.close()}
})

test('计算图按步骤切换同源读取，仅突出记录链路，实时结果不替换当前轮次',async()=>{
  const spec={...template,inputDefinitions:[{id:'connection',name:'Connection',valueType:{type:'enum',elements:[{value:0,text:'Offline'},{value:1,text:'Online'}]}}],
    definitions:[{id:'now',name:'Current',inputs:[{id:'state',metricId:'connection'}],expression:'state'},{id:'history',name:'Historical',inputs:[{id:'state',metricId:'connection'}],expression:'state'}],outputs:[]}
  const step=(id,value,at)=>({id:id === 'now' ? 0 : 1,definitionId:id,name:id,state:'produced',outputs:[],value:{metricId:id,value,evaluationTime:2000,evidence:{inputs:[{inputId:'state',metricId:'connection',count:1,inputTimeEnd:at}],execution:{truncated:false,values:[{kind:'input',id:'state',path:'/value',type:'number',value:String(value),state:'available'}]}}}})
  const observation=reactive({loading:false,snapshot:{resultId:'first',evaluationTime:2000,truncated:false,steps:[step('now',0,2000),step('history',1,1000)]},refresh(){}})
  const props=reactive({template:spec,output:{metricId:'now'},value:{metricId:'now',resultId:'first'},observation})
  const view=mount(ExecutionProcess,props)
  const graph=key=>walk(view.root,node=>node.props['data-node']===key)[0]
  const select=async key=>{await graph(key).props.onClick({currentTarget:{}});await flush()}
  try {
    assert.match(textContent(graph('input-0')),/executionMultipleReads/)
    await select('rule-0')
    assert.match(textContent(graph('input-0')),/Offline/)
    assert.ok(graph('rule-1').props.class.includes('is-unfocused'))
    await select('rule-1')
    assert.match(textContent(graph('input-0')),/Online/)
    assert.ok(graph('rule-0').props.class.includes('is-unfocused'))
    await select('input-0')
    await inspectNode(graph('input-0'))
    const readings=walk(view.root,node=>node.type==='button' && textContent(node).includes('executionReadBy'))
    assert.equal(readings.length,2)
    await click(readings[0]);assert.match(textContent(graph('input-0')),/Offline/)
    props.value={metricId:'now',resultId:'new'};await flush()
    assert.equal(graph('input-0'),undefined,'a different selected result must never display the previous graph')
    observation.snapshot={...observation.snapshot,resultId:'new'};await flush()
    assert.match(textContent(graph('input-0')),/executionMultipleReads/)
  } finally {view.close()}
})

test('窗口族选择不同输出时用该输出的记录结果，共享本步依据，不借用另一个结果',async()=>{
  const spec={...template,inputDefinitions:[],definitions:[{id:'family',name:'Statistics',aggregation:'max',windowFamily:{ranges:[{outputs:[{id:'minimum'},{id:'maximum'}]}]}}],outputs:[{metricId:'minimum'},{metricId:'maximum'}]}
  const first={metricId:'minimum',value:1,evidence:{execution:{values:[],truncated:false}}}
  const last={metricId:'maximum',value:7}
  const observation={loading:false,snapshot:{resultId:'round',evaluationTime:2000,truncated:false,steps:[{id:0,definitionId:'family',state:'produced',value:first,outputs:[first,last]}]},refresh(){}}
  const view=mount(ExecutionProcess,{template:spec,output:spec.outputs[0],value:{...first,resultId:'round'},observation})
  try {
    const output=walk(view.root,node=>node.props['data-node']==='output-1')[0]
    await inspectNode(output)
    const result=walk(view.root,node=>node.props.class==='metric-evidence__recorded')[0]
    assert.match(textContent(result),/7/)
    assert.equal(last.evidence,undefined,'shared evidence must not mutate the output snapshot')
  } finally {view.close()}
})

test('真实Panel按需注入来源类型，旧long输入在过程图及明细展示日期，无需重配模板',async()=>{
  defaults(); moduleRegistry.clear()
  const at=new Date(2026,10,7,9,8,13).getTime()
  const spec={...template,options:undefined,inputDefinitions:[{id:'at',name:'采样时刻',valueType:{type:'long'}}],
    definitions:[{id:'value',inputs:[{id:'stamp',metricId:'at'}],expression:'stamp + 1'}],outputs:[{metricId:'value',label:'Result'}]}
  const configured={...config,inputMappings:{at:{kind:'property',id:'timestamp',thingType:'device',thingId:'one'}}}
  const observed={...value,resultId:'date-result',value:1}
  const recorded={...observed,evidence:{inputs:[{inputId:'stamp',metricId:'at',count:1,inputTimeStart:at,inputTimeEnd:at}],
    execution:{values:[{kind:'input',id:'stamp',path:'/value',type:'number',value:String(at),state:'available'}]}}}
  let descriptions=0
  const picker=Object.assign(async()=>undefined,{describe:async()=>{descriptions++;return {at:{valueType:{type:'date'}}}}})
  api.byOwner=async()=>[configured];api.getConfig=async()=>configured;api.configTemplate=async()=>spec
  api.latest=async()=>[{configId:'c',outputs:{value:observed}}]
  api.execution=async()=>({resultId:'date-result',evaluationTime:at,steps:[{id:0,definitionId:'value',state:'produced',value:recorded,outputs:[observed]}]})
  const view=mount(Panel,{context:{ownerType:'device',ownerId:'one',targetType:'device',targetId:'one'},pickSource:picker})
  try {
    await flush();assert.equal(descriptions,0)
    await click(nodes(view.root,'button').find(node=>node.props.class?.includes('metric-panel__card')))
    assert.equal(descriptions,1)
    const input=walk(view.root,node=>node.props['data-node']==='input-0')[0]
    assert.match(textContent(input),/2026-11-07 09:08:13/)
    await inspectNode(input)
    const details=walk(view.root,node=>node.props.class==='metric-node-inspect__detail')[0]
    assert.match(textContent(details),/2026-11-07 09:08:13/)
    assert.equal(spec.inputDefinitions[0].valueType.type,'long')
    await click(findText(view.root,'a-button','refresh'));assert.equal(descriptions,1)
  } finally {view.close();moduleRegistry.clear()}
})

test('选点更新保留用户缩放，不因新的 overlay 对象重新适应全图',async()=>{
  const props=reactive({template:{...template,inputDefinitions:[{id:'source'}],definitions:[{id:'result',sourceMetric:'source'}],outputs:[]},
    overlay:{nodes:{'input-0':'done','rule-0':'done'}},selected:{kind:'input',index:0}})
  const view=mount(Graph,props)
  try {
    const viewport=walk(view.root,node=>node.props['aria-label']==='relations')[0]
    Object.assign(viewport,{clientWidth:500,clientHeight:350,scrollLeft:0,scrollTop:0})
    await click(findText(view.root,'a-button','canvasZoomIn'))
    const percent=()=>textContent(walk(view.root,node=>node.props.class==='template-graph__percent')[0])
    assert.equal(percent(),'120%')
    props.overlay={nodes:{'input-0':'done','rule-0':'done'}};props.selected={kind:'rule',index:0};await flush()
    assert.equal(percent(),'120%')
  } finally {view.close()}
})

test('证据复用状态、时长及对象字段语义，保留大整数与空值区别', () => {
  const spec={...template,inputDefinitions:[{id:'status',name:'Connection',valueType:{type:'enum',elements:[{value:0,text:'Offline'},{value:1,text:'Online'}]}}],definitions:[]}
  const item={kind:'input',id:'status',path:'/value',type:'number',value:'1',state:'available'}
  assert.equal(evidenceValue(item,'status',spec,'en',key=>key).text,'Online')
  assert.equal(evidenceValue({...item,value:'9223372036854775807'},'unknown',spec,'en',key=>key).text,'9223372036854775807')
  assert.equal(evidenceValue({...item,type:'null',value:null},'status',spec,'en',key=>key).text,'evidenceNull')
  assert.equal(evidenceValue({...item,type:'string',value:''},'unknown',spec,'en',key=>key).text,'evidenceEmptyString')
  assert.equal(evidenceValue({...item,type:'unavailable',state:'expired'},'status',spec,'en',key=>key).text,'evidenceInput_expired')
  const duration=evidenceValue({...item,path:'/state/duration',value:'60'},'unknown',spec,'en',key=>key)
  assert.equal(duration.label,'evidenceStateDuration');assert.notEqual(duration.text,'60')
  assert.equal(evidenceValue({...item,path:'/state/duration',value:'0'},'status',spec,'en',key=>key).text,
    evidenceValue({...item,path:'/state/duration',value:'0'},'unknown',spec,'en',key=>key).text,'duration must not use the input state labels')
  const at=new Date(2026,10,8,7,35,10).getTime()
  for(const field of ['inputTimeStart','inputTimeEnd']) {
    const date=evidenceValue({...item,path:`/${field}`,value:String(at)},'status',spec,'en',key=>key)
    assert.equal(date.label,field === 'inputTimeStart' ? 'evidenceInputTimeStart' : 'evidenceInputTimeEnd')
    assert.equal(date.text,'2026-11-08 07:35:10','区间元数据使用日期，不继承枚举或来源单位')
  }
  assert.equal(evidenceValue({...item,path:'/value/inputTimeStart',value:'12'},'unknown',spec,'en',key=>key).text,'12','业务对象的同名字段仍按声明类型展示')
  const aliases={...spec,definitions:[{id:'first',inputs:[{id:'same',metricId:'wrong'}]},{id:'second',inputs:[{id:'same',metricId:'status'}]}]}
  assert.equal(evidenceGroups({execution:{values:[{...item,id:'same'}],truncated:false}},aliases,'input','second')[0].name,'Connection')
  const family={...spec,definitions:[{id:'family',inputs:[{id:'sample',metricId:'status'}],windowFamily:{ranges:[{outputs:[{id:'max'}]}]}}]}
  assert.equal(evidenceGroups({execution:{values:[{...item,id:'sample'}],truncated:false}},family,'input','max')[0].name,'Connection')
})

test('历史读取失败保留最新值，避免同时展示无历史的误导空态；重试恢复', async () => {
  defaults(); moduleRegistry.clear()
  api.history = async () => { throw new Error('history unavailable') }
  const view = mount(Panel, { context: { ownerType: 'line', ownerId: 'a' } })
  try {
    await flush()
    await click(nodes(view.root, 'button').find(node => node.props.class?.includes('metric-panel__card')))
    assert.ok(nodes(view.root, 'strong').some(node => textContent(node) === '6'))
    assert.ok(nodes(view.root, 'a-alert').some(node => node.props.description === 'history unavailable'))
    assert.equal(nodes(view.root, 'a-empty').some(node => node.props.description === 'noHistory'), false)
    api.history = async () => [{ ...value, evaluationTime:Date.now()-1000 }]
    await click(findText(view.root, 'a-button', 'retry'))
    assert.equal(nodes(view.root, 'a-alert').some(node => node.props.description === 'history unavailable'), false)
    assert.equal(nodes(view.root, 'chart').length, 1)
  } finally { view.close() }
})

test('卡片与编辑使用配置名称和模板图标，实时值类型变化不改变身份，详情保留输出名称', async () => {
  defaults(); moduleRegistry.clear()
  const declared = { ...template, options:{ icon:'DashboardOutlined' } }
  let current = value
  api.configTemplate = async () => declared
  api.latest = async ids => ids.map(configId => ({ configId, outputs:{ value:current } }))
  const view = mount(Panel, { context:{ ownerType:'line', ownerId:'a', editable:true } })
  const header = () => walk(view.root, node => node.props.class === 'metric-card-shell__head')[0]
  const icon = () => walk(header(), node => node.props.type === 'DashboardOutlined')[0]
  try {
    await flush()
    assert.equal(textContent(walk(header(), node => node.props.class === 'metric-card-shell__title')[0]), 'Room')
    assert.ok(icon())
    const card = nodes(view.root, 'button').find(node => node.props.class?.includes('metric-panel__card'))
    assert.equal(card.props['aria-label'], 'Room')
    current = { ...value, value:false, evaluationTime:2000 }
    await click(findText(view.root, 'a-button', 'refresh'))
    assert.ok(icon()); assert.equal(nodes(view.root, 'article')[0].children.includes(header()), true)
    await click(card)
    const drawer = nodes(view.root, 'external-shell').find(node => node.props.open)
    assert.equal(drawer.props.title, 'Room'); assert.equal(drawer.props.sub, 'Room')
    await click(findText(header(), 'a-button', 'edit'))
    const title = walk(view.root, node => node.props.class === 'config-head__title')[0]
    assert.ok(walk(title, node => node.props.type === 'DashboardOutlined').length)
    assert.ok(nodes(title, 'external-shell').some(node => node.props.value === 'Room'))
  } finally { view.close(); moduleRegistry.clear() }
})

test('卡片公式独立于结果按钮，保留原公式；停用且无历史时收起空趋势与等待提示', async () => {
  defaults(); moduleRegistry.clear()
  api.configTemplate = async () => ({ ...template, definitions:[{ id:'value', expression:'sample / 60', inputs:[{id:'sample',metricId:'sample'}] }],
    inputDefinitions:[{id:'sample',name:'Duration',valueType:{type:'double'}}] })
  api.byOwner = async () => [{...config,state:'disabled'}]
  api.latest = async () => [{configId:'c',outputs:{}}]
  api.history = async () => []
  const view = mount(Panel,{context:{ownerType:'line',ownerId:'a'}})
  try {
    await flush()
    const header=walk(view.root,node=>node.props.class==='metric-card-shell__head')[0]
    const trigger=findText(header,'a-button','formula')
    assert.equal(textContent(trigger),'ƒx')
    assert.deepEqual(nodes(header,'a-popover')[0].props.trigger,['hover','focus','click'])
    const card=nodes(view.root,'button').find(node=>node.props.class?.includes('metric-panel__card'))
    assert.equal(nodes(card,'a-popover').length,0,'formula action is outside the result button')
    assert.equal(walk(card,node=>node.props.class==='metric-card-content__trend').length,0)
    assert.equal(textContent(card).includes('waiting'),false)
    await click(trigger)
    assert.equal(nodes(view.root,'external-shell').some(node=>node.props.open),false,'formula does not open result details')
  } finally {view.close()}
})

test('关系图选中与键盘焦点控制连线，重绘后保留节点和内部滚动位置', async () => {
  const model = reactive({ template:{ ...template, inputDefinitions:[{ id:'input', name:'Input' }], definitions:[{ id:'value', expression:'input * 2', dependsOn:['input'] }] }, selected:{ kind:'rule', index:0 } })
  const view = mount(Graph, model)
  const active = () => nodes(view.root,'path').filter(node => node.props.class?.includes('active'))
  const flowing = () => nodes(view.root,'path').filter(node => node.props.class === 'template-graph__flow')
  try {
    const viewport = walk(view.root, node => node.props.class === 'template-graph')[0]
    viewport.scrollTop = 125; viewport.scrollLeft = 90
    const rule = nodes(view.root,'button').find(node => node.props['data-node'] === 'rule-0')
    assert.equal(active().length, 2)
    assert.equal(flowing().length, 2)
    const input = nodes(view.root,'button').find(node => node.props['data-node'] === 'input-0')
    input.parent.props.onFocusin(); await flush(); assert.equal(active().length, 1)
    input.parent.props.onFocusout(); await flush(); assert.equal(active().length, 2)
    model.template = { ...model.template, name:'Renamed' }; await flush()
    assert.equal(nodes(view.root,'button').find(node => node.props['data-node'] === 'rule-0'), rule)
    assert.equal(viewport.scrollTop, 125); assert.equal(viewport.scrollLeft, 90)
    assert.equal(active().length, 2)
    model.selected = undefined; await flush(); assert.equal(flowing().length, 0)
    input.parent.props.onFocusin(); await flush(); assert.equal(active().length, 1); assert.equal(flowing().length, 0)
  } finally { view.close() }
})

test('同一配置聚合主辅输出，辅助值仍有独立详情与关闭回焦', async () => {
  defaults(); moduleRegistry.clear()
  const multi = { ...template, options: { presentation: { settings: { primaryOutput: 'duration' } } },
    outputs: [{ metricId: 'coverage', label: 'Coverage', unit: '%' }, { metricId: 'duration', label: 'Runtime', unit: 'min' }] }
  api.configTemplate = async () => multi
  api.latest = async ids => ids.map(configId => ({ configId, outputs: { duration: { ...value, metricId: 'duration', unit: 'min' }, coverage: { ...value, metricId: 'coverage', value: 90, unit: '%' } } }))
  const view = mount(Panel, { context: { ownerType: 'line', ownerId: 'a' } })
  try {
    await flush()
    const primary = nodes(view.root, 'button').filter(node => node.props.class?.includes('metric-panel__card'))
    const secondary = nodes(view.root, 'button').filter(node => node.props.class === 'metric-panel__secondary')
    assert.equal(primary.length, 1); assert.equal(secondary.length, 1)
    assert.equal(primary[0].props['aria-label'], 'Room')
    assert.ok(textContent(secondary[0]).includes('Coverage'))
    assert.ok(textContent(secondary[0]).includes('90'))
    await click(secondary[0])
    const drawer = nodes(view.root, 'external-shell').find(node => node.props.open)
    assert.equal(drawer.props.title, 'Room')
    drawer.props['onUpdate:open'](false); await flush()
    drawer.props.onAfterOpenChange(false)
    assert.deepEqual(secondary[0].focused, { preventScroll: true })
    api.latest = async () => { throw new Error('read timeout') }
    await click(nodes(view.root, 'a-button').find(node => node.props['aria-label'] === 'refresh'))
    const failedSecondary = nodes(view.root, 'button').find(node => node.props.class === 'metric-panel__secondary')
    assert.equal(failedSecondary.props.disabled, true)
    assert.ok(textContent(failedSecondary).includes('readFailed'))
    assert.equal(textContent(failedSecondary).includes('disabled'), false)
    assert.equal(textContent(failedSecondary).includes('90'), false, 'failed reads do not expose the previous value')
  } finally { view.close() }
})

test('附加输出复用状态语义与图标，保留完整名称、零值、布尔和日期',async()=>{
  defaults();moduleRegistry.clear()
  const at=new Date(2026,10,17,14,21,19).getTime()
  const multi={...template,options:{presentation:{settings:{primaryOutput:'duration'}}},
    definitions:[{id:'status',options:{stateLabels:[{value:4,name:'待观察',icon:'text:待观'}]}}],
    inputDefinitions:[{id:'stamp',valueType:{type:'date',format:'timestamp'}}],
    outputs:[{metricId:'duration',label:'Runtime',unit:'min'},{metricId:'status',label:'完整的附加状态结果名称',valueType:'int'},
      {metricId:'count',label:'次数',valueType:'long'},{metricId:'enabled',label:'成立',valueType:'boolean'},{metricId:'stamp',label:'通信时间',valueType:'date'}]}
  api.configTemplate=async()=>multi
  api.latest=async ids=>ids.map(configId=>({configId,outputs:Object.fromEntries([['duration',5],['status',4],['count',0],['enabled',false],['stamp',at]]
    .map(([metricId,value])=>[metricId,{metricId,value,status:'success',quality:{valid:true}}]))}))
  const view=mount(Panel,{context:{ownerType:'line',ownerId:'a'}})
  try {
    await flush()
    const secondary=nodes(view.root,'button').filter(node=>node.props.class==='metric-panel__secondary')
    assert.equal(secondary.length,2)
    assert.match(textContent(secondary[0]),/完整的附加状态结果名称.*待观察/)
    assert.equal(secondary[0].children.find(node=>node.type==='span').props.title,'完整的附加状态结果名称')
    assert.ok(walk(secondary[0],node=>node.type==='external-shell' && node.props.value==='text:待观').length)
    assert.match(textContent(secondary[1]),/次数0/)
    assert.equal(textContent(secondary[0]).includes('4'),false,'状态编码不代替名称')
  }finally{view.close()}
  const Value=load('components/Metric/MetricValue.vue').default
  for(const [metricId,value,text] of [['enabled',false,'conditionFalse'],['stamp',at,'2026-11-17 14:21:19']]) {
    const item=mount(Value,{template:multi,output:multi.outputs.find(output=>output.metricId===metricId),value:{metricId,value},inline:true})
    try{assert.ok(textContent(item.root).includes(text))}finally{item.close()}
  }
})

test('主要结果编辑保留已有显示扩展与数值精度', async () => {
  const changes = []
  const view = mount(DisplayFields, { modelValue: { decimals: 0, custom: false }, template: { ...template, outputs: [...template.outputs, { metricId: 'quality', label: 'Quality' }] },
    'onUpdate:modelValue': next => changes.push(next) })
  try {
    await flush()
    const select = nodes(view.root, 'a-select').find(node => node.props['aria-label'] === 'primaryOutput')
    assert.equal(select.props.value, 'value')
    select.props['onUpdate:value']('quality')
    assert.deepEqual(changes.at(-1), { decimals: 0, custom: false, primaryOutput: 'quality' })
  } finally { view.close() }
})

test('状态卡收敛为主结果与两项摘要，完整输出仍可在原详情切换并回焦', async () => {
  defaults(); moduleRegistry.clear()
  const outputs = ['state','one','two','three','four','five'].map(metricId => ({ metricId, label:metricId }))
  api.configTemplate = async () => ({ ...template, outputs, definitions:[{ id:'state', stateTracking:{} }], options:{ presentation:{ settings:{ summaryOutputs:['two','three'] } } } })
  const now = Date.now(), startTime = now - 15000
  const snapshot = { ...value, metricId:'state', value:2, evaluationTime:now - 5000, state:{ duration:10, currentInterval:{ id:'state-a', value:2, startTime, startKnown:true, observedUntil:startTime, validUntil:now + 60000 }, readView:{ time:now, duration:15 } } }
  api.latest = async ids => ids.map(configId => ({ configId, outputs:{ state:snapshot, ...Object.fromEntries(outputs.slice(1).map(output => [output.metricId, { ...value, metricId:output.metricId }])) } }))
  api.history = async () => [snapshot]
  const view = mount(Panel, { context:{ ownerType:'line', ownerId:'a' } })
  try {
    await flush()
    assert.equal(nodes(view.root, 'button').filter(node => node.props.class === 'metric-panel__secondary').length, 2)
    assert.equal(walk(view.root, node => node.props.class?.includes('interval-history__timeline')).length, 1)
    assert.equal(walk(view.root, node => node.props.class === 'interval-history__record').length, 0, 'card uses a timeline instead of repeated interval rows')
    const primary = nodes(view.root, 'button').find(node => node.props['aria-label'] === 'Room')
    await click(primary)
    const outputNav = nodes(view.root,'a-menu').find(node=>node.props['aria-label']==='allOutputs')
    assert.equal(nodes(outputNav, 'a-menu-item').length, outputs.length)
    outputNav.props.onClick({key:'five'}); await flush()
    const drawer = nodes(view.root, 'external-shell').find(node => node.props.open)
    assert.equal(drawer.props.title, 'Room')
    drawer.props['onUpdate:open'](false); await flush(); drawer.props.onAfterOpenChange(false)
    assert.deepEqual(primary.focused, { preventScroll:true })
  } finally { view.close(); moduleRegistry.clear() }
})

test('摘要编辑支持两项约束、主动留空和继承，保留其他展示设置', async () => {
  const changes = []
  const model = reactive({ modelValue:{ decimals:0, custom:false }, defaults:{ summaryOutputs:['one','two'] }, template:{ ...template, outputs:['main','one','two','three'].map(metricId => ({ metricId, label:metricId })) },
    'onUpdate:modelValue':next => { changes.push(next); model.modelValue = next } })
  const view = mount(DisplayFields, model)
  try {
    await flush()
    const select = () => nodes(view.root, 'a-select').find(node => node.props['aria-label'] === 'summaryOutputs')
    assert.deepEqual(select().props.value, ['one','two'])
    assert.equal(select().props.options.find(option => option.value === 'three').disabled, true)
    select().props['onUpdate:value'](['three']); await flush()
    assert.deepEqual(changes.at(-1), { decimals:0, custom:false, summaryOutputs:['three'] })
    select().props['onUpdate:value']([]); await flush()
    assert.deepEqual(select().props.value, [])
    await click(findText(view.root, 'a-button', 'inheritDisplay'))
    assert.deepEqual(select().props.value, ['one','two'])
  } finally { view.close() }
})

test('真实Workspace等待授权对象、导航失败清理、同ID重试重建来源scope；业务菜单缺席隐藏跳转', async () => {
  defaults(); moduleRegistry.clear()
  const navigators = new Map(); let sourceMounts = 0; let sourceCloses = 0; let queries = 0; let business = false
  api.byOwner = async () => { queries++; return [] }
  const provider = ownerType => ({ ownerType, label: ownerType,
    navigator: defineComponent({ props: ['selectedId'], setup: (_p, { emit }) => { navigators.set(ownerType, object => emit('select', object)); return () => h('navigator') } }),
    useSourcePicker: context => { sourceMounts++; onUnmounted(() => sourceCloses++); return { pickSource: async () => undefined, host: () => h('source-host', context.value.ownerId) } },
    canEdit: () => false, toBusiness: object => business ? { name: 'line-detail', params: { id: object.ownerId } } : undefined,
  })
  moduleRegistry.register('line-module', { metricDimensions: { line: provider('line'), area: provider('area') } })
  const props = reactive({ scopeKey: 'user/project/tenant', selection: { ownerType: 'line', ownerId: 'a' }, editable: true, onToBusiness: route => routes.push(route) })
  const routes = []
  const view = mount(Workspace, props)
  try {
    await flush(); assert.equal(queries, 0)
    navigators.get('line')({ ownerId: 'a', label: 'Line A' }); await flush()
    assert.equal(queries, 1); assert.equal(sourceMounts, 1)
    assert.equal(findText(view.root, 'a-button', 'openBusiness'), undefined)
    const select = nodes(view.root, 'a-select')[0]
    select.props['onUpdate:value']('area'); await flush()
    assert.equal(sourceCloses, 1)
    navigators.get('area')(undefined); await flush(); assert.equal(queries, 1)
    navigators.get('area')({ ownerId: 'a', label: 'Area A' }); await flush()
    assert.equal(queries, 2); assert.equal(sourceMounts, 2)
    business = true
    navigators.get('area')({ ownerId: 'a', label: 'Area confirmed' }); await flush()
    await click(findText(view.root, 'a-button', 'openBusiness'))
    assert.deepEqual(routes, [{ name: 'line-detail', params: { id: 'a' } }])
    moduleRegistry.unregister('line-module'); await flush()
    assert.equal(nodes(view.root, 'source-host').length, 0)
    assert.equal(sourceCloses, 2)
  } finally { view.close(); moduleRegistry.clear() }
})

test('工作区只装配一个导航；窄屏保留关闭抽屉内的授权确认，撤权销毁导航与来源',async()=>{
  defaults();moduleRegistry.clear()
  const allowed=ref(true)
  let mounted=0,closed=0,sourceClosed=0,confirm
  workspaceWidth.value=0
  moduleRegistry.register('objects',{metricDimensions:{line:{ownerType:'line',label:'Line',available:()=>allowed.value,
    navigator:defineComponent({setup:(_props,{emit})=>{mounted++;confirm=(object,origin)=>emit('select',object,origin);onUnmounted(()=>closed++);return()=>h('navigator')}}),
    useSourcePicker:()=>{onUnmounted(()=>sourceClosed++);return{pickSource:async()=>undefined}},
  }}})
  const view=mount(Workspace,{scopeKey:'narrow/project',selection:{ownerType:'line',ownerId:'a'}})
  try{
    await flush();assert.equal(mounted,0)
    workspaceWidth.value=700;await flush()
    assert.equal(mounted,1);assert.equal(nodes(view.root,'navigator').length,1)
    assert.equal(nodes(view.root,'a-drawer')[0].props.open,false)
    confirm({ownerId:'a',label:'Line A'});await flush()
    assert.ok(textContent(view.root).includes('Line A'))
    await click(findText(view.root,'a-button','selectObject'))
    assert.equal(nodes(view.root,'a-drawer')[0].props.open,true)
    confirm({ownerId:'a',label:'Line A'},'validation');await flush()
    assert.equal(nodes(view.root,'a-drawer')[0].props.open,true)
    confirm({ownerId:'a',label:'Line A'});await flush()
    assert.equal(nodes(view.root,'a-drawer')[0].props.open,false)
    workspaceWidth.value=1200;await flush()
    assert.equal(nodes(view.root,'navigator').length,1);assert.equal(mounted-closed,1)
    allowed.value=false;await flush()
    assert.equal(nodes(view.root,'navigator').length,0);assert.equal(mounted,closed)
    assert.equal(sourceClosed,1)
    assert.equal(textContent(view.root).includes('Line A'),false)
  }finally{view.close();workspaceWidth.value=1200;moduleRegistry.clear()}
})

test('窄屏聚合、成员和本级视图始终可切换对象，宽窄往返保留选择且不重复入口',async()=>{
  defaults();moduleRegistry.clear();workspaceWidth.value=700
  const navigators=new Map()
  let aggregateRead
  const ready=new Promise(resolve=>{aggregateRead=resolve})
  const groups=[{id:'score',cardId:'t',templateId:'t',templateName:'Communication',version:'1',revision:1,
    output:{metricId:'score',label:'Score',valueType:'double'},operations:['average'],defaultOperation:'average',
    latest:{time:1,valid:1,observed:1,sum:20,distribution:{}},points:[]}]
  api.collection=async()=>({readTime:1,visibleMembers:1,total:1,groups,data:[]})
  api.aggregate=async()=>{aggregateRead();return{readTime:1,from:0,to:3000,interval:1000,groups}}
  const provider=ownerType=>({ownerType,label:ownerType,
    readScopes:()=>[{memberType:'device',label:'Members',icon:'DesktopOutlined'}],
    navigator:defineComponent({props:['selectedId'],setup:(props,{emit})=>{
      navigators.set(ownerType,object=>emit('select',object));return()=>h('navigator',{selectedId:props.selectedId})
    }}),useSourcePicker:()=>({pickSource:async()=>undefined})})
  moduleRegistry.register('scope-navigation',{metricDimensions:{line:provider('line'),area:provider('area')}})
  const view=mount(Workspace,{scopeKey:'scope-navigation',selection:{ownerType:'line',ownerId:'a'}})
  async function openNavigation(){
    assert.equal(nodes(view.root,'h3').filter(node=>textContent(node)==='Line A').length,1,'shared heading appears once in every view')
    const triggers=nodes(view.root,'a-button').filter(node=>node.props['aria-label']==='selectObject')
    assert.equal(triggers.length,1)
    assert.equal(triggers[0].parent.props.class,'metric-workspace__object-heading')
    assert.equal(textContent(triggers[0].parent),'Line A')
    assert.equal(triggers[0].props['aria-expanded'],false)
    await click(triggers[0]);assert.equal(nodes(view.root,'a-drawer')[0].props.open,true)
    assert.equal(triggers[0].props['aria-expanded'],true)
    nodes(view.root,'a-drawer')[0].props.onClose();await flush()
  }
  try{
    await flush();navigators.get('line')({ownerId:'a',label:'Line A'});await flush()
    assert.equal(findText(view.root,'a-button','viewCurrent'),undefined,'results are the initial task')
    await openNavigation();nodes(view.root,'a-tabs').find(node=>node.props.class==='metric-scope-panel__tabs').props.onChange('overview');await ready;await flush()
    assert.ok(findText(view.root,'a-button','viewCurrent'));await openNavigation()
    nodes(view.root,'a-tabs').find(node=>node.props.class==='metric-scope-panel__tabs').props.onChange('metrics');await flush();await openNavigation()
    nodes(view.root,'a-tabs').find(node=>node.props.class==='metric-scope-panel__tabs').props.onChange('overview');await flush()
    await click(findText(view.root,'a-button','viewCurrent'));await openNavigation()
    assert.ok(findText(view.root,'a-button','backOverview'))
    workspaceWidth.value=1200;await flush()
    assert.equal(findText(view.root,'a-button','selectObject'),undefined)
    assert.equal(nodes(view.root,'navigator')[0].props.selectedId,'a')
    workspaceWidth.value=700;await flush();await openNavigation()
    assert.equal(nodes(view.root,'navigator')[0].props.selectedId,'a')
    await click(findText(view.root,'a-button','selectObject'))
    nodes(view.root,'a-select').find(node=>node.props['aria-label']==='chooseDimension').props['onUpdate:value']('area');await flush()
    assert.equal(nodes(view.root,'a-drawer')[0].props.open,true)
    navigators.get('area')({ownerId:'b',label:'Area B'});await flush()
    assert.equal(nodes(view.root,'a-drawer')[0].props.open,false)
    assert.equal(nodes(view.root,'navigator')[0].props.selectedId,'b')
    assert.equal(nodes(view.root,'h3').filter(node=>textContent(node)==='Area B').length,1)
  }finally{view.close();workspaceWidth.value=1200;moduleRegistry.clear()}
})

test('模板筛选空集不显示空库引导，编辑后返回保留分类和搜索且不重新加载目录',async()=>{
  defaults();let reads=0
  api.templateCategories=async()=>[{value:'energy',label:'Energy'},{value:'health',label:'Health'}]
  api.queryTemplates=async()=>{reads++;return{data:[
    {id:'power',released:false,template:{...template,options:{category:'energy'}}},
    {id:'runtime',released:false,template:{...template,id:'runtime',name:'Runtime',options:{category:'health'}}},
  ],total:2}}
  const view=mount(Manager,{editable:true})
  const cards=()=>nodes(view.root,'button').filter(node=>node.props.class==='template-catalog__item')
  try{
    await flush();assert.equal(cards().length,2)
    await click(findText(view.root,'button','Health'));assert.equal(cards().length,1)
    const filter=nodes(view.root,'condition-filter')[0]
    filter.props['onUpdate:modelValue']([{column:'category',termType:'eq',value:'health'},{column:'name',termType:'like',value:'missing'}]);await flush()
    assert.equal(cards().length,0)
    assert.ok(nodes(view.root,'a-empty').some(node=>node.props.description==='noMatchingTemplates'))
    assert.equal(textContent(view.root).includes('startWithScenario'),false)
    await click(findText(view.root,'a-button','clearFilters'));assert.equal(cards().length,2)
    await click(findText(view.root,'button','Health'))
    await click(cards()[0]);assert.equal(nodes(view.root,'a-drawer')[0].props.open,true)
    await click(findText(view.root,'a-button','close'))
    assert.equal(nodes(view.root,'a-drawer')[0].props.open,false)
    assert.equal(cards().length,1);assert.ok(textContent(cards()[0]).includes('Runtime'));assert.equal(reads,1)
  }finally{view.close()}
})

test('真实Panel组合模块卡片和详情；共享单位质量时间保留；卸载/渲染失败回退并可删除跳转', async () => {
  defaults(); moduleRegistry.clear(); let histories = 0; let failedDelete = true
  api.history = async () => { histories++; return [value] }
  api.removeConfig = async () => { if (failedDelete) throw new Error('Referenced'); api.byOwner = async () => [] }
  const card = defineComponent({ props: ['settings'], setup: props => () => h('custom-card', `custom:${props.settings.decimals}:${props.settings.warning}`) })
  const detail = defineComponent({ props: ['values'], setup: props => () => h('custom-detail', `points:${props.values.length}`) })
  moduleRegistry.register('line', { metricPresentations: { status: { label: 'Status', card, detail } } })
  const jumps = []
  const view = mount(Panel, { context: { ownerType: 'line', ownerId: 'a', editable: true }, detailLinkLabel: 'openWorkspace',
    onOpenDetailLink: reference => jumps.push(reference) })
  try {
    await flush(); assert.equal(textContent(nodes(view.root, 'custom-card')[0]), 'custom:0:false')
    assert.ok(textContent(view.root).includes('kW')); assert.ok(nodes(view.root, 'a-tooltip').some(node => node.props.title?.includes('sourceTimeHint') && node.props.title.includes('valid'))); assert.ok(textContent(view.root).includes('sourceTime'))
    assert.equal(histories, 1, 'visible overview loads one shared history')
    await click(nodes(view.root, 'button').find(node => node.props.class?.includes('metric-panel__card')))
    assert.equal(textContent(nodes(view.root, 'custom-detail')[0]), 'points:1'); assert.equal(histories, 1)
    await click(findText(view.root, 'a-button', 'openWorkspace')); assert.equal(jumps[0].configId, 'c')
    assert.equal(findText(view.root, 'a-button', 'createAlarm'), undefined)
    await click(findText(view.root, 'a-menu-item', 'deleteMetric')); assert.equal(confirmations.at(-1).content,'deleteInheritanceHint'); await assert.rejects(confirmations.at(-1).onOk()); await flush()
    assert.ok(nodes(view.root, 'a-alert').some(node => node.props.description === 'Referenced'))
    assert.equal(nodes(view.root, 'custom-detail').length, 1)
    moduleRegistry.unregister('line'); await flush()
    assert.equal(nodes(view.root, 'custom-card').length, 0); assert.equal(nodes(view.root, 'custom-detail').length, 0)
    assert.ok(textContent(view.root).includes('6'))
    moduleRegistry.register('line', { metricPresentations: { status: { label: 'Broken', card: { render() { throw new Error('renderer failure') } } } } }); await flush()
    assert.ok(nodes(view.root, 'a-alert').some(node => node.props.message === 'presentationFailed'))
    failedDelete = false
    await click(findText(view.root, 'a-menu-item', 'deleteMetric')); await confirmations.at(-1).onOk(); await flush()
    assert.equal(nodes(view.root, 'button').filter(node => node.props.class?.includes('metric-panel__card')).length, 0)
  } finally { view.close(); moduleRegistry.clear() }
})

test('真实Editor专用表单只改绑定和可编辑参数；显示覆盖单独保存且缺模块/渲染错误禁止保存', async () => {
  defaults(); moduleRegistry.clear(); let change; let stored; let savedEvents = 0
  const fields = defineComponent({ props: ['draft'], emits: ['change'], setup: (_props, { emit }) => { change = patch => emit('change', patch); return () => h('custom-config') } })
  moduleRegistry.register('line', { metricPresentations: { status: { label: 'Status', configFields: fields } } })
  api.saveConfig = async next => { stored = next; return { ...next, revision: 3 } }
  const view = mount(Editor, { context: { ownerType: 'line', ownerId: 'a', editable: true }, configuration: config, onSaved: () => savedEvents++ })
  try {
    await flush(); assert.equal(nodes(view.root, 'custom-config').length, 1)
    change({ parameters: { factor: 0, forbidden: 99 }, revision: 99, state: 'disabled', presentation: { unknown: 0 } }); await flush()
    moduleRegistry.unregister('line'); await flush()
    await click(findText(view.root, 'a-button', 'saveDisable')); assert.equal(stored, undefined)
    moduleRegistry.register('line', { metricPresentations: { status: { label: 'Status' } } }); await flush()
    await click(findText(view.root, 'a-button', 'saveDisable'))
    assert.deepEqual(stored.parameters, { factor: 0 }); assert.equal(stored.revision, 2)
    assert.deepEqual(stored.presentation, config.presentation); assert.equal(savedEvents, 1)
  } finally { view.close(); moduleRegistry.clear() }
})

test('配置空白区返回指标设置并取消来源选择，试算及定位都打开计算关系',async()=>{
  defaults();moduleRegistry.clear();let cancelled=0
  api.configTemplate=async()=>({...template,inputDefinitions:[{id:'reading',name:'Reading',valueType:{type:'double'}}],options:{}})
  const picker=Object.assign(()=>new Promise(()=>{}),{cancel:()=>cancelled++,editor:defineComponent({setup:()=>()=>h('source-picker')})})
  const view=mount(Editor,{context:{ownerType:'line',ownerId:'a',editable:true},configuration:{...config,inputMappings:{}},pickSource:picker})
  try{
    await flush()
    const subject=()=>walk(view.root,node=>node.props.class==='config-properties__subject')
    const main=nodes(view.root,'main').find(node=>node.props.class==='config-diagram')
    const binding=walk(view.root,node=>String(node.props.class).includes('config-bindings__row'))[0]
    await click(nodes(binding,'button')[1]);assert.equal(nodes(view.root,'source-picker').length,1)
    main.props.onClick({target:main,currentTarget:main});await flush()
    assert.equal(nodes(view.root,'source-picker').length,0);assert.equal(subject().length,1);assert.equal(cancelled,1)
    await click(findText(view.root,'a-button','simulate'))
    assert.equal(findText(view.root,'button','bindingGraph').props['aria-pressed'],true)
    await click(findText(view.root,'button','bindingList'))
    const viewport=walk(view.root,node=>String(node.props.class).split(' ').includes('template-graph'))[0]
    viewport.getBoundingClientRect=()=>({left:0,top:0,width:600,height:400})
    viewport.scrollBy=()=>{}
    const graphNode=walk(viewport,node=>node.props['data-node']==='input-0')[0]
    graphNode.getBoundingClientRect=()=>({left:20,top:20,width:160,height:60})
    viewport.querySelector=()=>graphNode
    await click(findText(view.root,'button','configMissingSources'))
    assert.equal(findText(view.root,'button','bindingGraph').props['aria-pressed'],true)
  }finally{view.close()}
})

test('真实Editor恢复参数默认值后保存不携带覆盖，继续跟随绑定模板', async () => {
  defaults(); moduleRegistry.clear(); let stored
  api.getConfig = async () => ({ ...config, parameters:{ factor:0 }, presentation:{} })
  api.configTemplate = async () => ({ ...template, options:{} })
  api.saveConfig = async next => { stored = next; return { ...next, revision:3 } }
  const view = mount(Editor, { context:{ ownerType:'line', ownerId:'a', editable:true }, configuration:{ ...config, parameters:{ factor:0 }, presentation:{} } })
  try {
    await flush()
    const parameter = walk(view.root, node => node.props['data-parameter'] === 'factor')[0]
    assert.ok(parameter)
    assert.ok(textContent(parameter).includes('parameterOverridden'))
    await click(findText(parameter, 'a-button', 'parameterRestoreDefault'))
    assert.ok(textContent(view.root).includes('parameterFollowing'))
    await click(findText(view.root, 'a-button', 'saveDisable'))
    assert.deepEqual(stored.parameters, {})
    assert.equal(config.parameters.factor, undefined)
  } finally { view.close(); moduleRegistry.clear() }
})

test('对象切换卸载旧编辑器后，迟到保存事件不能关闭新对象的编辑抽屉或追加刷新', async () => {
  defaults(); moduleRegistry.clear()
  const props = reactive({ context: { ownerType: 'line', ownerId: 'a', editable: true } })
  let reads = 0, completeSave
  api.byOwner = async (_type, ownerId) => { reads++; return [{ ...config, id: `config-${ownerId}`, ownerId, targetId: ownerId }] }
  api.configTemplate = async () => ({ ...template, options: {} })
  api.selectable = async () => [{ id: 't', name: 'Power', available: true, released: true, template: { ...template, options: {} } }]
  api.saveConfig = next => new Promise(resolve => { completeSave = () => resolve({ ...next, revision: next.revision + 1 }) })
  const view = mount(Panel, props)
  const openEditor = async () => {
    await click(nodes(view.root, 'button').find(node => node.props.class?.includes('metric-panel__card')))
    await click(findText(view.root, 'a-menu-item', 'edit'))
  }
  try {
    await flush()
    await openEditor()
    const saving = findText(view.root, 'a-button', 'saveDisable').props.onClick()
    assert.equal(typeof completeSave, 'function')
    props.context = { ...props.context, ownerId: 'b' }
    await flush()
    await openEditor()
    const readCount = reads
    completeSave()
    await saving
    await flush()
    assert.ok(findText(view.root, 'a-button', 'saveDisable'))
    assert.equal(reads, readCount)
  } finally { view.close(); moduleRegistry.clear() }
})

test('真实显示设置继承删除覆盖且保留未知字段；模板草稿删除确认失败可重试', async () => {
  defaults(); moduleRegistry.clear()
  const props = reactive({ modelValue: { decimals: 0, unknown: false }, defaults: { decimals: 2 }, 'onUpdate:modelValue': value => { props.modelValue = value } })
  const fields = mount(DisplayFields, props)
  try {
    await click(findText(fields.root, 'a-button', 'inheritDisplay')); assert.deepEqual(props.modelValue, { unknown: false })
    const input = nodes(fields.root, 'a-input-number')[0]
    input.props['onUpdate:value'](0); await flush(); assert.deepEqual(props.modelValue, { unknown: false, decimals: 0 })
    input.props['onUpdate:value'](9); await flush(); assert.equal(props.modelValue.decimals, 0)
  } finally { fields.close() }
  let fail = true; let removals = 0
  const entity = { id: 'draft', name: 'Power', released: false, available: false, template: { ...template, options: {} } }
  api.queryTemplates = async () => ({ data: [entity], total: 1 })
  api.removeTemplate = async () => { removals++; if (fail) throw new Error('Referenced template') }
  const manager = mount(Manager, { editable: true })
  try {
    await flush(); await click(findText(manager.root, 'button', 'Power'))
    assert.ok(findText(manager.root, 'a-popconfirm', 'deleteDraft'))
    await findText(manager.root, 'a-popconfirm', 'deleteDraft').props.onConfirm(); await flush()
    assert.ok(nodes(manager.root, 'a-alert').some(node => node.props.description === 'Referenced template'))
    fail = false
    await findText(manager.root, 'a-popconfirm', 'deleteDraft').props.onConfirm(); await flush()
    assert.equal(removals, 2); assert.equal(findText(manager.root, 'a-popconfirm', 'deleteDraft'), undefined)
  } finally { manager.close() }
})

test('真实Workspace抽屉动作返回第二配置引用；关闭后页头无引用，撤权及owner切换无旧动作', async () => {
  defaults(); moduleRegistry.clear()
  let confirm; let allowed = true
  const second = { ...config, id: 'second', name: 'Second configuration', slot: 'second' }
  api.byOwner = async (_type, id) => id === 'a' ? [config, second] : []
  api.getConfig = async id => id === 'second' ? second : config
  api.latest = async ids => ids.filter(id => allowed || id !== 'second').map(configId => ({ configId, outputs: { value } }))
  moduleRegistry.register('line-module', { metricDimensions: { line: { ownerType: 'line', label: 'Line',
    navigator: defineComponent({ setup: (_p, { emit }) => { confirm = object => emit('select', object); return () => h('navigator') } }),
    useSourcePicker: () => ({ pickSource: async () => undefined }), toBusiness: object => ({ name: 'detail', params: { id: object.ownerId } }),
  } } })
  const returned = []
  const view = mount(Workspace, { scopeKey: 'user/project/tenant', selection: { ownerType: 'line', ownerId: 'a' }, initialReference: { configId: 'c', outputId: 'value' },
    onToBusiness: (route, reference) => returned.push({ route, reference }) })
  try {
    await flush(); confirm({ ownerId: 'a', label: 'Line A' }); await flush()
    const drawer = () => nodes(view.root, 'external-shell').find(node => node.props.open)
    await click(findText(drawer(), 'a-button', 'openBusiness'))
    assert.equal(returned.at(-1).reference.configId, 'c')
    const cards = () => nodes(view.root, 'button').filter(node => node.props.class?.includes('metric-panel__card'))
    await click(cards()[1]); await click(findText(drawer(), 'a-button', 'openBusiness'))
    assert.equal(returned.at(-1).reference.configId, 'second')
    nodes(view.root, 'external-shell').find(node => node.props.open).props['onUpdate:open'](false); await flush()
    await click(findText(view.root, 'a-button', 'openBusiness')); assert.equal(returned.at(-1).reference, undefined)
    await click(cards()[1]); allowed = false
    await click(findText(view.root, 'a-button', 'refresh'))
    assert.equal(drawer(), undefined)
    await click(findText(view.root, 'a-button', 'openBusiness')); assert.equal(returned.at(-1).reference, undefined)
    allowed = true; await click(findText(view.root, 'a-button', 'refresh')); await click(cards()[0])
    confirm({ ownerId: 'b', label: 'Line B' }); await flush(); assert.equal(drawer(), undefined)
    await click(findText(view.root, 'a-button', 'openBusiness')); assert.equal(returned.at(-1).reference, undefined)
  } finally { view.close(); moduleRegistry.clear() }
})

test('真实专用配置组件渲染失败保持草稿并阻止保存；provider替换恢复', async () => {
  defaults(); moduleRegistry.clear(); let saves = 0
  api.saveConfig = async next => { saves++; return next }
  moduleRegistry.register('line', { metricPresentations: { status: { label: 'Broken', configFields: { render() { throw new Error('fields crashed') } } } } })
  const view = mount(Editor, { context: { ownerType: 'line', ownerId: 'a', editable: true }, configuration: config })
  try {
    await flush(); assert.ok(nodes(view.root, 'a-alert').some(node => node.props.message === 'presentationFailed'))
    await click(findText(view.root, 'a-button', 'saveDisable')); assert.equal(saves, 0)
    moduleRegistry.register('line', { metricPresentations: { status: { label: 'Recovered' } } }, { override: true }); await flush()
    await click(findText(view.root, 'a-button', 'saveDisable')); assert.equal(saves, 1)
  } finally { view.close(); moduleRegistry.clear() }
})

test('专用展示设置组件同一路径更新展示覆盖；默认精度继承不修改未知值', async () => {
  let update; let failures = 0
  const provider = { label: 'Custom', presentationFields: defineComponent({ props: ['modelValue','defaults','disabled'], emits: ['update:modelValue'], setup: (props, { emit }) => { update = value => emit('update:modelValue', value); return () => h('custom-display', String(props.defaults.decimals)) } }) }
  const props = reactive({ modelValue: { decimals: 0, unknown: false }, defaults: { decimals: 2 }, disabled: false, provider, 'onUpdate:modelValue': value => { props.modelValue = value }, onFailed: () => failures++ })
  const view = mount(DisplayFields, props)
  try {
    await flush(); assert.equal(textContent(nodes(view.root, 'custom-display')[0]), '2')
    update({ ...props.modelValue, warning: false }); await flush(); assert.equal(props.modelValue.warning, false)
    props.disabled = true; await flush(); update({ decimals: 8 }); await flush(); assert.equal(props.modelValue.decimals, 0)
    props.provider = { label: 'Broken', presentationFields: { render() { throw new Error('display form failed') } } }; await flush()
    assert.equal(failures, 1)
  } finally { view.close() }
})

test('模板卡片打开全屏编辑，关闭保护草稿且保留首页容器，保存中阻止关闭', async () => {
  defaults()
  const entity = { id:'draft', name:'Power', released:false, available:false, template }
  let writes = 0, finishSave
  api.queryTemplates = async () => ({ data:[entity], total:1 })
  api.saveTemplate = next => { writes++; return new Promise(resolve=>{ finishSave=()=>resolve({ ...entity, template:next }) }) }
  const view = mount(Manager, { editable:true })
  const drawer = () => nodes(view.root,'a-drawer')[0]
  const gallery = () => nodes(view.root,'div').find(node=>node.props.class==='metric-template-manager__gallery')
  const close = () => nodes(view.root,'a-button').find(node=>node.props['aria-label']==='close')
  try {
    await flush()
    const original = gallery()
    assert.equal(drawer().props.open,false)
    assert.equal(nodes(view.root,'nav').length,1)
    await click(findText(original,'button','Power'))
    assert.equal(drawer().props.width,'100%')
    assert.equal(drawer().props.open,true)
    assert.equal(writes,0)
    const identity = nodes(view.root,'external-shell').find(node=>node.props.field==='name')
    identity.props.onChange({ value:'Energy', i18nMessages:{} }); await flush()
    const rejected = close().props.onClick(); await flush()
    confirmations.at(-1).onCancel(); await rejected; await flush()
    assert.equal(drawer().props.open,true)
    const saving = findText(view.root,'a-button','save').props.onClick(); await flush()
    assert.equal(close().props.disabled,true)
    await close().props.onClick(); assert.equal(drawer().props.open,true)
    finishSave(); await saving; await flush()
    await click(close())
    assert.equal(drawer().props.open,false)
    assert.equal(gallery(),original)
    await click(findText(original,'button','Power'))
    nodes(view.root,'external-shell').find(node=>node.props.field==='name').props.onChange({ value:'Discard', i18nMessages:{} }); await flush()
    const accepted = close().props.onClick(); await flush()
    confirmations.at(-1).onOk(); await accepted; await flush()
    assert.equal(drawer().props.open,false)
    assert.equal(writes,1)
    assert.equal(template.name,'Power')
  } finally { view.close() }
})

test('已有模板时首页只展示模板，空库才显示场景创建引导，只读保留空态', async () => {
  defaults()
  const starter = { id:'s', groupId:'energy', group:'Energy', template:{ ...template, name:'Starter' } }
  const props = reactive({ editable:true, starters:[starter] })
  const view = mount(Manager,props)
  const gallery = () => nodes(view.root,'div').find(node=>node.props.class==='metric-template-manager__gallery')
  try {
    await flush()
    assert.ok(textContent(gallery()).includes('startWithScenario'))
    api.queryTemplates = async () => ({ data:[{ id:'t',template,released:false }], total:1 })
    await click(nodes(view.root,'a-button').find(node=>node.props['aria-label']==='refresh'))
    assert.equal(textContent(gallery()).includes('startWithScenario'),false)
    assert.equal(textContent(gallery()).includes('Starter'),false)
    api.queryTemplates = async () => ({ data:[],total:0 })
    props.editable=false
    await click(nodes(view.root,'a-button').find(node=>node.props['aria-label']==='refresh'))
    assert.equal(nodes(gallery(),'a-empty').length,1)
    assert.equal(nodes(gallery(),'button').length,0)
    assert.equal(nodes(view.root,'a-button').some(node=>node.props['aria-label']==='newTemplate'),false)
  } finally { view.close() }
})

test('空白新建直接选中输入，单一添加菜单随能力变化，修改模板身份不重复初始化',async()=>{
  defaults();moduleRegistry.clear();api.queryTemplates=async()=>({data:[],total:0})
  const view=mount(Manager,{editable:true})
  const input=()=>nodes(view.root,'button').find(node=>node.props['data-node']==='input-0')
  const toolbar=()=>nodes(view.root,'a-button').filter(node=>node.props['aria-label']==='canvasAdd')
  const menu=()=>toolbar()[0].parent
  try {
    await flush();await click(findText(view.root,'a-button','newTemplate'))
    assert.equal(input().props['aria-pressed'],true)
    assert.equal(toolbar().length,1)
    assert.equal(nodes(view.root,'button').filter(node=>node.props['data-add-root']).length,0)
    assert.equal(textContent(view.root).includes('unsavedChanges'),false)
    assert.equal(nodes(view.root,'span').some(node=>node.props.class==='template-designer__counts'),false)
    nodes(view.root,'external-shell').find(node=>node.props.class==='template-identity__id').props['onUpdate:value']('fresh-template');await flush()
    assert.equal(nodes(view.root,'button').filter(node=>node.props['data-node']?.startsWith('input-')).length,1)
    assert.equal(input().props['aria-pressed'],false)
    const rootMenu=nodes(menu(),'a-menu')[0]
    assert.deepEqual(nodes(rootMenu,'a-menu-item').map(textContent),['addInput','addCalculation'])
    rootMenu.props.onClick({key:'output'});await flush();assert.equal(nodes(view.root,'button').some(node=>node.props['data-node']==='output-0'),false)
    rootMenu.props.onClick({key:'rule'});await flush()
    assert.ok(nodes(view.root,'a-menu-item').some(node=>textContent(node)==='addOutput'))
    assert.equal(nodes(view.root,'button').find(node=>node.props['data-node']==='rule-0').props['aria-pressed'],true)
  } finally {view.close();moduleRegistry.clear()}
})

test('创建参考只展示可选发布模板，复制发布快照为新草稿并保留完整参数',async()=>{
  defaults()
  const published={id:'reference',released:true,available:true,revision:3,template:{...template,name:'Published reference'},draft:{...template,name:'Pending draft'}}
  api.queryTemplates=async()=>({data:[published,{id:'unreleased',released:false,available:true,template:{...template,name:'Unreleased'}},{id:'unavailable',released:true,available:false,template:{...template,name:'Unavailable'}}]})
  let saved
  api.saveTemplate=async value=>{saved=value;return {id:'new-reference',template:value,released:false,editRevision:1}}
  const view=mount(Manager,{editable:true})
  try {
    await flush();await click(findText(view.root,'a-button','newTemplate'))
    const cards=()=>nodes(view.root,'button').filter(node=>node.props.class==='template-catalog__item')
    assert.equal(cards().filter(node=>node.props['aria-label']==='Unreleased').length,1,'unreleased exists only in the management gallery')
    assert.equal(cards().filter(node=>node.props['aria-label']==='Published reference').length,2,'published reference is also offered during creation')
    await click(cards().filter(node=>node.props['aria-label']==='Published reference').at(-1))
    await click(findText(view.root,'a-button','save'))
    assert.notEqual(saved.id,template.id)
    assert.equal(saved.name,'Published reference')
    assert.deepEqual(saved.parameterDefinitions,template.parameterDefinitions)
    assert.equal(saved.options.authoring.reference.revision,3)
    assert.equal(published.draft.name,'Pending draft')
  } finally {view.close()}
})

test('真实模板编辑器选择展示提供者及默认值，表单和完整配置保存同一DTO', async () => {
  defaults(); moduleRegistry.clear()
  const entity = { id: 'draft', name: 'Power', released: false, available: false, template: { ...template, options: { keep: 9, presentation: { settings: { unknown: false } } } } }
  let stored; let settingsChanged
  moduleRegistry.register('line', { metricPresentations: { status: { label: () => 'Status', presentationFields: defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (props, { emit }) => { settingsChanged = value => emit('update:modelValue', value); return () => h('custom-template-settings', JSON.stringify(props.modelValue)) } }) } } })
  api.queryTemplates = async () => ({ data: [entity], total: 1 })
  api.saveTemplate = async next => { stored = next; return { ...entity, template: next } }
  const view = mount(Manager, { editable: true })
  try {
    await flush(); await click(findText(view.root, 'button', 'Power'))
    const decimals = nodes(view.root, 'a-input-number').find(node => node.props.max === 8)
    decimals.props['onUpdate:value'](0); await flush()
    const selection = nodes(view.root, 'a-select').find(node => node.props.value === 'builtin/default')
    assert.ok(selection); selection.props['onUpdate:value']('line/status'); await flush()
    settingsChanged({ decimals: 0, unknown: false, warning: false }); await flush()
    await click(findText(view.root, 'a-button', 'save')); assert.equal(stored.options.keep, 9)
    assert.deepEqual(stored.options.presentation, { provider: 'line/status', settings: { decimals: 0, unknown: false, warning: false } })
    await click(findText(view.root, 'a-button', 'fullMode'))
    await click(findText(view.root, 'a-button', 'save')); assert.equal(stored.options.presentation.settings.warning, false)
    await click(findText(view.root, 'a-button', 'visualMode'))
    moduleRegistry.unregister('line'); await flush()
    assert.ok(nodes(view.root, 'a-alert').some(node => node.props.message === 'presentationMissing'))
    assert.equal(nodes(view.root, 'custom-template-settings').length, 0)
  } finally { view.close(); moduleRegistry.clear() }
})

test('来源适配器装载失败显示错误且以只读面板保留查看能力', async () => {
  defaults(); api.byOwner = async () => []
  const Scope = load('components/Metric/workspace/MetricWorkspaceScope.vue').default
  const view = mount(Scope, { context: { ownerType: 'line', ownerId: 'a', editable: true }, provider: { ownerType: 'line', label: 'Line', navigator: {}, useSourcePicker() { throw new Error('Source adapter missing') } } })
  try {
    await flush(); assert.ok(nodes(view.root, 'a-alert').some(node => node.props.description === 'Source adapter missing'))
    assert.equal(findText(view.root, 'a-button', 'add'), undefined)
  } finally { view.close() }
})

test('模板名称标识版本收进顶部原位编辑，完整配置与只读不暴露双写入口', async () => {
  defaults()
  const entity = { id: 't', name: 'Power', released: false, available: false, template }
  api.queryTemplates = async () => ({ data: [entity], total: 1 })
  let stored
  api.saveTemplate = async next => { stored = next; return { ...entity, name: next.name, template: next } }
  const props = reactive({ editable: true }); const view = mount(Manager, props)
  const header = () => walk(view.root, node => node.type === 'header' && node.props.class === 'template-identity')[0]
  const fields = () => walk(header(), node => node.type === 'external-shell' && (node.props['onUpdate:value'] || node.props.field === 'name') && !node.props.disabled)
  try {
    await flush(); await click(findText(view.root, 'button', 'Power'))
    assert.equal(fields().length, 3)
    assert.equal(nodes(view.root, 'a-collapse-panel').some(node => node.props.header === 'basic'), false)
    fields()[0].props.onChange({ value: 'Energy', i18nMessages: { name: { zh: 'Energy', en: 'Energy use' } } }); await flush()
    fields()[1].props['onUpdate:value']('energy'); await flush()
    fields()[2].props['onUpdate:value']('2'); await flush()
    const stale = fields()[0].props.onChange
    await click(nodes(view.root, 'a-button').find(node => node.props['data-mode'] === 'full'))
    assert.equal(fields().length, 0)
    stale({ value: 'Ignored', i18nMessages: {} }); await flush()
    await click(nodes(view.root, 'a-button').find(node => node.props['data-mode'] === 'form'))
    await click(findText(view.root, 'a-button', 'save'))
    assert.equal(stored.name, 'Energy'); assert.equal(stored.id, 'energy'); assert.equal(stored.version, '2')
    assert.equal(stored.options.i18nMessages.name.en, 'Energy use')
    props.editable = false; await flush(); stale({ value: 'Ignored', i18nMessages: {} }); await flush()
    assert.equal(fields().length, 0); assert.equal(nodes(header(), 'external-shell').find(node => node.props.field === 'name').props.value, 'Energy')
  } finally { view.close() }
})

test('真实模板管理页属性连续编辑进入父草稿，统一保存及撤权边界一致', async () => {
  defaults(); moduleRegistry.clear()
  const entity = { id: 'rise', name: 'Temperature', released: false, available: false, template: {
    ...template, name: 'Temperature', inputDefinitions: [{ id: 'temperature', name: 'Winding' }, { id: 'ambient', name: 'Ambient' }],
    definitions: [{ id: 'rise', type: 'composite', dependsOn: ['temperature', 'ambient'], expression: '#temperature - #ambient' }],
    outputs: [{ metricId: 'rise', label: 'Rise', persist: false }], options: {},
  } }
  let stored; let saves = 0
  api.queryTemplates = async () => ({ data: [entity], total: 1 })
  api.saveTemplate = async next => { saves++; stored = next; return { ...entity, template: next } }
  const props = reactive({ editable: true }); const view = mount(Manager, props)
  const selectInput = async () => { const button = nodes(view.root, 'button').find(node => node.props['data-node'] === 'input-0'); button.props.onClick({ currentTarget: button }); await flush() }
  try {
    await flush(); await click(findText(view.root, 'button', 'Temperature')); await selectInput()
    nodes(view.root, 'external-shell').find(node => node.props.value === 'Winding').props['onUpdate:value']('Changed'); await flush()
    assert.equal(findText(view.root, 'a-button', 'save').props.disabled, false)
    await click(nodes(view.root, 'a-button').find(node => node.props['aria-label'] === 'nextNode'))
    nodes(view.root, 'external-shell').find(node => node.props.value === 'Ambient').props['onUpdate:value']('Room'); await flush()
    await click(findText(view.root, 'a-menu-item', 'revertNode')); assert.ok(findText(view.root, 'button', 'Changed')); assert.equal(saves, 0)
    await selectInput(); nodes(view.root, 'external-shell').find(node => node.props.value === 'Changed').props['onUpdate:value']('New winding'); await flush()
    await click(findText(view.root, 'a-button', 'save'))
    assert.equal(stored.inputDefinitions[0].name, 'New winding'); assert.equal(stored.inputDefinitions[1].name, 'Ambient'); assert.equal(stored.outputs[0].persist, false); assert.equal(saves, 1)
    await selectInput(); props.editable = false; await flush()
    assert.equal(findText(view.root, 'a-input', 'New winding'), undefined)
    assert.equal(findText(view.root, 'a-button', 'save'), undefined)
    props.editable = true; await flush()
    assert.ok(findText(view.root, 'a-button', 'simulate'))
    props.editable = false; await flush(); assert.equal(findText(view.root, 'a-button', 'simulate'), undefined)
  } finally { view.close(); moduleRegistry.clear() }
})

test('融合编辑：图内输入、时间轴、配置与结果共存；改值不保存模板且选时刻不执行计算', async () => {
  defaults(); moduleRegistry.clear()
  const content = { ...template, name:'Graph trial', inputDefinitions:[{ id:'reading', name:'Power', valueType:{ type:'double' } }], definitions:[{ id:'mean', name:'Mean', expression:'reading', dependsOn:['reading'] }], outputs:[{ metricId:'mean', label:'Average' }], options:{} }
  api.queryTemplates = async () => ({ data:[{ id:'graph-trial', name:'Graph trial', template:content }], total:1 })
  let calls = 0, finish, sent
  api.simulate = request => { calls++; sent = request; return new Promise(resolve => { finish = resolve }) }
  const view = mount(Manager, reactive({ editable:true }))
  const tabs = () => nodes(view.root, 'a-tabs')[0]
  const graphNode = key => nodes(view.root, 'button').find(node => node.props['data-node'] === key)
  const select = async key => { const node = graphNode(key); node.props.onClick({ currentTarget:node }); await flush() }
  const panel = () => walk(view.root, node => node.props.class === 'template-designer__panel-content')[0]
  try {
    await flush(); await click(findText(view.root, 'button', 'Graph trial'))
    const graph = walk(view.root, node => node.props.class === 'template-graph')[0]
    const mean = graphNode('rule-0'), coordinates = mean.parent.props.style
    assert.equal(nodes(view.root,'a-tab-pane').some(node => node.props.tab === 'simulate'), false)
    graph.scrollTop = 127
    const sampleEditor = () => walk(view.root, node => String(node.props.class).split(' ').includes('sample-editor'))[0]
    await select('rule-0')
    const ruleName=nodes(view.root,'external-shell').find(node=>node.props.value==='Mean')
    await click(nodes(graphNode('input-0').parent,'button').find(node => node.props.class === 'trial-input__add'))
    assert.equal(graphNode('rule-0').props['aria-pressed'],true,'添加模拟数据不切换正在编辑的计算节点')
    assert.equal(nodes(view.root,'external-shell').find(node=>node.props.value==='Mean'),ruleName)
    assert.equal(findText(view.root,'a-button','simulate').props.disabled, true)
    const graphValue = () => nodes(graphNode('input-0').parent,'external-shell').find(node => node.props.type === 'number')
    graphValue().props.onChange(0); await flush()
    await click(findText(sampleEditor(),'a-button','addSample'))
    nodes(sampleEditor(),'external-shell').filter(node => node.props.type === 'number')[1].props.onChange(120); await flush()
    assert.equal(walk(view.root,node => node.props.class === 'metric-template-manager__dirty').length,0)
    await select('input-0'); assert.equal(walk(view.root, node => node.props.class === 'sample-editor__filter').length, 1)
    await click(nodes(view.root,'a-button').find(node => node.props['aria-label'] === 'trialAllInputs'))
    assert.equal(graphNode('input-0').props['aria-pressed'], true,'清除样本筛选不清除配置节点选中状态')
    await select('rule-0')
    await click(nodes(graphNode('input-0').parent,'button').find(node=>node.props.class==='trial-input__details'))
    assert.equal(graphNode('rule-0').props['aria-pressed'],true,'查看样本详情不切换配置节点')
    await click(nodes(view.root,'a-button').find(node=>node.props['aria-label']==='trialAllInputs'))
    assert.equal(graphNode('rule-0').props['aria-pressed'],true)
    assert.ok(nodes(view.root,'external-shell').some(node => node.props.value === 'Mean'), 'rule remains editable alongside simulation')
    panel().scrollTop = 93
    const run = findText(view.root, 'a-button', 'simulate')
    run.props.onClick(); await flush()
    assert.equal(calls, 1); assert.equal(sent.includeRecords, true); assert.equal(sent.includeIntermediate, true)
    assert.equal(graphValue().props['component-props'].disabled, false, '样本在试算运行时仍可编辑')
    tabs().props['onUpdate:activeKey']('publication'); await flush(); assert.equal(tabs().props['active-key'], 'design')
    const results = sent.samples.map((sample, index) => ({ metricId:'mean', value:index ? 120 : 0, evaluationTime:sample.processTime, quality:{ valid:true } }))
    finish({ status:'success', results, records:results.flatMap((value, index) => [{ id:'n'+index, action:'metric.node', attributes:{ definitionId:'mean', evaluationTime:value.evaluationTime, state:'produced' } }, { id:'o'+index, action:'metric.output', parentId:'n'+index, attributes:{ resultIndex:index } }]), recordsTruncated:false }); await flush()
    assert.match(textContent(mean.parent), /120/)
    await click(nodes(view.root,'a-button').find(node => node.props['aria-label'] === 'trialPreviousTime'))
    assert.match(textContent(mean.parent), /0/); assert.equal(calls, 1)
    graphValue().props.onChange(15); await flush()
    assert.match(textContent(mean.parent), /trialPending/); assert.doesNotMatch(textContent(mean.parent), /120/)
    assert.equal(graphNode('rule-0'), mean); assert.equal(graphNode('rule-0').props['aria-pressed'], true)
    assert.equal(graph.scrollTop, 127); assert.equal(panel().scrollTop, 93)
    assert.ok(nodes(view.root,'external-shell').some(node => node.props.value === 'Mean'))
    assert.equal(nodes(sampleEditor(),'external-shell').find(node => node.props.type === 'number').props.value, 15)
    assert.deepEqual(mean.parent.props.style,coordinates)
    run.props.onClick(); await flush(); assert.equal(calls,2); assert.equal(sent.samples[0].value,15)
    finish({status:'success',results:[],records:[],recordsTruncated:false}); await flush()
  } finally { view.close(); moduleRegistry.clear() }
})

test('指标枚举显示 canonical text，保持真实值与原始元数据', async () => {
  const Value = load('components/Metric/MetricParameterValue.vue').default
  const parameter = { id: 'policy', valueType: { type: 'enum', elements: [{ value: 'reject', text: '判为异常' }] } }
  const view = mount(Value, { parameter, modelValue: 'reject' })
  try {
    const select = nodes(view.root, 'a-select')[0]
    assert.equal(select.props.options[0].label, '判为异常')
    assert.equal(select.props.value, select.props.options[0].value)
    assert.equal(parameter.valueType.elements[0].label, undefined)
  } finally { view.close() }
})

test('模板设计器向图与试算后代共享当前语言目录，目录更新不改模板', async () => {
  let key
  const Probe = defineComponent({setup() {const catalog=inject(key);return ()=>h('catalog-probe',catalog.value[0]?.name)}})
  const designerLoader=createMetricLoader({...componentStubs,[resolve(sourceRoot,'components/Metric/template/TemplateGraph.vue')]:{default:Probe,__esModule:true}})
  key=designerLoader('components/Metric/calculatorContext.ts').metricCalculatorsKey
  const Designer=designerLoader('components/Metric/template/TemplateDesigner.vue').default
  const props=reactive({template:{...template},disabled:false,calculators:[{name:'状态时长'}]})
  const before=JSON.stringify(props.template),view=mount(Designer,props)
  try {
    assert.equal(textContent(nodes(view.root,'catalog-probe')[0]),'状态时长')
    props.calculators=[{name:'State duration'}];await flush()
    assert.equal(textContent(nodes(view.root,'catalog-probe')[0]),'State duration')
    assert.equal(JSON.stringify(props.template),before)
  } finally {view.close()}
})

test('图中接续计算即时进入草稿且可撤回；发布及只读限制不暴露结构操作', async () => {
  const Designer = load('components/Metric/template/TemplateDesigner.vue').default
  const value = { ...template, inputDefinitions:[{ id:'a', name:'A' },{ id:'b', name:'B' }],
    definitions:[{ id:'value', expression:'#a', dependsOn:['a'] }], outputs:[] }
  const commits = []
  const props = reactive({ template:value, disabled:false, published:false,
    'onUpdate:template': next => { commits.push(next); props.template = next } })
  const view = mount(Designer, props)
  const plus = id => nodes(view.root,'button').find(node => node.props['data-add-from'] === id)
  const open = async (id, kind) => {
    const button = plus(id); button.props.onClick({ currentTarget:button })
    const menu = nodes(button.parent,'a-menu')[0]
    if (menu) menu.props.onClick({ key:kind })
    await flush()
  }
  try {
    await open('input-1','rule')
    assert.equal(nodes(view.root,'button').filter(node => node.props['data-node']?.startsWith('rule')).length, 2)
    await click(findText(view.root,'a-menu-item','revertNode'))
    assert.equal(commits.length, 2); assert.equal(props.template.definitions.length, 1)
    await open('input-1','rule')
    assert.equal(commits.length, 3); assert.deepEqual(props.template.definitions.at(-1).dependsOn, ['b'])
    assert.equal(props.template.definitions[0].expression, '#a')
    await open('rule-0','output')
    assert.equal(props.template.outputs[0].metricId,'value')
    assert.equal(nodes(view.root,'button').find(node=>node.props['data-node']==='output-0').props['aria-pressed'],true)
    await click(findText(view.root,'a-menu-item','revertNode'))
    assert.deepEqual(props.template.outputs,[])
    assert.equal(props.template.definitions.length,2)
    props.published = true; await flush()
    assert.equal(walk(view.root,node => node.props['data-add-root'] === 'input').length, 0)
    assert.equal(nodes(view.root,'a-menu-item').filter(node => textContent(node).includes('addOutput') && node.props.disabled !== true).length, 0)
    assert.ok(nodes(plus('rule-0').parent,'a-menu-item').some(node=>textContent(node).includes('addNextCalculation') && node.props.disabled !== true))
    const staleButton = plus('rule-0'),stale = staleButton.props.onClick
    props.disabled = true; await flush(); stale({ currentTarget:staleButton }); await flush()
    assert.equal(plus('rule-0'), undefined); assert.equal(commits.length, 5)
  } finally { view.close() }
})

test('常驻属性面板保留错误YAML，折叠不卸载，空白切换受保护，撤回后恢复模板设置', async () => {
  const Designer = load('components/Metric/template/TemplateDesigner.vue').default
  const states = []
  const value = { ...template, inputDefinitions:[{ id:'a', name:'A' }],
    definitions:[{ id:'r', calculator:{ provider:'external', parameters:{ zero:0, flag:false } } }], outputs:[] }
  const props = reactive({ template:value, disabled:false, onEditing:value => states.push(value),
    'onUpdate:template': next => { props.template = next } })
  const view = mount(Designer, props)
  const action = label => nodes(view.root,'a-button').find(node => node.props['aria-label'] === label)
  const select = async id => { const node = nodes(view.root,'button').find(node => node.props['data-node'] === id); node.props.onClick({ currentTarget:node }); await flush() }
  const blank = async () => { nodes(view.root,'div').find(node => node.props.class === 'template-graph').props.onClick({ target:{ closest:() => null } }); await flush() }
  const yaml = () => nodes(view.root,'external-shell').find(node => node.props.language === 'yaml')
  try {
    assert.ok(textContent(view.root).includes('scopeAndReference'))
    await select('rule-0')
    yaml().props['onUpdate:modelValue']('{'); await flush()
    const field = yaml(); assert.equal(states.at(-1), true)
    await click(action('collapseProperties'))
    assert.equal(yaml(), field); assert.equal(yaml().props['model-value'], '{')
    await blank(); await select('input-0')
    assert.equal(yaml(), field, '错误未修正时保留当前编辑器')
    await click(action('expandProperties'))
    assert.equal(yaml().props['model-value'], '{')
    await click(findText(view.root,'a-menu-item','revertNode'))
    assert.notEqual(yaml(), field); assert.equal(states.at(-1), false)
    assert.equal(props.template.definitions[0].calculator.parameters.flag, false)
    await blank(); assert.ok(textContent(view.root).includes('scopeAndReference'))
    assert.equal(yaml(), undefined)
    await select('input-0'); await click(action('collapseProperties')); await blank()
    assert.ok(action('expandProperties'), '收起后点空白不自动展开')
    await select('input-0'); assert.ok(action('collapseProperties'), '点击节点展开属性')
    assert.equal(nodes(view.root,'external-shell').some(node => node.props.open), false, '没有节点抽屉')
  } finally { view.close() }
})

test('输出用业务名称和计算摘要表达，来源聚焦仅虚线强调，定位及发布限制保持明确', async () => {
  const Designer = load('components/Metric/template/TemplateDesigner.vue').default
  const value = { ...template, inputDefinitions:[{ id:'temperature', name:'温度' }],
    definitions:[{ id:'attention', name:'温度偏高', expression:'temperature > 30', dependsOn:['temperature'] }],
    outputs:[{ metricId:'attention', label:'温度提醒', persist:true, publish:false }] }
  const props = reactive({ template:value, disabled:false, published:false,
    'onUpdate:template': next => { props.template = next } })
  const view = mount(Designer, props)
  const node = key => nodes(view.root,'button').find(node => node.props['data-node'] === key)
  const reference = () => nodes(view.root,'span').find(node => node.props['data-reference'] === 'attention')
  const field = () => nodes(view.root,'external-shell').find(node => node.props['component-props']?.['aria-label'] === 'outputFrom')
  const outputEvent = () => nodes(view.root,'button').find(node => textContent(node).includes('outputEvents'))
  try {
    node('output-0').props.onClick({ currentTarget:node('output-0') }); await flush()
    assert.equal(field().props['component-props'].options.find(item => item.value === 'attention').label, '温度偏高')
    assert.ok(textContent(view.root).includes('outputAs'))
    assert.equal(field().props['component-props'].disabled, false)
    reference().props.onMouseenter(); await flush()
    assert.ok(node('rule-0').props.class.includes('referenced')); assert.equal(node('output-0').props['aria-pressed'], true)
    assert.ok(nodes(view.root,'path').some(node => node.props.class?.includes('referenced')))
    reference().props.onMouseleave(); await flush()
    assert.equal(node('rule-0').props.class.includes('referenced'), false)
    reference().props.onFocusin(); await flush(); assert.ok(node('rule-0').props.class.includes('referenced'))
    reference().props.onFocusout(); await flush()
    await click(outputEvent()); assert.equal(props.template.outputs[0].publish, true)
    props.published = true; await flush()
    assert.equal(field().props['component-props'].disabled, true)
    const history = nodes(view.root,'external-shell').find(node => node.props['component-props']?.['aria-label'] === 'historyRecording')
    assert.equal(history.props['component-props'].disabled, true)
    history.props.onChange('latest'); assert.equal(props.template.outputs[0].persist, true)
    props.disabled = true; await flush()
    await click(outputEvent()); assert.equal(props.template.outputs[0].publish, true)
  } finally { view.close() }
})

test('指标数值编辑去除补齐零但保留输入文本和元数据精度，零值原样回传', async () => {
  const Value = load('components/Metric/MetricParameterValue.vue').default
  let changed
  const props = reactive({ parameter: { id: 'factor', name: 'Factor', valueType: { type: 'double', scale: 8 } }, modelValue: 1.163,
    'onUpdate:modelValue': value => { changed = value } })
  const view = mount(Value, props)
  try {
    await flush()
    const field = () => nodes(view.root, 'a-input-number')[0]
    assert.equal(field().props.precision, 8)
    assert.equal(field().props.formatter('1.16300000', { userTyping: false, input: '' }), '1.163')
    assert.equal(field().props.formatter('0.00000000', { userTyping: false, input: '' }), '0')
    assert.equal(field().props.formatter('-2.50000000', { userTyping: false, input: '' }), '-2.5')
    assert.equal(field().props.formatter('1', { userTyping: true, input: '1.' }), '1.')
    field().props['onUpdate:value'](0); assert.equal(changed, 0)
    props.parameter.valueType = { type: 'int' }; await flush(); assert.equal(field().props.precision, 0)
  } finally { view.close() }
})

test('真实值组件格式覆盖与共享质量/实际区间不被专用内容遮蔽', async () => {
  const Value = load('components/Metric/MetricValue.vue').default
  const props = reactive({ value: { ...value, inputTimeStart: 100, inputTimeEnd: 200, evaluationTime: 300, quality: { valid: true, coverage: 0 } }, unit: 'kW', settings: { decimals: 2 }, compact: true, disabled: false })
  const view = mount(Value, props)
  try {
    await flush(); assert.ok(textContent(view.root).includes('5.82')); assert.ok(textContent(view.root).includes('inputRange'))
    props.compact = false; await flush(); assert.ok(textContent(view.root).includes('coverage')); assert.ok(textContent(view.root).includes('updatedAt'))
    props.value = { ...value, value: 0, quality: {} }; await flush(); assert.ok(textContent(view.root).includes('0.00'))
    props.value = { ...value, value: false, unit: undefined }; await flush(); assert.ok(textContent(view.root).includes('conditionFalse'))
    props.value = { ...value, status: 'invalid' }; await flush(); assert.ok(textContent(view.root).includes('—'))
    props.value = { ...value, quality: { valid: false } }; await flush(); assert.ok(textContent(view.root).includes('—'))
    props.disabled = true; await flush(); assert.ok(textContent(view.root).includes('disabled'))
    props.disabled = false; props.compact = true; props.value = { metricId: 'value', value: 1 }; await flush(); assert.ok(textContent(view.root).includes('inputTimeUnknown'))
    props.value = { metricId: 'value', value: null, eventTime: 0, inputTimeStart: 0, inputTimeEnd: 0, evaluationTime: Date.UTC(2026, 10, 2), status: 'invalid' }
    await flush(); assert.ok(textContent(view.root).includes('inputTimeUnknown')); assert.ok(!textContent(view.root).includes('1970'))
    props.compact = false; await flush(); assert.ok(textContent(view.root).includes('updatedAt')); assert.ok(!textContent(view.root).includes('1970'))
    props.value = undefined; await flush(); assert.ok(textContent(view.root).includes('waiting'))
  } finally { view.close() }
})


test('时长卡片与趋势只格式化声明的时间单位，原始秒数不变且不重复显示单位', async () => {
  const Value = load('components/Metric/MetricValue.vue').default
  const result = { metricId:'duration', value:8100, unit:'s', evaluationTime:1000, status:'success' }
  const view = mount(Value, { value:result })
  const chart = mount(Trend, { values:[result], unit:'s' })
  try {
    assert.ok(textContent(view.root).includes('intervalHours'))
    assert.ok(textContent(view.root).includes('intervalMinutes'))
    assert.ok(!nodes(view.root, 'span').some(node => textContent(node) === 's'))
    const option = nodes(chart.root, 'chart')[0].props.option
    assert.deepEqual(option.series[0].data, [[1000,8100]])
    assert.equal(option.yAxis.axisLabel.formatter(8100), 'intervalHours intervalMinutes')
    assert.equal(option.tooltip.valueFormatter(45), 'intervalSeconds')
    assert.equal(result.value, 8100)
  } finally { chart.close(); view.close() }
})

test('数值趋势框选只改变时间视口，保留真实点和缺数，返回完整范围恢复坐标', async () => {
  const values=[{metricId:'v',value:10,evaluationTime:100},{metricId:'v',value:null,evaluationTime:300},{metricId:'v',value:20,evaluationTime:900}]
  const view=mount(Trend,{values,bounds:[0,1000]})
  const chart=()=>nodes(view.root,'chart')[0].props.option
  try {
    const original=chart().series[0].data.map(point=>[...point])
    const canonical=chart()
    nodes(view.root,'chart')[0].props.events.datazoom({startValue:100,endValue:500});await flush()
    assert.strictEqual(chart(),canonical,'native selection does not echo through setOption')
    assert.equal(chart().xAxis.min,0);assert.equal(chart().xAxis.max,1000)
    assert.deepEqual(chart().series[0].data,original)
    nodes(view.root,'chart')[0].props.events.restore();await flush()
    assert.equal(chart().xAxis.min,0);assert.equal(chart().xAxis.max,1000)
  } finally {view.close()}
})

test('详情刷新和切换时段均保留图表实例，主动切换时段原位重置视图', async () => {
  defaults()
  const Result=load('components/Metric/MetricResult.vue').default
  const at=Date.now()-1000
  api.history=async()=>[{...value,evaluationTime:at}]
  const view=mount(Result,{reference:{configId:'c',outputId:'value'},output:template.outputs[0],template})
  try {
    await flush()
    const initial=nodes(view.root,'chart')[0]
    assert.ok(initial)
    initial.props.events.datazoom({startValue:at-500,endValue:at+500});await flush()
    await click(findText(view.root,'a-button','refresh'))
    assert.strictEqual(nodes(view.root,'chart')[0],initial,'refresh is data replacement, not a new inspection scope')
    await click(nodes(view.root,'button').find(node=>textContent(node)==='day'))
    assert.strictEqual(nodes(view.root,'chart')[0],initial,'a deliberate query updates the existing chart')
    assert.ok(initial.props.option.xAxis.min < at-23*3600000,'the new query restores its full time range')
  } finally {view.close()}
})

test('详情后台刷新不卸载过程图、不加蒙层，新值与过程一起更新并保持选点',async()=>{
  defaults();moduleRegistry.clear()
  const Result=load('components/Metric/MetricResult.vue').default
  const spec={...template,definitions:[{id:'value',name:'Calculation',expression:'source * 2',inputs:[{id:'source',metricId:'source'}]}],inputDefinitions:[{id:'source',name:'Source'}]}
  const sample=(id,number)=>({...value,resultId:id,value:number,evaluationTime:number*1000})
  const first=sample('first',10),second=sample('second',20),pending=[]
  api.latest=async()=>[{configId:'c',outputs:{value:first}}]
  api.execution=(...args)=>new Promise(resolve=>pending.push({args,resolve}))
  const snap=reading=>({resultId:reading.resultId,evaluationTime:reading.evaluationTime,truncated:false,steps:[{id:0,definitionId:'value',state:'produced',value:reading,outputs:[reading]}]})
  const props=reactive({reference:{configId:'c',outputId:'value'},output:spec.outputs[0],template:spec,latest:{configId:'c',outputs:{value:first}}})
  const view=mount(Result,props)
  const graph=()=>walk(view.root,node=>String(node.props.class).includes('template-graph__canvas'))[0]
  const summary=()=>textContent(walk(view.root,node=>node.props.class==='metric-result__reading')[0])
  try {
    await flush();pending[0].resolve(snap(first));await flush()
    const original=graph();assert.ok(original)
    const rule=walk(view.root,node=>node.type==='button' && node.props['data-node'] && !node.props['data-node'].startsWith('input-'))[0]
    assert.ok(rule);rule.props.onClick({currentTarget:rule});await flush()
    await inspectNode(rule)
    const popover=nodes(view.root,'a-popover').find(node=>node.props.open)
    await click(findText(view.root,'a-button','expandFormula'))
    const formula=nodes(view.root,'a-modal').find(node=>node.props.open)
    assert.ok(formula)
    await click(findText(view.root,'a-button','canvasZoomIn'))
    const transform=graph().props.style.transform
    props.latest={configId:'c',outputs:{value:second}};await flush()
    assert.equal(pending.at(-1).args[2].resultId,'second')
    assert.strictEqual(graph(),original,'pending refresh retains the canvas instance')
    assert.match(summary(),/10/);assert.doesNotMatch(summary(),/20/)
    assert.ok(nodes(view.root,'a-spin').every(node=>!node.props.spinning),'background refresh has no blocking mask')
    props.template=structuredClone(spec);props.output={...spec.outputs[0]};await flush()
    assert.equal(popover.props.open,true,'refreshed template metadata preserves the open inspector')
    assert.equal(formula.props.open,true,'refreshed template metadata preserves expanded formula')
    pending.at(-1).resolve(snap(second));await flush()
    assert.strictEqual(graph(),original,'accepting the new round only replaces facts')
    assert.equal(graph().props.style.transform,transform,'new facts retain the user zoom')
    assert.match(summary(),/20/)
    assert.equal(rule.props['aria-pressed'],true,'selected node remains selected')
    assert.equal(popover.props.open,true,'new facts preserve the open inspector')
    assert.equal(formula.props.open,true,'new facts preserve expanded formula')
    props.template={...spec,version:'2'};await flush()
    assert.equal(walk(view.root,node=>node.props.class==='metric-node-inspect__detail').length,0,'switching template version closes the old inspector')
  }finally{view.close();delete api.execution}
})

test('历史选中联动主值、标记及精确过程身份，刷新与键盘切换保持同一记录',async()=>{
  defaults();moduleRegistry.clear()
  const Result=load('components/Metric/MetricResult.vue').default
  const at=Date.now()-1000,calls=[]
  const reading=(id,number,time)=>({...value,resultId:id,value:number,evaluationTime:time})
  const first=reading('first',10,at-60000),middle=reading('middle',20,at-30000),latest=reading('latest',30,at)
  let history=[first,middle,latest]
  api.history=async()=>history
  api.latest=async()=>[{configId:'c',outputs:{value:history.at(-1)}}]
  api.execution=async(_config,_output,query)=>{calls.push(query.resultId);return undefined}
  const props=reactive({reference:{configId:'c',outputId:'value'},output:template.outputs[0],template,
    latest:{configId:'c',outputs:{value:latest}},context:{ownerType:'line',ownerId:'a'}})
  const view=mount(Result,props)
  const chart=()=>nodes(view.root,'chart')[0]
  const summary=()=>textContent(walk(view.root,node=>node.props.class==='metric-result__reading')[0])
  const key=async name=>{chart().props.onKeydown({key:name,preventDefault(){},stopPropagation(){}});await flush()}
  try {
    await flush()
    assert.match(summary(),/30/)
    assert.deepEqual(calls,['latest'])
    chart().props.events.click({seriesIndex:0,dataIndex:chart().props.option.series[0].data.findIndex(point=>point[0]===first.evaluationTime)})
    await flush()
    assert.match(summary(),/10/)
    assert.equal(calls.at(-1),'first')
    assert.deepEqual(chart().props.option.series[0].markPoint.data[0].coord,[first.evaluationTime,10])
    await key('ArrowRight');assert.match(summary(),/20/);assert.equal(calls.at(-1),'middle')
    const newer=reading('newest',40,at+100)
    history=[...history,newer];props.latest={configId:'c',outputs:{value:newer}};await flush()
    assert.match(summary(),/20/);assert.equal(calls.at(-1),'middle')
    await key('ArrowLeft');assert.match(summary(),/10/);assert.equal(calls.at(-1),'first')
    await click(findText(view.root,'a-button','refresh'))
    assert.match(summary(),/10/)
    await click(findText(view.root,'a-button','executionFollowLatest'))
    assert.match(summary(),/40/);assert.equal(calls.at(-1),'newest')
    assert.equal(chart().props.option.series[0].markPoint.data.length,0)
  } finally {view.close();delete api.execution;moduleRegistry.clear()}
})

test('匿名数值记录同刻同值时可按实际点和键盘分别查看过程，刷新保留选择',async()=>{
  defaults();moduleRegistry.clear()
  const Result=load('components/Metric/MetricResult.vue').default,at=Date.now()-1000,calls=[]
  const first={...value,resultId:undefined,executionId:'round-one',value:10,evaluationTime:at}
  const second={...first,executionId:'round-two'}
  const history=[first,second]
  api.history=async()=>history;api.latest=async()=>[{configId:'c',outputs:{value:second}}]
  api.execution=async(_config,_output,query)=>{calls.push(query);return undefined}
  const props=reactive({reference:{configId:'c',outputId:'value'},output:template.outputs[0],template,latest:{configId:'c',outputs:{value:second}}})
  const view=mount(Result,props),chart=()=>nodes(view.root,'chart')[0]
  try {
    await flush();assert.equal(calls.at(-1).executionId,'round-two')
    chart().props.events.click({seriesIndex:0,dataIndex:0});await flush()
    assert.equal(calls.at(-1).executionId,'round-one')
    chart().props.onKeydown({key:'ArrowRight',preventDefault(){},stopPropagation(){}});await flush()
    assert.equal(calls.at(-1).executionId,'round-two')
    chart().props.events.click({seriesIndex:0,dataIndex:0});await flush()
    await click(findText(view.root,'a-button','refresh'))
    assert.equal(calls.at(-1).executionId,'round-one')
    assert.ok(calls.every(query=>query.resultId === undefined))
  } finally {view.close();delete api.execution;moduleRegistry.clear()}
})

test('状态标签复用至当前结果且严格匹配类型，不影响未映射数字的小数设置', async () => {
  const Value=load('components/Metric/MetricValue.vue').default
  const props=reactive({value:{metricId:'v',value:false},labels:[{value:false,name:'未超限',icon:'color:#1677ff'}],settings:{decimals:2},summary:true})
  const view=mount(Value,props)
  try {
    assert.ok(textContent(view.root).includes('未超限'))
    props.value={metricId:'v',value:1.235};await flush()
    assert.ok(textContent(view.root).includes('1.24'))
    props.value={metricId:'v',value:0};await flush()
    assert.ok(textContent(view.root).includes('0.00'));assert.ok(!textContent(view.root).includes('未超限'))
  } finally {view.close()}
})

test('真实Panel轮询展示服务端过期与独立装载反馈，旧值和真实时间保留；同ID重试服从维护权限', async () => {
  defaults(); moduleRegistry.clear()
  const props = reactive({ context: { ownerType: 'line', ownerId: 'a', editable: true } })
  let runtime = { nodeId: 'node-a', state: 'loaded', lastSuccessTime: 100 }
  let observed = { ...value, quality: { valid: true, attributes: { validUntil: 2000 } } }
  let empty = false
  const saved = []
  api.latest = async ids => ids.map(configId => ({ configId, outputs: empty ? {} : { value: observed }, ...(runtime ? { runtime } : {}) }))
  api.saveConfig = async next => { saved.push(next); runtime = { nodeId: 'node-a', state: 'loaded', lastSuccessTime: 300 }; return next }
  const view = mount(Panel, props)
  const card = () => nodes(view.root, 'button').find(node => node.props.class?.includes('metric-panel__card'))
  const refresh = () => click(findText(view.root, 'a-button', 'refresh'))
  try {
    await flush()
    assert.ok(nodes(card(), 'a-tooltip').some(node => node.props.title?.includes('valid')))
    assert.equal(textContent(card()).includes('runtimeLoaded'), false)
    observed = { ...observed, quality: { ...observed.quality, stale: true } }
    await refresh()
    assert.ok(textContent(card()).includes('inputExpired'))
    assert.ok(textContent(card()).includes('6'))
    const timeHint = nodes(card(), 'a-tooltip').find(node => node.props.title?.includes(new Date(1000).toLocaleString('zh')))
    const timestamp = nodes(timeHint, 'time')[0]
    assert.ok(timestamp)
    assert.ok(textContent(timestamp).includes(new Date(1000).toLocaleString('zh', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })))
    assert.ok(timeHint.props.title.includes('inputExpired'))
    assert.equal(observed.eventTime, 1000)
    runtime = { nodeId: 'node-a', state: 'pending' }; await refresh()
    assert.ok(textContent(card()).includes('runtimePending'))
    assert.ok(textContent(card()).includes('lastResult'))
    assert.ok(textContent(card()).includes('inputExpired'))
    runtime = { nodeId: 'node-a', state: 'failed', replicas: 0, complete: true, lastSuccessTime: 100, lastFailureTime: 200, errorCode: 'load_failed' }; await refresh()
    assert.ok(textContent(card()).includes('runtimeFailed'))
    assert.ok(textContent(card()).includes('inputExpired'))
    await click(card())
    assert.equal(textContent(view.root).includes('node-a'), false)
    assert.ok(textContent(view.root).includes('runtimeReplicas'))
    assert.equal(textContent(view.root).includes('load_failed'), false)
    const retry = findText(view.root, 'a-button', 'retryLoad')
    assert.ok(retry)
    props.context = { ...props.context, editable: false }; await flush()
    assert.equal(findText(view.root, 'a-button', 'retryLoad'), undefined)
    await retry.props.onClick(); await flush(); assert.equal(saved.length, 0)
    props.context = { ...props.context, editable: true }; await flush()
    await click(card())
    await click(findText(view.root, 'a-button', 'retryLoad'))
    assert.equal(saved.length, 1)
    assert.deepEqual(saved[0], config)
    assert.equal(textContent(card()).includes('runtimeLoaded'), false)
    assert.equal(findText(view.root, 'a-button', 'retryLoad'), undefined)
    assert.equal(textContent(view.root).includes('runtimeFailed'), false)
    runtime = undefined; await refresh()
    assert.equal(textContent(card()).includes('runtimeUnknown'), false)
    assert.ok(textContent(card()).includes('inputExpired'))
    runtime = { nodeId: 'node-a', state: 'loaded' }; empty = true; await refresh()
    assert.ok(textContent(card()).includes('waiting'))
    assert.equal(textContent(card()).includes('runtimeLoaded'), false)
    runtime = { nodeId: 'node-a', state: 'failed' }; await refresh()
    assert.ok(textContent(card()).includes('runtimeFailed'))
    assert.equal(textContent(card()).includes('waiting'), false)
  } finally { view.close(); moduleRegistry.clear() }
})

test('运行反馈将部分查询标为已确认副本，旧服务缺少数量时不伪造零副本', async () => {
  const Feedback = load('components/Metric/MetricRuntimeFeedback.vue').default
  const props = reactive({ runtime: { state: 'degraded', replicas: 2, complete: false, lastCalculationTime: 1000 } })
  const view = mount(Feedback, props)
  try {
    assert.ok(textContent(view.root).includes('runtimeDegraded'))
    assert.ok(textContent(view.root).includes('runtimeReplicasKnown'))
    assert.ok(textContent(view.root).includes('runtimeIncomplete'))
    props.runtime = { state: 'loaded' }; await flush()
    assert.ok(!textContent(view.root).includes('runtimeReplicas'))
  } finally { view.close() }
})


test('真实详情接受较新面板快照，迟到拒权不锁死刷新；真正新拒权隐藏结果，后续授权快照恢复', async () => {
  defaults(); moduleRegistry.clear()
  const Result = load('components/Metric/MetricResult.vue').default
  let finishOld; let calls = 0
  api.latest = async () => { calls++; return calls === 1 ? new Promise(resolve => { finishOld = resolve }) : [] }
  const snapshot = number => ({ configId: 'c', outputs: { value: { ...value, value: number } }, runtime: { nodeId: 'node-a', state: 'loaded' } })
  const props = reactive({ reference: { configId: 'c', outputId: 'value' }, output: template.outputs[0], template, context: { ownerType: 'line', ownerId: 'a' }, latest: undefined })
  const view = mount(Result, props)
  const denied = () => nodes(view.root, 'a-alert').some(node => node.props.message === 'noAccess')
  const shownValue = () => textContent(nodes(view.root, 'strong')[0])
  try {
    await flush(); props.latest = snapshot(2); await flush()
    assert.equal(Number(shownValue()), 2); assert.equal(denied(), false)
    finishOld([]); await flush()
    assert.equal(denied(), false); assert.equal(Number(shownValue()), 2)
    assert.ok(findText(view.root, 'a-button', 'refresh'))
    props.latest = snapshot(3); await flush()
    assert.equal(Number(shownValue()), 3); assert.equal(denied(), false)
    await click(findText(view.root, 'a-button', 'refresh'))
    assert.equal(denied(), true); assert.equal(nodes(view.root, 'strong').length, 0)
    assert.equal(textContent(view.root).includes('node-a'), false)
    props.latest = snapshot(4); await flush()
    assert.equal(denied(), false); assert.equal(Number(shownValue()), 4)
    assert.ok(findText(view.root, 'a-button', 'refresh'))
  } finally { view.close(); moduleRegistry.clear() }
})

test('部分结果显示服务端覆盖率且保留真实零值；具体异常和缺少覆盖率不推断', async () => {
  const Value=load('components/Metric/MetricValue.vue').default
  const props=reactive({summary:true,value:{metricId:'count',value:0,status:'partial',quality:{valid:true,coverage:.43}}})
  const view=mount(Value,props)
  try {
    assert.equal(textContent(nodes(view.root,'strong')[0]),'0')
    assert.equal(textContent(nodes(view.root,'a-tag')[0]),'coverage 43%')
    assert.equal(nodes(view.root,'a-tag')[0].props.title,'coveragePartialHint')
    props.value={...props.value,reason:'inputExpired'};await flush()
    assert.equal(textContent(nodes(view.root,'a-tag')[0]),'inputExpired')
    props.value={...props.value,reason:undefined,quality:{valid:true}};await flush()
    assert.equal(textContent(nodes(view.root,'a-tag')[0]),'optionalInputMissing')
  } finally {view.close()}
})

test('详情首次加载显示骨架，完成后展示静态曲线', async () => {
  defaults();moduleRegistry.clear()
  const Result=load('components/Metric/MetricResult.vue').default
  let finish
  api.history=()=>new Promise(resolve=>{finish=resolve})
  const view=mount(Result,{reference:{configId:'c',outputId:'value'},output:template.outputs[0],template})
  try {
    await flush()
    assert.equal(nodes(view.root,'a-skeleton').length,1)
    assert.equal(nodes(view.root,'chart').length,0)
    assert.ok(nodes(view.root,'a-spin').some(node=>node.props['aria-busy']))
    finish([{...value,evaluationTime:Date.now()-1000}]);await flush()
    assert.equal(nodes(view.root,'a-skeleton').length,0)
    assert.equal(nodes(view.root,'chart')[0].props.option.animation,false)
    const toolbar=walk(view.root,node=>node.props.class==='metric-history-view__tools')[0]
    assert.ok(findText(toolbar,'a-button','refresh'))
    assert.ok(findText(toolbar,'a-button','historyBrush'))
    assert.ok(nodes(view.root,'a-spin').every(node=>!node.props['aria-busy']))
  } finally {view.close();moduleRegistry.clear()}
})

test('详情切换时段保留图表实例和当前数据，完成后原位更新；迟到查询不回填', async () => {
  defaults();moduleRegistry.clear()
  const Result=load('components/Metric/MetricResult.vue').default
  const pending=[]
  const sample={...value,evaluationTime:Date.now()-1000}
  let hold=false
  api.history=()=>hold ? new Promise(resolve=>pending.push(resolve)) : Promise.resolve([sample])
  const view=mount(Result,{reference:{configId:'c',outputId:'value'},output:template.outputs[0],template})
  try {
    await flush()
    const chart=nodes(view.root,'chart')[0]
    assert.ok(chart)
    hold=true
    await click(findText(view.root,'button','day'))
    assert.strictEqual(nodes(view.root,'chart')[0],chart)
    assert.ok(nodes(view.root,'a-spin').some(node=>node.props.spinning))
    assert.equal(chart.props.option.series[0].data[0][1],value.value)
    await click(findText(view.root,'button','hour'))
    pending[0]([{...sample,value:99}]);await flush()
    assert.strictEqual(nodes(view.root,'chart')[0],chart)
    assert.equal(chart.props.option.series[0].data[0][1],value.value)
    pending[1]([{...sample,value:8}]);await flush()
    assert.strictEqual(nodes(view.root,'chart')[0],chart)
    assert.equal(chart.props.option.series[0].data[0][1],8)
  } finally {view.close();moduleRegistry.clear()}
})

test('持续条件未填输出类型时仍按模板布尔语义读取完整分布，点击仅切换原始记录时段',async()=>{
  defaults();moduleRegistry.clear()
  const Result=load('components/Metric/MetricResult.vue').default
  const now=Date.now(),calls=[]
  const output={metricId:'value',label:'Condition'}
  const definition={...template,outputs:[output],definitions:[{id:'value',temporalCondition:{}}]}
  api.history=async()=>[{...value,value:false,evaluationTime:now-1000}]
  api.aggregateHistory=async(_id,query)=>{calls.push(query);return {operations:[{id:'distribution',name:'State records'}],operation:'distribution',interval:1000,buckets:[{from:now-2000,to:now-1000,states:[{state:false,count:501}]}]}}
  const view=mount(Result,{reference:{configId:'c',outputId:'value'},output,template:definition})
  try{
    await flush();assert.equal(calls.length,1);assert.equal(calls[0].operation,'distribution')
    const cell=walk(view.root,node=>node.props.class?.split(' ').includes('state-matrix__cell'))[0]
    await click(cell);assert.equal(calls.length,1)
    assert.ok(nodes(view.root,'chart').length,'drilldown renders the existing original-record timeline')
  }finally{view.close();delete api.aggregateHistory;moduleRegistry.clear()}
})
