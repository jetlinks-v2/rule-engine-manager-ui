import assert from 'node:assert/strict'
import test from 'node:test'
import { h, reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMetricLoader, createMetricRenderer, flush, walk, textContent } from './helpers/metricRuntime.mjs'

function mount(expression) {
  const Display=createMetricLoader()('components/Metric/template/formula/TemplateFormulaDisplay.vue').default
  const rule={id:'unitEnergy',expression,inputs:[{id:'a',metricId:'energyA'}]}
  const props=reactive({expression,rule,compact:false,template:{
    id:'energy',version:'1',name:'单位能耗',parameters:{},
    inputDefinitions:[{id:'energyA',name:'产线A耗电'},{id:'energyB',name:'产线B耗电'},{id:'quantityA',name:'产线A产量'},{id:'quantityB',name:'产线B产量'}],
    definitions:[rule],outputs:[{metricId:'unitEnergy',label:'单位产量耗电'}],parameterDefinitions:[{id:'factor',name:'修正系数'}],
  }})
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup:()=>()=>h(Display,props)})
  app.component('a-popover',{setup:(_props,{slots})=>()=>h('div',{class:'test-formula-popover'},[h('div',{class:'test-summary'},slots.default?.()),h('div',{class:'test-full-formula'},slots.content?.())])})
  app.use(createI18n({legacy:false,locale:'zh',missingWarn:false,fallbackWarn:false}));app.config.warnHandler=()=>{};app.mount(root)
  const document=()=>walk(root,item=>item.props.class?.includes('expression-document'))[0]
  return {props,root,document,text:()=>document() ? textContent(document()) : textContent(root),close:()=>app.unmount()}
}

test('同形公式反显保留括号、业务别名及参数，查看不写回也不创建编辑器',async()=>{
  const view=mount('12.0 * (a + energyB) / (quantityA + quantityB)')
  try {
    const before=JSON.stringify(view.props);await flush()
    assert.match(view.text(),/产线A耗电/);assert.match(view.text(),/产线B产量/)
    assert.match(view.text(),/\*.*\(.*\).*\/.*\(/)
    assert.equal(walk(view.root,item=>item.type==='math-field' || item.props.contenteditable).length,0)
    assert.equal(JSON.stringify(view.props),before)
    view.props.template.inputDefinitions[0].name='车间耗电';await flush();assert.match(view.text(),/车间耗电/)
    view.props.expression='a / quantityA * params.factor';await flush();assert.match(view.text(),/修正系数/)
  } finally {view.close()}
})

test('适用条件展示比较关系；不能完整投影的旧脚本保留可读原文',async()=>{
  const view=mount('quantityA + quantityB > 0')
  try {
    await flush();assert.match(view.text(),/产线A产量.*>/)
    view.props.expression="a > 0 ? unknown('energyB') : 0";await flush()
    assert.equal(view.document(),undefined);assert.equal(view.text(),"产线A耗电 > 0 ? unknown('energyB') : 0")
    assert.equal(view.props.expression,"a > 0 ? unknown('energyB') : 0")
    view.props.expression='a / quantityA';await flush();assert.match(view.text(),/产线A耗电.*\/.*产线A产量/)
  } finally {view.close()}
})

test('显示名与旧脚本仅作为文本渲染，不允许HTML或属性注入',async()=>{
  const view=mount('a / quantityA')
  try {
    const hostile='<img src=x onerror=alert(1)>\\htmlClass{bad}'
    view.props.template.inputDefinitions[0].name=hostile;await flush()
    assert.ok(view.text().includes(hostile))
    assert.equal(walk(view.root,item=>item.type==='img' || item.props.innerHTML).length,0)
    view.props.expression=hostile;await flush()
    assert.equal(view.document(),undefined);assert.equal(view.text(),hostile)
  } finally {view.close()}
})

test('紧凑图节点保持轻量反显，展开入口仅出现在完整公式',async()=>{
  const view=mount('a / quantityA')
  try {
    await flush();assert.equal(walk(view.root,item=>item.props['aria-expanded']===false).length,1)
    view.props.compact=true;await flush()
    assert.equal(walk(view.root,item=>item.props['aria-expanded']!=null).length,0)
    assert.match(view.text(),/产线A耗电.*\/.*产线A产量/)
    assert.equal(walk(view.root,item=>item.props.contenteditable).length,0)
  } finally {view.close()}
})

test('固定图节点用分支摘要，悬浮预览保留完整公式及默认分支且不增加嵌套按钮',async()=>{
  const view=mount('a == null ? null : (a > 0 ? a : 0)')
  try {
    view.props.summary=true;view.props.compact=true
    const before=JSON.stringify(view.props);await flush()
    const summary=walk(view.root,item=>item.props.class==='test-summary')[0]
    assert.match(textContent(summary),/条件公式 · 2 项判断/)
    assert.equal(walk(summary,item=>item.props.class?.includes('expression-document')).length,0)
    const full=walk(view.root,item=>item.props.class==='test-full-formula')[0]
    assert.match(textContent(full),/产线A耗电/);assert.match(textContent(full),/0/)
    assert.equal(walk(view.root,item=>item.type==='button' || item.type==='math-field').length,0)
    assert.equal(JSON.stringify(view.props),before)
    view.props.expression='(a > 0 ? a : 0) + (quantityA > 0 ? quantityA : 0)';await flush()
    assert.match(textContent(summary),/条件公式 · 2 项判断/)
    view.props.expression='a / quantityA';await flush()
    assert.doesNotMatch(textContent(summary),/项判断/)
    assert.match(textContent(summary),/产线A耗电.*\/.*产线A产量/)
    view.props.expression="unknown('a')";await flush()
    assert.match(textContent(summary),/unknown/)
  }finally{view.close()}
})

test('画布缩略预览保留原条件公式，完整浮层与普通卡片摘要各自保持语义',async()=>{
  const view=mount('a == null ? null : (a > 0 ? a / quantityA : 0)')
  try {
    Object.assign(view.props,{summary:true,compact:true,thumbnail:true})
    const before=JSON.stringify(view.props);await flush()
    const summary=walk(view.root,item=>item.props.class==='test-summary')[0]
    assert.doesNotMatch(textContent(summary),/项判断/)
    assert.match(textContent(summary),/产线A耗电/)
    assert.match(textContent(summary),/产线A产量/)
    assert.ok(walk(summary,item=>item.props.class?.includes('expression-document')).length)
    assert.match(textContent(walk(view.root,item=>item.props.class==='test-full-formula')[0]),/产线A产量/)
    assert.equal(walk(view.root,item=>item.type==='button' || item.type==='math-field').length,0)
    assert.equal(JSON.stringify(view.props),before)
    view.props.thumbnail=false;await flush()
    assert.match(textContent(summary),/条件公式 · 2 项判断/)
  }finally{view.close()}
})

test('回放只展示后端记录值及采用分支，未知记录保留引用，不重算结果',async()=>{
  const view=mount('a > 0 ? a : 0')
  try {
    view.props.explanation={kind:'condition',state:'available',value:'9007199254740993',children:[
      {kind:'operator',operation:'>',state:'available',value:true,children:[{kind:'read',state:'available',path:['a'],value:'9007199254740993',children:[]},{kind:'literal',state:'available',value:0,children:[]}]},
      {kind:'read',state:'available',path:['a'],value:'9007199254740993',children:[]},
      {kind:'unsupported',state:'skipped',children:[]},
    ]}
    view.props.format=node=>({text:String(node.value)})
    const before=JSON.stringify(view.props.rule);await flush()
    assert.match(view.text(),/9007199254740993/)
    assert.equal(walk(view.root,item=>item.props.class?.includes('has-value')).length,2)
    assert.equal(walk(view.root,item=>item.props.class?.includes('is-selected')).length,1)
    assert.equal(JSON.stringify(view.props.rule),before)
    view.props.explanation=undefined;await flush()
    assert.doesNotMatch(view.text(),/9007199254740993/)
    assert.match(view.text(),/产线A耗电/)
  } finally {view.close()}
})

test('三项逻辑条件的二叉解释仍代入已记录数据，并标记实际采用结果',async()=>{
  const view=mount('a > 0 && quantityA > 0 && quantityB > 0 ? a : 0')
  const read=(id,value)=>({kind:'read',state:'available',path:[id],value,children:[]})
  const skipped={kind:'unsupported',state:'skipped',children:[]}
  const positive=(id,value)=>({kind:'operator',operation:'>',state:'available',value:value>0,children:[read(id,value),{kind:'literal',state:'available',value:0,children:[]}]})
  try {
    view.props.explanation={kind:'condition',state:'available',value:0,children:[
      {kind:'operator',operation:'and',state:'available',value:false,children:[
        {kind:'operator',operation:'and',state:'available',value:false,children:[positive('a',12),positive('quantityA',0)]},skipped]},
      skipped,{kind:'literal',state:'available',value:0,children:[]}]}
    view.props.format=node=>({text:String(node.value)})
    view.props.rule.options={stateLabels:[{value:0,name:'未成立'}]}
    await flush()
    const reads=walk(view.root,node=>node.props.class?.includes('has-value'))
    assert.equal(reads.length,2)
    assert.ok(reads.some(node=>textContent(node).includes('12')))
    const selected=walk(view.root,node=>node.props.class?.includes('is-selected'))
    assert.equal(selected.length,1)
    assert.match(textContent(selected[0]),/0/)
    assert.match(textContent(view.root),/不成立/)
    view.props.explanation=undefined;await flush()
    assert.equal(walk(view.root,node=>node.props.class?.includes('has-value')).length,0)
    assert.equal(walk(view.root,node=>node.props.class==='expression-branch__value').length,0)
  }finally{view.close()}
})
