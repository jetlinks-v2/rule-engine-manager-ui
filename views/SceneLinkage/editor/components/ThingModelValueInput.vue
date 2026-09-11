<template>
  <a-select
    v-if="valueOptions"
    :value="modelValue"
    :options="valueOptions"
    :placeholder="$t('IotSceneLinkage.placeholder.termValue')"
    @change="$emit('update:modelValue', $event)"
  />
  <a-date-picker
    v-else-if="isDate"
    :value="modelValue as string"
    show-time
    format="YYYY-MM-DD HH:mm:ss"
    value-format="YYYY-MM-DD HH:mm:ss"
    :placeholder="$t('IotSceneLinkage.placeholder.termValue')"
    @change="$emit('update:modelValue', $event || undefined)"
  />
  <a-input-number
    v-else-if="isNumber"
    :value="modelValue as number"
    :placeholder="$t('IotSceneLinkage.placeholder.termValue')"
    @change="$emit('update:modelValue', $event ?? undefined)"
  />
  <a-input
    v-else
    :value="modelValue as string"
    :placeholder="$t('IotSceneLinkage.placeholder.termValue')"
    @update:value="$emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { getValueOptions, isDateValueType, isNumberValueType, type ThingModelValueType } from '../thingModel'

const props = defineProps({
  modelValue: { type: [String, Number, Boolean] as PropType<string | number | boolean | undefined>, default: undefined },
  valueType: { type: Object as PropType<ThingModelValueType | undefined>, default: undefined },
})

defineEmits<{
  (event: 'update:modelValue', value: unknown): void
}>()

const { t } = useI18n()
const isDate = computed(() => isDateValueType(props.valueType))
const isNumber = computed(() => isNumberValueType(props.valueType))
const valueOptions = computed(() => getValueOptions(props.valueType, {
  true: t('IotSceneLinkage.value.true'),
  false: t('IotSceneLinkage.value.false'),
}))
</script>
