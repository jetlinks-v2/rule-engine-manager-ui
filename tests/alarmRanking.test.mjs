import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'

const require=createRequire(import.meta.url)
const {createRenderer,defineComponent,h,nextTick,reactive,ref}=require('vue')
const {parse,compileScript}=require('vue/compiler-sfc')
const root=resolve(import.meta.dirname,'..')
const messages=JSON.parse(await readFile(resolve(root,'locales/lang/zh.json'),'utf8'))
const stubs={
  '@jetlinks-web/core':'export const request={post:(...args)=>globalThis.alarmRankingFixture.request(...args)}',
  '@jetlinks-web-core/locales':'export default {global:{t:key=>key}}',
  '@jetlinks-web-core/store/user':'export const useUserStore=()=>globalThis.alarmRankingFixture.user',
  '@jetlinks-web-core/store/menu':'export const useMenuStore=()=>({initialized:true,loading:false,menuResultCache:[{code:"machine-vision/VisualAlarm"}],getMenu:()=>true,jumpPage:()=>{}})',
  '@jetlinks-web-core/utils/module-registry':'export const moduleRegistry={hasModule:()=>true,getResourceItem:()=>undefined,onChange:()=>()=>{}}',
  '@jetlinks-web-core/utils/project-runtime':'export const getProjectCodeFromLocation=()=>"project"',
  '@jetlinks-web-core/utils/request-context':'export const getRequestBaseApi=()=>"/api"',
  'vue-router':'export const useRoute=()=>globalThis.alarmRankingFixture.route',
  'vue-i18n':'export const useI18n=()=>({t:(key,args)=>{let text=globalThis.alarmRankingFixture.messages[key]||key;for(const [name,value] of Object.entries(args||{}))text=text.replace("{"+name+"}",value);return text},locale:{value:"zh-CN"}})',
  '@jetlinks-web/components':'import {h} from "vue";export const Ellipsis=(_,ctx)=>h("span",ctx.slots.default?.())',
  '@ant-design/icons-vue':'export const RightOutlined=()=>null',
  'ant-design-vue':'import {ref} from "vue";export const theme={useToken:()=>({token:ref({fontFamily:"Arial",colorTextDescription:"#86909c",colorBgSpotlight:"black",colorTextLightSolid:"white",colorText:"black",borderRadius:6,fontSize:12})})}',
  '@vueuse/core':'import {ref} from "vue";export const useElementSize=()=>({width:ref(600)})',
  'echarts/charts':'export const BarChart={}',
  'echarts/components':'export const GridComponent={},LegendComponent={},TitleComponent={},TooltipComponent={}',
  'echarts/core':'export const format={encodeHTML:value=>value}',
  '@jetlinks-web-core/components/Echarts':'import {h} from "vue";export default {props:["option","library"],setup(props){return ()=>h("div",{"data-chart":props.option})}}',
}
const output=await build({
  stdin:{resolveDir:root,loader:'ts',contents:`
    export * from './visDashboard/AlarmCenter/services/statistics';
    export * from './visDashboard/AlarmCenter/dashboardConfig';
    export * from './visDashboard/AlarmCenter/dashboard.types';
    export {default as AlarmWidget} from './visDashboard/AlarmCenter/components/AlarmWidget.vue';
    export {default as AlarmStatisticsPanel} from './visDashboard/AlarmCenter/components/AlarmStatisticsPanel.vue';
    export {default as AlarmRankingDialog} from './visDashboard/AlarmCenter/components/AlarmRankingDialog.vue';
    export {default as AlarmHandlingCard} from './visDashboard/AlarmCenter/components/AlarmHandlingCard.vue';
  `},
  bundle:true,write:false,format:'cjs',platform:'node',external:['vue','dayjs'],
  plugins:[{name:'alarm-ranking-boundaries',setup(builder){
    builder.onResolve({filter:/.*/},args=>stubs[args.path]===undefined?undefined:{path:args.path,namespace:'platform'})
    builder.onLoad({filter:/.*/,namespace:'platform'},args=>({contents:stubs[args.path]}))
    builder.onLoad({filter:/AlarmTrendPanel\.vue$/},()=>({contents:'export default {render(){return null}}',loader:'ts'}))
    builder.onLoad({filter:/\.vue$/},async args=>{
      const {descriptor,errors}=parse(await readFile(args.path,'utf8'),{filename:args.path})
      if(errors.length)throw errors[0]
      const content=compileScript(descriptor,{id:args.path,inlineTemplate:true}).content
        .replace(/import\((['"])(\.\/Alarm(?:(?:Trend|Statistics)Panel|RankingDialog)\.vue)\1\)/g,'import($1$2$1).then(module=>module.default)')
      return {contents:content,loader:'ts'}
    })
  }}],
})
const module={exports:{}}
new Function('require','module','exports',output.outputFiles[0].text)(require,module,module.exports)
const api=module.exports
const ok=result=>({success:true,result})
const flush=async()=>{await nextTick();await new Promise(setImmediate);await nextTick()}
const signal=()=>new AbortController().signal
const ranking=length=>Array.from({length},(_,index)=>({id:'alarm-'+index,name:'Alarm '+String(index).padStart(3,'0'),count:length-index}))
function fixture(rows=ranking(75)){
  const state={messages,calls:[],user:reactive({userInfo:{id:'user'}}),route:reactive({path:'/alarms/dashboard',params:{projectId:'p'},query:{}})}
  state.request=async(url,data,config)=>{
    state.calls.push({url,data,config})
    return ok(url.includes('device-alarm')?{data:[{id:'rule'}],total:1}
      :url.includes('/ai/aggregate/')?1:url.endsWith('_aggregation')?rows:0)
  }
  globalThis.alarmRankingFixture=state
  return state
}
const node=(type,text='')=>({type,text,props:{},children:[],parent:null})
const renderer=createRenderer({
  createElement:type=>node(type),createText:text=>node('text',text),createComment:()=>node('comment'),
  insert(child,parent,anchor){
    if(child.parent)child.parent.children.splice(child.parent.children.indexOf(child),1)
    const index=anchor?parent.children.indexOf(anchor):-1
    parent.children.splice(index<0?parent.children.length:index,0,child);child.parent=parent
  },
  remove(child){if(child.parent)child.parent.children.splice(child.parent.children.indexOf(child),1);child.parent=null},
  setText:(el,text)=>{el.text=text},setElementText:(el,text)=>{el.text=text;el.children=[]},
  patchProp:(el,key,_,value)=>{el.props[key]=value},parentNode:el=>el.parent,nextSibling:el=>el.parent?.children[el.parent.children.indexOf(el)+1]||null,
})
const find=(el,predicate)=>[el,...el.children.flatMap(child=>find(child,predicate))].filter(predicate)
const textOf=el=>el.text+el.children.map(textOf).join('')
function mount(t,render){
  const app=renderer.createApp(render)
  app.component('a-button',{inheritAttrs:false,setup(_,ctx){return ()=>h('button',ctx.attrs,ctx.slots.default?.())}})
  app.component('a-segmented',{props:['value','options'],emits:['update:value'],setup(props,ctx){return ()=>h('nav',props.options.map(option=>h('button',{'data-dimension':option.value,onClick:()=>ctx.emit('update:value',option.value)},option.label)))}})
  app.component('a-modal',{props:['open','title'],emits:['update:open'],setup(props,ctx){return ()=>props.open?h('dialog',[h('h2',props.title),h('button',{'data-close':true,onClick:()=>ctx.emit('update:open',false)},'close'),ctx.slots.default?.()]):null}})
  app.component('a-input-search',{props:['value','placeholder'],emits:['update:value'],setup(props,ctx){return ()=>h('input',{'data-rank-search':true,value:props.value,placeholder:props.placeholder,onInput:event=>ctx.emit('update:value',event.target.value)})}})
  app.component('a-table',{props:['dataSource','columns','pagination','loading'],setup(props,ctx){return ()=>h('div',{'data-table':props.dataSource,'data-columns':props.columns,'data-pagination':props.pagination,'data-loading':props.loading},props.dataSource.length?undefined:ctx.slots.emptyText?.())}})
  for(const name of ['a-badge','a-spin','AIcon'])app.component(name,()=>null)
  app.component('CloudEmpty',{props:['description','imageStyle'],setup(props){return ()=>h('div',{'data-empty':true,'data-image-style':props.imageStyle},props.description)}})
  app.component('a-card',{setup(_,ctx){return ()=>h('div',ctx.slots.default?.())}})
  const container=node('root');app.mount(container);t.after(()=>app.unmount())
  return {app,container}
}

for(const [target,dimension] of [['device','type'],['aiTaskMediaTarget','type'],['aiTaskMediaTarget','camera']]){
  test(`${target}/${dimension}: full sorted results retain more than 50 entries for view more`,async()=>{
    const input=[...ranking(75)].reverse().concat({id:'zero',name:'Zero',count:0})
    const result=await api.loadStatistics({aggregateAlarms:async(_,payload)=>{
      assert.equal(payload.limit,10000)
      assert.equal(payload.filter.terms[0].column,'alarmTime')
      return ok(input)
    }},target,dimension,signal())
    assert.equal(result.ranking.length,75)
    assert.deepEqual(result.ranking,ranking(75))
  })
}

test('device-type ranking retains every product and groups counts before sorting',async()=>{
  const rows=ranking(35).map((item,index)=>({deviceId:'device-'+index,count:item.count}))
  const result=await api.loadStatistics({aggregateAlarms:async()=>ok(rows),queryDevices:async ids=>ok(ids.map(id=>({id,productId:id,productName:id})))},'device','deviceType',signal())
  assert.equal(result.ranking.length,35)
  assert.equal(result.ranking[0].count,35)
  assert.equal(result.ranking.at(-1).count,1)
})

test('aggregate saturation is rejected instead of presenting a truncated result as all entries',async()=>{
  const data=Array.from({length:10000},()=>({id:'x',name:'X',count:1}))
  await assert.rejects(api.loadStatistics({aggregateAlarms:async()=>ok(data)},'device','type',signal()))
})

test('legacy quantity settings cannot change the fixed top ten',()=>{
  for(const kind of ['IotStatistics','VisionStatistics'])for(const limit of [1,5,20,50]){
    assert.equal(api.settingsOf(kind,{componentProps:{[api.typeOf(kind)]:{limit}}}).limit,10)
  }
})

test('the real card chart shows ten ranked bars and their counts from a larger result',async t=>{
  fixture()
  const {container}=mount(t,()=>h(api.AlarmStatisticsPanel,{items:ranking(75),vision:false,preview:false}))
  await flush()
  const option=find(container,el=>el.props['data-chart'])[0].props['data-chart']
  assert.equal(option.series[0].data.length,10)
  assert.deepEqual(option.series[0].data,ranking(75).slice(0,10).map(item=>item.count))
  assert.equal(option.yAxis.data[0],'Alarm 000')
  assert.equal(option.yAxis.data[9],'Alarm 009')
  assert.equal(option.series[0].label.show,true)
})

test('shorter rankings render only their available rows and zero entries keep the business empty state',async t=>{
  fixture()
  const items=ref(ranking(3))
  const {container}=mount(t,()=>h(api.AlarmStatisticsPanel,{items:items.value,vision:true,preview:false}))
  await flush()
  assert.equal(find(container,el=>el.props['data-chart'])[0].props['data-chart'].series[0].data.length,3)
  items.value=[];await flush()
  assert(textOf(container).includes(messages['alarmDashboard.noStatistics']))
})

for(const kind of ['IotStatistics','VisionStatistics']){
  test(`${kind}: view more opens all 75 ranked entries and close returns to the top-ten card`,async t=>{
    const state=fixture()
    const {container}=mount(t,()=>h(api.AlarmWidget,{kind,isEdit:false,info:{componentProps:{[api.typeOf(kind)]:{limit:1,refreshSeconds:0}}}}))
    await flush()
    assert(textOf(container).includes(messages['alarmDashboard.'+kind]))
    assert.equal(find(container,el=>el.props['data-chart'])[0].props['data-chart'].series[0].data.length,10)
    const more=find(container,el=>el.type==='button'&&textOf(el)===messages['alarmDashboard.viewMore'])[0]
    assert(more);assert.equal(more.props.disabled,false)
    more.props.onClick();await flush()
    const table=find(container,el=>el.props['data-table'])[0]
    assert.equal(table.props['data-table'].length,75)
    assert.equal(table.props['data-table'][0].rank,1)
    assert.equal(table.props['data-table'].at(-1).rank,75)
    assert.equal(table.props['data-table'].at(-1).count,1)
    assert.equal(table.props['data-pagination'].pageSize,20)
    assert.equal(table.props['data-pagination'].current,1)
    assert.equal(state.calls.filter(call=>call.url.endsWith('_aggregation')).length,1)
    find(container,el=>el.props['data-close'])[0].props.onClick();await flush()
    assert.equal(find(container,el=>el.type==='dialog').length,0)
  })
}

test('changing dimension closes the old ranking dialog and queries the new grouping',async t=>{
  const state=fixture()
  const {container}=mount(t,()=>h(api.AlarmWidget,{kind:'VisionStatistics',isEdit:false,info:{componentProps:{alarmCenterVisionStatistics:{refreshSeconds:0}}}}))
  await flush()
  find(container,el=>el.type==='button'&&textOf(el)===messages['alarmDashboard.viewMore'])[0].props.onClick();await flush()
  assert.equal(find(container,el=>el.type==='dialog').length,1)
  find(container,el=>el.props['data-dimension']==='camera')[0].props.onClick();await flush()
  assert.equal(find(container,el=>el.type==='dialog').length,0)
  const query=state.calls.filter(call=>call.url.endsWith('_aggregation')).at(-1)
  assert.deepEqual(query.data.groupBy.map(item=>item.column),['sourceId','sourceName'])
})

for(const kind of ['IotStatistics','VisionStatistics'])for(const count of [0,10,11]){
  test(`${kind}: view more is only available above ten entries (${count})`,async t=>{
    fixture(ranking(count))
    const {container}=mount(t,()=>h(api.AlarmWidget,{kind,isEdit:false,info:{componentProps:{[api.typeOf(kind)]:{refreshSeconds:0}}}}))
    await flush()
    const more=find(container,el=>el.type==='button'&&textOf(el)===messages['alarmDashboard.viewMore'])
    assert.equal(more.length,count>10?1:0)
    if(count>10)assert.equal(more[0].props.disabled,false)
  })
}

test('a failed ranking query hides view more and preserves the error state',async t=>{
  const state=fixture()
  const original=state.request
  state.request=(url,...args)=>url.endsWith('_aggregation')?Promise.reject(new Error('failed')):original(url,...args)
  t.mock.method(console,'warn',()=>{})
  const {container}=mount(t,()=>h(api.AlarmWidget,{kind:'IotStatistics',isEdit:false,info:{componentProps:{alarmCenterIotStatistics:{refreshSeconds:0}}}}))
  await flush()
  assert.equal(find(container,el=>el.type==='button'&&textOf(el)===messages['alarmDashboard.viewMore']).length,0)
  assert(textOf(container).includes(messages['alarmDashboard.loadError']))
})

for(const dimension of ['type','deviceType','camera']){
  test(`${dimension}: searching the complete ranking keeps absolute rank and resets pagination`,async t=>{
    const state=fixture()
    const {container}=mount(t,()=>h(api.AlarmRankingDialog,{open:true,title:'Ranking',items:ranking(75),dimension,preview:false,loading:false,error:false}))
    await flush()
    const table=()=>find(container,el=>el.props['data-table'])[0]
    const search=()=>find(container,el=>el.props['data-rank-search'])[0]
    assert.equal(search().props.placeholder,messages['alarmDashboard.rankSearchPlaceholder'].replace('{name}',messages['alarmDashboard.rankName.'+dimension]))
    table().props['data-pagination'].onChange(4,20);await flush()
    assert.equal(table().props['data-pagination'].current,4)
    search().props.onInput({target:{value:'  aLaRm 074  '}});await flush()
    assert.equal(table().props['data-pagination'].current,1)
    assert.equal(table().props['data-pagination'].total,1)
    assert.deepEqual(table().props['data-table'],[{...ranking(75)[74],rank:75}])
    search().props.onInput({target:{value:'missing item'}});await flush()
    assert.equal(table().props['data-table'].length,0)
    assert(textOf(container).includes(messages['alarmDashboard.noMatchingRank']))
    search().props.onInput({target:{value:''}});await flush()
    assert.equal(table().props['data-table'].length,75)
    assert.equal(table().props['data-pagination'].current,1)
    table().props['data-pagination'].onChange(2,50);await flush()
    assert.equal(table().props['data-pagination'].pageSize,50)
    assert.equal(table().props['data-pagination'].current,1)
    table().props['data-pagination'].onChange(2,50);await flush()
    assert.equal(table().props['data-pagination'].current,2)
    assert.equal(state.calls.length,0)
  })
}

test('view more searches beyond the card top ten without issuing a new query',async t=>{
  const state=fixture()
  const {container}=mount(t,()=>h(api.AlarmWidget,{kind:'VisionStatistics',isEdit:false,info:{componentProps:{alarmCenterVisionStatistics:{refreshSeconds:0}}}}))
  await flush()
  find(container,el=>el.type==='button'&&textOf(el)===messages['alarmDashboard.viewMore'])[0].props.onClick();await flush()
  const calls=state.calls.length
  find(container,el=>el.props['data-rank-search'])[0].props.onInput({target:{value:'Alarm 074'}});await flush()
  const rows=find(container,el=>el.props['data-table'])[0].props['data-table']
  assert.equal(rows[0].rank,75)
  assert.equal(rows[0].name,'Alarm 074')
  assert.equal(state.calls.length,calls)
})

test('an open ranking keeps its search during polling and clamps an invalid page',async t=>{
  fixture()
  const props=reactive({open:true,title:'Ranking',items:ranking(75),dimension:'camera',preview:false,loading:false,error:false})
  const {container}=mount(t,()=>h(api.AlarmRankingDialog,props))
  await flush()
  const table=()=>find(container,el=>el.props['data-table'])[0]
  const search=()=>find(container,el=>el.props['data-rank-search'])[0]
  search().props.onInput({target:{value:'Alarm'}});await flush()
  table().props['data-pagination'].onChange(4,20);await flush()
  props.items=ranking(30);await flush()
  assert.equal(search().props.value,'Alarm')
  assert.equal(table().props['data-pagination'].current,2)
  assert.equal(table().props['data-pagination'].total,30)
  props.dimension='type';await flush()
  assert.equal(search().props.value,'')
  assert.equal(table().props['data-pagination'].current,1)
  table().props['data-pagination'].onChange(2,20);await flush()
  props.open=false;await flush()
  props.open=true;await flush()
  assert.equal(table().props['data-pagination'].current,1)
})

test('localized preview names remain searchable in full after truncation in the chart',async t=>{
  const state=fixture()
  state.messages={...messages,'alarmDashboard.preview.longName':'超长摄像头名称 Camera North Entrance'}
  const {container}=mount(t,()=>h(api.AlarmRankingDialog,{open:true,title:'Ranking',items:[{id:'camera',name:'preview.longName',count:1}],dimension:'camera',preview:true,loading:false,error:false}))
  await flush()
  const search=find(container,el=>el.props['data-rank-search'])[0]
  search.props.onInput({target:{value:' north entrance '}});await flush()
  const rows=find(container,el=>el.props['data-table'])[0].props['data-table']
  assert.equal(rows.length,1)
  assert.equal(rows[0].name,'超长摄像头名称 Camera North Entrance')
})


test('ranking error shows CloudEmpty without retry, search, or table',async t=>{
  fixture()
  const {container}=mount(t,()=>h(api.AlarmRankingDialog,{open:true,title:'Ranking',items:[],dimension:'type',preview:false,loading:false,error:true}))
  await flush()
  const empty=find(container,el=>el.props['data-empty'])
  assert.equal(empty.length,1)
  assert.equal(textOf(empty[0]),messages['alarmDashboard.loadError'])
  assert.equal(empty[0].props['data-image-style'].height,'48px')
  assert.equal(find(container,el=>el.props['data-rank-search']||el.props['data-table']).length,0)
  assert.equal(find(container,el=>el.type==='button'&&textOf(el)===messages['alarmDashboard.retry']).length,0)
})

test('handling failure shows CloudEmpty while another successful source keeps its chart',async t=>{
  fixture()
  const failed={total:null,active:null,handled:null,rate:null,points:[],failed:true}
  const success={total:0,active:0,handled:0,rate:null,points:[],failed:false}
  const {container}=mount(t,()=>h('div',[h(api.AlarmHandlingCard,{title:'IOT',data:failed}),h(api.AlarmHandlingCard,{title:'Vision',data:success})]))
  await flush()
  const empty=find(container,el=>el.props['data-empty'])
  assert.equal(empty.length,1)
  assert.equal(textOf(empty[0]),messages['alarmDashboard.loadError'])
  assert.equal(empty[0].props['data-image-style'].height,'48px')
  assert.equal(find(container,el=>el.props['data-chart']).length,1)
  assert.equal(find(container,el=>el.type==='button'&&textOf(el)===messages['alarmDashboard.retry']).length,0)
})
