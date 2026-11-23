import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { metricApi } from './api'
import { createConfig, MetricActivationError, saveAndActivate } from './service'
import { copy, editableParameters, errorText, parameterOverrides, templateKey } from '@jetlinks-web-core/components/Metric/service'
import { useMetricPresentation } from '@jetlinks-web-core/components/Metric/extensions/useMetricPresentation'
import { normalizePresentation } from '@jetlinks-web-core/components/Metric/extensions/presentationSettings'
import { sourceScheduleMissing, supportsSnapshotSource } from './sourcePolicy'
import { metricSourceHasInputConstraint } from '@jetlinks-web-core/components/Metric/sourceSchema'
import type { MetricApi, MetricConfig, MetricContext, MetricSourceDescription, MetricSourcePicker, MetricTemplateCategory, MetricTemplateEntity, MetricTemplateInput } from '@jetlinks-web-core/components/Metric/types'

export function useMetricEditor(
  context: Ref<MetricContext>, initial: Ref<MetricConfig | undefined>,
  picker: Ref<MetricSourcePicker | undefined>, api: MetricApi = metricApi
) {
  const draft = ref<MetricConfig>(copy(initial.value || createConfig(context.value)))
  const templates = ref<MetricTemplateEntity[]>([])
  const categories = ref<MetricTemplateCategory[]>([])
  const clean = ref(JSON.stringify(draft.value))
  const dirty = computed(() => JSON.stringify(draft.value) !== clean.value)
  const loading = ref(false)
  const saving = ref(false)
  const choosing = ref('')
  const error = ref('')
  const errorKind = ref<'load' | 'save' | 'activation' | 'binding' | 'presentation' | ''>('')
  const sourceLabels = ref<Record<string, string>>({})
  const sourceDescriptions = ref<Record<string, MetricSourceDescription>>({})
  const sourcesLoading = ref(false)
  const savedSnapshot = ref<MetricConfig>()
  const snapshotLoading = ref(false)
  const selectedTemplate = computed(() => templates.value.find(item =>
    item.template.id === draft.value.templateId && item.template.version === draft.value.templateVersion
    && (draft.value.templateRevision == null || item.revision === draft.value.templateRevision))?.template)
  const parameters = computed(() => editableParameters(selectedTemplate.value))
  const missingInputs = computed(() => selectedTemplate.value?.inputDefinitions.filter(input => !draft.value.inputMappings[input.id]) || [])
  const presentation = useMetricPresentation(selectedTemplate, draft)
  const extensionFailed = ref(false)
  watch(presentation.provider, () => { extensionFailed.value = false })
  const templateSelection = computed({
    get: () => draft.value.templateId ? templateKey({ id: draft.value.templateId, version: draft.value.templateVersion }) : undefined,
    set: (key: string | undefined) => {
      if (!key) return
      const entity = templates.value.find(item => templateKey(item.template) === key)
      if (!entity) return
      const template = entity.template
      cancelChoice()
      draft.value = { ...draft.value, templateId: template.id, templateVersion: template.version, templateRevision: entity.revision,
        inputMappings: {}, parameters: {} }
      sourceLabels.value = {}
    }
  })
  let generation = 0
  let sourceVersion = 0
  let choiceVersion = 0
  function cancelChoice() {
    choiceVersion++
    // 抽屉退出动画期间，其他入口可能已开始选择；只取消当前编辑器发起的选择。
    if (choosing.value) picker.value?.cancel?.()
    choosing.value = ''
  }
  async function refreshSources() {
    const token = ++sourceVersion
    const describe = picker.value?.describe
    sourceDescriptions.value = {}
    if (!context.value.editable || loading.value || errorKind.value === 'load') { sourceLabels.value = {}; sourcesLoading.value = false; return }
    if (!describe || !Object.keys(draft.value.inputMappings).length) { sourcesLoading.value = false; return }
    sourceLabels.value = {}
    sourcesLoading.value = true
    try {
      const descriptions = await describe({ ...context.value, scope:draft.value.scope, targetType:draft.value.targetType, targetId:draft.value.targetId }, copy(draft.value.inputMappings))
      if (token === sourceVersion) {
        sourceDescriptions.value = descriptions
        sourceLabels.value = Object.fromEntries(Object.entries(descriptions).filter(([,item]) => item.label && !item.error).map(([id,item]) => [id,item.label!]))
      }
    } catch (cause) {
      if (token === sourceVersion) sourceDescriptions.value = Object.fromEntries(Object.keys(draft.value.inputMappings).map(id => [id,{ error:errorText(cause) }]))
    } finally { if (token === sourceVersion) sourcesLoading.value = false }
  }
  async function load() {
    const token = ++generation
    loading.value = true
    error.value = ''
    errorKind.value = ''
    try {
      // 结果列表省略输入绑定；进入管理时重新授权并读取完整配置。
      const config = draft.value.id ? await api.getConfig(draft.value.id) : draft.value
      if (token !== generation) return
      if (config.id) { draft.value = copy(config); clean.value = JSON.stringify(draft.value) }
      const [catalog, fixed, dictionary] = await Promise.allSettled([
        api.selectable(), config.id ? api.configTemplate(config.id) : Promise.resolve(undefined), api.templateCategories?.() || Promise.resolve([])
      ])
      const list = catalog.status === 'fulfilled' ? catalog.value : []
      if (config.id && fixed.status === 'rejected') throw fixed.reason
      if (fixed.status === 'fulfilled' && fixed.value) {
        // 编辑已有配置始终使用固定快照；目录的同版本最新修订不能替换它。
        const index = list.findIndex(item => item.template.id === config.templateId && item.template.version === config.templateVersion)
        const fixedEntity = { id: config.id!, name: fixed.value.name, available: false, released: true, template: fixed.value, revision: config.templateRevision ?? 1 }
        if (index >= 0) list.splice(index, 1, fixedEntity)
        else list.unshift(fixedEntity)
      }
      if (catalog.status === 'rejected' && !list.length) throw catalog.reason
      if (token === generation) { templates.value = list; categories.value = dictionary.status === 'fulfilled' ? dictionary.value : [] }
    } catch (cause) { if (token === generation) { error.value = errorText(cause); errorKind.value = 'load' } }
    finally { if (token === generation) loading.value = false }
  }
  async function choose(input: MetricTemplateInput, inline = false) {
    if (!context.value.editable || !picker.value) return
    cancelChoice()
    const choice = choiceVersion
    choosing.value = input.id
    error.value = ''
    try {
      const token = generation
      const version = templateKey({ id: draft.value.templateId, version: draft.value.templateVersion })
      // 旧模板未声明类型时，可按已绑定来源的真实声明筛选；不改写模板或猜测类型。
      const source = sourceDescriptions.value[input.id]
      const selectableInput = !metricSourceHasInputConstraint(input) && !source?.error && source?.valueType?.type ? {...input,valueType:source.valueType} : input
      const selection = await picker.value({ context: { ...context.value, scope: draft.value.scope,
        targetType: draft.value.targetType, targetId: draft.value.targetId }, configId:draft.value.id, input:selectableInput, mapping: draft.value.inputMappings[input.id],
        hint:selectedTemplate.value?.options?.inputHints?.[input.id], scheduled:!!selectedTemplate.value && supportsSnapshotSource(selectedTemplate.value, input), inline:inline && !!picker.value.editor })
      if (context.value.editable && selection && choice === choiceVersion && token === generation && version === templateKey({ id: draft.value.templateId, version: draft.value.templateVersion })) {
        draft.value.inputMappings[input.id] = copy(selection.mapping)
        sourceLabels.value[input.id] = selection.label || ''
      }
    } catch (cause) { if (choice === choiceVersion) error.value = errorText(cause) }
    finally { if (choice === choiceVersion) choosing.value = '' }
  }
  async function readSaved() {
    if (!draft.value.id) return
    snapshotLoading.value = true
    try { savedSnapshot.value = await api.getConfig(draft.value.id) }
    catch (cause) { error.value = errorText(cause) }
    finally { snapshotLoading.value = false }
  }
  function useSaved() {
    if (!savedSnapshot.value) return
    draft.value = copy(savedSnapshot.value)
    savedSnapshot.value = undefined
    error.value = ''
    errorKind.value = ''
    sourceLabels.value = {}
    clean.value = JSON.stringify(draft.value)
    void load()
  }
  function bindingsReady() { return !!selectedTemplate.value && !missingInputs.value.length
    && !selectedTemplate.value.inputDefinitions.some(input => sourceScheduleMissing(selectedTemplate.value!, input, draft.value.inputMappings[input.id])) }
  function setScope(scope: 'single' | 'children') {
    const owner = context.value
    if (!owner.editable || saving.value || (draft.value.scope || 'single') === scope || scope === 'children' && !owner.inheritance) return
    cancelChoice()
    draft.value = { ...draft.value, scope, targetType: scope === 'children' ? owner.inheritance!.targetType : owner.targetType || owner.ownerType,
      targetId: scope === 'children' ? '*' : owner.targetId || owner.ownerId, inputMappings: {} }
    sourceLabels.value = {}
  }
  function ready() {
    error.value = ''
    if (!selectedTemplate.value) { errorKind.value = 'binding'; return false }
    if (!bindingsReady()) { errorKind.value = 'binding'; return false }
    errorKind.value = ''
    return true
  }
  async function save(activate: boolean): Promise<MetricConfig | undefined> {
    if (!context.value.editable || saving.value || loading.value || errorKind.value === 'load') return
    const template = selectedTemplate.value
    if (!template || !ready()) return
    if (sourcesLoading.value || Object.values(sourceDescriptions.value).some(item => item.error)) { errorKind.value = 'binding'; return }
    if (presentation.missing.value || extensionFailed.value) { errorKind.value = 'presentation'; return }
    saving.value = true
    error.value = ''
    errorKind.value = ''
    try {
      const saved = await saveAndActivate(api, {
        ...copy(draft.value), parameters: parameterOverrides(template, draft.value.parameters), presentation: normalizePresentation(draft.value.presentation)
      }, activate)
      draft.value = saved
      clean.value = JSON.stringify(saved)
      return saved
    } catch (cause) {
      if (cause instanceof MetricActivationError) {
        draft.value = cause.configuration
        clean.value = JSON.stringify(draft.value)
        errorKind.value = 'activation'
      } else errorKind.value = 'save'
      error.value = errorText(cause)
    } finally { saving.value = false }
  }
  watch(initial, value => { cancelChoice(); draft.value = copy(value || createConfig(context.value)); clean.value = JSON.stringify(draft.value); void load() }, { immediate: true })
  watch(() => [context.value.ownerType, context.value.ownerId, context.value.editable, loading.value, draft.value.scope, JSON.stringify(draft.value.inputMappings), picker.value], refreshSources, { immediate:true })
  watch(() => context.value.editable, editable => { if (!editable) cancelChoice() })
  onScopeDispose(() => { generation++; sourceVersion++; cancelChoice() })
  return { draft, dirty, templates, categories, selectedTemplate, templateSelection, parameters, missingInputs, loading, saving, choosing,
    error, errorKind, sourceLabels, sourceDescriptions, sourcesLoading, refreshSources, cancelChoice, savedSnapshot, snapshotLoading, presentation, extensionFailed, load, choose, ready, save, readSaved, useSaved, setScope }
}
