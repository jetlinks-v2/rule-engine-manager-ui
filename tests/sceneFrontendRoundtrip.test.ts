import assert from 'node:assert/strict'
import test from 'node:test'
import { ref, reactive, computed, watch } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mergeDetailedDraft } from '../views/SceneLinkage/editor/editorMode'
import { useDetailedSceneDraft } from '../views/SceneLinkage/editor/detail/useDetailedSceneDraft'

// 对齐宿主的 Vue 自动导入；使用同一份 Vue 实例创建编辑会话。
Object.assign(globalThis, { ref, reactive, computed, watch })

// 本轮新建配置的交叉组合：两种条件连接、两种分支继续策略、四种原生值。
for (const relation of ['and', 'or']) {
  for (const executeAnyway of [false, true]) {
    for (const value of [0, false, { source: 'fixed', value: [10, 30] }, { source: 'upper', value: 'action_0.temperature' }]) {
      test(`new detailed draft reload retains ${relation}/${executeAnyway}/${JSON.stringify(value)}`, () => {
        setActivePinia(createPinia())
        const branch = (index: number) => ({
          branchId: `branch-${index}`, executeAnyway,
          when: [{ type: relation, terms: [{ column: 'temperature', termType: 'eq', value }] }],
          shakeLimit: { enabled: true, time: 5, threshold: 2, alarmFirst: false },
          then: [
            { parallel: false, actions: [{ actionId: `read-${index}`, executor: 'device-data', configuration: { productId: 'p1', selector: 'all' }, options: { columns: ['temperature'] } }, { actionId: `delay-${index}`, executor: 'delay', delay: { time: 7, unit: 'seconds' }, terms: [{ type: 'and', terms: [{ column: 'success', termType: 'eq', value: { source: 'fixed', value: true } }] }] }] },
            { parallel: true, actions: [{ actionId: `write-${index}`, executor: 'device', device: { productId: 'p1', selector: 'all', message: { messageType: 'WRITE_PROPERTY', properties: { enabled: false, temperature: 0 } } }, options: { columns: [] } }] },
          ],
        })
        const submitted = mergeDetailedDraft({}, { name: '新建前端组合', triggerType: 'device', trigger: { type: 'device', device: { productId: 'p1', selector: 'all', operation: { operator: 'online' } } }, branches: [branch(1), branch(2)], options: {} })
        const session = useDetailedSceneDraft()
        session.load(JSON.parse(JSON.stringify(submitted)))
        session.data.value.name = '修改名称'
        const resubmitted = mergeDetailedDraft(submitted, session.getDraft())
        assert.deepEqual(resubmitted.branches, submitted.branches)
        assert.deepEqual(resubmitted.trigger, submitted.trigger)
        assert.equal(resubmitted.name, '修改名称')
        assert.equal(submitted.name, '新建前端组合')
        assert.equal(resubmitted.branches[0].then[0].actions[0].actionId, 'read-1')
        assert.deepEqual(resubmitted.branches[0].then[1].actions[0].device.message.properties, { enabled: false, temperature: 0 })
      })
    }
  }
}

test('new draft with empty condition metadata supports independent condition deletion and readdition', () => {
  setActivePinia(createPinia())
  const session = useDetailedSceneDraft()
  session.load({ name: '新建条件', triggerType: 'device', trigger: { type: 'device' }, options: { when: [] } })
  const rule = session.data.value
  assert.equal(rule.options.when.length, 1)
  assert.equal(rule.branches[0].when.length, 1)
  assert.equal(rule.options.when[0].terms.length, 1)
  assert.ok(Array.isArray(rule.options.when[0].terms[0].terms[0]))
  rule.branches[0].when.splice(0, 1)
  assert.equal(rule.options.when[0].terms.length, 1)
  rule.options.when[0].terms.splice(0, 1)
  assert.deepEqual(rule.branches[0].when, [])
  rule.options.when[0].terms.push({ terms: [] })
  assert.deepEqual(rule.branches[0].when, [])
})
