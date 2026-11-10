type SceneRecord = Record<string, any>

const isRecord = (value: unknown): value is SceneRecord => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)

const asArray = (value: unknown): SceneRecord[] => Array.isArray(value)
  ? value.filter(isRecord)
  : []

const isConditionGroup = (condition: SceneRecord) => !condition.column && Array.isArray(condition.terms)

/**
 * 原版详细编辑器把分支条件包装为条件组，而快速编辑器保存的是扁平条件。
 * 进入详细模式时只补齐编辑器所需的分组外壳，规则叶子和未知字段保持不变。
 */
export const toDetailedConditionGroups = (conditions: unknown): SceneRecord[] => asArray(conditions)
  .map(condition => isConditionGroup(condition)
    ? condition
    : {
        type: 'and',
        terms: [condition],
      })

/** 在保留原有条件树的前提下替换某一类由触发器维护的叶子条件。 */
export const replaceManagedSceneCondition = (
  conditions: unknown,
  isManaged: (condition: SceneRecord) => boolean,
  nextCondition?: SceneRecord,
): SceneRecord[] => {
  let replaced = false

  const replace = (condition: SceneRecord): SceneRecord | undefined => {
    if (isConditionGroup(condition)) {
      const terms = asArray(condition.terms)
        .map(replace)
        .filter(isRecord)
      return terms.length ? { ...condition, terms } : undefined
    }
    if (!isManaged(condition)) return condition
    if (replaced || !nextCondition) return undefined
    replaced = true
    return { ...condition, ...nextCondition }
  }

  const result = asArray(conditions)
    .map(replace)
    .filter(isRecord)
  if (nextCondition && !replaced) {
    result.push({ type: 'and', terms: [nextCondition] })
  }
  return result
}

/** 找到详细条件树中的首个叶子条件，供专用触发器回显自己的配置。 */
export const findSceneCondition = (
  conditions: unknown,
  predicate: (condition: SceneRecord) => boolean,
): SceneRecord | undefined => {
  for (const condition of asArray(conditions)) {
    if (isConditionGroup(condition)) {
      const found = findSceneCondition(condition.terms, predicate)
      if (found) return found
    } else if (predicate(condition)) {
      return condition
    }
  }
  return undefined
}

/**
 * 历史场景告警和通知模板动作均不再提供可写编辑器。它们可查看和删除，
 * 但在重新配置完成前不能保存，避免重新提交已下线的执行契约。
 */
export const hasUnsupportedLegacyAction = (scene: unknown) => isRecord(scene)
  && asArray(scene.branches)
    .flatMap(branch => asArray(branch.then))
    .flatMap(group => asArray(group.actions))
    .some(action => ['alarm', 'notify'].includes(String(action.executor)))

/** @deprecated 新调用统一使用 hasUnsupportedLegacyAction，同时保留旧调用方的告警判断。 */
export const hasUnsupportedLegacyAlarmAction = (scene: unknown) => isRecord(scene)
  && asArray(scene.branches)
    .flatMap(branch => asArray(branch.then))
    .flatMap(group => asArray(group.actions))
    .some(action => action.executor === 'alarm')
