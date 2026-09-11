import { computed, ref, watch, type Ref } from 'vue'
import { applyMultiTriggerForm, defaultMultiTriggerForm, toMultiTriggerForm, type SceneLinkageForm, type SceneTriggerKind } from '../utils'

export const useMultiSceneTrigger = (
  form: SceneLinkageForm,
  supportedTriggers: Ref<string[]>,
  isEditing: () => boolean,
  onActiveTriggerChange: () => void,
) => {
  const activeMultiTriggerIndex = ref(0)
  const addingMultiTrigger = ref(false)
  let applyingMultiTrigger = false
  // multi 保留一个叶子时仍须使用 multi 模型，避免编辑已保存场景时改变根触发器类型。
  const isMulti = computed(() => Boolean(form.multiTriggers?.length))
  // 已保存的单条件场景不能变更为组合条件，直接不展示入口；手动条件仍保留禁用提示。
  const showMultiTriggerControl = computed(() => supportedTriggers.value.includes('multi')
    && (form.triggerKind === 'manual' || !isEditing() || isMulti.value))
  const multiTriggerDisabledReason = computed(() => {
    if (!showMultiTriggerControl.value) return ''
    if (form.triggerKind === 'manual') {
      return 'IotSceneLinkage.message.conditionCannotAddMore'
    }
    return ''
  })
  const canAddMultiTrigger = computed(() => !multiTriggerDisabledReason.value)

  const syncActiveMultiTrigger = () => {
    if (!isMulti.value || activeMultiTriggerIndex.value < 0) return
    const activeTrigger = form.multiTriggers![activeMultiTriggerIndex.value]
    form.multiTriggers![activeMultiTriggerIndex.value] = toMultiTriggerForm(form, activeTrigger.clientId)
  }

  const selectMultiTrigger = (index: number) => {
    if (!isMulti.value || index === activeMultiTriggerIndex.value) return
    syncActiveMultiTrigger()
    activeMultiTriggerIndex.value = index
    applyingMultiTrigger = true
    applyMultiTriggerForm(form, form.multiTriggers![index])
    applyingMultiTrigger = false
    onActiveTriggerChange()
  }

  const addMultiTrigger = () => {
    if (!form.triggerKind || !canAddMultiTrigger.value || addingMultiTrigger.value) return
    syncActiveMultiTrigger()
    form.multiTriggers ||= [toMultiTriggerForm(form)]
    addingMultiTrigger.value = true
  }

  const removeMultiTrigger = (index: number) => {
    syncActiveMultiTrigger()
    const triggers = form.multiTriggers || []
    if (triggers.length <= 1) return
    const remaining = triggers.filter((_, triggerIndex) => triggerIndex !== index)
    if (remaining.length === 1) {
      applyMultiTriggerForm(form, remaining[0])
      // 新建场景在保存前可回到标准单触发器；已保存的 multi 场景必须保持根类型不变。
      form.multiTriggers = isEditing() ? remaining : undefined
      activeMultiTriggerIndex.value = 0
      onActiveTriggerChange()
      return
    }
    form.multiTriggers = remaining
    activeMultiTriggerIndex.value = Math.min(activeMultiTriggerIndex.value, remaining.length - 1)
    applyingMultiTrigger = true
    applyMultiTriggerForm(form, remaining[activeMultiTriggerIndex.value])
    applyingMultiTrigger = false
    onActiveTriggerChange()
  }

  const selectTrigger = (kind: SceneTriggerKind) => {
    if (!addingMultiTrigger.value) return true
    if (kind === 'manual') return false
    const next = defaultMultiTriggerForm()
    next.triggerKind = kind
    form.multiTriggers!.push(next)
    addingMultiTrigger.value = false
    return true
  }

  const cancelTriggerPicker = () => {
    if (addingMultiTrigger.value && !isEditing() && form.multiTriggers?.length === 1) {
      applyMultiTriggerForm(form, form.multiTriggers[0])
      form.multiTriggers = undefined
    }
    addingMultiTrigger.value = false
  }

  // 切换卡片时会逐字段回填表单；此时不能把未完成的中间态同步回原卡片。
  watch(() => toMultiTriggerForm(form), () => {
    if (!applyingMultiTrigger) syncActiveMultiTrigger()
  }, { deep: true, flush: 'sync' })

  return {
    activeMultiTriggerIndex,
    addingMultiTrigger,
    isMulti,
    showMultiTriggerControl,
    multiTriggerDisabledReason,
    canAddMultiTrigger,
    addMultiTrigger,
    cancelTriggerPicker,
    removeMultiTrigger,
    selectMultiTrigger,
    selectTrigger,
  }
}
