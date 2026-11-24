import assert from 'node:assert/strict'
import test from 'node:test'
import { h, reactive, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, createMetricRenderer, flush, passthrough, sourceRoot, textContent, walk } from './helpers/metricRuntime.mjs'

const load=createMetricLoader({'vue-i18n':{useI18n:({messages})=>({t:(key,args={})=>(messages.en[key] || key).replace(/\{(\w+)\}/g,(_,key)=>String(args[key] ?? '')),locale:ref('en')})},
  [resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}},
  [resolve(sourceRoot,'components/Echarts/index.ts')]:{default:passthrough('chart'),__esModule:true},
})
const {metricStatisticUnit,metricStatisticSigned,metricStatisticBaseline}=load('components/Metric/statisticPresentation.ts')
const {metricSparkline,metricSparklinePoint}=load('components/Metric/presentation.ts')
const t=(key)=>({statisticPp:'pp',secondsSingular:'second',minutesSingular:'minute',seconds:'seconds',minutes:'minutes'}[key] || key)
const output=(characteristic='rate',unit='pp',timeUnit='PT1M')=>({metricId:'result',unit:'old unit',valueType:'double',resultSemantics:{
  statistic:{procedure:characteristic==='rate'?'timeSlope':characteristic,characteristic,unitRule:characteristic==='rate'?'perTime':characteristic==='count'?'count':'squared'},
  sourceMetric:'reading',unit,timeUnit,window:{mode:'time',size:'PT5M',timeMode:'event',emitPolicy:'onEvent'},
}})
function mount(path,props,setup=()=>{}) {
  const {renderer,root}=createMetricRenderer()
  const component=load(path).default
  const app=renderer.createApp({setup:()=>{setup();return ()=>h(component,props)}})
  app.config.warnHandler=()=>{};app.mount(root)
  return {root,app}
}

test('结果量纲来自后端绑定语义；原始结果事实、未知量纲与旧模板有明确边界',()=>{
  assert.equal(metricStatisticUnit(output(),t),'pp / minute')
  assert.equal(metricStatisticUnit(output('rate','pp','PT1S'),t),'pp / second')
  assert.equal(metricStatisticUnit(output('rate','pp','PT5S'),t),'pp / 5 seconds')
  assert.equal(metricStatisticUnit(output('variance','(°C)²'),t),'(°C)²')
  assert.equal(metricStatisticUnit(output('rate',null),t),'old unit','未知输入单位时保留明确的完整输出单位，不再次追加时间单位')
  assert.equal(metricStatisticUnit({...output('rate',null),unit:undefined},t),undefined)
  assert.equal(metricStatisticUnit(output('count'),t),undefined,'计数不能沿用输入物理单位')
  assert.equal(metricStatisticUnit(output(),t,{unit:'V/s'}),'V/s','生产者已有单位事实优先')
  assert.equal(metricStatisticUnit({metricId:'plain',unit:'kW'},t),'kW')
  assert.equal(metricStatisticUnit({metricId:'unknown'},t,undefined,'V'),'V')
  const precise='0.000000000000000000000123'
  assert.equal(metricStatisticSigned(precise,precise,output()),'+'+precise)
  for (const value of [-1,0,null,true]) assert.equal(metricStatisticSigned(String(value),value,output()),String(value))
  assert.equal(metricStatisticBaseline(output()),'centered')
  assert.equal(metricStatisticBaseline(output('variance')),'zero')
  assert.equal(metricStatisticBaseline({metricId:'legacy',metricKind:'rate'}),undefined,'不猜测旧指标使用的统计方法')
})

test('斜率的缩略图和悬停使用相同零轴，保留负值、空值和真实样本',()=>{
  const points=[[100,-2],[200,null],[300,4]]
  const chart=metricSparkline(points,[100,300],'centered')
  assert.equal(chart.zero,28)
  assert.equal((chart.path.match(/M/g)||[]).length,2)
  assert.equal(metricSparklinePoint(points,296,[100,300],'centered').y,chart.peak.y)
  assert.equal(metricSparklinePoint(points,150,[100,300],'centered'),undefined)
  assert.equal(metricSparkline([[100,0],[200,0]],undefined,'centered').zero,28)
  assert.equal(metricSparkline([[100,2],[200,4]],undefined,'zero').zero,48)
  assert.equal(metricSparkline([[100,2],[200,4]]).zero,undefined)
})

test('主值展示带符号与时间单位；更换统计口径无需转换或清理原始值',async()=>{
  const props=reactive({output:output(),unit:'old unit',value:{metricId:'result',value:.3,status:'valid',quality:{valid:true}},summary:true})
  const view=mount('components/Metric/MetricValue.vue',props)
  try {
    assert.match(textContent(view.root),/\+0.3/)
    assert.match(textContent(view.root),/pp \/ minute/)
    props.output=output('variance','(°C)²');await flush()
    assert.doesNotMatch(textContent(view.root),/\+0.3/)
    assert.match(textContent(view.root),/\(°C\)²/)
    assert.equal(props.value.value,.3)
  } finally {view.app.unmount()}
})

test('同一结果在缩略图和详情中使用相同量纲与对称坐标，切换普通统计不保留斜率装饰',async()=>{
  const props=reactive({output:output(),unit:'old unit',values:[{metricId:'result',evaluationTime:100,value:-2},{metricId:'result',evaluationTime:300,value:4}],bounds:[100,300],compact:true})
  const view=mount('components/Metric/MetricTrend.vue',props)
  try {
    assert.equal(walk(view.root,node=>node.type==='path' && node.props.class==='metric-trend-mini__zero').length,1)
    props.compact=false;await flush()
    const chart=()=>walk(view.root,node=>node.type==='chart')[0].props.option
    assert.equal(chart().yAxis.name,'pp / minute')
    assert.equal(chart().yAxis.min({min:-2,max:4}),-4)
    assert.equal(chart().yAxis.max({min:-2,max:4}),4)
    assert.equal(chart().tooltip.valueFormatter(.3),'+0.3 pp / minute')
    assert.equal(chart().series[0].markLine.data[0].yAxis,0)
    assert.equal(chart().yAxis.axisLabel.formatter(.084211755),'0.0842','极值刻度不能展示长尾数字造成裁切')
    assert.equal(chart().yAxis.nameTextStyle.align,'left')
    assert.equal(chart().grid.top,28)
    props.output=output('variance','(°C)²');await flush()
    assert.equal(chart().series[0].markLine,undefined)
    assert.equal(chart().yAxis.name,'(°C)²')
    assert.equal(props.values[0].value,-2,'显示策略不改写数据')
  } finally {view.app.unmount()}
})

test('共享目录迟到和语言变动不新增请求，来源卡片和关联卡片使用同一说明',async()=>{
  const directory=ref([]),props=reactive({output:output()})
  const {metricAggregationsKey}=load('components/Metric/calculatorContext.ts')
  const {renderer,root}=createMetricRenderer()
  const Summary=load('components/Metric/MetricStatisticSummary.vue').default
  const app=renderer.createApp({setup:()=>()=>h('main',[h(Summary,props),h(Summary,props)])})
  app.provide(metricAggregationsKey,directory);app.config.warnHandler=()=>{};app.mount(root)
  try {
    assert.match(textContent(root),/Rate of change · Last 5 minutes/)
    assert.doesNotMatch(textContent(root),/timeSlope/)
    directory.value=[{id:'timeSlope',name:'Time slope',icon:'RiseOutlined'}];await flush()
    assert.equal(walk(root,node=>node.type==='p' && node.props.class==='metric-statistic-summary').length,2)
    assert.match(textContent(root),/Time slope · Last 5 minutes/)
    assert.equal(props.output.resultSemantics.unit,'pp')
  } finally {app.unmount()}
})
