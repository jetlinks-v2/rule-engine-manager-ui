import assert from 'node:assert/strict'
import test from 'node:test'
import { defineComponent,h } from 'vue'
import { createMetricLoader,createMetricRenderer,flush,textContent,walk } from './helpers/metricRuntime.mjs'
const load=createMetricLoader({'ant-design-vue':{Empty:{PRESENTED_IMAGE_SIMPLE:'simple'}},'vue-i18n':{useI18n:()=>({t:(key,args)=>key==='outputsSelected'?`${args.count} selected`:key})}})
const Picker=load('components/Metric/collection/MetricCollectionPicker.vue').default
test('output picker groups templates, keeps draft changes open, searches and applies once',async()=>{
  const {renderer,root}=createMetricRenderer(),changes=[]
  const groups=[{id:'a',templateId:'network',templateName:'Network',version:'1',output:{metricId:'score',label:'Score',valueType:'double',unit:'%'}},
    {id:'b',templateId:'network',templateName:'Network',version:'1',output:{metricId:'state',label:'State',valueType:'boolean'}},
    {id:'c',templateId:'runtime',templateName:'Runtime',version:'1',output:{metricId:'duration',label:'Duration',unit:'s'}}]
  const app=renderer.createApp({setup:()=>()=>h(Picker,{groups,value:['a'],onChange:value=>changes.push(value)})})
  for(const name of ['a-popover','a-input','a-checkbox','a-button','a-empty','AIcon'])app.component(name,defineComponent({inheritAttrs:false,setup:(_, {attrs,slots,expose})=>{if(name==='a-input')expose({focus(){}});return()=>h(name,attrs,[slots.default?.(),...(name==='a-popover'&&attrs.open?slots.content?.() || []:[])])}}))
  app.mount(root)
  try {
    const popover=()=>walk(root,node=>node.type==='a-popover')[0]
    popover().props['onUpdate:open'](true);await flush()
    assert.equal(walk(root,node=>node.type==='section'&&node.props.class==='collection-picker__category').length,2)
    const output=walk(root,node=>node.type==='a-checkbox'&&textContent(node).includes('State'))[0]
    output.props.onChange({target:{checked:true}});await flush()
    assert.equal(popover().props.open,true);assert.equal(changes.length,0)
    const input=walk(root,node=>node.type==='a-input')[0]
    input.props['onUpdate:value']('Runtime');await flush()
    assert.equal(walk(root,node=>node.type==='section'&&node.props.class==='collection-picker__category').length,1)
    assert.match(textContent(root),/Duration/)
    walk(root,node=>node.type==='a-button'&&textContent(node)==='apply')[0].props.onClick();await flush()
    assert.deepEqual(changes,[['a','b']]);assert.equal(popover().props.open,false)
    popover().props['onUpdate:open'](true);await flush()
    walk(root,node=>node.type==='a-button'&&textContent(node)==='resetAll')[0].props.onClick();await flush()
    walk(root,node=>node.type==='a-button'&&textContent(node)==='apply')[0].props.onClick();await flush()
    assert.equal(changes.at(-1),undefined)
  } finally {app.unmount()}
})
