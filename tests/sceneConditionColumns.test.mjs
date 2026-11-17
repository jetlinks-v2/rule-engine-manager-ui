import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function load(url, mocks) {
  const code = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', code)(id => id in mocks ? mocks[id] : require(id), exports)
  return exports
}
let nextId = 0
const utils = load(new URL('../views/SceneLinkage/utils.ts', import.meta.url), {
  '@jetlinks-web/utils': { randomNumber: () => ++nextId },
})

function fixture() {
  const calls = []
  const api = load(new URL('../views/SceneLinkage/editor/sceneConditionColumns.ts', import.meta.url), {
    '../utils': utils,
    '../../../api/scene-linkage': {
      querySceneTermColumns: async () => ({ result: [{ id: '_now', termTypes: [{ id: 'btw' }] }] }),
      // 后端按最终动作序号创建变量；action 参数只暴露该位置之前的串行输出。
      parseSceneVariables: async (draft, params) => {
        calls.push(params)
        return { result: draft.branches[0].then[0].actions.slice(0, params.action).flatMap((action, index) => {
          const id = `branch_1_group_1_action_${index + 1}`
          if (action.executor === 'device-data') return [{ id, children: action.configuration.properties.map(property => ({ id: `${id}.properties.${property}`, column: `properties.${property}`, termTypes: [{ id: 'gt' }, { id: 'eq' }] })) }]
          if (action.executor === 'alarm-record-query') return [{ id, termTypes: [{ id: 'eq' }] }]
          return []
        }) }
      },
    },
  })
  return { ...api, calls }
}
const time = { type: 'timeRange', ranges: [{ start: '09:00', end: '18:00' }] }
const property = id => ({ type: 'deviceProperty', productId: 'p', selector: 'fixed', selectorValues: [{ value: 'd' }], propertyId: id, termType: 'gt', value: 60 })
const alarm = { type: 'alarmState', alarm: { alarmConfigId: 'alarm', state: 'warning', options: {} } }
const form = (triggerKind, conditions) => ({ ...utils.defaultForm(), triggerKind, additionalConditions: structuredClone(conditions), actions: [{ type: 'delay', time: 1 }] })

test('manual time gate preserves the property condition variable at its actual action position', async () => {
  const api = fixture()
  const value = form('manual', [time, property('cpu')])
  const columns = await api.resolveSceneConditionColumns(value)
  assert.deepEqual(columns.devicePropertyColumns, ['branch_1_group_1_action_2.properties.cpu'])
  assert.equal(api.calls[0].action, 2)
  const request = utils.buildRequest(value, columns)
  assert.equal(request.branches[0].then[0].actions[1].terms[0].column, columns.devicePropertyColumns[0])
})

test('mixed additional conditions retain their actual variable positions with and without a manual gate', async () => {
  for (const trigger of ['manual', 'online']) {
    const api = fixture()
    const value = form(trigger, [property('temperature'), time, alarm, property('humidity')])
    const columns = await api.resolveSceneConditionColumns(value)
    const offset = trigger === 'manual' ? 1 : 0
    assert.deepEqual(columns.devicePropertyColumns, [`branch_1_group_1_action_${offset + 1}.properties.temperature`, `branch_1_group_1_action_${offset + 3}.properties.humidity`])
    assert.deepEqual(columns.alarmStateColumns, [`branch_1_group_1_action_${offset + 2}`])
    assert.equal(api.calls[0].action, offset + 3)
  }
})

test('time-only conditions do not parse action variables', async () => {
  const api = fixture()
  const columns = await api.resolveSceneConditionColumns(form('manual', [time]))
  assert.equal(columns.timeColumn, '_now')
  assert.deepEqual(api.calls, [])
})
