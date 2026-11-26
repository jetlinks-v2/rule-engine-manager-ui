import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, effectScope, h, reactive, ref } from 'vue'
import * as echarts from 'echarts'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent } from './helpers/metricRuntime.mjs'

const language = ref('zh')
let messages
const load = createMetricLoader({ '@vueuse/core':{ useElementSize:() => ({width:ref(736),height:ref(500)}) }, 'vue-i18n':{ useI18n:() => ({ locale:language, t:(key, values = {}) => {
  let text = messages[language.value][key] || key
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value))
  return text
} }) } })
messages = load('components/Metric/messages.ts').metricMessages
const { historyRecords, historyIntervals, historyBounds, historyGroup, historyGaps, historyStateBuckets } = load('components/Metric/history/projection.ts')
const { stateAppearance } = load('components/Metric/stateIntervals.ts')
const { useHistoryTimeline, useHistoryKind } = load('components/Metric/history/useHistoryTimeline.ts')
const { useTimeZoom, timeZoomRange } = load('hooks/Echarts/useTimeZoom.ts')
const { useHistoryChart } = load('components/Metric/history/useHistoryChart.ts')
const Timeline = load('components/Metric/history/MetricHistoryTimeline.vue').default
const row = (id, time, value, extra = {}) => ({ metricId:'result', resultId:id, evaluationTime:time, value, quality:{ valid:true }, ...extra })
const interval = (id, startTime, endTime, value, extra = {}) => ({ id, startTime, endTime, value, validUntil:10000, startKnown:true, endKnown:true, observedUntil:endTime, ...extra })
const nodes = (root, type) => walk(root, node => node.type === type)
const byClass = (root, name) => walk(root, node => node.props.class?.split(' ').includes(name))
const chart = root => nodes(root,'external-shell').find(node => node.props.option?.series)
function mount(props) {
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp({ setup:() => () => h(Timeline, props) })
  for (const name of ['a-button','a-tag','a-tooltip','AIcon']) app.component(name, defineComponent({ inheritAttrs:false, setup:(_, { attrs, slots }) => () => h(name, attrs, slots.default?.()) }))
  app.mount(root)
  return { root, close:() => app.unmount() }
}
function model(rows, bounds = [0,1000]) {
  const scope = effectScope(), entries = ref(historyRecords(rows)), range = ref(bounds)
  const state = scope.run(() => useHistoryTimeline(entries, range))
  return { entries, range, state, close:() => scope.stop() }
}

test('布尔计算保留true、false与无效记录；质量未声明不抹去已记录的布尔值，也不推导时长', () => {
  const input = [row('a',0,false), row('b',100,true,{ quality:undefined }), row('c',200,false,{ status:'invalid' }), row('d',300,null), row('e',400,true,{ quality:{ stale:true } })]
  const entries = historyRecords(input)
  assert.deepEqual(entries.map(entry => entry.state), [false,true,null,null,null])
  assert.ok(entries.every(entry => entry.kind === 'record' && !Object.hasOwn(entry,'end')))
  assert.deepEqual(historyIntervals(input), [], 'boolean samples never imply continuous states')
  assert.deepEqual(historyBounds([entries[0]]), [-1,1])
  assert.deepEqual(historyBounds(entries,[0,0]), [-1,1])
  assert.equal(historyBounds([], [1,0]), undefined)
})

test('同刻的不同结果可分别选中，刷新顺序与新增记录不改变身份，缺少id的旧记录仍保留', () => {
  const rows = [row('a',100,true), row('b',100,false), row(undefined,100,true), row(undefined,100,false)]
  const before = historyRecords(rows), after = historyRecords([...rows].reverse())
  assert.equal(before.length,4)
  assert.deepEqual(before.map(entry=>entry.key),after.map(entry=>entry.key))
  assert.equal(new Set(before.map(entry=>entry.key)).size,4)
  assert.equal(historyRecords([rows[0],rows[0]]).length,1, 'same result id is one record')
  assert.equal(historyRecords([rows[2],rows[2]]).length,2, 'legacy duplicates cannot be discarded as different results may have no id')
})

test('匿名执行引用保持历史选择且同轮不同输出不互相去重',()=>{
  const first=row(undefined,100,true,{executionId:'round-a'}),second=row(undefined,100,true,{executionId:'round-b'})
  const entries=historyRecords([first,second])
  assert.equal(entries.length,2)
  assert.deepEqual(entries.map(entry=>entry.key),historyRecords([second,first]).map(entry=>entry.key))
  assert.equal(historyRecords([first,{...first}]).length,1)
  assert.equal(historyRecords([first,{...first,metricId:'other'}]).length,2)
  const current={...first,evaluationTime:200,state:{currentInterval:interval('state',100,undefined,true)}}
  assert.equal(historyIntervals([],current,[100,300])[0].value.executionId,'round-a')
})

test('记录时间0、无效时间与范围外记录按事实投影', () => {
  assert.equal(historyRecords([row('a',0,false)],[0,1000])[0].time,0)
  assert.equal(historyRecords([row('bad',NaN,true),row('outside',1200,true)],[0,1000]).length,0)
})

test('卡片分格只统计已读取样本，保留类型、稀有状态与结束边界，桶数有界',()=>{
  const samples=historyRecords([row('outside',-1,false),...Array.from({length:60},(_,index)=>row(String(index),index*10,false)),row('end',600,true),row('n',100,1),row('s',100,'1'),row('bad',100,null)],undefined,true)
  const buckets=historyStateBuckets(samples,[0,600],10)
  assert.ok(buckets.length<=10)
  assert.equal(buckets.flatMap(bucket=>bucket.states).reduce((sum,state)=>sum+state.count,0),64)
  assert.deepEqual(buckets.at(-1).states.find(state=>state.state===true),{state:true,count:1})
  assert.equal(buckets.flatMap(bucket=>bucket.states).filter(state=>state.state===1 || state.state==='1').length,2)
  assert.ok(buckets.every(bucket=>bucket.from>=0 && bucket.to<=600))
  assert.deepEqual(historyStateBuckets([], [0,1000],10),[])
})

test('声明的数字与文本状态保留类型、平台外观和未知质量，不被解释为数值趋势或布尔', async () => {
  const entries = historyRecords([row('n',100,1),row('s',200,'1'),row('bad',300,1,{status:'invalid'}),row('nan',400,NaN)],undefined,true)
  assert.deepEqual(entries.map(entry => entry.state),[1,'1',null,null])
  assert.equal(new Set(entries.map(historyGroup)).size,3)
  assert.ok(entries.every(entry => !Object.hasOwn(entry,'end')),'enum samples cannot manufacture intervals')
  const view = mount({ entries,bounds:[0,1000],labels:[{value:1,name:'正常',icon:'color:#22c55e'},{value:'1',name:'维护',icon:'img:/maintenance.svg'},{value:2,name:'异常',icon:'font:WarningOutlined'}] })
  try {
    assert.ok(textContent(view.root).includes('正常'));assert.ok(textContent(view.root).includes('维护'))
    const absent = nodes(view.root,'button').find(node => textContent(node).includes('异常'))
    assert.equal(absent,undefined,'states with no records do not occupy the legend')
    const data = chart(view.root).props.option.series[0].data
    assert.equal(data.find(item => item.entry.state === 1).itemStyle.color,'#22c55e')
    assert.notEqual(data[0].value[2],data[1].value[2])
    assert.equal(chart(view.root).props.option.series[1].data.length,0)
  } finally {view.close()}
})

test('持续区间保留原始边界、严格区分多状态类型、过期截断且不覆盖未知间隔', () => {
  const first = interval('a',0,200,1), second = interval('b',400,600,'1')
  const current = row('c',900,true,{ state:{ currentInterval:interval('c',800,undefined,true,{ validUntil:850, endKnown:false }), readView:{ time:1000, duration:null } } })
  const entries = historyIntervals([row('a',200,1,{ state:{ closedInterval:first } }),row('b',600,'1',{ state:{ closedInterval:second } })],current,[100,1000])
  assert.deepEqual(entries.map(entry=>[entry.time,entry.end]),[[0,200],[400,600],[800,850]])
  assert.strictEqual(entries[0].interval,first, 'view clipping must not rewrite original start or duration')
  assert.equal(new Set(entries.map(historyGroup)).size,3)
  assert.deepEqual(historyGaps(entries,[100,1000]),[{start:200,end:400},{start:600,end:800},{start:850,end:1000}])
  assert.equal(current.state.readView.time,1000, 'projection does not advance or mutate server facts')
})

test('固定身份跨刷新、短暂空数组与移除保留；明确missing，取消后查看最新记录', async () => {
  const view = model([row('a',100,false),row('b',200,true)])
  try {
    view.state.choose(view.entries.value[0])
    view.entries.value = historyRecords([row('c',300,true),row('b',200,true),row('a',100,false)])
    await flush()
    assert.equal(view.state.detail.value.value.resultId,'a')
    view.entries.value = []; await flush()
    assert.equal(view.state.missing.value,true)
    view.entries.value = historyRecords([row('a',100,false),row('b',200,true)]); await flush()
    assert.equal(view.state.missing.value,false); assert.equal(view.state.detail.value.value.resultId,'a')
    view.entries.value = historyRecords([row('b',200,true)]); await flush()
    assert.equal(view.state.detail.value,undefined); assert.equal(view.state.missing.value,true)
    view.state.clear()
    assert.equal(view.state.detail.value.value.resultId,'b'); assert.equal(view.state.pinned.value,false)
  } finally { view.close() }
})

test('筛选状态被全部移除后，查看最新记录会回到仍有数据的全部范围', async () => {
  const view = model([row('a',100,false),row('b',200,true)])
  try {
    view.state.chooseFilter(historyGroup(view.entries.value[0]))
    view.entries.value = historyRecords([row('b',200,true)]); await flush()
    assert.equal(view.state.missing.value,true)
    view.state.clear()
    assert.equal(view.state.filter.value,undefined)
    assert.equal(view.state.detail.value.value.resultId,'b')
  } finally { view.close() }
})

test('方向键遍历同刻记录，Home/End、Esc、筛选与悬停各自保持选择语义', () => {
  const view = model([row('a',100,false),row('b',100,true),row('c',900,true)])
  const key = value => view.state.keydown({ key:value, preventDefault() {} })
  try {
    key('Home'); assert.equal(view.state.detail.value.value.resultId,'a')
    key('ArrowRight'); assert.equal(view.state.detail.value.value.resultId,'b')
    view.state.hover(view.entries.value[2])
    assert.equal(view.state.hovered.value.value.resultId,'c'); assert.equal(view.state.detail.value.value.resultId,'b')
    key('End'); assert.equal(view.state.detail.value.value.resultId,'c')
    view.state.chooseFilter(historyGroup(view.entries.value[0]))
    assert.equal(view.state.visible.value.length,1); assert.equal(view.state.detail.value.state,false)
    view.state.chooseFilter(); key('Escape'); view.state.hover(view.entries.value[0])
    assert.equal(view.state.detail.value.value.resultId,'a'); assert.equal(view.state.pinned.value,false)
    view.state.leave(); assert.equal(view.state.detail.value.value.resultId,'c')
    view.state.hover(); assert.equal(view.state.hovered.value,undefined)
  } finally { view.close() }
})

test('空刷新保留历史类型，切换对象或输出重置；真实混合类型不被强行视作布尔', async () => {
  const scope = effectScope(), values = ref([row('a',100,true)]), current = ref(), identity = ref('device:a/output:1')
  const kind = scope.run(() => useHistoryKind(values,current,identity))
  try {
    assert.equal(kind.value,'boolean')
    values.value = []; await flush(); assert.equal(kind.value,'boolean')
    identity.value = 'device:b/output:1'; await flush(); assert.equal(kind.value,'other')
    current.value = row('b',200,42); await flush(); assert.equal(kind.value,'number')
    values.value = [row('a',100,true),row('b',200,42)]; await flush(); assert.equal(kind.value,'other')
  } finally { scope.stop() }
})

test('公共时间轴支持悬停、固定、键盘、清晰缺失提示；刷新不丢身份且原始数据按文本展示', async () => {
  language.value = 'zh'
  const props = reactive({ entries:historyRecords([row('a',100,false,{ reason:'<script>unsafe</script>' }),row('b',900,true)]), bounds:[0,1000], limited:true, canInspectSource:true })
  const view = mount(props)
  const plot = () => byClass(view.root,'history-timeline__plot')[0]
  const pointer = (_clientX, pin = false) => chart(view.root).props.events[pin ? 'click' : 'mouseover']({ seriesId:'facts',dataIndex:0 })
  try {
    assert.ok(textContent(view.root).includes('未成立')); assert.ok(textContent(view.root).includes('成立'))
    assert.equal(byClass(view.root,'history-record').length,0,'current summary is not repeated as a default record')
    pointer(100); await flush(); assert.equal(byClass(view.root,'history-record').length,0,'hover stays inside the chart tooltip')
    pointer(100,true); await flush(); assert.ok(textContent(view.root).includes('unsafe'))
    assert.ok(nodes(view.root,'a-button').some(node=>node.props['aria-label']==='取消固定'))
    props.entries = historyRecords([row('a',100,false),row('b',900,true),row('c',950,true)]); await flush()
    assert.ok(textContent(byClass(view.root,'history-record')[0]).includes('未成立'))
    props.entries = []; await flush(); assert.ok(textContent(view.root).includes('这条记录已不在当前返回范围中'))
    props.entries = historyRecords([row('a',100,false),row('b',900,true)]); await flush()
    plot().props.onKeydown({ key:'End',preventDefault() {} }); await flush()
    assert.ok(textContent(byClass(view.root,'history-record')[0]).includes('成立'))
    assert.equal(nodes(view.root,'script').length,0)
    const info = nodes(view.root,'a-tooltip').find(node=>node.props.title?.includes('200'))
    assert.ok(info.props.title.includes('200')); assert.deepEqual(info.props.trigger,['hover','focus','click'])
    language.value = 'en'; await flush()
    assert.ok(nodes(view.root,'a-button').some(node=>node.props['aria-label']==='Unpin record'))
    assert.ok(textContent(view.root).includes('Data quality'))
  } finally { view.close(); language.value = 'zh' }
})

test('区间与记录共用详情交互，范围裁剪不裁短持续时长，状态名支持国际化', async () => {
  const entries = historyIntervals([row('a',200,1,{ state:{ closedInterval:interval('a',0,200,1,{ startKnown:false }) } })],undefined,[100,300])
  const props = reactive({ entries, bounds:[100,300], intervals:true, limited:true, labels:[{ value:1, name:'运行', nameI18n:{ en:'Running' } }] })
  const view = mount(props)
  try {
    const bands = chart(view.root).props.option.series[0].data
    assert.equal(bands.length,1); assert.deepEqual(bands[0].value,[0,200,0])
    chart(view.root).props.events.click({seriesId:'facts',dataIndex:0});await flush()
    assert.ok(textContent(view.root).includes('开始记录')); assert.ok(textContent(view.root).includes('至少'))
    assert.ok(textContent(view.root).includes('运行'))
    assert.ok(textContent(view.root).includes('查询已达上限'))
    assert.ok(nodes(view.root,'a-tooltip').some(node=>node.props.title?.includes('状态区间按标识去重')))
    language.value = 'en'; await flush(); assert.ok(textContent(view.root).includes('Running'))
    props.entries = []; await flush(); assert.ok(textContent(view.root).includes(messages.en.intervalNoHistory))
    assert.equal(chart(view.root),undefined)
  } finally { view.close(); language.value = 'zh' }
})

test('持续区间过期后不假装精确结束，使用截至有效期的下界时长', async () => {
  language.value = 'zh'
  const current = row('now',900,true,{ state:{ currentInterval:interval('expired',100,undefined,'running',{ validUntil:500,endKnown:false }), readView:{ time:900,duration:null } } })
  const view = mount({ entries:historyIntervals([],current,[0,1000]),bounds:[0,1000],intervals:true })
  try {
    chart(view.root).props.events.click({seriesId:'facts',dataIndex:0});await flush()
    const text = textContent(view.root)
    assert.ok(text.includes('至少')); assert.ok(text.includes('观测中断'))
    assert.equal(text.includes('仍在持续'),false)
  } finally { view.close() }
})

test('状态外观直接使用平台color/font/image字符串，保持原类型映射和稳定回退', () => {
  const labels=[{ value:1,name:'运行',icon:'color:#22c55e' },{ value:'1',name:'维护',icon:'font:ToolOutlined' },{ value:true,name:'在线',icon:'img:/files/online.png' }]
  assert.deepEqual(stateAppearance(1,labels),{ icon:'color:#22c55e',color:'#22c55e' })
  assert.equal(stateAppearance('1',labels).icon,'font:ToolOutlined')
  assert.equal(stateAppearance('1',labels).color,stateAppearance('1').color)
  assert.equal(stateAppearance(true,labels).icon,'img:/files/online.png')
  assert.equal(stateAppearance(true,labels).color,stateAppearance(true).color)
  assert.equal(stateAppearance(2,labels).icon,undefined)
  assert.equal(stateAppearance(0).color,'var(--ink-3)','unconfigured state values never imply a healthy color')
  assert.equal(stateAppearance(1).color,stateAppearance(0).color)
  assert.deepEqual(stateAppearance(2),stateAppearance(2), 'unconfigured legacy templates remain deterministic')
})

test('未确认轨道只取真实区间的补集，支持重叠、范围裁剪与空历史，不受状态筛选影响', () => {
  const entries=historyIntervals([row('a',300,1,{state:{closedInterval:interval('a',100,300,1)}}),row('b',400,2,{state:{closedInterval:interval('b',200,400,2)}}),row('c',700,1,{state:{closedInterval:interval('c',600,700,1)}})],undefined,[0,1000])
  assert.deepEqual(historyGaps(entries,[0,1000]),[{start:0,end:100},{start:400,end:600},{start:700,end:1000}])
  assert.deepEqual(historyGaps(entries,[250,650]),[{start:400,end:600}])
  assert.deepEqual(historyGaps([],[0,1000]),[{start:0,end:1000}])
})

test('短区间聚焦改变查看轴，不改变状态事实、固定身份或完整持续时长', () => {
  const scope=effectScope(), entryRows=historyIntervals([row('a',900000,1,{state:{closedInterval:interval('a',800000,824000,1,{validUntil:1000000})}})],undefined,[0,1000000])
  const entries=ref(entryRows),bounds=ref([0,1000000]),state=scope.run(()=>useHistoryTimeline(entries,bounds))
  try {
    state.choose(entryRows[0]);state.focused.value=true
    assert.deepEqual(state.axis.value,[680000,944000])
    assert.equal(state.detail.value.end-state.detail.value.time,24000)
    assert.equal(state.detail.value.key,entryRows[0].key)
    state.focused.value=false;assert.deepEqual(state.axis.value,[0,1000000])
  } finally {scope.stop()}
})

test('24小时内短状态区间有独立可点击标记和时间语义，图例筛选不把其他状态变成未知', async () => {
  language.value='zh'
  const data=[row('a',300000,1,{state:{closedInterval:interval('a',100000,300000,1,{validUntil:86400000})}}),row('b',324000,0,{state:{closedInterval:interval('b',300000,324000,0,{validUntil:86400000})}})]
  const props=reactive({entries:historyIntervals(data,undefined,[0,86400000]),bounds:[0,86400000],intervals:true,labels:[{value:1,name:'在线',icon:'color:#22c55e'},{value:0,name:'离线',icon:'font:DisconnectOutlined'}]})
  const view=mount(props)
  try {
    const bands=chart(view.root).props.option.series[0].data
    assert.equal(bands.length,2)
    assert.ok(textContent(byClass(view.root,'history-chart__shortcuts')[0]).includes('24秒'))
    assert.equal(bands[0].itemStyle.color,'#22c55e')
    assert.equal(chart(view.root).props.option.series[1].data.length,2)
    const filter=nodes(view.root,'button').find(node=>textContent(node).includes('离线')&&node.props['aria-pressed']===false)
    filter.props.onClick();await flush()
    assert.equal(chart(view.root).props.option.series[0].data.length,2)
    assert.deepEqual(chart(view.root).props.option.series[0].data.map(item=>item.itemStyle.opacity),[.22,1])
    assert.equal(chart(view.root).props.option.series[1].data.length,2,'confirmed online time stays confirmed when only offline lane is shown')
    const focus=nodes(view.root,'a-button').find(node=>node.props['aria-label']==='框选放大')
    focus.props.onClick();await flush()
    assert.equal(chart(view.root).props.option.toolbox.feature.restore.title,'返回完整范围')
  } finally {view.close()}
})

test('查询重置原位清理筛选、缩放和固定记录，不重新固定到末条', async () => {
  const selected=[]
  const props=reactive({entries:historyRecords([row('a',100,false),row('b',900,true)]),bounds:[0,1000],resetSelection:0,onSelect:(entry,pinned)=>selected.push({entry,pinned})})
  const view=mount(props)
  try {
    const initial=chart(view.root)
    initial.props.events.click({seriesId:'facts',dataIndex:0});await flush()
    assert.ok(byClass(view.root,'history-record').length)
    initial.props.events.datazoom({startValue:50,endValue:500});await flush()
    props.resetSelection++;await flush()
    assert.strictEqual(chart(view.root),initial)
    assert.equal(byClass(view.root,'history-record').length,0)
    assert.equal(selected.at(-1).pinned,false)
    assert.equal(initial.props.option.xAxis.min,0)
    assert.equal(initial.props.option.xAxis.max,1000)
  } finally {view.close()}
})

test('原生缩放解析批量时间值及百分比，滚动查询范围保留绝对视口，恢复才重置', async () => {
  const scope=effectScope(),bounds=ref([0,1000]),current=ref(),applied=[]
  const zoom=scope.run(()=>useTimeZoom(bounds,current,value=>{applied.push(value);current.value=value},key=>key))
  try {
    assert.deepEqual(timeZoomRange({batch:[{startValue:0,endValue:500}]},[0,1000]),[0,500])
    assert.equal(timeZoomRange({startValue:900,endValue:100},[0,1000]),undefined)
    assert.equal(timeZoomRange({startValue:NaN,endValue:100},[0,1000]),undefined)
    zoom.events.datazoom({batch:[{start:20,end:90}]});await flush()
    assert.deepEqual(current.value,[200,900])
    assert.equal(zoom.option.value.dataZoom[0].filterMode,'none')
    assert.equal(zoom.option.value.toolbox.feature.dataZoom.yAxisIndex,'none')
    bounds.value=[0,1000];await flush();assert.deepEqual(current.value,[200,900])
    zoom.events.restore();assert.equal(current.value,undefined)
    zoom.events.datazoom({startValue:0,endValue:500});assert.deepEqual(current.value,[0,500])
    bounds.value=[100,1100];await flush();assert.deepEqual(current.value,[0,500])
    assert.deepEqual(zoom.extent.value,[0,1100],'an inspected range remains available after the query rolls forward')
    bounds.value=[1000,2000];await flush();assert.deepEqual(current.value,[0,500])
    assert.deepEqual(zoom.extent.value,[0,2000],'expired query data does not move the inspected time window')
    zoom.events.restore();await flush();assert.equal(current.value,undefined);assert.deepEqual(zoom.extent.value,[1000,2000])
  } finally {scope.stop()}
})

test('详情只展示有记录的布尔类别；缩略图与详情共享分行刻度，框选不产生连续状态', async () => {
  const entries=historyRecords([row('a',100,false),row('b',900,false)])
  const view=mount({entries,bounds:[0,1000]})
  try {
    const trueButton=nodes(view.root,'button').find(node=>textContent(node).replaceAll(/\s/g,'')==='成立0')
    assert.equal(trueButton,undefined)
    const native=chart(view.root)
    assert.equal(native.props.option.series[1].data.length,0,'records never create continuous intervals or gap bands')
    native.props.events.datazoom({startValue:50,endValue:500});await flush()
    assert.equal(byClass(view.root,'history-record').length,0)
    assert.equal(chart(view.root).props.option.dataZoom[0].startValue,undefined,'native drag state is not echoed through full setOption')
    assert.equal(chart(view.root).props.option.series[0].data.length,2,'native clipping retains returned facts')
  } finally {view.close()}
})

test('自定义布尔标签即使0条也保留名称与平台外观，未知记录保持中性', async () => {
  const view=mount({entries:historyRecords([row('a',100,false),row('b',200,true,{status:'invalid'})]),bounds:[0,1000],
    labels:[{value:true,name:'超限',icon:'font:WarningOutlined'},{value:false,name:'未超限',icon:'color:#22c55e'}]})
  try {
    const empty=nodes(view.root,'button').find(node=>textContent(node).replaceAll(/\s/g,'')==='超限0')
    assert.equal(empty,undefined)
    const marks=chart(view.root).props.option.series[0].data
    assert.equal(marks.find(mark=>mark.entry.state===false).itemStyle.color,'#22c55e')
    assert.ok(marks.find(mark=>mark.entry.state===null).itemStyle.color)
    assert.ok(textContent(view.root).includes('无有效结果'))
  } finally {view.close()}
})

test('原生事件按数据身份区分同刻不同布尔结果，空白行不吸附或清除固定记录', async () => {
  const view=mount({entries:historyRecords([row('a',100,false),row('b',100,true)]),bounds:[0,1000]})
  try {
    chart(view.root).props.events.click({seriesId:'facts',dataIndex:1});await flush()
    assert.ok(textContent(byClass(view.root,'history-record')[0]).includes('成立'))
    chart(view.root).props.events.click({seriesId:'unconfirmed',dataIndex:0});chart(view.root).props.events.globalout();await flush()
    assert.ok(nodes(byClass(view.root,'history-record')[0],'a-button').some(node=>node.props['aria-label']==='取消固定'))
    chart(view.root).props.events.click({seriesId:'facts',dataIndex:0});await flush()
    assert.ok(textContent(byClass(view.root,'history-record')[0]).includes('未成立'))
  } finally {view.close()}
})

test('真实ECharts custom series裁剪区间并区分离散记录，原生缩放及恢复不改写时间事实', async () => {
  const entries=historyIntervals([row('a',300,1,{state:{closedInterval:interval('a',100,300,1)}}),row('b',900,'1',{state:{closedInterval:interval('b',600,900,'1')}})],undefined,[0,1000])
  const props=reactive({entries,bounds:[0,1000],viewBounds:[0,1000],intervals:true,labels:[{value:1,name:'运行',icon:'color:#22c55e'},{value:'1',name:'维护',icon:'img:/maintenance.svg'}]})
  const view=ref(),range=ref(props.bounds)
  let model,zoom
  const environment=createMetricRenderer(),app=environment.renderer.createApp({setup() {
    zoom=useTimeZoom(range,view,value=>{view.value=value},key=>key)
    model=useHistoryChart(props,ref('zh'),key=>key,zoom.extent)
    return () => h('div')
  }})
  app.mount(environment.root)
  const instance=echarts.init(null,undefined,{renderer:'svg',ssr:true,width:800,height:300})
  instance.on('datazoom',zoom.events.datazoom);instance.on('restore',zoom.events.restore)
  try {
    instance.setOption({...model.option.value,...zoom.option.value})
    zoom.ready(instance);await flush()
    assert.ok(instance.renderToSVGString().includes('#22c55e'))
    assert.deepEqual(model.option.value.series[0].data.map(item=>item.value),[[100,300,0],[600,900,0]])
    instance.dispatchAction({type:'dataZoom',startValue:200,endValue:700});await flush()
    assert.deepEqual(view.value,[200,700])
    instance.setOption({...model.option.value,...zoom.option.value})
    assert.equal(instance.getOption().dataZoom[0].startValue,200,'sample updates preserve the native viewport')
    assert.equal(instance.getOption().dataZoom[0].endValue,700)
    assert.ok(instance.renderToSVGString().includes('#22c55e'))
    props.bounds=range.value=[50,1050]
    instance.setOption({...model.option.value,...zoom.option.value});await flush()
    assert.equal(instance.getOption().dataZoom[0].startValue,200,'a rolling query must not reset or shift the selected absolute time')
    assert.equal(instance.getOption().dataZoom[0].endValue,700)
    props.bounds=range.value=[1000,2000]
    instance.setOption({...model.option.value,...zoom.option.value});await flush()
    assert.equal(instance.getOption().dataZoom[0].startValue,200,'even an evicted range remains at its original time')
    assert.equal(instance.getOption().xAxis[0].min,200)
    props.selected=entries[0];await flush()
    assert.deepEqual(model.option.value.series[0].data.map(item=>item.itemStyle.opacity),[1,.22])
    assert.equal(entries[0].time,100);assert.equal(entries[0].end,300)
    instance.dispatchAction({type:'restore'});assert.equal(view.value,undefined)
    props.bounds=range.value=[0,1000]
    props.intervals=false;props.entries=historyRecords([row('same-false',500,false),row('same-true',500,true)]);await flush()
    instance.setOption({...model.option.value,...zoom.option.value})
    assert.equal(model.option.value.series[1].data.length,0)
    assert.equal(model.option.value.series[0].data[0].value[0],model.option.value.series[0].data[1].value[0])
    assert.notEqual(model.option.value.series[0].data[0].value[2],model.option.value.series[0].data[1].value[2])
    assert.ok(instance.renderToSVGString().includes('<path'))
  } finally { instance.dispose();app.unmount() }
})

test('拖动不回写整份option，外部聚焦才调用原生dataZoom；卸载取消待执行动作', async () => {
  const scope=effectScope(),bounds=ref([0,1000]),view=ref(),actions=[]
  const zoom=scope.run(()=>useTimeZoom(bounds,view,value=>{view.value=value},key=>key))
  const instance={isDisposed:()=>false,dispatchAction:value=>actions.push(value)}
  try {
    zoom.ready(instance);await flush()
    const canonical=zoom.option.value,initial=actions.length
    for(let start=10;start<50;start+=10) zoom.events.datazoom({start,end:90})
    await flush()
    assert.strictEqual(zoom.option.value,canonical,'continuous drag must not invalidate the canonical chart option')
    assert.equal(actions.length,initial,'native gestures must not dispatch back to the chart')
    view.value=[500,600];await flush()
    assert.equal(actions.at(-1).startValue,500);assert.equal(actions.at(-1).endValue,600)
    zoom.dispose(instance);const before=actions.length
    view.value=[600,700];await flush();assert.equal(actions.length,before)
  } finally {scope.stop()}
})

test('统一工具使用原生brush时间坐标缩放；概览显隐与实时刷新保留绝对视口', async () => {
  const scope=effectScope(),bounds=ref([0,1000]),view=ref()
  const zoom=scope.run(()=>useTimeZoom(bounds,view,value=>{view.value=value},key=>key,true))
  const instance=echarts.init(null,undefined,{renderer:'svg',ssr:true,width:800,height:220})
  let brushAreas
  instance.on('brush',event=>{brushAreas=event.areas})
  const option=()=>({...zoom.option.value,animation:false,xAxis:{type:'time',min:zoom.extent.value[0],max:zoom.extent.value[1]},yAxis:{type:'value'},series:[{type:'line',data:[[0,0],[1000,1]]}]})
  try {
    instance.setOption(option());zoom.ready(instance);await flush()
    assert.equal(zoom.controls.overview.value,false)
    assert.equal(zoom.option.value.toolbox.show,false,'external tools replace the duplicated native toolbox')
    zoom.controls.brush();assert.equal(zoom.controls.brushing.value,true)
    instance.dispatchAction({type:'brush',areas:[{brushType:'lineX',xAxisIndex:0,coordRange:[200,700]}]})
    assert.equal(brushAreas.length,1)
    zoom.events.brushEnd({areas:[{coordRange:[200,700]}]});await flush()
    assert.deepEqual(view.value,[200,700]);assert.equal(zoom.controls.brushing.value,false)
    assert.equal(instance.getOption().dataZoom[0].startValue,200)
    assert.deepEqual(brushAreas,[],'the native brush action clears the selection overlay after zoom')
    zoom.controls.overview.value=true;instance.setOption(option());await flush()
    assert.deepEqual(view.value,[200,700]);assert.equal(instance.getOption().dataZoom[1].show,true)
    bounds.value=[100,1100];instance.setOption(option());await flush()
    assert.equal(instance.getOption().dataZoom[0].startValue,200);assert.equal(instance.getOption().dataZoom[0].endValue,700)
    assert.equal(zoom.controls.overview.value,true)
    zoom.controls.reset();await flush();assert.equal(view.value,undefined)
  } finally {zoom.dispose(instance);instance.dispose();scope.stop()}
})
