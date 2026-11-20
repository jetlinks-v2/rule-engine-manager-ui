import { computed, onScopeDispose, ref, watch } from 'vue'
import type { AiSceneTreeOption } from '../../../../api/scene-linkage'
import { defaultForm, type SceneAlarmTriggerConfig } from '../../utils'
import { conditionNodeSummaryParts } from '../conditionNodeSummary'
import { localizedSummaryParts, type SummaryTranslate } from '../summaryParts'
import { quickTriggerSummaryParts } from '../quickTriggerSummary'
import type { SelectedVisualAlarmTaskIssue } from '../aiVisualAlarmTaskService'
import { loadIotAlarmRules, loadVisualAlarmRules, type AlarmRule, type AlarmSourceKind } from './alarmConditionResourceService'

export type AlarmConditionOptions = {
  open: boolean
  sourceKind: AlarmSourceKind
  mode: 'trigger' | 'condition' | 'query'
  modelValue: SceneAlarmTriggerConfig
}

/** 管理告警弹窗草稿与分页资源；关闭或重开后不接受上一轮请求结果。 */
export function useAlarmConditionModel(getOptions: () => AlarmConditionOptions, t: SummaryTranslate) {
  const loading = ref(false)
  const loadError = ref(false)
  const selectedTaskIssue = ref<SelectedVisualAlarmTaskIssue>()
  let requestVersion = 0
  const keyword = ref('')
  const rules = ref<AlarmRule[]>([])
  const hasMoreVisualTasks = ref(false)
  const loadingMoreVisualTasks = ref(false)
  let visualTaskPageIndex = -1
  let visualScenes: AiSceneTreeOption[] = []
  const selectedRuleId = ref<string>()
  const draft = ref<SceneAlarmTriggerConfig>(clone(getOptions().modelValue))

  const title = computed(() => getOptions().mode === 'query'
    ? t('IotSceneLinkage.alarmCondition.queryTitle')
    : getOptions().mode === 'trigger'
      ? t(getOptions().sourceKind === 'visual-ai' ? 'IotSceneLinkage.triggerCategory.visualAlarm' : 'IotSceneLinkage.triggerCategory.iotAlarm')
    : t(getOptions().sourceKind === 'visual-ai'
      ? 'IotSceneLinkage.condition.visualAlarmState'
      : 'IotSceneLinkage.condition.iotAlarmState'))
  const listTitle = computed(() => t(getOptions().sourceKind === 'visual-ai'
    ? 'IotSceneLinkage.alarmCondition.visualRuleList'
    : 'IotSceneLinkage.alarmCondition.iotRuleList'))
  const sourceLabel = computed(() => t(getOptions().sourceKind === 'visual-ai'
    ? 'IotSceneLinkage.alarmSource.visualAi'
    : 'IotSceneLinkage.alarmSource.iotDevice'))
  const searchPlaceholder = computed(() => t(getOptions().sourceKind === 'visual-ai'
    ? 'IotSceneLinkage.alarmCondition.searchVisual'
    : 'IotSceneLinkage.alarmCondition.searchIot'))
  const filteredRules = computed(() => {
    const normalized = keyword.value.trim().toLocaleLowerCase()
    if (!normalized) return rules.value
    return rules.value.filter(rule => [rule.name, ...rule.lines, ...rule.details.map(item => item.value)]
      .some(value => value.toLocaleLowerCase().includes(normalized)))
  })
  const selectedRule = computed(() => rules.value.find(rule => rule.id === selectedRuleId.value))
  const states = computed(() => [
    ...(getOptions().mode === 'query'
      ? []
      : getOptions().mode === 'trigger'
      ? [
          { value: 'trigger', label: t('IotSceneLinkage.alarmMode.trigger'), description: t('IotSceneLinkage.alarmMode.triggerHint'), icon: 'AlertOutlined' },
          { value: 'relieve', label: t('IotSceneLinkage.alarmMode.relieve'), description: t('IotSceneLinkage.alarmMode.relieveHint'), icon: 'SafetyCertificateOutlined' },
        ]
      : [
          { value: 'warning', label: t('IotSceneLinkage.alarmState.warning'), description: t('IotSceneLinkage.alarmCondition.detailHelp'), icon: 'AlertOutlined' },
          { value: 'normal', label: t('IotSceneLinkage.alarmCondition.normalState'), description: t('IotSceneLinkage.alarmCondition.detailHelp'), icon: 'SafetyCertificateOutlined' },
        ]),
  ])
  const stateTitle = computed(() => getOptions().mode === 'trigger'
    ? t('IotSceneLinkage.alarmCondition.triggerWhen')
    : t('IotSceneLinkage.alarmCondition.currentState'))
  const triggerPreview = computed(() => quickTriggerSummaryParts({ ...defaultForm(), triggerKind: 'alarm', alarm: draft.value }, t))
  const conditionPreview = computed(() => getOptions().mode === 'query'
    ? localizedSummaryParts(t, 'IotSceneLinkage.alarmCondition.queryPreviewText', { name: selectedRule.value?.name || draft.value.options?.alarmConfigName || t('IotSceneLinkage.alarmCondition.selectRule') })
    : conditionNodeSummaryParts({ type: 'alarmState', alarm: draft.value }, t))

  function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

  /** 进入弹窗时使用草稿，取消不会让未确认的规则选择写回场景表单。 */
  async function resetAndLoad() {
    const version = ++requestVersion
    const options = getOptions()
    selectedTaskIssue.value = undefined
    keyword.value = ''
    draft.value = clone(getOptions().modelValue)
    selectedRuleId.value = draft.value.alarmConfigId
    rules.value = []
    loadingMoreVisualTasks.value = false
    hasMoreVisualTasks.value = false
    visualTaskPageIndex = -1
    loadError.value = false
    loading.value = true
    try {
      let loaded: AlarmRule[]
      if (options.sourceKind === 'visual-ai') {
        const page = await loadVisualAlarmRules(0, draft.value.state, t, [], draft.value.alarmConfigId)
        if (version !== requestVersion) return
        visualScenes = page.scenes
        hasMoreVisualTasks.value = page.hasMore
        selectedTaskIssue.value = page.selectedTaskIssue
        visualTaskPageIndex = 0
        loaded = page.rules
      } else loaded = await loadIotAlarmRules(draft.value.state, t)
      if (version !== requestVersion) return
      rules.value = loaded
      const selectedFromList = rules.value.find(rule => rule.id === selectedRuleId.value)
      // 分页列表没有返回历史已选规则时，保留历史配置，不能因打开并保存弹窗而替换为首条规则。
      const selected = selectedFromList || selectedRuleFromDraft() || rules.value[0]
      if (selected && !selectedFromList && draft.value.alarmConfigId) {
        selected.unavailable = Boolean(selectedTaskIssue.value)
        rules.value.unshift(selected)
      }
      if (selected) selectRule(selected)
    } catch {
      // Keep a request failure distinct from a successful empty response, so users know to retry rather than recreate a rule.
      if (version === requestVersion) loadError.value = true
    } finally {
      if (version === requestVersion) loading.value = false
    }
  }

  function selectedRuleFromDraft(): AlarmRule | undefined {
    const value = clone(draft.value)
    const id = value.alarmConfigId
    const name = value.options?.alarmConfigName || id
    if (!id || !name) return undefined
    if (getOptions().sourceKind === 'visual-ai') {
      const scene = value.options?.sceneName || value.options?.sceneId || '-'
      const algorithm = value.options?.taskTargetName || value.options?.taskTarget || '-'
      return {
        id,
        name,
        lines: [
          t('IotSceneLinkage.alarmCondition.sceneLine', { value: scene }),
          t('IotSceneLinkage.alarmCondition.algorithmLine', { value: algorithm }),
        ],
        details: [
          { label: t('IotSceneLinkage.alarmCondition.scene'), value: scene },
          { label: t('IotSceneLinkage.alarmCondition.algorithm'), value: algorithm },
        ],
        value,
      }
    }
    const product = value.options?.productId || '-'
    const device = value.options?.deviceId || t('IotSceneLinkage.scope.all')
    return {
      id,
      name,
      lines: [
        t('IotSceneLinkage.alarmCondition.productLine', { value: product }),
        t('IotSceneLinkage.alarmCondition.deviceLine', { value: device }),
      ],
      details: [
        { label: t('IotSceneLinkage.form.product'), value: product },
        { label: t('IotSceneLinkage.form.device'), value: device },
      ],
      value,
    }
  }

  function alarmLevelText(level: number) {
    const keys = ['emergency', 'urgent', 'severity', 'ordinary', 'warn']
    return t(`DeviceAlarm.level.${keys[level - 1] || 'ordinary'}`)
  }

  function alarmLevelColor(level: number) {
    if (level <= 2) return 'error'
    if (level === 3) return 'warning'
    if (level === 4) return 'processing'
    return 'default'
  }

  async function loadMoreVisualAlarmRules() {
    if (loading.value || loadingMoreVisualTasks.value || !hasMoreVisualTasks.value) return
    const version = requestVersion
    loadingMoreVisualTasks.value = true
    try {
      const pageIndex = visualTaskPageIndex + 1
      const page = await loadVisualAlarmRules(pageIndex, draft.value.state, t, visualScenes)
      if (version !== requestVersion) return
      visualTaskPageIndex = pageIndex
      hasMoreVisualTasks.value = page.hasMore
      rules.value = [...new Map([...rules.value, ...page.rules].map(rule => [rule.id, rule])).values()]
    } catch { if (version === requestVersion) loadError.value = true }
    finally { if (version === requestVersion) loadingMoreVisualTasks.value = false }
  }

  function selectRule(rule: AlarmRule) {
    if (!rule.unavailable) selectedTaskIssue.value = undefined
    selectedRuleId.value = rule.id
    const current = draft.value
    // 保留历史扩展字段，同时用查询到的最新名称刷新旧的属性名回显。
    draft.value = current.alarmConfigId === rule.id
      ? {
          ...rule.value,
          ...current,
          sourceKind: rule.value.sourceKind,
          targetType: rule.value.targetType,
          state: current.state || rule.value.state || 'warning',
          options: { ...current.options, ...rule.value.options },
        }
      : { ...rule.value, modes: current.modes || [], state: current.state || 'warning' }
    // 新建触发默认产生告警；切换规则、重新编辑时保留用户已选状态。
    if (getOptions().mode === 'trigger' && !draft.value.modes?.length) draft.value.modes = ['trigger']
  }

  function isStateSelected(value: string) {
    return getOptions().mode === 'trigger'
      ? draft.value.modes.includes(value as 'trigger' | 'relieve')
      : draft.value.state === value
  }

  /** Trigger and condition use one selection shell but persist different existing alarm fields. */
  function changeState(value: string) {
    draft.value = getOptions().mode === 'trigger'
      ? { ...draft.value, modes: [value as 'trigger' | 'relieve'] }
      : { ...draft.value, state: value as 'warning' | 'normal' }
  }

  /** 失效历史引用只用于回显，必须重新选择可读任务后才能确认。 */
  function getValue() {
    return selectedRule.value && !selectedRule.value.unavailable ? clone(draft.value) : undefined
  }

  // 新增附加条件时组件与打开状态会在同一渲染周期创建；立即执行才能避免首次弹窗不发查询。
  watch(() => getOptions().open, open => {
    if (open) void resetAndLoad()
    else { requestVersion += 1; loading.value = false; loadingMoreVisualTasks.value = false }
  }, { immediate: true })
  onScopeDispose(() => { requestVersion += 1 })

  return { loading, loadError, keyword, hasMoreVisualTasks, loadingMoreVisualTasks, selectedTaskIssue,
    title, listTitle, sourceLabel, searchPlaceholder, filteredRules, selectedRuleId, selectedRule,
    states, stateTitle, triggerPreview, conditionPreview, resetAndLoad, selectRule,
    alarmLevelText, alarmLevelColor, loadMoreVisualAlarmRules, isStateSelected, changeState, getValue }
}
