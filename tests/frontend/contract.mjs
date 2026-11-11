import assert from 'node:assert/strict'
/** 独立检查 2.12 SceneRule 的容器和执行字段，不调用被测编辑器的序列化函数生成期望值。 */
export function assertSceneContract(rule) {
  assert.equal(typeof rule.name, 'string')
  assert.ok(rule.name.trim())
  assert.equal(typeof rule.trigger, 'object')
  assert.equal(rule.trigger.type, rule.triggerType)
  assert.ok(Array.isArray(rule.branches) && rule.branches.length)
  for (const branch of rule.branches) {
    assert.ok(Array.isArray(branch.when))
    assert.ok(Array.isArray(branch.then) && branch.then.length)
    assert.ok(branch.then.some((group) => group.actions.length))
    assert.ok(branch.then.filter((group) => group.parallel === true).length <= 1)
    assert.ok(branch.then.filter((group) => group.parallel === false).length <= 1)
    for (const group of branch.then) {
      assert.equal(typeof group.parallel, 'boolean')
      assert.ok(Array.isArray(group.actions))
      for (const action of group.actions) {
        assert.equal(typeof action.executor, 'string')
        assert.ok(action.actionId)
        assert.equal(action.key, undefined)
        assert.equal(action.error, undefined)
        if (action.executor === 'delay') {
          assert.equal(group.parallel, false, '并行动作组不能新增延迟')
          assert.ok(
            Number.isInteger(action.delay.time) && action.delay.time >= 1 && action.delay.time <= 65535,
          )
          assert.ok(['seconds', 'minutes', 'hours'].includes(action.delay.unit))
        }
        if (action.executor === 'device') assert.ok(action.device.productId)
        if (action.executor === 'device-data') assert.equal(typeof action.configuration, 'object')
      }
    }
  }
  return rule
}
/** 共同样例只移除明确的展示信息和节点ID；options.columns/columnMap 等运行元数据参与比较。 */
export function executionShape(rule) {
  const strip = (value, context = '') => {
    if (Array.isArray(value)) return value.map((item) => strip(item, context))
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => {
          if (['typeName', 'branchName', 'key', 'error', 'actionId', 'branchId'].includes(key)) return false
          if (
            context === 'options' &&
            ['editorMode', 'editorSchemaVersion', 'name', 'typeName'].includes(key)
          )
            return false
          return true
        })
        .map(([key, item]) => [key, strip(item, key)]),
    )
  }
  return { trigger: strip(rule.trigger), branches: strip(rule.branches) }
}
