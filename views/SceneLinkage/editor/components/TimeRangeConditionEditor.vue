<template>
  <div class="time-range-condition-editor">
    <DocumentHelp code="rule-engine/Scene" help-key="scene.effectivePeriod" />
    <template v-for="range in modelValue" :key="rangeKey(range)">
      <template v-if="editingRangeKey === rangeKey(range)">
        <a-time-range-picker style="width: 212px; max-width: 100%" v-model:value="customRange" :order="false" format="HH:mm" value-format="HH:mm" />
        <a-button type="primary" size="small" :disabled="!pendingRanges" @click="saveCustomRange">{{ $t('IotSceneLinkage.action.applyTimeRange') }}</a-button>
        <a-button type="text" size="small" @click="cancelCustomRange">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
      </template>
      <span v-else class="time-range-condition-editor__tag" :class="{ 'time-range-condition-editor__tag--editable': !isPreset(range) }" style="background: #fff; border: 1px solid #d9d9d9" @click="editCustomRange(range)"><a-tag closable @close="removeRange(range)">{{ rangeLabel(range) }}</a-tag></span>
    </template>
    <template v-if="editingRangeKey === '__new__'">
      <a-time-range-picker style="width: 212px; max-width: 100%" v-model:value="customRange" :order="false" format="HH:mm" value-format="HH:mm" />
      <a-button type="primary" size="small" :disabled="!pendingRanges" @click="saveCustomRange">{{ $t('IotSceneLinkage.action.addTimeRange') }}</a-button>
      <a-button type="text" size="small" @click="cancelCustomRange">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
    </template>
    <a-dropdown v-else :trigger="['click']" :disabled="isFull">
      <a-button type="dashed" size="small" :disabled="isFull"><AIcon type="PlusOutlined" />{{ $t('IotSceneLinkage.action.addTimeRange') }}</a-button>
      <template #overlay>
        <a-menu>
          <a-menu-item v-for="preset in availablePresets" :key="preset.key" @click="addRange(preset.range)">{{ preset.label }}</a-menu-item>
          <a-menu-divider />
          <a-menu-item @click="startCustomRange"><AIcon type="ClockCircleOutlined" />{{ $t('IotSceneLinkage.timeTemplate.custom') }}</a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>
  </div>
</template>

<script setup lang="ts">
import DocumentHelp from '@jetlinks-web-core/components/DocumentHelp'
import { computed, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatSceneTimeRange, type SceneTimeRange } from '../../utils'

const props = defineProps({
  modelValue: { type: Array as PropType<SceneTimeRange[]>, required: true },
})
const emit = defineEmits<{
  (event: 'update:modelValue', value: SceneTimeRange[]): void
  (event: 'draft-change', value: SceneTimeRange[] | undefined): void
}>()

const { t } = useI18n()
const maxRanges = 5
const customRange = ref<string[]>([])
const editingRangeKey = ref('')
const presets = computed(() => [
  { key: 'workday', label: t('IotSceneLinkage.timeTemplate.workday'), range: { start: '09:00', end: '18:00' } },
  { key: 'evening', label: t('IotSceneLinkage.timeTemplate.evening'), range: { start: '20:00', end: '08:00' } },
])
const isFull = computed(() => props.modelValue.length >= maxRanges)
const isCustomRangeReady = computed(() => customRange.value.length === 2 && customRange.value.every(Boolean))
const isCustomDuplicate = computed(() => isCustomRangeReady.value && props.modelValue.some(range => rangeKey(range) === `${customRange.value[0]}-${customRange.value[1]}` && rangeKey(range) !== editingRangeKey.value))
const availablePresets = computed(() => presets.value.filter(item => !hasRange(item.range)))

/** 弹窗确认和行内添加读取同一份完整草稿，避免输入已有值却未加入时段列表。 */
const pendingRanges = computed<SceneTimeRange[] | undefined>(() => {
  if (!editingRangeKey.value) return props.modelValue
  if (!isCustomRangeReady.value || customRange.value[0] === customRange.value[1] || isCustomDuplicate.value) return undefined
  const range = { start: customRange.value[0], end: customRange.value[1] }
  if (editingRangeKey.value === '__new__') return isFull.value ? undefined : [...props.modelValue, range]
  return props.modelValue.map(item => rangeKey(item) === editingRangeKey.value ? range : item)
})
function getError() {
  if (!editingRangeKey.value || pendingRanges.value) return undefined
  return isCustomDuplicate.value ? 'IotSceneLinkage.message.timeRangeDuplicate'
    : isCustomRangeReady.value && customRange.value[0] === customRange.value[1] ? 'IotSceneLinkage.message.timeRangeInvalid'
    : 'IotSceneLinkage.message.timeRangeRequired'
}
defineExpose({ getRanges: () => pendingRanges.value, getError })
watch(pendingRanges, value => emit('draft-change', value), { immediate: true })

function rangeKey(range: SceneTimeRange) { return `${range.start}-${range.end}` }
function rangeLabel(range: SceneTimeRange) { return formatSceneTimeRange(t, range) }
function isPreset(range: SceneTimeRange) { return presets.value.some(item => rangeKey(item.range) === rangeKey(range)) }
function hasRange(range: SceneTimeRange) { return props.modelValue.some(item => rangeKey(item) === rangeKey(range)) }
function addRange(range: SceneTimeRange) { if (isFull.value || hasRange(range)) return; emit('update:modelValue', [...props.modelValue, range]) }
function startCustomRange() { editingRangeKey.value = '__new__'; customRange.value = [] }
function editCustomRange(range: SceneTimeRange) { if (isPreset(range)) return; editingRangeKey.value = rangeKey(range); customRange.value = [range.start, range.end] }
function saveCustomRange() { if (!pendingRanges.value) return; emit('update:modelValue', pendingRanges.value); cancelCustomRange() }
function cancelCustomRange() { customRange.value = []; editingRangeKey.value = '' }
function removeRange(range: SceneTimeRange) { if (editingRangeKey.value === rangeKey(range)) cancelCustomRange(); emit('update:modelValue', props.modelValue.filter(item => rangeKey(item) !== rangeKey(range))) }
</script>

<style scoped>
.time-range-condition-editor { display: flex; flex: 1; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 260px; }.time-range-condition-editor__tag { display: inline-flex; align-items: center; min-height: 32px; padding: 0 8px 0 10px; border-radius: 6px; }.time-range-condition-editor__tag :deep(.ant-tag) { padding: 0; margin: 0; font-size: 15px; font-weight: 500; line-height: 30px; color: inherit; border: 0; background: transparent; }.time-range-condition-editor__tag :deep(.anticon-close) { margin-left: 6px; font-size: 13px; }.time-range-condition-editor__tag--editable { cursor: pointer; }.time-range-condition-editor__tag--editable:hover { border-color: var(--ant-color-primary) !important; color: var(--ant-color-primary); }
</style>
