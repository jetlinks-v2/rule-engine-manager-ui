<template>
  <a-tooltip :title="selectedLabel" :open="dropdownOpen ? false : undefined" :overlay-style="{ pointerEvents: 'none' }">
  <a-select
    style="width: 100%; min-width: 0"
    :value="modelValue"
    :options="options"
    :placeholder="placeholder || t('IotSceneLinkage.placeholder.thingModel')"
    :allow-clear="allowClear"
    :mode="multiple ? 'multiple' : undefined"
    :max-tag-count="multiple ? 'responsive' : undefined"
    :disabled="disabled"
    show-search
    :filter-option="filterOption"
    :dropdown-match-select-width="true"
    :dropdown-style="{ minWidth: '320px', maxWidth: 'calc(100vw - 48px)' }"
    popup-class-name="scene-editor__thing-model-dropdown"
    @change="change"
    @dropdownVisibleChange="changeDropdown"
  >
    <template #option="option">
      <ThingModelOptionView v-if="optionValue(option).value" :option="optionValue(option)" />
      <span v-else>{{ optionValue(option).label }}</span>
    </template>
  </a-select>
  </a-tooltip>
</template>

<script setup lang="ts">
import { computed, ref, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ThingModelOption } from '../thingModel'
import ThingModelOptionView from './ThingModelOption.vue'

type ThingModelOptionGroup = {
  label: string
  options: ThingModelOption[]
}

const props = defineProps({
  modelValue: { type: [String, Array] as PropType<string | string[]>, default: undefined },
  options: { type: Array as PropType<Array<ThingModelOption | ThingModelOptionGroup>>, default: () => [] },
  placeholder: { type: String, default: '' },
  allowClear: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const dropdownOpen = ref(false)
function changeDropdown(open: boolean) { dropdownOpen.value = open; emit('dropdownVisibleChange', open) }
const selectedLabel = computed(() => {
  const values = Array.isArray(props.modelValue) ? props.modelValue : [props.modelValue]
  return props.options.flatMap(item => 'options' in item ? item.options : [item]).filter(item => values.includes(item.value)).map(item => item.label).join('、') || undefined
})

const emit = defineEmits(['update:modelValue', 'change', 'dropdownVisibleChange'])

const { t } = useI18n()

const change = (value: string | string[]) => {
  emit('update:modelValue', value)
  emit('change', value)
}

const optionValue = (option: any): ThingModelOption =>
  option?.data?.value ? option.data : option

const filterOption = (input: string, option: any) => {
  const keyword = input.trim().toLocaleLowerCase()
  if (!keyword) return true
  const item = optionValue(option)
  return [item.label, item.value]
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase().includes(keyword))
}
</script>
