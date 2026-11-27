import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile,writeFile,rm} from 'node:fs/promises'
import {resolve} from 'node:path'
import vm from 'node:vm'
import {build} from 'esbuild'
import {createRenderer,nextTick,ref} from 'vue'
import {createI18n} from 'vue-i18n'

const root=new URL('..',import.meta.url)
const dictionaries=Object.fromEntries(await Promise.all(['zh','en','ja'].map(async lang=>[lang,JSON.parse(await readFile(new URL(`../locales/lang/${lang}.json`,import.meta.url),'utf8')).RuleTemplates])))
const temporary=new URL(`../.rule-templates-test-${process.pid}.mjs`,import.meta.url)
const bundled=await build({stdin:{contents:[
  "export * from './views/Instance/Templates/catalog'", "export * from './views/Instance/Templates/types'",
  "export * from './views/Instance/Templates/buildFlow'", "export * from './views/Instance/Templates/models'",
  "export * from './views/Instance/Templates/useTemplateSource'", "export * from './views/Instance/Templates/useRuleTemplateCreation'",
  "export * from './views/Instance/Templates/useResourceOptions'",
  "export * from './views/Instance/useRuleInstanceActions'",
  "export * from './views/Instance/Templates/illustrations'", "export * from './api/ruleTemplates'",
].join(';'),resolveDir:root.pathname},bundle:true,write:false,platform:'node',format:'esm',external:['vue','vue-i18n','@vueuse/core'],plugins:[{name:'platform-boundaries',setup(b){
  b.onResolve({filter:/^@jetlinks-web\/core$/},()=>({path:'request',namespace:'mock'}))
  b.onResolve({filter:/^@jetlinks-web-core\/utils$/},()=>({path:'utils',namespace:'mock'}))
  b.onResolve({filter:/^@jetlinks-web\/utils$/},()=>({path:'messages',namespace:'mock'}))
  b.onResolve({filter:/^@jetlinks-web\/hooks$/},()=>({path:'router-params',namespace:'mock'}))
  b.onResolve({filter:/^vue-router$/},()=>({path:'router',namespace:'mock'}))
  b.onResolve({filter:/^@jetlinks-web-core\/components\/I18n\/text$/},()=>({path:new URL('../../jetlinks-web-core/src/components/I18n/text.ts',root).pathname}))
  b.onResolve({filter:/\.svg\?raw$/},args=>({path:resolve(args.resolveDir,args.path.replace(/\?raw$/,'')),namespace:'svg'}))
  b.onLoad({filter:/.*/,namespace:'svg'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))
  b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='router-params'
    ? "import {ref} from 'vue';export const useRouterParams=()=>({params:ref(globalThis.__ruleParams || {})});export const setParamsValue=(code,value)=>{globalThis.__ruleParams=value}"
    : args.path==='router' ? "export const useRoute=()=>globalThis.__ruleRoute;export const useRouter=()=>globalThis.__ruleRouter"
    : args.path==='messages' ? "export const onlyMessage=()=>{}"
    : args.path==='request'
    ? "export const request={get:(url,...args)=>globalThis.__templateRequest('GET',url,...args),post:(url,...args)=>globalThis.__templateRequest('POST',url,...args)}"
    : "export const getBaseApi=()=>'/api';export const isFromCloud=()=>false"}))
}}]})
await writeFile(temporary,bundled.outputFiles[0].text)
let api
try {api=await import(temporary.href)}finally {await rm(temporary)}
const translator=lang=>createI18n({legacy:false,locale:lang,messages:{[lang]:{RuleTemplates:dictionaries[lang]}}}).global.t
const decode=value=>Buffer.from(value,'base64').toString('utf8')
const model={properties:[{id:'temperature',name:'温度',nameI18n:{en:'Temperature',ja:'温度'},valueType:{type:'double',unit:'celsius'},expands:{type:['read','report']}}],events:[{id:'alarm',name:'Alarm',outputs:{type:'object',properties:[{id:'code',name:'Code',valueType:{type:'enum',elements:[{value:1,text:'Active'}]}}]}}],functions:[]}
const source=()=>({product:{id:'p1',name:'Meters'},scope:'devices',devices:[{id:'d1',name:'Meter 1',productId:'p1'}],message:'property',properties:structuredClone(model.properties),event:structuredClone(model.events[0]),eventFields:structuredClone(model.events[0].outputs.properties),format:'records',includeMetadata:false})
function parameters(id){const p={...api.defaultTemplateParameters(),source:source(),threshold:60};if(id==='event-action')p.source.message='event';return p}
const nodes=draft=>JSON.parse(draft.payload.modelMeta).flows
const flush=async()=>{await nextTick();await new Promise(resolve=>setImmediate(resolve));await nextTick()}
function mount(setup,plugin){let state;const renderer=createRenderer({createComment:()=>({}),parentNode:()=>null,nextSibling:()=>null,insert(){},remove(){},setText(){},setElementText(){},patchProp(){},createElement:()=>({}),createText:()=>({})});const app=renderer.createApp({setup(){state=setup();return()=>null}});if(plugin)app.use(plugin);app.mount({});return{state,close:()=>app.unmount()}}

test('all template, category, parameter and node text has the same complete language keys',()=>{
  const keys=(value,prefix='')=>Object.entries(value).flatMap(([key,item])=>typeof item==='object' ? keys(item,`${prefix}${key}.`) : [`${prefix}${key}`]).sort()
  assert.deepEqual(keys(dictionaries.en),keys(dictionaries.zh));assert.deepEqual(keys(dictionaries.ja),keys(dictionaries.zh))
  for(const lang of ['zh','en','ja'])for(const template of api.ruleTemplates){
    const draft=api.buildTemplateFlow(template.id,parameters(template.id),translator(lang),lang)
    assert.ok(draft.payload.name && draft.payload.description)
    assert.ok(!draft.payload.name.includes('RuleTemplates.'))
    nodes(draft).forEach(node=>assert.ok(node.name && !node.name.includes('RuleTemplates.')))
    if(template.id!=='blank'){
      assert.match(draft.payload.metadata.thumbnailSvg,/^<svg/)
      assert.doesNotMatch(draft.payload.metadata.thumbnailSvg,/\{\{|RuleTemplates\./)
      assert.ok(draft.payload.metadata.thumbnailSvg.includes(dictionaries[lang].steps[template.steps[0]]))
    }else assert.equal(draft.payload.metadata.thumbnailSvg,undefined)
    assert.equal(draft.payload.metadata.icon,template.icon)
  }
})

test('exported SVG nodes and links match every template and forwarding target',()=>{
  for(const template of api.ruleTemplates)for(const target of api.forwardingTargets){
    const p=parameters(template.id);p.target=target
    let index=0
    const draft=api.buildTemplateFlow(template.id,p,translator('en'),'en',()=>`diagram-${index++}`),flow=nodes(draft)
    const svg=draft.payload.metadata?.thumbnailSvg || ''
    if(template.id==='blank'){assert.equal(svg,'');continue}
    assert.match(svg,/data-export="node-red"/)
    const graph=[...svg.matchAll(/<g\b[^>]*\bid="([^"]+)"[^>]*data-node-type="([^"]+)"/g)].map(([,id,type])=>({id,type}))
    assert.deepEqual(graph,flow.map(({id,type})=>({id,type})))
    const edges=[...svg.matchAll(/<path\b(?=[^>]*class="[^"]*\bred-ui-flow-link-line\b)[^>]*data-source="([^"]+)" data-target="([^"]+)"/g)].map(([,from,to])=>`${from}->${to}`).sort()
    assert.deepEqual(edges,flow.flatMap(node=>node.wires.flat().map(id=>`${node.id}->${id}`)).sort())
    assert.doesNotMatch(svg,/<script|<foreignObject|(?:href|src)="(?:https?:|blob:)/i)
    assert.doesNotMatch(svg,/class="[^"]*\bred-ui-flow-node-(?:error|status-group|changed)\b/)
  }
  for(const template of api.ruleTemplates.filter(item=>item.setup)){
    const draft=api.buildTemplateFlow(template.id,api.defaultTemplateParameters(),translator('en'),'en')
    const flow=nodes(draft),focus=flow.find(item=>item.id===draft.initialization.focusNodeId)
    assert.equal(focus.type,template.id==='scheduled-read' ? 'device-message-sender' : 'reactor-ql')
    assert.equal(draft.initialization.source,undefined)
    assert.ok(draft.initialization.pending.length)
    assert.match(draft.payload.metadata.thumbnailSvg,/^<svg/)
    if(focus.type==='reactor-ql')assert.equal(decode(focus.sql),'')
  }
})

test('static SVG localization replaces every label, escapes XML, and preserves exported geometry',()=>{
  for(const lang of ['zh','en','ja'])for(const template of api.ruleTemplates){
    const illustration={id:template.id,message:'event'},raw=api.templateIllustrationSource(illustration)
    const svg=api.localizedTemplateIllustration(illustration,translator(lang))
    assert.doesNotMatch(svg,/\{\{|RuleTemplates\./)
    assert.equal(svg.replace(/>[^<>]*<\/text>/g,'></text>'),raw.replace(/>[^<>]*<\/text>/g,'></text>'))
  }
  const unsafe=api.localizedTemplateIllustration({id:'device-forward'},()=>`A & <B> "C" 'D'`)
  assert.match(unsafe,/A &amp; &lt;B&gt; &quot;C&quot; &apos;D&apos;/)
  assert.ok(api.localizedTemplateIllustration({id:'device-forward',message:'event'},translator('en')).includes(dictionaries.en.steps.eventSource))
})

test('parallel calls share input, return the named finite branch results, and remap all references on each creation',()=>{
  const first=api.buildTemplateFlow('parallel-response',parameters('parallel-response'),translator('en'),'en')
  const second=api.buildTemplateFlow('parallel-response',parameters('parallel-response'),translator('en'),'en')
  const a=nodes(first),b=nodes(second),ids=new Set(a.map(n=>n.id))
  assert.ok(b.every(n=>!ids.has(n.id)))
  const zip=a.find(n=>n.type==='zip-output');assert.equal(zip.flatWhenSingle,true)
  const result={}
  for(const branch of a.filter(n=>n.type==='function')){
    let handler;vm.runInNewContext(decode(branch.func),{handler:{onMessage(fn){handler=fn}}})
    result[zip.mapping[branch.id].alias]=handler({data:{deviceId:'d1',value:42}})
    assert.ok(branch.wires[0].includes(zip.id))
  }
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{data:{data:{deviceId:'d1',value:42}},summary:{fieldCount:2}})
  a[1].wires[0].length=0;assert.equal(b[1].wires[0].length,2)
})

test('search combines localized names, descriptions, categories and steps and handles an empty result',()=>{
  assert.ok(api.searchRuleTemplates('查询',undefined,translator('zh')).some(item=>item.id==='device-query-all'))
  assert.deepEqual(api.searchRuleTemplates('query','device-actions',translator('en')),[])
  assert.ok(api.searchRuleTemplates(' FORWARD device ',undefined,translator('en')).some(item=>item.id==='device-forward'))
  assert.ok(api.searchRuleTemplates('プロパティ',undefined,translator('ja')).some(item=>item.id==='scheduled-read'))
  assert.deepEqual(api.searchRuleTemplates('not-a-template',undefined,translator('en')),[])
})

test('SQL scope, property projection, event outputs and metadata follow explicit selections',()=>{
  const s=source();s.properties[0].id="a'b";s.format='fields'
  let sql=api.deviceSourceSql(s);assert.match(sql,/new_map\('a''b', this\.properties\['a''b'\]\)/);assert.match(sql,/\/device\/p1\/d1\/message\/property\/report/)
  s.format='records';s.includeMetadata=true;sql=api.deviceSourceSql(s)
  assert.match(sql,/unnest\(this\.properties\.entries\)/);assert.match(sql,/thing\.metadata\.property/);assert.match(sql,/where entry.key in \('a''b'\)/)
  s.message='event';s.format='fields';sql=api.deviceSourceSql(s);assert.match(sql,/\/message\/event\/alarm/);assert.match(sql,/this.data\['code'\]/)
  s.scope='product';sql=api.deviceSourceSql(s);assert.match(sql,/\/device\/p1\/\*\/message\/event\/alarm/);assert.ok(!sql.includes('this.deviceId in'))
})

test('HTTP and MQTT wrap messages according to their contracts, while fixed-topic Kafka forwards the object directly',()=>{
  for(const target of api.forwardingTargets){
    const p=parameters('device-forward');p.target=target;p.topic='devices';p.url='https://example.com/ingest'
    const flow=nodes(api.buildTemplateFlow('device-forward',p,translator('en'),'en'))
    const adapter=flow.find(n=>n.type==='function')
    if(target==='kafka-producer')assert.equal(adapter,undefined)
    else {let handler;vm.runInNewContext(decode(adapter.func),{handler:{onMessage(fn){handler=fn}}});const output=handler({data:{value:12}});assert.equal(output.payload.value,12);if(target==='http request')assert.equal(output.contentType,'application/json')}
  }
})

test('required scope, numeric fields and identity are checked before creating a model',()=>{
  const p=parameters('threshold-notify');p.threshold=Infinity;assert.equal(api.validateTemplateParameters('threshold-notify',p),'required')
  p.threshold=60;p.source.properties[0].valueType.type='string';assert.equal(api.validateTemplateParameters('threshold-notify',p),'numericRequired')
  p.source.devices[0].productId='other';assert.equal(api.validateTemplateParameters('device-forward',p),'sourceNeeded')
  assert.throws(()=>api.parseThingModel('{bad json'))
  assert.throws(()=>api.parseThingModel({properties:{}}))
})

test('compatible models retain nested schemas and reject same-name fields with incompatible types or units',()=>{
  const first=structuredClone(model),second=structuredClone(model);second.properties[0].name='Temperature'
  assert.equal(api.compatibleThingModels([first,second]).properties.length,1)
  second.properties[0].valueType.unit='fahrenheit';assert.equal(api.compatibleThingModels([first,second]).properties.length,0)
  const combined=api.compatibleThingModels([first,first]);assert.equal(api.eventDefinitions(combined.events[0])[0].valueType.elements[0].value,1)
})

test('late model results cannot overwrite a changed device scope and complete-message forwarding avoids model reads',async()=>{
  const waits=[];globalThis.__templateRequest=async(method,url)=>{if(url.includes('_query'))return{result:{data:[],total:0}};return new Promise(resolve=>waits.push({url,resolve}))}
  const template=ref('device-forward'),locale=ref('en'),mounted=mount(()=>api.useTemplateSource(template,locale));const s=mounted.state
  s.products.remember({id:'p1',name:'First'});s.productId.value='p1';await flush();assert.equal(waits.length,0);assert.equal(s.source.value.product.id,'p1')
  s.format.value='fields';await flush();assert.equal(waits.length,1)
  s.products.remember({id:'p2',name:'Second'});s.productId.value='p2';await flush();assert.equal(waits.length,2)
  waits[1].resolve({result:{metadata:model}});await flush();assert.equal(s.properties.value[0].id,'temperature')
  waits[0].resolve({result:{metadata:{properties:[{id:'stale',valueType:{type:'string'}}]}}});await flush();assert.equal(s.properties.value[0].id,'temperature')
  mounted.close()
})

test('submission is single-flight, posts a complete model once, and keeps input available after failure',async()=>{
  let resolveCreate,writes=0
  globalThis.__templateRequest=async(method,url,body)=>{
    if(method==='GET')return{result:api.ruleTemplates.flatMap(item=>item.nodes).map(type=>({enabled:true,types:[type]}))}
    writes++;assert.equal(url,'/rule-editor/flows/_create');assert.ok(JSON.parse(body.modelMeta).flows.length);assert.match(body.metadata.thumbnailSvg,/^<svg/);return new Promise(resolve=>{resolveCreate=resolve})
  }
  const mounted=mount(()=>api.useRuleTemplateCreation(translator('en'),()=> 'en'));await mounted.state.load()
  const first=mounted.state.create('transform-response',api.defaultTemplateParameters());assert.equal(await mounted.state.create('transform-response',api.defaultTemplateParameters()),undefined)
  resolveCreate({status:500});assert.equal(await first,undefined);assert.equal(writes,1);assert.equal(mounted.state.creating.value,false);assert.ok(mounted.state.error.value)
  const retry=mounted.state.create('transform-response',api.defaultTemplateParameters());resolveCreate({result:{id:'created-rule'}})
  const result=await retry;assert.equal(result.rule.id,'created-rule');assert.ok(result.initialization.focusNodeId);assert.equal(writes,2);mounted.close()
})

test('editing uses submission validation and clears repaired issues without hiding request failures',async()=>{
  const mounted=mount(()=>api.useRuleTemplateCreation(translator('en'),()=> 'en'))
  const p=api.defaultTemplateParameters()
  assert.equal(await mounted.state.create('device-forward',p),undefined)
  assert.equal(mounted.state.validationIssue.value,'sourceNeeded')
  p.source=source();assert.equal(mounted.state.validate('device-forward',p),true)
  assert.equal(mounted.state.validationIssue.value,undefined)
  p.url='invalid';assert.equal(mounted.state.validate('device-forward',p),false)
  assert.equal(mounted.state.validationIssue.value,'invalidUrl')
  mounted.state.error.value='request failed'
  p.url='https://example.com';assert.equal(mounted.state.validate('device-forward',p),true)
  assert.equal(mounted.state.validationIssue.value,undefined)
  assert.equal(mounted.state.error.value,'request failed')
  mounted.close()
})

test('skip creates an unconfigured draft without carrying selected resources or bypassing normal validation',async()=>{
  let writes=0
  globalThis.__templateRequest=async(method,url,body)=>{
    if(method==='GET')return{result:api.ruleTemplates.flatMap(item=>item.nodes).map(type=>({enabled:true,types:[type]}))}
    writes++
    assert.equal(decode(JSON.parse(body.modelMeta).flows[0].sql),'')
    assert.ok(!body.modelMeta.includes('/device/p1/'))
    return{result:{id:'later-rule',state:{value:'disable'}}}
  }
  const mounted=mount(()=>api.useRuleTemplateCreation(translator('en'),()=> 'en'));await mounted.state.load()
  assert.equal(await mounted.state.create('event-action',api.defaultTemplateParameters()),undefined)
  assert.equal(writes,0)
  const result=await mounted.state.create('event-action',parameters('event-action'),true)
  assert.equal(result.initialization.source,undefined)
  assert.equal(result.initialization.focusNodeId,result.initialization.pending[0].nodeId)
  assert.equal(writes,1);mounted.close()
})

test('created template initialization survives query navigation and does not reopen the creation panel',async()=>{
  const {reactive}=await import('vue')
  const i18n=createI18n({legacy:false,locale:'en',messages:{en:{RuleTemplates:dictionaries.en}}})
  const draft=api.buildTemplateFlow('event-action',api.defaultTemplateParameters(),translator('en'),'en')
  const rule={id:'restored-rule',...draft.payload}
  globalThis.__ruleParams={save:true,ruleTemplate:{templateId:'event-action'}}
  globalThis.__ruleRoute=reactive({name:'rule-engine/Instance',query:{}})
  globalThis.__ruleRouter={replace:async({query})=>{globalThis.__ruleRoute.query=query}}
  globalThis.__templateRequest=async()=>({status:200,result:rule})
  const first=mount(()=>api.useRuleInstanceActions(()=>{}),i18n);first.state.created({rule,initialization:draft.initialization});await flush();first.close()
  const restored=mount(()=>api.useRuleInstanceActions(()=>{}),i18n);await flush()
  assert.equal(restored.state.visible.value,false)
  assert.equal(restored.state.ruleEditor.current.id,rule.id)
  assert.equal(restored.state.templateInitialization.value.focusNodeId,draft.initialization.focusNodeId)
  restored.close();delete globalThis.__ruleParams
})

test('resource choices load on open, debounce searches, append pages, and discard old scope or disposed reads',async context=>{
  context.mock.timers.enable({apis:['setTimeout']})
  const requests=[]
  const mounted=mount(()=>api.useResourceOptions((keyword,page)=>new Promise(resolve=>requests.push({keyword,page,resolve}))))
  const s=mounted.state
  assert.equal(requests.length,0);s.open(false);assert.equal(requests.length,0)
  s.open(true);s.open(true);assert.equal(requests.length,1)
  requests[0].resolve({data:Array.from({length:20},(_,i)=>({id:String(i),name:`Device ${i}`})),total:21});await flush()
  s.open(true);assert.equal(requests.length,1)
  s.scroll({target:{scrollTop:100,clientHeight:100,scrollHeight:200}});assert.equal(requests[1].page,1)
  requests[1].resolve({data:[{id:'20',name:'Device 20'}],total:21});await flush();assert.equal(s.items.value.length,21)
  void s.search('met');void s.search('meter');context.mock.timers.tick(251);await flush()
  assert.equal(requests.length,3);assert.equal(requests[2].keyword,'meter');assert.equal(requests[2].page,0)
  s.clear();requests[2].resolve({data:[{id:'old',name:'Old'}],total:1});await flush();assert.equal(s.items.value.length,0)
  s.open(true);assert.equal(requests[3].keyword,'')
  mounted.close();requests[3].resolve({data:[{id:'late',name:'Late'}],total:1});await flush();assert.equal(s.items.value.length,0)
  context.mock.timers.reset()
})
