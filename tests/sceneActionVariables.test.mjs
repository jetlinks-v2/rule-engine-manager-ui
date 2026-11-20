import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function fixture(response = { success: true, result: [{ id: 'scene.deviceId' }] }) {
  const calls = []
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../views/Scene/Save/util.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mocks = {
    '../../../api/scene': { queryBuiltInParams: async (rule, params) => { calls.push({ rule, params }); if (response instanceof Error) throw response; return response } },
    './components/Terms/util': {}, '../../../store/scene': {}, pinia: {},
  }
  new Function('require', 'exports', code)(id => mocks[id] ?? {}, exports)
  return { getParams: exports.getParams, calls }
}
const position = { branch: 0, branchGroup: 0, action: 0 }

test('empty drafts and unfinished multi triggers do not request upstream variables', async () => {
  const { getParams, calls } = fixture()
  for (const trigger of [undefined, {}, { type: '' }, { type: ' ' }, { type: 'multi', multi: { triggers: [] } },
    { type: 'multi', multi: { triggers: [{ trigger: { type: 'timer' } }, { trigger: {} }] } }]) {
    const draft = { trigger, branches: [{ when: [{ terms: [{ value: { source: 'fixed' } }] }], then: [] }] }
    const original = structuredClone(draft)
    assert.deepEqual(await getParams(position, draft), [])
    assert.deepEqual(draft, original)
  }
  assert.equal(calls.length, 0)
})

test('configured sources preserve the requested position and original action/condition structure', async () => {
  const { getParams, calls } = fixture()
  const draft = { trigger: { type: 'device', device: { productId: 'p', operation: { operator: 'online' } } },
    branches: [{ when: [{ terms: [{ column: 'temperature', value: 0 }] }], then: [{ actions: [{ executor: 'device-data' }, { executor: 'device' }] }] }] }
  const original = structuredClone(draft)
  const params = { branch: 0, branchGroup: 0, action: 1 }
  assert.deepEqual(await getParams(params, draft), [{ id: 'scene.deviceId' }])
  assert.deepEqual(calls[0], { rule: original, params })
  assert.deepEqual(draft, original)
  draft.trigger = { type: 'multi', multi: { triggers: [{ trigger: { type: 'timer' } }, { trigger: original.trigger }] } }
  await getParams(params, draft)
  assert.equal(calls.length, 2)
})

test('failed and non-success variable responses settle as empty options', async () => {
  for (const response of [{ success: false }, { success: true }, new Error('unavailable')]) {
    const { getParams } = fixture(response)
    assert.deepEqual(await getParams(position, { trigger: { type: 'manual' }, branches: [] }), [])
  }
})
