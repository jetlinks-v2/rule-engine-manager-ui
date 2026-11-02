import { isPrivateDeployment } from '@jetlinks-web-core/utils/deployment'
import { randomNumber } from '@jetlinks-web/utils'

export type SceneEditorMode = 'quick' | 'detail'

export type SceneRuleRecord = Record<string, any>

export const SCENE_EDITOR_SCHEMA_VERSION = 2

const isRecord = (value: unknown): value is SceneRuleRecord => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)

const asRecords = (value: unknown): SceneRuleRecord[] => Array.isArray(value)
  ? value.filter(isRecord)
  : []

/**
 * SceneRule 是 JSON 数据，但详细编辑器会把它包装为 Vue 响应式对象。
 * structuredClone 不能接收 Proxy；按规则字段递归复制既保留未知字段，也能安全处理编辑草稿。
 */
const cloneRule = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(cloneRule) as T
  if (!isRecord(value)) return value
  return Object.entries(value).reduce<SceneRuleRecord>((result, [key, item]) => {
    result[key] = cloneRule(item)
    return result
  }, {}) as T
}

/**
 * 读取已保存的模式标识；历史规则没有标识时按当前部署形态选择默认入口。
 *
 * 模式只属于编辑器元数据，不能从规则结构猜测，避免首次打开历史复杂规则时发生隐式迁移。
 */
export const resolveInitialEditorMode = (
  rule: unknown,
  privateDeployment = isPrivateDeployment(),
): SceneEditorMode => {
  const savedMode = isRecord(rule) && isRecord(rule.options) ? rule.options.editorMode : undefined
  if (savedMode === 'quick' || savedMode === 'detail') return savedMode
  return privateDeployment ? 'detail' : 'quick'
}

/**
 * 仅定点更新编辑器元数据，保留后端和其它编辑器写入的 options 字段。
 *
 * `editorSchemaVersion` 只标识前端已按统一规则树保存，不能参与场景运行时语义。
 */
export const mergeEditorMode = (rule: SceneRuleRecord, editorMode: SceneEditorMode): SceneRuleRecord => {
  const nextRule = cloneRule(rule)
  nextRule.options = {
    ...(isRecord(nextRule.options) ? nextRule.options : {}),
    editorMode,
    editorSchemaVersion: SCENE_EDITOR_SCHEMA_VERSION,
  }
  return nextRule
}

/**
 * 将详细编辑器提交的树合并回加载快照。
 *
 * 原版组件会在编辑时补充 key、error 等 UI 字段；保存时只移除这些临时字段，
 * 其它未知字段仍随所在规则节点一起回写。
 */
export const mergeDetailedDraft = (
  originalRule: SceneRuleRecord,
  detailedDraft: SceneRuleRecord,
): SceneRuleRecord => {
  const original = cloneRule(originalRule)
  const draft = omitEditorFields(cloneRule(detailedDraft))
  const merged = {
    ...original,
    ...draft,
    options: {
      ...(isRecord(original.options) ? original.options : {}),
      ...(isRecord(draft.options) ? draft.options : {}),
    },
  }
  return mergeEditorMode(merged, 'detail')
}

const createEmptyDetailedCondition = () => ({
  terms: [{
    column: undefined,
    value: { source: 'fixed', value: undefined },
    termType: undefined,
    key: `params_${randomNumber()}`,
    type: 'and',
  }],
  type: 'and',
  key: `terms_${randomNumber()}`,
})

/**
 * 快速模式没有过滤条件时仍是有效规则；切到详细模式后按原版新建规则的编辑态补一个空条件。
 * 该草稿须经详细表单补全后才能保存，保证“执行：开”的展示与真实条件结构一致。
 */
export const prepareQuickRuleForDetailedEditing = (rule: SceneRuleRecord): SceneRuleRecord => {
  const next = cloneRule(rule)
  const branch = asRecords(next.branches)[0]
  if (!branch) return next

  branch.executeAnyway = true
  if (!asRecords(branch.when).length) {
    branch.when = [createEmptyDetailedCondition()]
  }

  const options = isRecord(next.options) ? next.options : {}
  const branchOptions = asRecords(options.when)
  const branchOption = branchOptions[0] || {}
  next.options = {
    ...options,
    when: [{
      ...branchOption,
      terms: cloneRule(branch.when),
      branchName: branch.branchName || branchOption.branchName,
      key: branch.branchId || branchOption.key,
      executeAnyway: true,
      groupIndex: 1,
    }, ...branchOptions.slice(1)],
  }
  return next
}

/**
 * 快速表单只在快速模式自己的合并基线上保存；对可表达节点继续透传未知字段。
 */
export const mergeQuickDraft = (
  originalRule: SceneRuleRecord,
  quickDraft: SceneRuleRecord,
): SceneRuleRecord => {
  const original = cloneRule(originalRule)
  const quick = omitEditorFields(cloneRule(quickDraft))
  const merged = {
    ...original,
    ...quick,
    trigger: mergeRuleNode(original.trigger, quick.trigger),
    options: {
      ...(isRecord(original.options) ? original.options : {}),
      ...(isRecord(quick.options) ? quick.options : {}),
    },
    branches: mergeBranches(asRecords(original.branches), asRecords(quick.branches)),
  }
  return mergeEditorMode(merged, 'quick')
}

const mergeBranches = (originalBranches: SceneRuleRecord[], quickBranches: SceneRuleRecord[]) => quickBranches.map((branch, index) => {
  const original = originalBranches.find(item => item.branchId && item.branchId === branch.branchId)
    || originalBranches[index]
  const merged = mergeRuleNode(original, branch)
  return {
    ...merged,
    then: mergeActionGroups(asRecords(original?.then), asRecords(branch.then)),
  }
})

const mergeActionGroups = (originalGroups: SceneRuleRecord[], quickGroups: SceneRuleRecord[]) => quickGroups.map((group, index) => {
  const original = originalGroups.find(item => Boolean(item.parallel) === Boolean(group.parallel))
    || originalGroups[index]
  const merged = mergeRuleNode(original, group)
  return {
    ...merged,
    actions: asRecords(group.actions).map((action, actionIndex) => {
      const originalAction = asRecords(original?.actions).find(item => item.actionId && item.actionId === action.actionId)
        || asRecords(original?.actions)[actionIndex]
      return mergeRuleNode(originalAction, action)
    }),
  }
})

const mergeRuleNode = (original: unknown, draft: unknown): SceneRuleRecord => {
  const originalNode = isRecord(original) ? original : {}
  const draftNode = isRecord(draft) ? draft : {}
  return {
    ...originalNode,
    ...draftNode,
    ...(isRecord(originalNode.options) || isRecord(draftNode.options) ? {
      options: { ...(isRecord(originalNode.options) ? originalNode.options : {}), ...(isRecord(draftNode.options) ? draftNode.options : {}) },
    } : {}),
  }
}

const EDITOR_ONLY_FIELDS = new Set(['key', 'error', 'branches_Index'])

const omitEditorFields = (value: unknown): any => {
  if (Array.isArray(value)) return value.map(omitEditorFields)
  if (!isRecord(value)) return value
  return Object.entries(value).reduce<SceneRuleRecord>((result, [key, item]) => {
    if (!EDITOR_ONLY_FIELDS.has(key)) result[key] = omitEditorFields(item)
    return result
  }, {})
}
