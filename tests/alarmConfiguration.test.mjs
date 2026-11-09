import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const vue = require('vue')
const { createRenderer, defineComponent, h, KeepAlive, nextTick, reactive, ref } = vue
const { parse, compileScript } = require('vue/compiler-sfc')
const root = resolve(import.meta.dirname, '..')
const messages = JSON.parse(await readFile(resolve(root, 'locales/lang/zh.json'), 'utf8'))
const stubs = {
  '@jetlinks-web/core': 'export const request={post:(...args)=>globalThis.alarmConfigurationFixture.request(...args)}',
  '@jetlinks-web-core/utils/module-registry': 'export const moduleRegistry={getResourceItem:()=>undefined,hasModule:()=>true,onChange:()=>()=>{}}',
  '@jetlinks-web-core/locales': 'export default {global:{t:key=>key}}',
  '@jetlinks-web-core/store/user': 'export const useUserStore=()=>globalThis.alarmConfigurationFixture.user',
  '@jetlinks-web-core/store/menu': `export const useMenuStore=()=>({
    initialized:true,loading:false,menuResultCache:[{code:"machine-vision/VisualAlarm"}],
    getMenu:code=>globalThis.alarmConfigurationFixture.menus.has(code),
    jumpPage:code=>globalThis.alarmConfigurationFixture.navigations.push(code)
  })`,
  '@jetlinks-web-core/utils/project-runtime': 'export const getProjectCodeFromLocation=()=>"project"',
  '@jetlinks-web-core/utils/request-context': 'export const getRequestBaseApi=()=>"/api"',
  'vue-router': 'export const useRoute=()=>globalThis.alarmConfigurationFixture.route',
  'vue-i18n': 'export const useI18n=()=>({t:(key,args)=>{let text=globalThis.alarmConfigurationFixture.messages[key]||key;for(const [name,value] of Object.entries(args||{}))text=text.replace("{"+name+"}",value);return text},locale:{value:"zh-CN"}})',
  '@jetlinks-web/components': 'import {h} from "vue";export const Ellipsis=(_,ctx)=>h("span",ctx.slots.default?.())',
  '@ant-design/icons-vue': 'export const RightOutlined=()=>null',
}
const output = await build({
  stdin: { loader: 'ts', resolveDir: root, contents: `
    export * from './api/alarmDashboard';
    export * from './visDashboard/AlarmCenter/services/configuration';
    export * from './visDashboard/AlarmCenter/hooks/useAlarmRuleConfiguration';
    export * from './visDashboard/AlarmCenter/dashboard.types';
    export {default as AlarmWidget} from './visDashboard/AlarmCenter/components/AlarmWidget.vue';
    export {default as AlarmMetricPanel} from './visDashboard/AlarmCenter/components/AlarmMetricPanel.vue';
    export {default as AlarmHandlingPanel} from './visDashboard/AlarmCenter/components/AlarmHandlingPanel.vue';
  ` },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['vue', 'dayjs'],
  plugins: [{ name: 'configuration-boundaries', setup(builder) {
    builder.onResolve({filter: /.*/}, args => stubs[args.path] === undefined ? undefined : {path: args.path, namespace: 'platform'})
    builder.onLoad({filter: /.*/, namespace: 'platform'}, args => ({contents: stubs[args.path]}))
    builder.onLoad({filter: /Alarm(?:Trend|Statistics)Panel\.vue$/}, args => ({contents: `
      import {h} from 'vue';export default {props:['items','series'],setup(props){return ()=>h('div',{'data-chart':true},JSON.stringify(props.items||props.series))}}
    `, loader: 'ts'}))
    builder.onLoad({filter: /AlarmHandlingCard\.vue$/}, () => ({contents: `import {h} from 'vue';export default {props:['title'],setup(p){return ()=>h('span',p.title)}}`}))
    builder.onLoad({filter: /\.vue$/}, async args => {
      const {descriptor,errors} = parse(await readFile(args.path, 'utf8'), {filename: args.path})
      if (errors.length) throw errors[0]
      // esbuild 的 CJS 动态导入返回普通 namespace；按浏览器 ESM 约定取 default。
      const content=compileScript(descriptor, {id: args.path, inlineTemplate: true}).content
        .replace(/import\((['"])(\.\/Alarm(?:Trend|Statistics|Handling)Panel\.vue)\1\)/g, 'import($1$2$1).then(module=>module.default)')
      return {contents:content,loader:'ts'}
    })
  } }],
})
const module = {exports: {}}
new Function('require','module','exports',output.outputFiles[0].text)(require,module,module.exports)
const api = module.exports
const ok = result => ({success: true, result})
const flush = async () => { await nextTick(); await new Promise(setImmediate); await nextTick() }
const signal = () => new AbortController().signal
function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return {promise, resolve}
}
function fixture(request) {
  const state = {
    calls: [], navigations: [], messages,
    user: reactive({userInfo:{id:'user'}}),
    route: reactive({path:'/alarms/dashboard',params:{projectId:'p'},query:{}}),
    menus: reactive(new Set(['iot-user/device/alarm','machine-vision/VisualAlarm'])),
    request: (url, data, config) => {
      state.calls.push({url,data,config})
      if (request) return request(url, data, config)
      return Promise.resolve(ok(url.includes('device-alarm/_query') ? {data:[],total:0}
        : url.endsWith('_count') ? 0 : []))
    },
  }
  globalThis.alarmConfigurationFixture = state
  return state
}
const node = (type, text='') => ({type,text,props:{},children:[],parent:null})
const renderer = createRenderer({
  createElement: type => node(type), createText: text => node('text',text), createComment: () => node('comment'),
  insert(child,parent,anchor) {
    if(child.parent) child.parent.children.splice(child.parent.children.indexOf(child),1)
    const index=anchor ? parent.children.indexOf(anchor) : -1
    parent.children.splice(index < 0 ? parent.children.length : index,0,child);child.parent=parent
  },
  remove(child) {if(child.parent) child.parent.children.splice(child.parent.children.indexOf(child),1);child.parent=null},
  setText: (el,text) => {el.text=text}, setElementText: (el,text) => {el.text=text;el.children=[]},
  patchProp: (el,key,_,value) => {el.props[key]=value}, parentNode: el=>el.parent,
  nextSibling: el=>el.parent?.children[el.parent.children.indexOf(el)+1]||null,
})
function mount(t, component) {
  const app=renderer.createApp(component)
  app.component('a-button',{inheritAttrs:false,setup(_,ctx){return ()=>h('button',ctx.attrs,ctx.slots.default?.())}})
  app.component('a-spin',{setup(_,ctx){return ()=>h('div',ctx.slots.default?.())}})
  for(const name of ['a-badge','a-segmented','AIcon']) app.component(name,()=>null)
  app.component('CloudEmpty',{props:['description'],setup(props){return ()=>h('div',{'data-empty':true},props.description)}})
  const container=node('root')
  app.mount(container)
  t.after(()=>app.unmount())
  return {app,container}
}
const textOf = el => el.text + el.children.map(textOf).join('')
const find = (el,predicate) => [el,...el.children.flatMap(child=>find(child,predicate))].filter(predicate)
function mountHook(t,preview=ref(false),count=1) {
  const hooks=[]
  const mounted=mount(t,defineComponent({setup(){
    for(let index=0;index<count;index++) hooks.push(api.useAlarmRuleConfiguration(preview))
    return ()=>h('div')
  }}))
  return {...mounted,hooks}
}
function widget(t,kind,preview=false) {
  return mount(t,()=>h(api.AlarmWidget,{kind,isEdit:preview,info:{componentProps:{[api.typeOf(kind)]:{refreshSeconds:0}}}}))
}
const defaultApi = overrides => ({queryIotRules:async()=>ok({data:[],total:0}),countVisionRules:async()=>ok(0),...overrides})

test('configuration API uses the real rule sources, a bounded first page, no time or enabled filter, and cancellation',async()=>{
  const calls=[]
  const client=api.createAlarmDashboardApi({post:(...args)=>{calls.push(args);return Promise.resolve(ok(0))}})
  const abort=signal()
  await client.queryIotRules(abort);await client.countVisionRules(abort)
  assert.equal(calls[0][0],'/message/preprocessor/device-alarm/_query')
  assert.deepEqual(calls[0][1],{paging:true,pageIndex:0,pageSize:1,terms:[]})
  assert.equal(calls[1][0],'/ai/aggregate/task/_count')
  assert.deepEqual(calls[1][1],{terms:[]})
  assert(calls.every(call=>call[2].signal===abort&&call[2].hiddenError))
})

test('successful empty rule sources mean missing; disabled rules and nonzero counts remain configured',async()=>{
  assert.equal(await api.loadRuleConfiguration(defaultApi(),'iot',signal()),'missing')
  assert.equal(await api.loadRuleConfiguration(defaultApi(),'vision',signal()),'missing')
  assert.equal(await api.loadRuleConfiguration(defaultApi({queryIotRules:async()=>ok({data:[{id:'rule',state:'disabled'}],total:1})}),'iot',signal()),'configured')
  assert.equal(await api.loadRuleConfiguration(defaultApi({countVisionRules:async()=>ok(1)}),'vision',signal()),'configured')
})

test('failed, malformed and forbidden responses never mean missing',async()=>{
  for(const payload of [null,{},ok({}),{success:false,result:0},{status:'500',result:0}]) {
    assert.equal(await api.loadRuleConfiguration(defaultApi({countVisionRules:async()=>payload}),'vision',signal()),'error')
    assert.equal(await api.loadRuleConfiguration(defaultApi({queryIotRules:async()=>payload}),'iot',signal()),'error')
  }
  assert.equal(await api.loadRuleConfiguration(defaultApi({queryIotRules:async()=>({status:403,result:[]})}),'iot',signal()),'forbidden')
  assert.equal(await api.loadRuleConfiguration(defaultApi({countVisionRules:async()=>{throw {response:{status:403}}}}),'vision',signal()),'forbidden')
})

test('all seven consumers share only two configuration requests and concurrent retry is deduplicated',async t=>{
  const pending=deferred()
  const state=fixture(url=>url.includes('device-alarm')?pending.promise:Promise.resolve(ok(0)))
  const {hooks}=mountHook(t,ref(false),7)
  assert.equal(state.calls.length,2)
  assert.equal(hooks[0].state.value.iot,'loading')
  const first=hooks[0].refresh(),second=hooks[6].refresh()
  assert.equal(state.calls.length,2)
  pending.resolve(ok({data:[],total:0}))
  await Promise.all([first,second])
  assert.deepEqual(hooks[0].state.value,{iot:'missing',vision:'missing'})
  assert(hooks.every(hook=>hook.state.value===hooks[0].state.value))
})

test('preview is isolated and returning to runtime starts fresh detection',async t=>{
  const state=fixture(),preview=ref(true)
  const {hooks}=mountHook(t,preview)
  assert.equal(state.calls.length,0)
  preview.value=false;await flush()
  assert.equal(state.calls.length,2)
  preview.value=true;await flush()
  assert(state.calls.every(call=>call.config.signal.aborted))
  assert.deepEqual(hooks[0].state.value,{iot:'loading',vision:'loading'})
  preview.value=false;await flush()
  assert.equal(state.calls.length,4)
})

test('switching project aborts old requests and ignores their late no-rule results',async t=>{
  const old=deferred()
  const state=fixture(url=>state.route.params.projectId==='p'?old.promise:Promise.resolve(ok(url.includes('device-alarm')?{data:[{id:'new'}],total:1}:1)))
  const {hooks}=mountHook(t)
  const previous=state.calls.slice()
  state.route.params.projectId='other';await flush()
  assert(previous.every(call=>call.config.signal.aborted))
  assert.deepEqual(hooks[0].state.value,{iot:'configured',vision:'configured'})
  old.resolve(ok(0));await flush()
  assert.deepEqual(hooks[0].state.value,{iot:'configured',vision:'configured'})
})

test('KeepAlive leaving cancels detection and re-entry checks configuration again',async t=>{
  const state=fixture(),visible=ref(true)
  const Child=defineComponent({setup(){api.useAlarmRuleConfiguration(ref(false));return ()=>h('div')}})
  mount(t,()=>h(KeepAlive,null,{default:()=>visible.value?h(Child):h('span')}))
  await flush();assert.equal(state.calls.length,2)
  visible.value=false;await flush()
  assert(state.calls.every(call=>call.config.signal.aborted))
  visible.value=true;await flush()
  assert.equal(state.calls.length,4)
})

test('one consumer leaving does not cancel peers; the last consumer releases requests and cache',async t=>{
  const pending=deferred(),state=fixture(()=>pending.promise)
  const first=mountHook(t),second=mountHook(t)
  assert.equal(state.calls.length,2)
  first.app.unmount();assert(state.calls.every(call=>!call.config.signal.aborted))
  second.app.unmount();assert(state.calls.every(call=>call.config.signal.aborted))
  mountHook(t);assert.equal(state.calls.length,4)
  pending.resolve(ok({data:[],total:0}));await flush()
})

test('every widget maps only the relevant sources and configuration actions respect menu permission',()=>{
  const actions=[{key:'iotRules',icon:''},{key:'visionRules',icon:''}]
  for(const kind of api.dashboardKinds){
    const hints=api.configurationHintsFor(kind,{iot:'missing',vision:'missing'},actions)
    const expected=kind==='QuickStart'?[]:(kind==='AlarmTrend'||kind==='HandlingStatistics')?['iot','vision']:kind.startsWith('Iot')?['iot']:['vision']
    assert.deepEqual(hints.map(item=>item.source),expected)
    assert(hints.every(item=>item.action))
    assert(api.configurationHintsFor(kind,{iot:'missing',vision:'missing'},[]).every(item=>!item.action))
    assert.deepEqual(api.configurationHintsFor(kind,{iot:'configured',vision:'loading'},actions),[])
  }
})

test('unconfigured statistics replace generic no-record empty state and configure navigates to the permitted entry',async t=>{
  const state=fixture(),{container}=widget(t,'IotStatistics')
  await flush()
  assert(textOf(container).includes(messages['alarmDashboard.configuration.missing.iot']))
  assert(!textOf(container).includes(messages['alarmDashboard.noStatistics']))
  const button=find(container,el=>el.type==='button'&&textOf(el)===messages['alarmDashboard.action.iotRules'])[0]
  assert(button);button.props.onClick()
  assert.deepEqual(state.navigations,['iot-user/device/alarm'])
})

test('metric guidance preserves raw event counts and cumulative historical alarm values',async t=>{
  fixture(url=>Promise.resolve(ok(url.includes('device-alarm')?{data:[],total:0}:url.endsWith('_count')?(url.includes('/ai/aggregate/')?0:24):[])))
  const events=widget(t,'TodayEvents'),alarms=widget(t,'IotAlarms')
  await flush()
  assert(textOf(events.container).includes('24'))
  assert(textOf(events.container).includes(messages['alarmDashboard.configuration.missing.vision']))
  assert(textOf(alarms.container).includes(messages['alarmDashboard.total']))
  assert(textOf(alarms.container).includes('24'))
})

test('an unconfigured source does not remove existing ranking or other trend series',async t=>{
  fixture((url,data)=>Promise.resolve(ok(url.includes('device-alarm')?{data:[],total:0}
    : url.includes('history/aggregation')?[{time:'2026-10-27 01:00',total:7}]
      : data.groupByTime?[{time:'2026-10-27 01:00',count:2}]
        : url.endsWith('_count')?0:[{id:'historic',name:'Historic alarm',count:3}])))
  const {container}=widget(t,'IotStatistics')
  const trend=widget(t,'AlarmTrend')
  await flush()
  assert(textOf(container).includes('Historic alarm'))
  assert(textOf(container).includes(messages['alarmDashboard.configuration.missing.iot']))
  assert(textOf(trend.container).includes('\"count\":7'))
  assert(textOf(trend.container).includes('\"count\":2'))
})

test('configuration guidance never hides an independently failed trend source',async t=>{
  fixture(url=>url.includes('history/aggregation')?Promise.reject(new Error('event service unavailable'))
    :Promise.resolve(ok(url.includes('device-alarm')?{data:[],total:0}:url.endsWith('_count')?0:[])))
  const {container}=widget(t,'AlarmTrend')
  await flush()
  assert(textOf(container).includes(messages['alarmDashboard.configuration.missing.iot']))
  assert(textOf(container).includes(messages['alarmDashboard.partialFailed']))
  assert(find(container,el=>el.props.title?.includes(messages['alarmDashboard.source.events'])).length)
  assert(find(container,el=>el.props['data-chart']).length)
  assert.equal(find(container,el=>el.type==='button'&&textOf(el)===messages['alarmDashboard.retry']).length,0)
})

test('configured but empty alarms use normal no-record state, with no onboarding prompt',async t=>{
  fixture(url=>Promise.resolve(ok(url.includes('device-alarm')?{data:[{id:'disabled',state:'disabled'}],total:1}:url.includes('/ai/aggregate/')?1:url.endsWith('_count')?0:[])))
  const {container}=widget(t,'VisionStatistics')
  await flush()
  assert.equal(find(container,el=>el.props['data-chart']).length,1)
  assert(textOf(container).includes('[]'))
  assert(!textOf(container).includes(messages['alarmDashboard.configuration.missing.vision']))
})

test('forbidden configuration has no configure button and never becomes an empty-rule prompt',async t=>{
  fixture(url=>url.includes('device-alarm')?Promise.reject({response:{status:403}}):Promise.resolve(ok(url.endsWith('_count')?0:[])))
  const {container}=widget(t,'IotAlarms')
  await flush()
  assert(!textOf(container).includes(messages['alarmDashboard.configuration.forbidden.iot']))
  assert(!textOf(container).includes(messages['alarmDashboard.configuration.missing.iot']))
  assert.equal(find(container,el=>el.type==='button').length,0)
})

test('missing rules without an accessible menu show the prompt without a dead configure button',async t=>{
  const state=fixture();state.menus.clear()
  const {container}=widget(t,'VisionAlarms')
  await flush()
  assert(textOf(container).includes(messages['alarmDashboard.configuration.missing.vision']))
  assert.equal(find(container,el=>el.type==='button').length,0)
})

test('failed configuration is silent and never presents a missing-rule action',async t=>{
  fixture(url=>url.includes('/ai/aggregate/')?Promise.reject(new Error('temporary')):Promise.resolve(ok(url.includes('device-alarm')?{data:[],total:0}:url.endsWith('_count')?0:[])))
  const {container}=widget(t,'VisionAlarms')
  await flush()
  assert(!textOf(container).includes(messages['alarmDashboard.configuration.error.vision']))
  assert(!textOf(container).includes(messages['alarmDashboard.configuration.missing.vision']))
  assert.equal(find(container,el=>el.type==='button').length,0)
})

test('metric distinguishes failed values from successful zero and null rate',async t=>{
  fixture()
  const data=reactive({today:0,total:42,active:0,handled:0,filterRate:null,failed:['today','active']})
  const {container}=mount(t,()=>h(api.AlarmMetricPanel,{title:'metric',icon:'',event:false,data}))
  await flush()
  assert(textOf(container).includes('—'))
  assert(textOf(container).includes('42'))
  assert(find(container,el=>el.type==='strong'&&textOf(el)==='0').length)
  assert.equal(find(container,el=>el.props.title===messages['alarmDashboard.partialFailed']).length,2)
  const events=mount(t,()=>h(api.AlarmMetricPanel,{title:'events',icon:'',event:true,data}))
  await flush()
  assert(textOf(events.container).includes('0%'))
  data.failed.push('filterRate');await flush()
  assert(!textOf(events.container).includes('0%'))
  assert(find(events.container,el=>el.type==='strong'&&textOf(el)==='—').length)
})

test('trend with all sources failed displays empty error without retry or chart',async t=>{
  fixture(url=>url.includes('history/aggregation')||url.endsWith('_aggregation')?Promise.reject(new Error('unavailable'))
    :Promise.resolve(ok(url.includes('device-alarm')?{data:[{id:'rule'}],total:1}:url.endsWith('_count')?1:[])))
  const {container}=widget(t,'AlarmTrend')
  await flush()
  assert(textOf(container).includes(messages['alarmDashboard.loadError']))
  assert.equal(find(container,el=>el.props['data-empty']).length,1)
  assert.equal(find(container,el=>el.props['data-chart']).length,0)
  assert.equal(find(container,el=>el.type==='button'&&textOf(el)===messages['alarmDashboard.retry']).length,0)
})

test('quick start marks only the missing source and preview widgets issue no live requests',async t=>{
  fixture(url=>Promise.resolve(ok(url.includes('device-alarm')?{data:[],total:0}:1)))
  const {container}=widget(t,'QuickStart')
  await flush()
  assert.equal(textOf(container).split(messages['alarmDashboard.configuration.unconfigured']).length-1,1)
  const state=fixture()
  for(const kind of api.dashboardKinds) widget(t,kind,true)
  await flush()
  assert.equal(state.calls.length,0)
})


test('shared configuration scopes query only enabled sources and recheck when vision becomes available', async t => {
  const state=fixture();const enabled=ref(false);const hooks=[]
  mount(t,defineComponent({setup(){for(let i=0;i<3;i++)hooks.push(api.useAlarmRuleConfiguration(ref(false),enabled));return ()=>h('div')}}))
  await flush()
  assert.equal(state.calls.length,1)
  assert(state.calls[0].url.includes('device-alarm'))
  enabled.value=true;await flush()
  assert.equal(state.calls.length,3)
  assert.equal(state.calls.filter(call=>call.url.includes('/ai/aggregate/')).length,1)
  assert(hooks.every(hook=>hook.state.value===hooks[0].state.value))
})


test('legacy combined handling panel hides the vision placeholder when unavailable', async t => {
  fixture()
  const {container}=mount(t,()=>h(api.AlarmHandlingPanel,{isEdit:false,loading:false,visionEnabled:false}))
  await flush()
  assert(textOf(container).includes(messages['alarmDashboard.source.iot']))
  assert(!textOf(container).includes(messages['alarmDashboard.source.vision']))
})
