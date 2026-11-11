import { storeToRefs } from 'pinia'
import { cloneDeep } from 'lodash-es'
import type { Ref } from 'vue'
import { useSceneStore, defaultBranches, assignmentKey } from '@rule-engine-manager-ui/store/scene'
import { type SceneRuleRecord } from '../editorMode'
import { toDetailedConditionGroups } from '../../sceneRule'

const createEmptyOptions = () => ({ trigger: {}, when: [] as any[] })
const isBranchRecord = (value: unknown): value is SceneRuleRecord => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)

/**
 * 为未按原版编辑器结构保存的规则补齐原版组件所需的展示元数据。
 *
 * 此处只构造会话草稿，不写入后端；保存由上层把会话结果合并到统一规则树，
 * 以免首次打开旧数据就改变其结构。
 */
const toLegacyDraft = (rule: SceneRuleRecord): SceneRuleRecord => {
  const draft = cloneDeep(rule)
  const options = draft.options && typeof draft.options === 'object' && !Array.isArray(draft.options)
    ? draft.options
    : {}
  const branches = Array.isArray(draft.branches) && draft.branches.length
    ? draft.branches
    : cloneDeep(defaultBranches)

  // 新建详细草稿必须保留未选择触发方式的状态，不能为了复用原版组件隐式补成手动触发。
  draft.trigger = draft.trigger || {}
  draft.triggerType = draft.triggerType || draft.trigger.type
  // 私有化旧规则可使用空分支来表达同一条件组的动作序列；展示规范化必须保留它们的索引。
  // 保存会移除 UI key，重新载入时复用原版初始化，确保动作删除和条件联动可定位节点。
  draft.branches = assignmentKey(branches.map((branch: SceneRuleRecord) => isBranchRecord(branch)
    ? { ...branch, when: toDetailedConditionGroups(branch.when) }
    : branch))
  draft.options = {
    ...createEmptyOptions(),
    ...options,
    trigger: options.trigger || {},
    // 快速模式的 options.when 与运行时分支同样是扁平叶子；原版详细组件则读取条件组。
    // 新建页面会传入空 options.when；仍需为每个分支补齐条件组件读写的展示记录。
    // 展示条件必须独立克隆，否则删除条件时会同时修改运行条件树两次。
    when: draft.branches.filter(isBranchRecord).map((branch: SceneRuleRecord, index: number) => {
      const existing = Array.isArray(options.when)
        ? options.when.find((item: SceneRuleRecord) => branch.branchId != null && item?.key === branch.branchId) || options.when[index]
        : undefined
      return {
        terms: (branch.when || []).map((group: SceneRuleRecord) => ({
          terms: (group.terms || []).map((term: SceneRuleRecord) => [term.column || '', term.termType || 'eq', cloneDeep(term.value?.value ?? ''), term.type || 'and']),
        })),
        branchName: branch.branchName,
        key: branch.branchId,
        executeAnyway: branch.executeAnyway,
        groupIndex: index + 1,
        ...existing,
        ...(existing && options.editorMode === 'quick' ? { terms: toDetailedConditionGroups(existing.terms) } : {}),
      }
    }),
  }
  return draft
}

/**
 * 原版细粒度组件只能读取 sceneStore；桥接层把统一规则树映射为会话数据。
 * 该会话数据只服务原版组件，不能自行构造或提交另一份规则请求。
 */
export const useDetailedSceneDraft = () => {
  const sceneStore = useSceneStore()
  const { data } = storeToRefs(sceneStore)
  const load = (rule: SceneRuleRecord) => {
    data.value = toLegacyDraft(rule) as any
  }

  /** 返回原版组件当前会话状态，统一规则树的合并和提交由编辑页负责。 */
  const getDraft = (): SceneRuleRecord => cloneDeep(data.value as SceneRuleRecord)

  return {
    // Store 的原版 FormModelType 未覆盖 SaaS 专用触发器；桥接会话统一按 SceneRule 使用。
    data: data as unknown as Ref<SceneRuleRecord>,
    load,
    getDraft,
  }
}
