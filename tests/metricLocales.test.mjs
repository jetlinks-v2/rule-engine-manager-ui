import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync, readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import ts from 'typescript'
import {parse} from 'vue/compiler-sfc'
import {createI18n} from 'vue-i18n'
import {createMetricLoader, sourceRoot} from './helpers/metricRuntime.mjs'

const load=createMetricLoader()
const placeholders=value=>[...value.matchAll(/\{([\w]+)\}/g)].map(match=>match[1]).sort()
const catalogs=[
  ['messages.ts','metricMessages'],
  ['collection/messages.ts','collectionMessages'],
  ['source-picker/messages.ts','metricHostMessages'],
  ['bindings/messages.ts','bindingMessages'],
  ['template/algorithmGuideMessages.ts','algorithmGuideMessages'],
  ['statisticPresentation.ts','statisticMessages'],
  ['template/windowPresentation.ts','windowMessages'],
]

for(const [file,name] of catalogs)test(`${file}: Japanese has all keys and preserves interpolation`,()=>{
  const messages=load(`components/Metric/${file}`)[name]
  assert.deepEqual(Object.keys(messages.ja).sort(),Object.keys(messages.en).sort())
  assert.deepEqual(Object.keys(messages.ja).sort(),Object.keys(messages.zh).sort())
  const i18n=createI18n({legacy:false,locale:'ja',fallbackLocale:false,messages:{ja:messages.ja}})
  try{
    for(const [key,value] of Object.entries(messages.ja)){
      assert.equal(typeof value,'string',key)
      assert.deepEqual(placeholders(value),placeholders(messages.en[key]),key)
      const params=Object.fromEntries(placeholders(value).map(name=>[name,`sample-${name}`]))
      assert.notEqual(i18n.global.t(key,params),key,`${key} must compile without fallback`)
    }
  }finally{i18n.dispose()}
})

test('inline metric locale combinations include Japanese',()=>{
  function visitFiles(directory){
    for(const entry of readdirSync(directory,{withFileTypes:true})){
      const file=resolve(directory,entry.name)
      if(entry.isDirectory()){visitFiles(file);continue}
      if(!/\.(ts|vue)$/.test(file))continue
      const text=readFileSync(file,'utf8')
      const source=file.endsWith('.vue') ? parse(text).descriptor.scriptSetup?.content || '' : text
      const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true)
      function visit(node){
        if(ts.isObjectLiteralExpression(node)){
          const names=node.properties.filter(ts.isPropertyAssignment).map(item=>item.name.getText(tree))
          if(names.includes('zh')&&names.includes('en'))assert.ok(names.includes('ja'),file)
        }
        ts.forEachChild(node,visit)
      }
      visit(tree)
    }
  }
  visitFiles(resolve(sourceRoot,'components/Metric'))
})
