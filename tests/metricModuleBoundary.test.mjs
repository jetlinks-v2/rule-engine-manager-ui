import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { sourceRoot } from './helpers/metricRuntime.mjs'

const root = new URL('../', import.meta.url)
const files = directory => readdirSync(directory, { withFileTypes:true }).flatMap(entry => entry.isDirectory()
  ? files(resolve(directory,entry.name)) : [resolve(directory,entry.name)])

test('metric implementation and HTTP belong to the rule module while core stays generic', () => {
  const platform = process.env.JETLINKS_WEB_CORE_ROOT || resolve(sourceRoot,'../../jetlinks-web-core')
  assert.equal(existsSync(resolve(platform,'src/components/Metric')),false)
  assert.doesNotMatch(readFileSync(resolve(platform,'src/types/module.ts'),'utf8'),/components\/Metric|metricDimensions|metricPresentations/)
  for (const file of files(resolve(sourceRoot,'components/Metric')).filter(file => /\.(ts|vue)$/.test(file))) {
    assert.doesNotMatch(readFileSync(file,'utf8'),/@jetlinks-web-core\/components\/Metric|\/ontology\//,file)
  }
  assert.match(readFileSync(resolve(sourceRoot,'components/Metric/api.ts'),'utf8'),/saveConfig:/)
  assert.match(readFileSync(resolve(sourceRoot,'components/Metric/readApi.ts'),'utf8'),/\/metric\/configs\/sources\/types/)
})

test('management routes and the public object panel load their owning module', () => {
  const registration=readFileSync(new URL('register.ts',root),'utf8')
  assert.match(registration,/MetricScopePanel:\s*defineAsyncComponent\(\(\) => import\('\.\/components\/Metric\/collection\/MetricScopePanel.vue'\)\)/)
  for (const [view,component] of [['Metric','workspace/MetricWorkspace.vue'],['MetricTemplate','template/MetricTemplateManager.vue']]) {
    assert.ok(readFileSync(new URL(`views/${view}/index.vue`,root),'utf8').includes(`../../components/Metric/${component}`))
  }
})
