import { computed, nextTick, ref, watch } from 'vue'
import { i18nText } from '@jetlinks-web-core/components/I18n/text'
import { metricValueLabels, schemaValueLabels, semanticValueText, type ValueTranslate } from '../valueSemantics'
import type { MetricStateLabel, MetricTemplate, MetricTemplateInput } from '../types'
import type Editable from '@jetlinks-web-core/components/Editable/index.vue'
import { parameterConstraints } from '../parameterPresentation'

/** 共享图内／时间轴的状态候选与异常样本入口；始终发出原始标量类型。 */
export function useSampleValue(props:{ input:MetricTemplateInput; value:unknown; template?:MetricTemplate; disabled?:boolean },
  locale:() => string, t:ValueTranslate, change:(value:unknown) => void) {
  const open = ref(false), raw = ref(false)
  const editable = ref<InstanceType<typeof Editable>>()
  const root = ref<HTMLElement>()
  const labels = computed(() => {
    const own = schemaValueLabels(props.input.valueType)
    return own.length ? own : metricValueLabels(props.template,props.input.id)
  })
  const unknown = computed(() => props.value != null && labels.value.length > 0 && !labels.value.some(item => item.value === props.value))
  const text = computed(() => semanticValueText(props.value, { labels:labels.value, schema:props.input.valueType, locale:locale() }, t))
  const name = (item:MetricStateLabel) => i18nText(item.name,item.nameI18n,locale())
  const type = computed(() => props.input.valueType?.type === 'string' || props.input.valueType?.type === 'enum' && labels.value.every(item => typeof item.value === 'string') ? 'string' : 'number')
  const hint = computed(() => parameterConstraints({ ...props.input, valueType:{ ...props.input.valueType, type:String(props.input.valueType?.type || 'string') } },t))
  function commit(value:unknown) {
    if (props.disabled) return
    change(value ?? null)
    raw.value = false
  }
  async function edit() {
    if (props.disabled) return
    if (labels.value.length && !raw.value || props.input.valueType?.type === 'date') { open.value = true; await nextTick(); root.value?.querySelector<HTMLElement>('button')?.focus({ preventScroll:true }) }
    else if (editable.value) await editable.value.edit()
    else { await nextTick(); root.value?.querySelector<HTMLElement>('input, textarea, [role="combobox"], button, [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll:true }) }
  }
  async function editRaw() {
    if (props.disabled) return
    raw.value = true; open.value = false
    await nextTick(); await edit()
  }
  function select(item:MetricStateLabel) {
    if (props.disabled) return
    change(item.value); open.value = false; raw.value = false
  }
  watch(() => props.input.id, () => { open.value = false; raw.value = false })
  watch(() => props.disabled, disabled => { if (disabled) open.value = false })
  return { root, editable, labels, text, unknown, type, hint, name, open, raw, select, commit, edit, editRaw }
}
