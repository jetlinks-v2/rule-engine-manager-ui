import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h } from 'vue'
import { createMetricLoader, createMetricRenderer, flush, textContent, walk } from './helpers/metricRuntime.mjs'
const load=createMetricLoader()
const {metricInputDiagnostics,metricIssueCaption,metricIssueReason,metricIssueInputId,metricIssueNextStep}=load('components/Metric/sourceDiagnostics.ts')
const {metricMessages}=load('components/Metric/messages.ts')
const {metricState,metricChartPoints}=load('components/Metric/presentation.ts')
test('source diagnostics preserve bounded required and optional facts, without inventing a device state',()=>{
  const issues=Array.from({length:10},(_,i)=>({inputId:`i${i}`,reason:i ? 'optionalInputMissing' : 'inputExpired',required:!i,eventTime:123}))
  const value={quality:{attributes:{inputIssues:issues,inputIssueCount:10}}}
  const result=metricInputDiagnostics(value)
  assert.equal(result.issues.length,8);assert.equal(result.total,10)
  const template={inputDefinitions:[{id:'i0',name:'温度'}]}
  assert.equal(metricIssueCaption(value,template,key=>metricMessages.zh[key]),'温度：数据未及时更新')
  assert.equal(metricIssueReason('unknownNewCode',key=>metricMessages.en[key]),'No usable value returned')
  assert.equal(metricIssueCaption({reason:'inputInvalid'},template,key=>key),undefined,'a generic failure cannot identify a source or an offline device')
  assert.deepEqual(metricInputDiagnostics(),{issues:[],total:0})
})

test('diagnoses resolve local aliases and upstream calculation names without selecting another rule binding',()=>{
  const template={inputDefinitions:[{id:'online',name:'平台连接状态'},{id:'temperature',name:'温度'}],outputs:[],definitions:[
    {id:'statistics',name:'近1小时连接统计'},
    {id:'result',inputs:[{id:'state',metricId:'online'},{id:'history',metricId:'statistics'}]},
    {id:'another',inputs:[{id:'state',metricId:'temperature'}]},
  ]}
  const value={metricId:'result',quality:{attributes:{inputIssues:[{inputId:'state',reason:'requiredInputMissing'}]}}}
  const t=key=>metricMessages.zh[key]
  assert.equal(metricIssueCaption(value,template,t),'平台连接状态：尚未收到数据')
  assert.equal(metricIssueInputId(value.quality.attributes.inputIssues[0],template,'result'),'online')
  value.quality.attributes.inputIssues=[{inputId:'history',reason:'inputInvalid'}]
  assert.equal(metricIssueCaption(value,template,t),'近1小时连接统计：数据不符合计算要求')
  assert.equal(metricIssueInputId(value.quality.attributes.inputIssues[0],template,'result'),undefined)
  assert.equal(metricIssueNextStep('inputInvalid',key=>key),'issueCheckSourceValue')
  assert.equal(metricIssueNextStep('requiredInputMissing',key=>key),'issueWaitForData')
  assert.equal(metricIssueNextStep('unknownNewCode',key=>key),undefined)
})

function mount(component,props) {
  const {renderer,root}=createMetricRenderer()
  const app=renderer.createApp({setup:()=>()=>h(component,props)})
  for(const name of ['a-tag','a-button','AIcon']) app.component(name,defineComponent({setup:(_, {attrs,slots})=>()=>h(name,attrs,slots.default?.())}))
  app.mount(root)
  return {root,close:()=>app.unmount()}
}

test('an absent result is neutral in cards and details, while input and calculation failures remain errors',async()=>{
  const localLoad=createMetricLoader({'vue-i18n':{useI18n:()=>({t:key=>metricMessages.zh[key],locale:{value:'zh'}})}})
  for(const reason of ['noValue','notApplicable','inputInvalid','calculationFailed']) {
    const value={metricId:'score',value:null,status:'invalid',reason,evaluationTime:123,quality:{valid:false}}
    const abnormal=['inputInvalid','calculationFailed'].includes(reason)
    assert.equal(metricState(value).tone,abnormal ? 'error' : 'default')
    assert.deepEqual(metricChartPoints([value]),[[123,null]],'an absent result remains a gap, never a zero or a previous value')
    const views=[
      mount(localLoad('components/Metric/MetricValue.vue').default,{value,summary:true,hideQuality:true}),
      mount(localLoad('components/Metric/MetricValue.vue').default,{value,inline:true,hideQuality:true}),
      mount(localLoad('components/Metric/MetricSourceIssues.vue').default,{value}),
    ]
    try {
      await flush()
      assert.equal(textContent(views[0].root).includes('未能计算'),abnormal)
      assert.equal(textContent(views[1].root).includes('未能计算'),abnormal)
      assert.equal(walk(views[2].root,node=>node.type==='details').length,abnormal ? 1 : 0)
      if (!abnormal) assert.match(textContent(views[0].root),/—/)
    } finally { views.forEach(view=>view.close()) }
  }
})

test('primary cards explain one cause while secondary outputs use a short status and keep the cause in their title',async()=>{
  const localLoad=createMetricLoader({'vue-i18n':{useI18n:()=>({t:key=>metricMessages.zh[key],locale:{value:'zh'}})}})
  const component=localLoad('components/Metric/MetricValue.vue').default
  const value={metricId:'score',status:'invalid',unit:'%',quality:{valid:false,attributes:{inputIssues:[{inputId:'online',reason:'inputInvalid'}]}}}
  const template={inputDefinitions:[{id:'online',name:'平台连接状态'}],definitions:[],outputs:[]}
  const main=mount(component,{value,template,summary:true,hideQuality:true})
  const inline=mount(component,{value,template,inline:true,hideQuality:true})
  try {
    await flush()
    assert.match(textContent(main.root),/未能计算/)
    assert.equal(textContent(main.root).split('平台连接状态：数据不符合计算要求').length,2)
    assert.equal(walk(main.root,node=>node.type==='a-tag').length,0)
    assert.doesNotMatch(textContent(main.root),/%/,'an invalid result must not display a unit without a value')
    assert.equal(textContent(inline.root),'—未能计算')
    assert.equal(walk(inline.root,node=>node.props.title==='平台连接状态：数据不符合计算要求').length,1)
  } finally { main.close();inline.close() }
})

test('details start expanded and only direct inputs provide a binding repair action',async()=>{
  const localLoad=createMetricLoader({'vue-i18n':{useI18n:()=>({t:key=>metricMessages.zh[key],locale:{value:'zh'}})}})
  const component=localLoad('components/Metric/MetricSourceIssues.vue').default
  const template={inputDefinitions:[{id:'online',name:'平台连接状态'}],outputs:[],definitions:[{id:'statistics',name:'连接统计'},
    {id:'result',inputs:[{id:'state',metricId:'online'},{id:'history',metricId:'statistics'}]}]}
  const issues=[{inputId:'state',reason:'requiredInputMissing',required:true},{inputId:'history',reason:'calculationFailed',required:true}]
  const edits=[]
  const view=mount(component,{template,value:{metricId:'result',status:'invalid',quality:{attributes:{inputIssues:issues}}},editable:true,onEditSource:id=>edits.push(id)})
  try {
    await flush()
    assert.equal(walk(view.root,node=>node.type==='details')[0].props.open,true)
    const buttons=walk(view.root,node=>node.type==='a-button')
    assert.equal(buttons.length,1)
    buttons[0].props.onClick()
    assert.deepEqual(edits,['online'])
    assert.match(textContent(view.root),/连接统计/)
    assert.match(textContent(view.root),/请查看上游计算及其输入/)
  } finally { view.close() }
})

test('optional references stay compact, while incomplete classifications keep the warning expanded',async()=>{
  const localLoad=createMetricLoader({'vue-i18n':{useI18n:()=>({t:key=>metricMessages.zh[key],locale:{value:'zh'}})}})
  const component=localLoad('components/Metric/MetricSourceIssues.vue').default
  const template={inputDefinitions:[{id:'age',name:'距最近会话通信'}],definitions:[],outputs:[]}
  const value={metricId:'state',value:1,status:'partial',quality:{attributes:{inputIssues:[{inputId:'age',reason:'unknownReason',required:false}],inputIssueCount:1}}}
  const view=mount(component,{template,value})
  const unknown=mount(component,{template,value:{...value,quality:{attributes:{...value.quality.attributes,inputIssueCount:2}}}})
  const summary=mount(localLoad('components/Metric/MetricValue.vue').default,{template,value,summary:true,hideFeedback:true})
  try {
    await flush()
    assert.equal(walk(view.root,node=>node.type==='details')[0].props.open,false)
    assert.match(textContent(view.root),/参考项.*距最近会话通信：未取得可用值.*已继续计算/)
    assert.match(textContent(view.root),/参考项，允许缺少/)
    assert.equal(walk(view.root,node=>node.type==='p').length,0,'unknown reasons do not invent a repair instruction')
    assert.equal(walk(unknown.root,node=>node.type==='details')[0].props.open,true,'truncated diagnostics cannot be assumed optional')
    assert.equal(walk(summary.root,node=>node.type==='p' || node.type==='a-tag').length,0,'detail owns the feedback, so its primary value stays concise')
  } finally {view.close();unknown.close();summary.close()}
})
