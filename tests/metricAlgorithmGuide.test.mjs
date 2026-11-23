import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { defineComponent, h, reactive, ref } from 'vue'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent, sourceRoot } from './helpers/metricRuntime.mjs'

const descriptors=JSON.parse(readFileSync(new URL('./fixtures/metricCalculatorDocumentation.json',import.meta.url),'utf8'))
const load=createMetricLoader({
  'vue-i18n':{useI18n:({messages})=>({locale:ref('zh'),t:key=>messages.zh[key] || key})},
})
const Guide=load('components/Metric/template/TemplateAlgorithmGuide.vue').default
const {calculatorOption,calculatorIcon}=load('components/Metric/template/calculatorPresentation.ts')
const {visibleAlgorithmParameters,interactiveCalculator}=load('components/Metric/template/algorithm.ts')
function mount(descriptor,invalid=false) {
  const {renderer,root}=createMetricRenderer(),props=reactive({descriptor:structuredClone(descriptor),invalid})
  const app=renderer.createApp({setup:()=>()=>h(Guide,props)})
  for(const tag of ['a-tooltip','a-button','a-select'])app.component(tag,defineComponent({
    inheritAttrs:false,setup:(_,{attrs,slots})=>()=>h(tag,attrs,Object.values(slots).flatMap(slot=>slot?.())),
  }))
  app.component('AIcon',defineComponent({inheritAttrs:false,setup:(_,{attrs})=>()=>h('icon',attrs)}))
  app.mount(root)
  return {root,props,close:()=>app.unmount()}
}

test('真实后端描述的所有公式和符号均能由共享 MathLive 排版',async()=>{
  const {convertLatexToMarkup}=await import(pathToFileURL(resolve(sourceRoot,'../node_modules/mathlive/mathlive-ssr.min.mjs')).href)
  assert.equal(descriptors.length,32)
  assert.equal(descriptors.flatMap(item=>item.documentation.examples).length,39)
  for(const descriptor of descriptors) {
    const {documentation}=descriptor
    assert.doesNotMatch(convertLatexToMarkup(documentation.formula),/ML__error/,descriptor.id)
    for(const item of documentation.symbols)assert.doesNotMatch(convertLatexToMarkup(item.symbol),/ML__error/,descriptor.id)
    assert.equal(calculatorOption(descriptor,key=>key).formula,documentation.formula)
    assert.ok(descriptor.icon,descriptor.id)
    assert.equal(calculatorIcon(descriptor),descriptor.icon,descriptor.id)
  }
})

test('新增监测描述复用交互编辑、双输入与模式切换，序列预算可显式配置',()=>{
  for(const id of ['cusum','correlation','align','hampel','spectrum']) {
    const descriptor=descriptors.find(item=>item.id===id)
    assert.ok(interactiveCalculator(descriptor.configuration,descriptor),id)
    assert.notEqual(calculatorIcon(descriptor),'FunctionOutlined',id)
  }
  const correlation=descriptors.find(item=>item.id==='correlation')
  assert.deepEqual(Object.keys(correlation.configuration.inputTypes).sort(),['reference','signal'])
  assert.deepEqual(correlation.configuration.outputType.properties.map(item=>item.id),['correlation','pairs'])
  const ewma=descriptors.find(item=>item.id==='ewma'),spec=structuredClone(ewma.configuration)
  const ids=()=>visibleAlgorithmParameters(ewma,spec,false).map(item=>item.id)
  assert.ok(ids().includes('alpha'));assert.ok(!ids().includes('timeConstant'))
  spec.parameters.smoothing='time'
  assert.ok(!ids().includes('alpha'));assert.ok(ids().includes('timeConstant'))
  for(const id of ['ewma','align','hampel','spectrum']) {
    const descriptor=descriptors.find(item=>item.id===id)
    assert.ok(visibleAlgorithmParameters(descriptor,descriptor.configuration,true).some(item=>item.id==='maxOutputBytes'),id)
  }
})

test('图例直接排版后端输入、计算说明和结果，不计算或修改运行配置',()=>{
  for(const descriptor of descriptors) {
    const original=JSON.stringify(descriptor),view=mount(descriptor)
    try {
      const example=descriptor.documentation.examples[0],text=textContent(view.root)
      assert.ok(text.includes(example.explanation),descriptor.id)
      const selector=walk(view.root,node=>node.type==='a-select')[0]
      assert.ok(selector ? selector.props.options.some(item=>item.label===example.name) : text.includes(example.name),descriptor.id)
      assert.ok(text.includes('固定算例'))
      assert.equal(walk(view.root,node=>node.type==='svg').length,0)
      assert.equal(JSON.stringify(descriptor),original)
    } finally {view.close()}
  }
})

test('多算例可切换，拒绝结果不显示零值，算例参数保留独立默认值',async()=>{
  const descriptor=descriptors.find(item=>item.id==='increase'),view=mount(descriptor)
  try {
    const choose=walk(view.root,node=>node.type==='a-select')[0]
    choose.props.onChange(1);await flush()
    assert.ok(textContent(view.root).includes('未提供值'))
    assert.ok(textContent(view.root).includes(descriptor.documentation.examples[1].explanation))
    choose.props.onChange(3);await flush()
    assert.ok(textContent(view.root).includes('70'))
    assert.ok(textContent(view.root).includes('100'))
    // 固定算例不跟随待编辑配置参数改写，避免用旧预期结果冒充新参数试算。
    view.props.descriptor.configuration.parameters.multiplier=99;await flush()
    assert.ok(textContent(view.root).includes('70'))
  } finally {view.close()}
})

test('对象结果使用输出元数据命名；空文档隐藏；扩展算法无前端类型限制',async()=>{
  const descriptor=descriptors.find(item=>item.id==='duration')
  const view=mount(descriptor)
  try {
    const text=textContent(view.root)
    assert.ok(text.includes('30'))
    assert.ok(text.includes(descriptor.configuration.outputType.properties.find(item=>item.id==='activeDuration').name))
    view.props.descriptor={...view.props.descriptor,configuration:{provider:'custom',providerVersion:'v9'}};await flush()
    assert.ok(textContent(view.root).includes(descriptor.documentation.examples[0].explanation))
    delete view.props.descriptor.documentation;await flush()
    assert.equal(walk(view.root,node=>node.type==='details').length,0)
  } finally {view.close()}
})

test('解析失败只提示修正，不展示与未解析配置混淆的示例',()=>{
  const view=mount(descriptors[0],true)
  try {
    assert.ok(textContent(view.root).includes('配置尚未解析'))
    assert.equal(walk(view.root,node=>node.props.class==='algorithm-guide__example').length,0)
  } finally {view.close()}
})
