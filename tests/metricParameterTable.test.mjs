import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent, h, reactive, ref } from 'vue'
import { createMetricLoader, createMetricRenderer, walk, flush, textContent } from './helpers/metricRuntime.mjs'

const load=createMetricLoader({'vue-i18n':{useI18n:({messages})=>({locale:ref('zh'),t:key=>messages.zh[key] || key})}})
const Value=load('components/Metric/MetricParameterValue.vue').default
const parameter={id:'points',name:'校准点',expands:{editor:'table',minItems:2,maxItems:3},valueType:{type:'array',elementType:{type:'object',properties:[
  {id:'input',name:'测量值',valueType:{type:'double'}},{id:'output',name:'换算值',valueType:{type:'double'}},
]}}}

function mount(disabled=false) {
  const {renderer,root}=createMetricRenderer(),props=reactive({parameter,modelValue:[{input:0,output:0},{input:100,output:400}],inline:true,disabled}),changes=[]
  const app=renderer.createApp({setup:()=>()=>h(Value,{...props,'onUpdate:modelValue':value=>{changes.push(value);props.modelValue=value}})})
  for(const tag of ['a-input-number','a-button'])app.component(tag,defineComponent({inheritAttrs:false,setup:(_,{attrs,slots})=>()=>h(tag,attrs,slots.default?.())}))
  app.component('AIcon',defineComponent({inheritAttrs:false,setup:(_,{attrs})=>()=>h('icon',attrs)}))
  app.mount(root)
  return {root,props,changes,close:()=>app.unmount()}
}
test('成对数据使用直接展开的表格，编辑保留另一列与其他点，增删受声明约束',async()=>{
  const view=mount()
  try {
    assert.equal(walk(view.root,node=>node.props.role==='table').length,1)
    assert.equal(walk(view.root,node=>node.type==='details').length,0)
    assert.ok(textContent(view.root).includes('测量值'))
    const inputs=()=>walk(view.root,node=>node.type==='a-input-number')
    inputs()[1].props['onUpdate:value'](10);await flush()
    assert.deepEqual(view.props.modelValue,[{input:0,output:10},{input:100,output:400}])
    const buttons=()=>walk(view.root,node=>node.type==='a-button')
    assert.equal(buttons()[0].props.disabled,true)
    buttons().at(-1).props.onClick();await flush()
    assert.deepEqual(view.props.modelValue[2],{})
    assert.equal(buttons().at(-1).props.disabled,true)
    assert.equal(inputs().length,6)
  } finally {view.close()}
})
test('只读校准表保持列与数据，没有修改入口',()=>{
  const view=mount(true)
  try {
    assert.equal(walk(view.root,node=>node.type==='a-button').length,0)
    assert.ok(walk(view.root,node=>node.type==='a-input-number').every(node=>node.props.disabled))
    assert.equal(view.changes.length,0)
  } finally {view.close()}
})
