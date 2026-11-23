import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { sourceRoot } from './helpers/metricRuntime.mjs'

const root = new URL('../', import.meta.url)
const files = directory => readdirSync(directory, { withFileTypes:true }).flatMap(entry => entry.isDirectory()
  ? files(resolve(directory,entry.name)) : [resolve(directory,entry.name)])

test('core metric rendering and query imports stay independent of management implementation', () => {
  const core = resolve(sourceRoot,'components/Metric')
  for (const file of files(core).filter(file => /\.(ts|vue)$/.test(file))) {
    const source = readFileSync(file,'utf8')
    assert.doesNotMatch(source,/from\s*['"][^'"]*(?:rule-engine-manager-ui|useMetricEditor|useTemplateMathEditor|MetricWorkspace|TemplateDesigner)/,file)
  }
  assert.equal(existsSync(resolve(core,'MetricConfigEditor.vue')),false)
  assert.equal(existsSync(resolve(core,'workspace/MetricWorkspace.vue')),false)
  assert.doesNotMatch(readFileSync(resolve(core,'api.ts'),'utf8'),/\b(?:saveConfig|removeConfig|saveTemplate|releaseTemplate|simulateConfig|simulate):/)
})

test('management routes and the public object panel load their owning module', () => {
  const registration=readFileSync(new URL('register.ts',root),'utf8')
  assert.match(registration,/MetricScopePanel:\s*defineAsyncComponent\(\(\) => import\('\.\/components\/Metric\/collection\/MetricScopePanel.vue'\)\)/)
  for (const [view,component] of [['Metric','workspace/MetricWorkspace.vue'],['MetricTemplate','template/MetricTemplateManager.vue']]) {
    assert.ok(readFileSync(new URL(`views/${view}/index.vue`,root),'utf8').includes(`../../components/Metric/${component}`))
  }
})
