<template>
  <section class="detailed-multi-trigger-config">
    <a-form-item :label="$t('IotSceneLinkage.form.triggerType')" name="trigger.multi.triggers" :rules="rules">
      <div v-if="triggers.length" class="detailed-multi-trigger-config__list">
        <MultiTriggerCard
          v-for="(item, index) in triggers"
          :key="item.clientId"
          :trigger="item"
          :removable="triggers.length > 1"
          @remove="removeTrigger(index)"
        />
      </div>
      <a-button block class="detailed-multi-trigger-config__add" @click="pickerVisible = true">
        <AIcon type="PlusOutlined" />
        {{ triggers.length ? $t('IotSceneLinkage.editor.addAnotherTrigger') : $t('IotSceneLinkage.action.addTrigger') }}
      </a-button>
    </a-form-item>

    <!-- 混合触发只替换触发源；分支条件和动作仍复用原版详细编辑器。 -->
    <Terms v-if="triggers.length" />

    <TriggerPickerModal
      :open="pickerVisible"
      :options="triggerOptions"
      @cancel="pickerVisible = false"
      @select="addTrigger"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type PropType } from 'vue'
import { cloneDeep } from 'lodash-es'
import { buildRequest, defaultForm, defaultMultiTriggerForm, toForm, type SceneMultiTriggerForm, type SceneTriggerKind } from '../../utils'
import MultiTriggerCard from '../components/MultiTriggerCard.vue'
import TriggerPickerModal, { type TriggerPickerOption } from '../components/TriggerPickerModal.vue'
import Terms from '../../../Scene/Save/components/Terms/Terms.vue'

const props = defineProps({
  modelValue: {
    type: Object as PropType<Record<string, any>>,
    required: true,
  },
  triggerOptions: {
    type: Array as PropType<TriggerPickerOption[]>,
    default: () => [],
  },
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

const pickerVisible = ref(false)
const triggers = ref<SceneMultiTriggerForm[]>([])
let syncingFromModel = false
let localTriggerSignature = ''

const rules = [{
  validator: () => triggers.value.length
    ? Promise.resolve()
    : Promise.reject(new Error('')),
}]

/** 将原生 multi 配置投影为已有的触发器卡片表单；卡片只负责编辑叶子，不接管详细分支。 */
function loadTriggers(value: Record<string, any>) {
  const signature = JSON.stringify(value)
  if (localTriggerSignature && localTriggerSignature === signature) {
    localTriggerSignature = ''
    return
  }
  syncingFromModel = true
  const form = toForm({ trigger: value, branches: [] })
  triggers.value = cloneDeep(form.multiTriggers || [])
  void nextTick(() => {
    syncingFromModel = false
  })
}

/** 复用快速卡片的触发器编码，仅取回原生 multi 根节点，避免改写原版 branches。 */
function emitTrigger() {
  if (syncingFromModel) return
  if (!triggers.value.length) {
    const trigger = { type: 'multi', multi: { triggers: [] } }
    localTriggerSignature = JSON.stringify(trigger)
    emit('update:modelValue', trigger)
    return
  }
  const form = defaultForm()
  form.triggerKind = triggers.value[0].triggerKind
  form.multiTriggers = cloneDeep(triggers.value)
  const trigger = buildRequest(form).trigger
  localTriggerSignature = JSON.stringify(trigger)
  emit('update:modelValue', trigger)
}

function addTrigger(value: string) {
  const next = defaultMultiTriggerForm()
  next.triggerKind = value as SceneTriggerKind
  triggers.value = [...triggers.value, next]
  pickerVisible.value = false
}

function removeTrigger(index: number) {
  triggers.value = triggers.value.filter((_, triggerIndex) => triggerIndex !== index)
}

/** 多触发器叶子由卡片编辑，不能依赖顶层 FormItem 的“非空”校验。 */
function validate() {
  for (const trigger of triggers.value) {
    const isDevice = ['property', 'event', 'online', 'offline', 'state'].includes(trigger.triggerKind)
    if (isDevice && !trigger.productId) return 'IotSceneLinkage.message.selectProductFirst'
    if (isDevice && !trigger.allDevices && (trigger.dynamicScope ? !trigger.groupIds.length : !trigger.deviceIds.length)) {
      return 'IotSceneLinkage.message.deviceRequired'
    }
    if (trigger.triggerKind === 'property' && (!trigger.propertyId || trigger.termValue === undefined || trigger.termValue === '')) {
      return 'IotSceneLinkage.message.propertyRequired'
    }
    if (trigger.triggerKind === 'event' && !trigger.eventId) return 'IotSceneLinkage.message.eventRequired'
    if (trigger.triggerKind === 'date' && !trigger.dateTime) return 'IotSceneLinkage.message.dateRequired'
    if (trigger.triggerKind === 'repeat' && trigger.repeatMode === 'custom'
      && ((trigger.repeatCustomMode === 'weekly' && !trigger.repeatWeekdays.length)
        || (trigger.repeatCustomMode === 'monthly' && !trigger.repeatMonthDays.length))) {
      return 'IotSceneLinkage.message.repeatDateRequired'
    }
    if (trigger.triggerKind === 'alarm') {
      const alarm = trigger.alarm
      const visualAi = alarm.sourceKind === 'visual-ai' || alarm.targetType === 'aiTaskMediaTarget'
      const valid = Boolean(alarm.alarmConfigId && alarm.modes?.length
        && (visualAi
          ? alarm.options?.sceneId && alarm.options?.taskTarget
          : alarm.targetType && alarm.options?.productId))
      if (!valid) return 'IotSceneLinkage.message.alarmTriggerRequired'
    }
  }
  return undefined
}

watch(() => props.modelValue, loadTriggers, { immediate: true, deep: true })
watch(triggers, emitTrigger, { deep: true })

defineExpose({ validate })
</script>

<style scoped>
.detailed-multi-trigger-config__list {
  display: grid;
  gap: var(--space-3, 12px);
}

.detailed-multi-trigger-config__add {
  height: 2.5rem;
  margin-top: var(--space-3, 12px);
  color: var(--ant-color-primary);
  border-color: var(--ant-color-primary);
}
</style>
