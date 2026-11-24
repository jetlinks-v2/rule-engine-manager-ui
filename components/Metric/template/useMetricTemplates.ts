import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { metricApi } from '../api'
import { copy, errorText } from '../service'
import { configurationObject, configurationSnapshot, encodeConfiguration, type ConfigurationFormat } from './configurationText'
import type { ValueTranslate } from '../valueSemantics'
import { captureTemplateExample, exampleFacts, templateAuthoring } from './templateAuthoring'
import type { MetricApi, MetricCalculatorDescriptor, MetricAggregationDescriptor, MetricConfig, MetricSimulationRequest, MetricSimulationResponse, MetricTemplate, MetricTemplateCategory, MetricTemplateEntity, MetricTemplateStarter } from '../types'

const emptyTemplate = (withInput:boolean): MetricTemplate => ({
  id: '', version: '1', name: '', enabled: true, inputDefinitions: withInput ? [{id:'input1',presence:'required'}] : [], parameterDefinitions: [],
  parameters: {}, definitions: [], outputs: [], options: {}
})
export function useMetricTemplates(editable: Ref<boolean>, api: MetricApi = metricApi, t: ValueTranslate = key => key) {
  const entities = ref<MetricTemplateEntity[]>([])
  const categories = ref<MetricTemplateCategory[]>([])
  const discoveredStarters = ref<MetricTemplateStarter[]>([])
  const startersLoading = ref(false)
  const starterError = ref('')
  const categoriesLoading = ref(false)
  const categoryError = ref('')
  const calculators = ref<MetricCalculatorDescriptor[]>([])
  const calculatorError = ref('')
  const aggregations = ref<MetricAggregationDescriptor[]>([])
  const aggregationError = ref('')
  const selected = ref<MetricTemplateEntity>()
  const draft = ref<MetricTemplate>()
  const mode = ref<'form' | 'full'>('form')
  const format = ref<ConfigurationFormat>('yaml')
  const fullText = ref('')
  const simulationText = ref('')
  const keepExample = ref(false)
  const simulationResponse = ref<MetricSimulationResponse>()
  const simulationResults = computed(() => simulationResponse.value?.results || [])
  const error = ref('')
  const simulationError = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const simulating = ref(false)
  const savedText = ref<string>()
  const readOnly = computed(() => !editable.value)
  const hasChanges = computed(() => {
    if (!draft.value || readOnly.value) return false
    try { return configurationSnapshot(prepared()) !== savedText.value }
    catch { return true }
  })
  let generation = 0
  let starterGeneration = 0
  let categoryGeneration = 0
  let calculatorGeneration = 0
  let aggregationGeneration = 0
  let simulationGeneration = 0
  let simulationRequest = 0
  // 规则或样本变化即作废旧结果，也截断已发出的试算响应。
  function invalidateSimulation() {
    simulationGeneration++
    simulationResponse.value = undefined
    simulationError.value = ''
  }
  watch([draft, fullText, simulationText, editable], invalidateSimulation, { deep: true, flush: 'sync' })
  async function load() {
    const token = ++generation
    loading.value = true
    error.value = ''
    try {
      // 分类目录需要完整集合，不能把一页数据当成全部场景。
      const result = await api.queryTemplates({ paging: false, sorts: [{ name: 'modifyTime', order: 'desc' }] })
      if (token === generation) entities.value = result.data
    } catch (cause) { if (token === generation) error.value = errorText(cause) }
    finally { if (token === generation) loading.value = false }
  }
  /** 目录只读且独立于用户草稿；失败清空发现结果，不能回落为过时内置代码。 */
  async function loadStarters() {
    const token = ++starterGeneration
    startersLoading.value = true
    starterError.value = ''
    try {
      const values = await api.templateStarters?.() || []
      if (token === starterGeneration) discoveredStarters.value = values
    } catch (cause) {
      if (token === starterGeneration) { discoveredStarters.value = []; starterError.value = errorText(cause) }
    } finally { if (token === starterGeneration) startersLoading.value = false }
  }
  /** 字典维护和语言切换后重新读取；失败不覆盖分类，更不重置编辑中的模板。 */
  async function loadCategories() {
    const token = ++categoryGeneration
    categoriesLoading.value = true
    categoryError.value = ''
    try {
      const values = await api.templateCategories()
      if (token === categoryGeneration) categories.value = values
    } catch (cause) { if (token === categoryGeneration) categoryError.value = errorText(cause) }
    finally { if (token === categoryGeneration) categoriesLoading.value = false }
  }
  /** 元数据失败不阻断模板读取；未知算法保持原声明，在高级模式中继续编辑。 */
  async function loadCalculators() {
    const token = ++calculatorGeneration
    calculatorError.value = ''
    try {
      const values = await api.calculators()
      if (token === calculatorGeneration) calculators.value = values
    } catch (cause) { if (token === calculatorGeneration) calculatorError.value = errorText(cause) }
  }
  async function loadAggregations() {
    const token = ++aggregationGeneration
    aggregationError.value = ''
    try {
      const values = await api.aggregations()
      if (token === aggregationGeneration) aggregations.value = values
    } catch (cause) { if (token === aggregationGeneration) aggregationError.value = errorText(cause) }
  }
  function open(entity?: MetricTemplateEntity, starter?: MetricTemplateStarter) {
    if (saving.value) return
    simulationGeneration++
    simulating.value = false
    selected.value = entity ? copy(entity) : undefined
    // 默认输入只属于空白新建，不推断已存模板、业务起点或只读内容。
    draft.value = entity ? copy(entity.draft || entity.template) : starter ? { ...copy(starter.template), id: `${starter.template.id}-${crypto.randomUUID().slice(0, 8)}` } : emptyTemplate(editable.value)
    if (!entity && starter) draft.value.options = { ...draft.value.options, ...(starter.groupId ? { category:starter.groupId } : {}), ...(starter.icon ? { icon:starter.icon } : {}) }
    if (!entity && starter && !templateAuthoring(draft.value).reference) {
      draft.value.options = { ...draft.value.options,authoring:{ ...templateAuthoring(draft.value),reference:{ id:starter.template.id,version:starter.template.version,
        name:starter.template.name,nameI18n:(starter.template.options?.i18nMessages as Record<string,Record<string,string>> | undefined)?.name,builtin:true,
        ...(starter.providerId ? {providerId:starter.providerId,providerName:starter.providerName} : {}) } } }
    }
    mode.value = 'form'
    error.value = ''
    simulationResponse.value = undefined
    simulationError.value = ''
    const template = draft.value
    const example = templateAuthoring(template).example
    const facts = starter?.simulation ? copy(starter.simulation) : exampleFacts(template,example)
    facts.configuration.templateId = template.id
    facts.configuration.templateVersion = template.version
    simulationText.value = encodeConfiguration(facts, format.value)
    keepExample.value = !!example || !!starter?.simulation && !!captureTemplateExample(template,facts)
    fullText.value = encodeConfiguration(prepared(), format.value)
    savedText.value = configurationSnapshot(prepared())
  }
  function prepared(): MetricTemplate {
    if (!draft.value) throw new Error(t('templateRequired'))
    if (mode.value === 'full') {
      const value = configurationObject(fullText.value, format.value, t('invalidObject'))
      // 仅检查可视编辑需要的容器结构；计算语义仍由服务端编译。
      const sections = { inputDefinitions:'inputs', parameterDefinitions:'parameters', definitions:'rules', outputs:'outputs' }
      for (const [key, section] of Object.entries(sections)) {
        const items = value[key]
        if (items !== undefined && (!Array.isArray(items) || items.some(item => !item || typeof item !== 'object' || Array.isArray(item)))) {
          throw new Error(t('templateConfigurationArray', { section:t(section), field:key }))
        }
      }
      if (value.parameters !== undefined && (!value.parameters || typeof value.parameters !== 'object' || Array.isArray(value.parameters))) throw new Error(t('templateConfigurationParameters'))
      const defaults: Record<string, unknown> = { id: '', version: '', name: '', inputDefinitions: [], parameterDefinitions: [], parameters: {}, definitions: [], outputs: [] }
      for (const key of Object.keys(defaults)) if (value[key] === undefined) value[key] = defaults[key]
      const result = value as unknown as MetricTemplate
      if (selected.value?.released && (result.id !== selected.value.template.id || result.version !== selected.value.template.version)) {
        throw new Error(t('publishedTemplateIdentityLocked'))
      }
      return withAuthoring(result)
    }
    return withAuthoring(copy(draft.value))
  }
  /** 开关与样本共享保存/脏状态；无效高级样本不能静默丢失。 */
  function withAuthoring(template:MetricTemplate):MetricTemplate {
    const authoring = { ...templateAuthoring(template) }
    if (keepExample.value) {
      const example = captureTemplateExample(template,configurationObject(simulationText.value,format.value))
      if (!example) throw new Error(t('completeSample'))
      authoring.example = example
    } else delete authoring.example
    if (Object.keys(authoring).length || template.options?.authoring) template.options = { ...template.options,authoring }
    return template
  }
  /** 关闭编辑会话同时作废迟到的试算反馈，首页列表及滚动容器保持不变。 */
  function close() {
    if (saving.value) return
    invalidateSimulation()
    simulating.value = false
    selected.value = undefined
    draft.value = undefined
    fullText.value = ''
    error.value = ''
  }
  function switchMode(next: 'form' | 'full') {
    if (next === mode.value) return
    try {
      draft.value = prepared()
      fullText.value = encodeConfiguration(draft.value, format.value)
      mode.value = next
      error.value = ''
    } catch (cause) { error.value = errorText(cause) }
  }
  function switchFormat(next: ConfigurationFormat) {
    if (next === format.value) return
    try {
      const template = prepared()
      const facts = configurationObject(simulationText.value, format.value)
      fullText.value = encodeConfiguration(template, next)
      simulationText.value = encodeConfiguration(facts, next)
      draft.value = template
      format.value = next
      error.value = ''
    } catch (cause) { error.value = errorText(cause) }
  }
  async function save(): Promise<MetricTemplateEntity | undefined> {
    if (readOnly.value || saving.value) return
    saving.value = true
    error.value = ''
    try {
      const entity = await api.saveTemplate(prepared(), selected.value?.editRevision)
      selected.value = entity
      draft.value = copy(entity.draft || entity.template)
      fullText.value = encodeConfiguration(draft.value, format.value)
      savedText.value = configurationSnapshot(draft.value)
      await load()
      return entity
    } catch (cause) { error.value = errorText(cause) }
    finally { saving.value = false }
  }
  async function release() {
    if (readOnly.value || saving.value) return
    const entity = await save()
    if (!entity || readOnly.value) return
    saving.value = true
    try {
      const published = await api.releaseTemplate(entity.id, entity.editRevision)
      selected.value = published || { ...entity, released: true, draft: null }
      draft.value = copy(selected.value.template)
      fullText.value = encodeConfiguration(draft.value, format.value)
      savedText.value = configurationSnapshot(draft.value)
      await load()
    } catch (cause) { error.value = errorText(cause) }
    finally { saving.value = false }
  }
  function newVersion() {
    if (!selected.value || !editable.value || saving.value) return
    try {
      const template = prepared()
      template.version = ''
      open({ ...selected.value, template, draft: null, released: false })
      selected.value = undefined
    } catch (cause) { error.value = errorText(cause) }
  }
  async function setAvailable(available: boolean) {
    if (!selected.value || !editable.value || saving.value) return
    saving.value = true
    try { await api.setAvailable(selected.value.id, available); selected.value.available = available; await load() }
    catch (cause) { error.value = errorText(cause) }
    finally { saving.value = false }
  }
  async function removeDraft(): Promise<boolean> {
    if (readOnly.value || saving.value || !selected.value?.id || selected.value.released) return false
    saving.value = true
    error.value = ''
    try {
      await api.removeTemplate(selected.value.id)
      selected.value = undefined
      draft.value = undefined
      simulationGeneration++
      simulationResponse.value = undefined
      await load()
      return true
    } catch (cause) { error.value = errorText(cause); return false }
    finally { saving.value = false }
  }
  async function discardDraft() {
    if (readOnly.value || saving.value || !selected.value?.draft) return
    saving.value = true
    error.value = ''
    try {
      const entity = await api.discardTemplateDraft(selected.value.id, selected.value.editRevision || 0)
      selected.value = entity
      draft.value = copy(entity.template)
      const example = templateAuthoring(draft.value).example
      keepExample.value = !!example
      simulationText.value = encodeConfiguration(exampleFacts(draft.value,example),format.value)
      fullText.value = encodeConfiguration(draft.value, format.value)
      savedText.value = configurationSnapshot(draft.value)
      await load()
    } catch (cause) { error.value = errorText(cause) }
    finally { saving.value = false }
  }
  async function simulate() {
    if (!editable.value) return
    const token = ++simulationGeneration
    const request = ++simulationRequest
    simulating.value = true
    simulationError.value = ''
    simulationResponse.value = undefined
    try {
      const facts = configurationObject(simulationText.value, format.value)
      const template = prepared()
      // 编辑参考资料不随每轮试算传输，也不参与执行。
      if (template.options) delete template.options.authoring
      const response = await api.simulate({ ...facts, template, configuration: { ...(facts.configuration as MetricConfig), templateId: template.id, templateVersion: template.version }, includeIntermediate: true, includeRecords: true } as unknown as MetricSimulationRequest)
      if (token === simulationGeneration) {
        simulationResponse.value = response
        simulationError.value = response.error || ''
      }
    } catch (cause) { if (token === simulationGeneration) simulationError.value = errorText(cause) }
    finally { if (request === simulationRequest) simulating.value = false }
  }
  onScopeDispose(() => { generation++; categoryGeneration++; simulationGeneration++; calculatorGeneration++; aggregationGeneration++; starterGeneration++ })
  return { discoveredStarters, startersLoading, starterError, loadStarters, categories, categoriesLoading, categoryError, loadCategories, calculators, calculatorError, loadCalculators, aggregations, aggregationError, loadAggregations, entities, selected, draft, mode, format, fullText, simulationText, keepExample,
    simulationResults, simulationResponse, error, simulationError, loading, saving, simulating, readOnly, hasChanges,
    load, open, close, switchMode, switchFormat, save, release, newVersion, setAvailable, removeDraft, discardDraft, simulate, invalidateSimulation }
}
