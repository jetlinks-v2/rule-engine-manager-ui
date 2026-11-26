import { computed, ref, watch, type Ref } from 'vue'
import { copy } from '../service'
import { nextNodeId, nodeKey, nodeList, type TemplateNode, type TemplateRule } from './designer'
import { templateMessages } from './text'
import { inputIdentityIssue, referenceInputId, renameTemplateInput } from './inputIdentity'
import type { MetricSourceSelection, MetricTemplate } from '../types'

/** 属性面板直接更新页面草稿；检查点只负责撤回当前项，不承担持久化。 */
export function useTemplateDesigner(template: Ref<MetricTemplate>, disabled: Ref<boolean>, commit: (value: MetricTemplate) => void, onInputRename?:(previous:string,next:string)=>void, initialInput=false) {
  const view = ref(template.value)
  const selection = ref<TemplateNode>()
  const invalid = ref(false)
  const editorVersion = ref(0)
  const nodes = computed(() => nodeList(view.value))
  const position = computed(() => nodes.value.findIndex(node => selection.value && nodeKey(node) === nodeKey(selection.value)))
  const items = (value: MetricTemplate, node: TemplateNode) => node.kind === 'input' ? value.inputDefinitions : node.kind === 'rule' ? value.definitions : value.outputs
  let checkpoint: MetricTemplate | undefined
  let created = false
  let generatedInputId:string | undefined
  const messageKeys = new Set<string>()
  function renameMessageKeys(previous:string,next:string) {
    const prefix = `input.${previous}.`
    for (const key of [...messageKeys]) if (key.startsWith(prefix)) {
      messageKeys.delete(key)
      messageKeys.add(`input.${next}.${key.slice(prefix.length)}`)
    }
  }
  function update(value: MetricTemplate) {
    if (disabled.value) return
    view.value = value
    commit(view.value)
  }
  function select(node?: TemplateNode) {
    if (invalid.value) return false
    if (node && selection.value && nodeKey(node) === nodeKey(selection.value)) return true
    selection.value = node
    checkpoint = node ? copy(view.value) : undefined
    created = false
    generatedInputId = undefined
    messageKeys.clear()
    return true
  }
  function move(offset: number) { const node = nodes.value[position.value + offset]; if (node) select(node) }
  /** 直接输出与计算节点共享单位；撤回时恢复原声明，不重建其他展示设置。 */
  function replaceRule(value:MetricTemplate, index:number, rule:TemplateRule, originalOutputs?:MetricTemplate['outputs']) {
    const previous = value.definitions[index] as TemplateRule
    value.definitions[index] = rule
    if (previous.calculator?.outputUnit === rule.calculator?.outputUnit) return
    for (const output of value.outputs.filter(item => item.metricId === rule.id)) {
      const unit = originalOutputs ? originalOutputs.find(item => item.metricId === output.metricId)?.unit : rule.calculator?.outputUnit
      if (unit) output.unit = unit
      else delete output.unit
    }
  }
  function patch(fields: Record<string, unknown>) {
    if (!selection.value || disabled.value) return false
    const node = selection.value
    const previous = node.kind === 'input' ? view.value.inputDefinitions[node.index].id : undefined
    const next = previous !== undefined && typeof fields.id === 'string' ? fields.id.trim() : previous
    if (next !== previous && inputIdentityIssue(view.value,node.index,next!)) return false
    const value = next !== previous ? renameTemplateInput(view.value,node.index,next!) : copy(view.value)
    if (node.kind === 'rule') replaceRule(value, node.index, { ...value.definitions[node.index], ...fields } as TemplateRule)
    else Object.assign(items(value, node)[node.index], fields)
    if (next !== previous) { value.inputDefinitions[node.index].id = next!; renameMessageKeys(previous!,next!); onInputRename?.(previous!,next!) }
    update(value)
    return true
  }
  function setMessages(messages: Record<string, Record<string, string>>) {
    if (!selection.value || disabled.value) return
    const current = templateMessages(view.value)
    for (const key of new Set([...Object.keys(current), ...Object.keys(messages)])) {
      if (JSON.stringify(current[key]) !== JSON.stringify(messages[key])) messageKeys.add(key)
    }
    update({ ...view.value, options: { ...view.value.options, i18nMessages: messages } })
  }
  /** 参考当前输入的声明，手填身份保持；覆盖已有类型或单位前由界面确认。 */
  function applyInputReference(declaration:NonNullable<MetricSourceSelection['declaration']>,confirmed=false):'applied' | 'confirm' | 'unavailable' {
    if (disabled.value || invalid.value || selection.value?.kind !== 'input' || !declaration.valueType) return 'unavailable'
    const index = selection.value.index, input = view.value.inputDefinitions[index]
    const changesType = input.valueType && JSON.stringify(input.valueType) !== JSON.stringify(declaration.valueType)
    const changesUnit = input.unit && input.unit !== declaration.unit
    const changesSemantics = input.semantics && JSON.stringify(input.semantics) !== JSON.stringify(declaration.semantics)
    if (!confirmed && (changesType || changesUnit || changesSemantics)) return 'confirm'
    const id = created && input.id === generatedInputId && declaration.id ? referenceInputId(view.value,index,declaration.id) : input.id
    return patch({id,name:input.name || declaration.name,valueType:copy(declaration.valueType),unit:declaration.unit,semantics:declaration.semantics ? copy(declaration.semantics) : undefined}) ? 'applied' : 'unavailable'
  }
  /** 错误文本留在当前编辑器；显式撤回才重建编辑器，其他节点和模板设置不回滚。 */
  function revert() {
    if (!selection.value || !checkpoint || disabled.value) return
    const node = selection.value
    let value = copy(view.value)
    if (created) { clearHint(value,node); items(value, node).splice(node.index, 1) }
    else if (node.kind === 'input') {
      const previous = value.inputDefinitions[node.index].id, next = checkpoint.inputDefinitions[node.index].id
      if (previous !== next) { value = renameTemplateInput(value,node.index,next); renameMessageKeys(previous,next); onInputRename?.(previous,next) }
      value.inputDefinitions[node.index] = copy(checkpoint.inputDefinitions[node.index])
      if (checkpoint.options?.inputHints?.[next]) value.options = { ...value.options,inputHints:{ ...value.options?.inputHints,[next]:copy(checkpoint.options.inputHints[next]) } }
      else clearHint(value,node)
    }
    else if (node.kind === 'rule') replaceRule(value, node.index, copy(checkpoint.definitions[node.index]) as TemplateRule, checkpoint.outputs)
    else value.outputs[node.index] = copy(checkpoint.outputs[node.index])
    if (messageKeys.size) {
      const messages = { ...templateMessages(value) }
      for (const key of messageKeys) {
        const original = templateMessages(checkpoint)[key]
        if (original) messages[key] = copy(original)
        else delete messages[key]
      }
      value.options = { ...value.options, i18nMessages: messages }
    }
    invalid.value = false
    editorVersion.value++
    update(value)
    if (created) selection.value = undefined
    checkpoint = selection.value ? copy(view.value) : undefined
    created = false
    messageKeys.clear()
  }
  /** 从图中节点接续时只预置依赖／来源，原节点和已有分支保持不变。 */
  function add(kind: TemplateNode['kind'], source?: TemplateNode) {
    if (disabled.value || invalid.value) return false
    // 公开输出只能引用计算结果；输入先通过计算节点参与处理。
    if (kind === 'output' && (source?.kind === 'input' || !view.value.definitions.length)) return false
    const value = copy(view.value)
    const sourceId = source?.kind === 'input' ? value.inputDefinitions[source.index]?.id
      : source?.kind === 'rule' ? value.definitions[source.index]?.id : undefined
    let index: number
    if (kind === 'input') {
      index = value.inputDefinitions.push({ id: nextNodeId(value, 'input'), presence: 'required' }) - 1
    } else if (kind === 'rule') {
      index = value.definitions.push({ id: nextNodeId(value, 'result'), type: 'composite', dependsOn: sourceId ? [String(sourceId)] : [], expression: '' }) - 1
    } else {
      const id = sourceId || value.definitions.at(-1)?.id || ''
      index = value.outputs.push({ metricId: String(id), persist: true, publish: false }) - 1
    }
    update(value)
    select({ kind, index })
    created = true
    generatedInputId = kind === 'input' ? value.inputDefinitions[index].id : undefined
    return true
  }
  function remove() {
    if (!selection.value || disabled.value || invalid.value) return
    const previousPosition = position.value
    const value = copy(view.value)
    clearHint(value,selection.value)
    items(value, selection.value).splice(selection.value.index, 1)
    // 删除不静默级联改写引用；服务端编译会报告仍被引用的标识。
    update(value)
    selection.value = undefined
    select(nodes.value[Math.min(previousPosition, nodes.value.length - 1)])
  }
  function clearHint(value:MetricTemplate,node:TemplateNode) { if (node.kind === 'input' && value.options?.inputHints) delete value.options.inputHints[value.inputDefinitions[node.index].id] }
  watch(template, value => {
    if (value === view.value) return
    const replaced = value.id !== view.value.id || value.version !== view.value.version
    view.value = value
    if (replaced || selection.value && !items(value, selection.value)[selection.value.index]) {
      invalid.value = false
      selection.value = undefined
      checkpoint = undefined
      editorVersion.value++
    }
  }, { flush: 'sync' })
  watch(disabled, value => {
    if (value && invalid.value) { invalid.value = false; editorVersion.value++ }
    checkpoint = selection.value ? copy(view.value) : undefined
    created = false
    messageKeys.clear()
  }, { flush: 'sync' })
  // 新建边界已生成输入；按刚添加的节点编辑，参考与撤回仍沿用同一套规则。
  if (initialInput && !disabled.value && view.value.inputDefinitions.length) {
    select({kind:'input',index:0})
    created = true
    generatedInputId = view.value.inputDefinitions[0].id
  }
  return { selection, invalid, editorVersion, view, nodes, position, select, move, patch, add, remove, revert, setMessages, update, applyInputReference }
}
