import test from 'node:test'
import assert from 'node:assert/strict'
import {defineComponent,h,ref,reactive} from 'vue'
import {createMetricLoader,createMetricRenderer,walk,flush,textContent} from './helpers/metricRuntime.mjs'
const load=createMetricLoader({'vue-i18n':{useI18n:()=>({t:key=>key,locale:ref('zh')})}})
const Inspector=load('components/Metric/template/TemplateSimulationInspect.vue').default
const template={inputDefinitions:[{id:'reading',name:'测量值',valueType:{type:'double'}}],parameterDefinitions:[],definitions:[{id:'r',name:'加倍',expression:'reading * 2',inputs:[{id:'reading',metricId:'reading'}]}],outputs:[{metricId:'r'}]}
const value={metricId:'r',resultId:'result-1',value:7.5,evaluationTime:1000,evidence:{execution:{truncated:false,values:[{kind:'input',id:'reading',path:'/value',type:'number',value:'3.75',state:'available'}]}}}
const step={id:0,definitionId:'r',state:'produced',value,outputs:[value]}
function mount(entry) {
  const props=reactive({template,node:{kind:'rule',index:0},entry})
  const {renderer,root}=createMetricRenderer(),app=renderer.createApp({setup:()=>()=>h(Inspector,props)})
  for (const type of ['a-popover','a-button']) app.component(type,defineComponent({inheritAttrs:false,setup:(_,{attrs,slots})=>()=>h(type,attrs,Object.values(slots).flatMap(slot=>slot?.()))}))
  app.config.warnHandler=()=>{};app.mount(root)
  return {props,root,close:()=>app.unmount()}
}
test('试算节点复用真实过程的同一个解释浮层及当次取值，支持键盘关闭',async()=>{
  const view=mount({key:'entry-1',time:1000,order:0,value:{...value,evidence:undefined},record:{id:'node-1',attributes:{execution:step}}})
  try {
    assert.equal(walk(view.root,n=>n.props.class==='metric-node-inspect__detail').length,0)
    walk(view.root,n=>n.type==='a-popover')[0].props.onOpenChange(true);await flush()
    const detail=walk(view.root,n=>n.props.class==='metric-node-inspect__detail')[0]
    assert.ok(textContent(detail).includes('3.75'));assert.ok(textContent(detail).includes('7.5'))
    assert.equal(walk(detail,n=>n.props.class==='metric-evidence').length,1)
    const button=walk(view.root,n=>n.props.class==='metric-node-inspect')[0]
    button.props.onKeydown({key:'Escape',preventDefault(){},stopPropagation(){}});await flush()
    assert.equal(walk(view.root,n=>n.props.class==='metric-node-inspect__detail').length,0)
    assert.equal(view.props.entry.value.evidence,undefined,'展示适配不改写真实试算结果')
  } finally {view.close()}
})
test('旧试算没有共享步骤时不拿样本或脚本编造计算依据',()=>{
  const view=mount({key:'legacy',time:1000,order:0,value,record:{attributes:{inputs:[{value:3.75}],expression:'reading * 2'}}})
  try {assert.equal(walk(view.root,n=>n.type==='a-popover').length,0)} finally {view.close()}
})
test('说明浮层留在所属对话框，卸载时没有触发元素也可安全取得容器',()=>{
  const view=mount({key:'container',time:1000,order:0,value,record:{attributes:{execution:step}}})
  const previousDocument=globalThis.document,body={},container={}
  globalThis.document={body}
  try {
    const getContainer=walk(view.root,n=>n.type==='a-popover')[0].props['get-popup-container']
    assert.equal(getContainer({closest:()=>container,ownerDocument:{body}}),container)
    assert.equal(getContainer({closest:()=>null,ownerDocument:{body}}),body)
    assert.equal(getContainer(),body)
  } finally {globalThis.document=previousDocument;view.close()}
})
test('内容重定位不关闭已聚焦的数据折叠，焦点离开与Esc仍可关闭',async()=>{
  const view=mount({key:'entry-focus',time:1000,order:0,value,record:{attributes:{execution:step}}})
  try {
    const popover=()=>walk(view.root,n=>n.type==='a-popover')[0]
    const detail=()=>walk(view.root,n=>n.props.class==='metric-node-inspect__detail')[0]
    popover().props.onOpenChange(true);await flush()
    detail().props.onFocusin();await flush()
    popover().props.onOpenChange(false);await flush()
    assert.equal(popover().props.open,true,'展开后换向产生的鼠标离开不能关闭浮层')
    detail().props.onFocusout({currentTarget:{contains:()=>true},relatedTarget:{}});await flush()
    assert.equal(popover().props.open,true,'在同一内容内切换操作保留浮层')
    detail().props.onFocusout({currentTarget:{contains:()=>false},relatedTarget:null});await flush()
    assert.equal(popover().props.open,false)
    popover().props.onOpenChange(true);await flush()
    detail().props.onFocusin();await flush()
    detail().props.onKeydown({key:'Escape',preventDefault(){},stopPropagation(){}});await flush()
    assert.equal(popover().props.open,false,'Esc明确关闭，不被焦点保护拦截')
  } finally {view.close()}
})
test('从说明浮层展开对照后，鼠标离开不销毁公式；关闭对照后恢复正常关闭',async()=>{
  const view=mount({key:'entry-expand',time:1000,order:0,value,record:{attributes:{execution:step}}})
  try {
    const popover=()=>walk(view.root,n=>n.type==='a-popover')[0]
    popover().props.onOpenChange(true);await flush()
    walk(view.root,n=>n.props['aria-expanded']===false && n.type==='a-button')[0].props.onClick();await flush()
    popover().props.onOpenChange(false);await flush()
    assert.equal(popover().props.open,true)
    assert.equal(popover().props['overlay-style'].visibility,'hidden')
    assert.equal(walk(view.root,n=>n.props.class==='metric-node-inspect__detail').length,1)
    const modal=walk(view.root,n=>n.type==='a-modal')[0]
    assert.equal(typeof modal.props['after-close'],'function')
    modal.props.onCancel();await flush()
    assert.equal(popover().props['overlay-style'],undefined)
    popover().props.onOpenChange(false);await flush()
    assert.equal(popover().props.open,false)
  } finally {view.close()}
})
