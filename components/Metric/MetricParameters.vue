<template>
  <div class="metric-parameters">
    <MetricParameterBlock v-for="parameter in editable" :key="parameter.id" :parameter="parameter" :value-label="t('parameterCurrentValue')" :disabled="disabled" :expanded="expandedId === parameter.id" @toggle="expandedId = expandedId === parameter.id ? null : parameter.id"
      :value="values[parameter.id] ?? defaults[parameter.id] ?? parameter.expands?.defaultValue" @change="change(parameter.id, $event)">
      <template #state><span>{{ t(overridden(parameter.id) ? 'parameterOverridden' : 'parameterFollowing') }}</span></template>
      <div v-if="overridden(parameter.id)" class="metric-parameters__reset"><a-button type="text" size="small" :disabled="disabled" @click="reset(parameter.id)"><AIcon type="UndoOutlined" />{{ t('parameterRestoreDefault') }}</a-button></div>
    </MetricParameterBlock>
    <a-empty v-if="!editable.length" :description="t('noParameters')" :image-style="{ height:'44px' }" />
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, watch } from 'vue'
import MetricParameterBlock from './MetricParameterBlock.vue'
import { metricMessages } from './messages'
import type { MetricParameter } from './types'
const props = defineProps<{ definitions: MetricParameter[]; values: Record<string, unknown>; defaults: Record<string, unknown>; disabled?:boolean }>()
const emit = defineEmits<{ (event: 'change', id: string, value: unknown): void; (event:'reset', id:string):void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const editable = computed(() => props.definitions.filter(item => item.expands?.editable === true))
const expandedId = ref<string | null>()
watch(() => editable.value.map(item => item.id), ids => { if (expandedId.value === undefined || expandedId.value !== null && !ids.includes(expandedId.value)) expandedId.value = ids[0] }, { immediate:true })
const overridden = (id:string) => Object.hasOwn(props.values, id) && props.values[id] != null
function change(id:string, value:unknown) { if (!props.disabled) emit('change', id, value) }
function reset(id:string) { if (!props.disabled) emit('reset', id) }
</script>
<style scoped>
.metric-parameters { display:grid; gap:12px }
.metric-parameters__reset { margin-top:8px }
.metric-parameters__reset :deep(.ant-btn) { color:var(--ink-3); padding:0 }
</style>
