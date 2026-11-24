import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, effectScope, h, reactive, ref } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, walk, flush, sourceRoot, passthrough, textContent } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({ 'vue-i18n':{useI18n:()=>({t:key=>key,locale:ref('en')})},[resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}} })
const { aggregationOptions } = load('components/Metric/template/aggregationPresentation.ts')
const { calculationKind } = load('components/Metric/template/window.ts')
const { graphNodeSummary } = load('components/Metric/template/graphPresentation.ts')
const { simulationSteps, simulationOperation } = load('components/Metric/template/simulationFlow.ts')
const { resolveMetricResultType } = load('components/Metric/template/resultTypes.ts')
// 由后端 MetricAggregationDescriptorTest 的真实目录输出生成。
const catalog = JSON.parse(readFileSync(new URL('./fixtures/metricAggregations.json',import.meta.url),'utf8'))
const t = key => key
const template = rule => ({id:'stats',version:'1',name:'Statistics',inputDefinitions:[{id:'reading',valueType:{type:'double'}}],definitions:[rule],outputs:[],parameterDefinitions:[]})

function mount(extra = {}) {
  const editorLoad = createMetricLoader({ 'vue-i18n':{useI18n:()=>({t,locale:ref('en')})},
    [resolve(sourceRoot,'components/Editable/index.vue')]:{default:defineComponent({inheritAttrs:false,setup:(_, {attrs,slots})=>()=>h('editable',attrs,attrs['component-props']?.options?.flatMap(option=>slots.option?.(option) || []))}),__esModule:true},
    [resolve(sourceRoot,'components/SelectOption/index.vue')]:{default:passthrough('option'),__esModule:true},
    [resolve(sourceRoot,'components/Metric/template/CalculatorFormula.vue')]:{default:passthrough('formula'),__esModule:true},
  })
  const Editor = editorLoad('components/Metric/template/TemplateWindowEditor.vue').default
  const {metricAggregationsKey}=editorLoad('components/Metric/calculatorContext.ts')
  const patches = []
  const props = reactive({rule:{id:'stats',type:'feature',aggregation:'avg',dependsOn:['reading'],sourceMetric:'reading',custom:false,
    window:{mode:'time',size:'PT15M',timeMode:'processing',maxEntries:500,custom:false}},disabled:false,
    onPatch:patch=>{patches.push(patch);Object.assign(props.rule,patch)},...extra})
  const {renderer,root}=createMetricRenderer()
  const app=renderer.createApp({setup:()=>()=>h(Editor,props)});app.provide(metricAggregationsKey,ref(catalog));app.config.warnHandler=()=>{};app.mount(root)
  return {root,props,patches,close:()=>app.unmount(),field:label=>walk(root,node=>node.type==='editable' && node.props['component-props']?.['aria-label']===label)[0]}
}

test('聚合菜单、画布及试算使用同一统计身份，数值结果不丢失类型',()=>{
  const options=aggregationOptions(catalog,'time','unavailable')
  assert.equal(options.length,12)
  assert.equal(new Set(options.map(item=>item.icon)).size,12)
  for (const option of options) {
    const descriptor=catalog.find(item=>item.id===option.value)
    const rule={id:'r',type:'feature',sourceMetric:'reading',dependsOn:['reading'],aggregation:descriptor.aggregation,timeAggregation:descriptor.timeAggregation,window:{mode:'time',size:'PT15M',...descriptor.windowDefaults}}
    const value=template(rule)
    assert.equal(calculationKind(rule),'statistics')
    assert.equal(graphNodeSummary(value,{kind:'rule',index:0},t,[],'en',catalog).icon,option.icon)
    assert.ok(simulationOperation(rule,t,catalog).endsWith(option.label))
    assert.equal(resolveMetricResultType(value,'r').schema.type,option.value==='count'?'long':'double')
  }
})

test('时间聚合切换原子更新时间口径与参数，保留来源、窗口和扩展',async()=>{
  const view=mount()
  try {
    view.field('statistic').props.onChange('timeSlope');await flush()
    assert.equal(view.props.rule.timeAggregation,'timeSlope');assert.equal(view.props.rule.aggregation,undefined)
    assert.equal(view.props.rule.window.timeMode,'event');assert.equal(view.props.rule.window.timeUnit,'PT1S')
    assert.equal(view.props.rule.sourceMetric,'reading');assert.deepEqual(view.props.rule.dependsOn,['reading'])
    assert.equal(view.props.rule.window.maxEntries,500);assert.equal(view.props.rule.window.custom,false)
    assert.equal(view.field('windowRange').props['component-props'].options.find(item=>item.value==='latestN').disabled,true)
    assert.equal(view.field('timeBasis'),undefined,'仅支持数据时间的统计不展示不可切换的时间口径')
    const count=view.patches.length
    view.field('windowRange').props.onChange('latestN');assert.equal(view.patches.length,count)
    view.field('statistic').props.onChange('timeWeightedMean');await flush()
    assert.equal(view.props.rule.window.timeUnit,undefined);assert.equal(view.props.rule.window.maxGap,'PT1M')
    view.field('statistic').props.onChange('variance');await flush()
    assert.equal(view.props.rule.timeAggregation,undefined);assert.equal(view.props.rule.aggregation,'variance')
    assert.equal(view.field('timeBasis').props['component-props'].options.filter(item=>!item.disabled).length,3,'普通统计保留时间口径选择')
    assert.equal(view.props.rule.window.maxGap,undefined);assert.equal(view.props.rule.custom,false)
    view.field('windowRange').props.onChange('latestN');await flush()
    assert.equal(view.props.rule.aggregation,'variance');assert.equal(view.props.rule.window.mode,'latestN')
    const after=view.patches.length
    view.field('statistic').props.onChange('timeSlope');assert.equal(view.patches.length,after)
    assert.ok(view.field('statistic').props['component-props'].options.filter(item=>item.value.startsWith('time')).every(item=>item.disabled))
  } finally {view.close()}
})

test('公式说明复用公共组件；禁用态不产生修改，最新值模式移除时间参数',async()=>{
  const view=mount()
  try {
    const formulas=walk(view.root,node=>node.type==='formula')
    assert.equal(walk(view.root,node=>node.type==='option').flatMap(node=>walk(node,child=>child.type==='formula')).length,6)
    assert.match(formulas.find(node=>node.props.description===catalog.find(item=>item.id==='variance').description).props.formula,/frac\{1\}\{n\}/)
    assert.ok(formulas.every(node=>node.props.description))
    view.field('statistic').props.onChange('timeSlope');await flush()
    view.props.disabled=true;await flush()
    const count=view.patches.length
    view.field('statistic').props.onChange('range');view.field('windowRange').props.onChange('none')
    assert.equal(view.patches.length,count)
    view.props.disabled=false;await flush();view.field('windowRange').props.onChange('none');await flush()
    assert.equal(view.props.rule.type,'raw');assert.equal(view.props.rule.timeAggregation,undefined)
    assert.equal(view.props.rule.window.timeUnit,undefined)
    assert.equal(walk(view.root,node=>node.type==='editable' && node.props['component-props']?.['aria-label']==='statistic').length,0)
  } finally {view.close()}
})

test('窗口族展开时间聚合时保留各输出的真实时间参数',()=>{
  const value=template({id:'family',sourceMetric:'reading',windowFamily:{ranges:[{mode:'time',size:'PT5M',timeMode:'event',timeUnit:'PT1M',maxGap:'PT30S',outputs:[{id:'slope',timeAggregation:'timeSlope'},{id:'weighted',timeAggregation:'timeWeightedMean'},{id:'peak',aggregation:'max'}]}]}})
  const steps=simulationSteps(value,[])
  assert.deepEqual(steps.map(item=>[item.id,item.rule.aggregation,item.rule.timeAggregation]),[['slope',undefined,'timeSlope'],['weighted',undefined,'timeWeightedMean'],['peak','max',undefined]])
  assert.equal(steps[0].rule.window.timeUnit,'PT1M');assert.equal(steps[1].rule.window.maxGap,'PT30S')
  assert.ok(simulationOperation(steps[0].rule,t,catalog).endsWith('Time slope'))
})

test('聚合目录按实际后端返回加载；失败可重试，旧请求不覆盖新目录',async()=>{
  const { useMetricTemplates }=load('components/Metric/template/useMetricTemplates.ts')
  const scope=effectScope();const pending=[]
  const view=scope.run(()=>useMetricTemplates(ref(true),{aggregations:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}))
  try {
    const first=view.loadAggregations(),second=view.loadAggregations()
    pending[1].resolve(catalog);await second
    pending[0].resolve([]);await first
    assert.equal(view.aggregations.value.length,12)
    const failed=view.loadAggregations();pending[2].reject(new Error('unavailable'));await failed
    assert.equal(view.aggregationError.value,'unavailable')
    const retry=view.loadAggregations();pending[3].resolve([catalog[0]]);await retry
    assert.equal(view.aggregations.value.length,1);assert.equal(view.aggregationError.value,'')
    assert.deepEqual(aggregationOptions([], 'time','unavailable'),[],'没有目录时不伪造可执行选项')
  } finally {scope.stop()}
})

test('每项聚合展示真实时间图例和结果；时间加权的保持区间不冒充新增样本',async()=>{
  const Guide=load('components/Metric/template/TemplateAlgorithmGuide.vue').default
  const {renderer,root}=createMetricRenderer(),descriptor=ref(catalog[0])
  const app=renderer.createApp({setup:()=>()=>h(Guide,{descriptor:descriptor.value})})
  app.config.warnHandler=()=>{};app.mount(root)
  try {
    for(const item of catalog) {
      descriptor.value=item;await flush()
      const example=item.documentation.examples[0]
      assert.equal(walk(root,node=>node.type==='svg').length,1,item.id)
      assert.equal(walk(root,node=>node.props.class==='example-plot__point').length,3,item.id)
      assert.equal(walk(root,node=>node.props.class==='algorithm-guide__samples').length,0,item.id)
      assert.ok(textContent(root).includes(example.explanation),item.id)
      assert.ok(textContent(root).includes(example.visualization.timeLabel),item.id)
      assert.ok(textContent(root).includes(example.visualization.valueLabel),item.id)
      assert.equal(walk(root,node=>node.props.class==='algorithm-guide__result').length,1,item.id)
      const ticks=walk(root,node=>node.props.class==='example-plot__tick').map(node=>Number(node.props.x1))
      assert.ok(Math.abs((ticks[2]-ticks[1])/(ticks[1]-ticks[0])-2)<1e-10,'1→3 秒的距离应是 0→1 秒的两倍')
      assert.equal(walk(root,node=>node.props.class==='example-plot__bar').length,item.id==='sum'?3:0,item.id)
      if(item.id==='timeWeightedMean') {
        assert.equal(ticks.length,4)
        assert.equal(ticks[3],280)
        assert.match(walk(root,node=>node.type==='path')[0].props.d,/H280$/)
      } else assert.equal(ticks.length,3,item.id)
      const highlights=walk(root,node=>node.props.class==='example-plot__guide').flatMap(node=>walk(node,child=>child.type==='text'))
      assert.ok(highlights.every(node=>node.props.x>=30 && node.props.x<=280 && node.props.y>=12 && node.props.y<=118),item.id)
    }
  } finally {app.unmount()}
})

test('全部统计参数紧跟统计选择；数量窗口和最新值模式隐藏无关配置',async()=>{
  const view=mount()
  try {
    for(const item of catalog) {
      view.field('statistic').props.onChange(item.id);await flush()
      const sentence=walk(view.root,node=>node.props.class==='window-description__sentence')[0]
      const calculation=walk(sentence,node=>node.props.class==='window-description__calculation')[0]
      assert.ok(calculation,item.id)
      const parameters=walk(sentence,node=>node.props.class==='window-description__parameter')
      assert.equal(parameters.length,item.parameterDefinitions.length,item.id)
      for(const field of item.parameterDefinitions)assert.ok(textContent(calculation).includes(field.name),item.id)
      assert.equal(walk(sentence,node=>node.type==='small').length,0,'滚动说明不挤占配置句子')
    }
    view.field('statistic').props.onChange('avg');await flush()
    view.field('windowRange').props.onChange('latestN');await flush()
    assert.equal(view.field('windowCapacity'),undefined)
    assert.ok(view.field('sampleCount'))
    view.field('windowRange').props.onChange('none');await flush()
    assert.equal(walk(view.root,node=>node.props.class==='window-description__calculation').length,0,'最新值仅表达取数，不混入聚合')
    assert.equal(walk(view.root,node=>node.props.class==='window-description__settings').length,0)
    assert.equal(walk(view.root,node=>node.props.class==='algorithm-guide').length,0)
  } finally {view.close()}
})

test('结果反显随共享目录补齐名称、图标与完整窗口参数，不泄露编码或改写模板',async()=>{
  const Lineage=load('components/Metric/MetricLineage.vue').default
  const {metricAggregationsKey}=load('components/Metric/calculatorContext.ts')
  const spec=template({id:'stats',name:'Trend',type:'feature',sourceMetric:'reading',dependsOn:['reading'],timeAggregation:'timeSlope',window:{mode:'time',size:'PT1M',timeMode:'event',timeUnit:'PT1S',maxEntries:128},qualityPolicy:{expectedCount:60}})
  spec.inputDefinitions[0].name='Memory';spec.outputs=[{metricId:'stats',persist:true}]
  const original=structuredClone(spec),descriptors=ref([])
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup:()=>()=>h(Lineage,{template:spec,output:spec.outputs[0],definitionsOnly:true,configuration:{inputMappings:{}}})})
  app.provide(metricAggregationsKey,descriptors);app.config.warnHandler=()=>{};app.mount(root)
  try {
    assert.equal(textContent(root).includes('timeSlope'),false,'目录尚未到达时不显示内部统计编码')
    descriptors.value=catalog;await flush()
    const description=walk(root,node=>String(node.props.class).split(' ').includes('window-description'))[0]
    const text=textContent(description)
    assert.ok(text.includes('Memory'));assert.ok(text.includes('Time slope'));assert.ok(text.includes('per'))
    assert.ok(text.includes('60'));assert.ok(text.includes('128'));assert.ok(text.includes('time_event'))
    assert.ok(walk(description,node=>node.props.type==='RiseOutlined').length)
    assert.equal(text.includes('timeSlope'),false)
    assert.deepEqual(spec,original,'只读投影不补写默认值或改动原始配置')
  } finally {app.unmount()}
})
