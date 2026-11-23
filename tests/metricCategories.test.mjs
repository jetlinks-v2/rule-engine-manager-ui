import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, ref } from 'vue'
import { resolve } from 'node:path'
import { createMetricLoader, sourceRoot } from './helpers/metricRuntime.mjs'

const load = createMetricLoader({[resolve(sourceRoot,'components/Metric/api.ts')]:{metricApi:{}}})
const { useMetricTemplates } = load('components/Metric/template/useMetricTemplates.ts')
const { templateCatalog, starterCatalog, filterTemplateCatalog, selectCatalogCategory } = load('components/Metric/template/templateCatalog.ts')
const { useTemplateCatalog } = load('components/Metric/template/useTemplateCatalog.ts')

test('目录搜索支持本地化名称、分类与发布状态及分组，清除筛选不改变原始目录',()=>{
  const empty={inputDefinitions:[],parameterDefinitions:[],definitions:[],outputs:[]}
  const entities=[
    {id:'power',released:true,template:{...empty,name:'Power',options:{category:'energy',i18nMessages:{name:{zh:'单位能耗'}}}}},
    {id:'runtime',released:false,template:{...empty,name:'Runtime',options:{category:'health'}}},
    {id:'other',released:false,template:{...empty,name:'Other'}},
  ]
  // 使用与实际目录相同的本地化输入，避免搜索未翻译的原始实体名称。
  const groups=templateCatalog(entities,[{value:'energy',label:'能源'},{value:'health',label:'维护'}],'zh','未分类')
  const snapshot=JSON.stringify(groups)
  const ids=terms=>filterTemplateCatalog(groups,terms).flatMap(group=>group.items.map(item=>item.entity.id))
  const clause=(column,value,termType='eq',type='and')=>({column,value,termType,type})
  assert.deepEqual(ids([clause('name','%run%','like')]),['runtime'])
  assert.deepEqual(ids([clause('name','能耗','like')]),['power'])
  assert.deepEqual(ids([{terms:[clause('category','energy'),clause('category','health','eq','or')]},clause('released','false')]),['runtime'])
  assert.deepEqual(ids([clause('category','')]),['other'])
  assert.deepEqual(ids([clause('name','absent','like')]),[])
  assert.equal(JSON.stringify(groups),snapshot)
  assert.equal(ids([]).length,3)
})

test('快捷分类和搜索共享条件，保留其他字段；空分类与全部分类可区分',()=>{
  const terms=[{terms:[{column:'category',termType:'eq',value:'old'},{column:'name',termType:'like',value:'Runtime'}]}, {column:'released',termType:'eq',value:'false'}]
  const before=JSON.stringify(terms)
  const selected=selectCatalogCategory(terms,'')
  assert.deepEqual(selected,[{terms:[{column:'name',termType:'like',value:'Runtime'}]},terms[1],{column:'category',termType:'eq',value:'',type:'and'}])
  assert.deepEqual(selectCatalogCategory(selected),[{terms:[{column:'name',termType:'like',value:'Runtime'}]},terms[1]])
  assert.equal(JSON.stringify(terms),before)
  const directory=useTemplateCatalog(ref([]),key=>key)
  directory.selectCategory(''); assert.equal(directory.category.value,'')
  directory.clear(); assert.equal(directory.category.value,undefined)
})

test('字典改名、排序和删除后重新分组，保留模板编码与当前草稿', async () => {
  const scope = effectScope()
  let items = [{value:'energy',label:'Energy'},{value:'maintenance',label:'Maintenance'}]
  const view = scope.run(() => useMetricTemplates(ref(true), {templateCategories:async()=>items}))
  try {
    view.open()
    view.draft.value.name = 'Unsaved'
    await view.loadCategories()
    const empty = {inputDefinitions:[],parameterDefinitions:[],definitions:[],outputs:[]}
    const entities = items.map(item=>({template:{...empty,name:item.value,options:{category:item.value}}}))
    const starters = items.map(item=>({id:item.value,groupId:item.value,template:{...empty,name:item.value}}))
    items = [{value:'maintenance',label:'保养'},{value:'energy',label:'能源'}]
    await view.loadCategories()
    assert.deepEqual(templateCatalog(entities,view.categories.value,'zh','未分类').map(x=>x.label),['保养','能源'])
    assert.deepEqual(starterCatalog(starters,'zh',view.categories.value,'未分类').map(x=>x.label),['保养','能源'])
    items = items.slice(0,1)
    await view.loadCategories()
    assert.deepEqual(templateCatalog(entities,view.categories.value,'zh','未分类').map(x=>x.label),['保养','未分类'])
    assert.equal(entities[0].template.options.category,'energy')
    assert.equal(view.draft.value.name,'Unsaved')
    assert.equal(view.hasChanges.value,true)
  } finally { scope.stop() }
})

test('分类读取失败保留最后结果与草稿，重试成功后清除错误', async () => {
  const scope = effectScope()
  let fail = false
  const view = scope.run(() => useMetricTemplates(ref(true), {templateCategories:async()=>{
    if (fail) throw new Error('Dictionary unavailable')
    return [{value:'custom',label:'Custom'}]
  }}))
  try {
    view.open(); view.draft.value.name = 'Unsaved'
    await view.loadCategories(); fail = true; await view.loadCategories()
    assert.match(view.categoryError.value,/Dictionary unavailable/)
    assert.deepEqual(view.categories.value,[{value:'custom',label:'Custom'}])
    assert.equal(view.draft.value.name,'Unsaved')
    assert.equal(view.categoriesLoading.value,false)
    fail = false; await view.loadCategories()
    assert.equal(view.categoryError.value,'')
  } finally { scope.stop() }
})

test('分类并发刷新和卸载时，迟到响应不覆盖当前字典', async () => {
  const scope = effectScope(); const finish = []
  const view = scope.run(() => useMetricTemplates(ref(true), {templateCategories:()=>new Promise(resolve=>finish.push(resolve))}))
  try {
    const first = view.loadCategories(); const second = view.loadCategories()
    finish[1]([{value:'new',label:'New'}]); await second
    finish[0]([{value:'old',label:'Old'}]); await first
    assert.equal(view.categories.value[0].value,'new')
    const last = view.loadCategories(); scope.stop()
    finish[2]([{value:'late',label:'Late'}]); await last
    assert.equal(view.categories.value[0].value,'new')
  } finally { scope.stop() }
})
