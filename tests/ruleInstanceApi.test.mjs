import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { writeFile, rm } from 'node:fs/promises'
const temporary = new URL(`../.rule-api-test-${process.pid}.mjs`, import.meta.url)
const result = await build({ entryPoints: [new URL('../api/instanceObservation.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm', external: ['rxjs'],
  plugins: [{ name: 'transport-boundaries', setup(b) {
    b.onResolve({ filter: /^@jetlinks-web/ }, args => ({ path: args.path, namespace: 'mock' }))
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path.endsWith('ndjson-precision')
      ? 'export const postRuntimeNdJson=(url,body)=>({url,body})' : 'export const wsClient={}' }))
  } }] })
await writeFile(temporary, result.outputFiles[0].text)
const { streamRuleInstances, loadRulePreviews } = await import(temporary.href)
await rm(temporary)

const matches = (item, terms) => terms.reduce((result, term) => {
  const value = term.terms ? matches(item, term.terms) : term.termType === 'lt' ? item[term.column] < term.value : item[term.column] === term.value
  return term.type === 'or' ? result || value : result && value
}, true)
test('generic bounded query keeps OR filters inside the stable timestamp and id cursor', () => {
  const { url, body } = streamRuleInstances({ terms: [{ column: 'name', value: 'A' }, { type: 'or', column: 'name', value: 'B' }] }, { beforeTime: 100, beforeId: 'b' })
  assert.equal(url, '/rule-engine/instance/_query/no-paging')
  assert.equal(body.paging, true); assert.equal(body.pageSize, 32); assert.equal(body.pageIndex, 0)
  assert.equal(body.includes.includes('modelMeta'), false); assert.equal(body.includes.includes('metadata'), false)
  assert.equal(matches({ name: 'B', createTime: 100, id: 'a' }, body.terms), true)
  assert.equal(matches({ name: 'B', createTime: 100, id: 'c' }, body.terms), false)
  assert.equal(matches({ name: 'B', createTime: 101, id: 'a' }, body.terms), false)
  assert.equal(matches({ name: 'C', createTime: 99, id: 'a' }, body.terms), false)
})
test('preview lookup is a separate visible batch with no canvas projection', () => {
  const { body } = loadRulePreviews(['a', 'b'])
  assert.deepEqual(body.includes, ['id', 'metadata'])
  assert.deepEqual(body.terms[0].value, ['a', 'b'])
  assert.equal(body.pageSize, 64)
})
