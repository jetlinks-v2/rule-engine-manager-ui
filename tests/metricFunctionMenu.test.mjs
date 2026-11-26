import test from 'node:test'
import assert from 'node:assert/strict'
import {defineComponent,h,ref} from 'vue'
import {resolve} from 'node:path'
import {createMetricLoader,createMetricRenderer,flush,walk,sourceRoot} from './helpers/metricRuntime.mjs'

test('指标使用宿主函数目录，失败可重试且恢复原声明，不再维护独立菜单',async()=>{
  let failing=true,calls=0
  const functions=[{id:'stats.avg',name:'数据均值',parameters:[{id:'values',name:'数值集合',valueType:'any'}],returnType:'number',minimumArguments:1,maximumArguments:16}]
  const boundary=defineComponent({props:['context','functionsError'],emits:['retry-functions'],setup:(props,{emit})=>()=>h('shared-editor',{catalog:props.context.functions,error:props.functionsError,retry:()=>emit('retry-functions')})})
  const load=createMetricLoader({'vue-i18n':{useI18n:()=>({locale:ref('zh'),t:key=>key})},
    [resolve(sourceRoot,'components/Metric/expressionApi.ts')]:{metricExpressionFunctions:async()=>{calls++;if(failing)throw Error('unavailable');return functions}},
    [resolve(sourceRoot,'components/Expression/MathExpressionEditor.vue')]:{default:boundary,__esModule:true}})
  const Editor=load('components/Metric/template/TemplateFormulaEditor.vue').default
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp(Editor,{modelValue:'',references:[]})
  app.config.warnHandler=()=>{};app.mount(root)
  const editor=()=>walk(root,node=>node.type==='shared-editor')[0]
  try{
    await flush();assert.equal(calls,1);assert.equal(editor().props.error,true)
    failing=false;editor().props.retry();await flush()
    assert.equal(calls,2);assert.equal(editor().props.error,false)
    assert.deepEqual(editor().props.catalog,functions)
  }finally{app.unmount()}
})
