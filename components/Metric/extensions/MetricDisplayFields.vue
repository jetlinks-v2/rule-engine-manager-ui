<template>
  <div v-if="template && template.outputs.length > 1" class="metric-display-clause">
    <AIcon type="AppstoreOutlined" /><span>{{ t('primaryOutput') }}</span>
    <a-select :value="primaryOutput" :options="outputOptions" :disabled="disabled" :aria-label="t('primaryOutput')" @update:value="setPrimaryOutput"><template #option="option"><SelectOption :label="option.label" :icon="option.icon" :description="option.description" /></template></a-select>
    <a-button v-if="Object.hasOwn(modelValue, 'primaryOutput') && defaults.primaryOutput" type="link" size="small" :disabled="disabled" @click="inheritOutput">{{ t('inheritDisplay') }}</a-button>
  </div>
  <div v-if="template && template.outputs.length > 1" class="metric-display-clause">
    <AIcon type="UnorderedListOutlined" /><span>{{ t('summaryOutputs') }}</span>
    <a-select mode="multiple" :value="summaryOutputs" :options="summaryOptions" :disabled="disabled" :placeholder="t('summaryOutputsHint')" :aria-label="t('summaryOutputs')" @update:value="setSummaryOutputs"><template #option="option"><SelectOption :label="option.label" :icon="option.icon" :description="option.description" /></template></a-select>
    <a-button v-if="Object.hasOwn(modelValue, 'summaryOutputs')" type="link" size="small" :disabled="disabled" @click="inheritSummary">{{ t('inheritDisplay') }}</a-button>
  </div>
  <MetricExtension v-if="provider?.presentationFields" :content="provider.presentationFields" :content-props="{ modelValue, defaults, disabled }" @update:model-value="change" @failed="emit('failed')">
    <template #fallback><a-alert type="warning" show-icon :message="t('presentationFailed')" /></template>
  </MetricExtension>
  <div v-else class="metric-display-clause">
      <AIcon type="NumberOutlined" /><span>{{ t('decimals') }}</span>
      <a-space>
        <a-input-number :value="decimals" :min="0" :max="8" :precision="0" :disabled="disabled" :placeholder="inherited" @update:value="setDecimals" />
        <a-button v-if="Object.hasOwn(modelValue, 'decimals')" type="link" size="small" :disabled="disabled" @click="inherit">{{ t('inheritDisplay') }}</a-button>
      </a-space>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MetricExtension from '@jetlinks-web-core/components/Metric/extensions/MetricExtension.vue'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import { metricMessages } from '@jetlinks-web-core/components/Metric/messages'
import { metricOutputName } from '@jetlinks-web-core/components/Metric/presentation'
import { outputId } from '@jetlinks-web-core/components/Metric/service'
import { summaryMetricOutputs } from '@jetlinks-web-core/components/Metric/extensions/presentationSettings'
import type { MetricPresentationProvider, MetricTemplate } from '@jetlinks-web-core/components/Metric/types'
const props = withDefaults(defineProps<{ modelValue: Readonly<Record<string, unknown>>; defaults?: Readonly<Record<string, unknown>>; disabled?: boolean; provider?: MetricPresentationProvider; template?: MetricTemplate }>(), { defaults: () => ({}) })
const emit = defineEmits<{ (event: 'update:modelValue', value: Record<string, unknown>): void; (event: 'failed'): void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const decimals = computed(() => typeof props.modelValue.decimals === 'number' ? props.modelValue.decimals : undefined)
const inherited = computed(() => typeof props.defaults.decimals === 'number' ? String(props.defaults.decimals) : t('automaticDisplay'))
const outputOptions = computed(() => props.template?.outputs.map(output => ({ value:outputId(output), label:metricOutputName(output, props.template) || t('unnamedOutput'), icon:'ExportOutlined', description:[outputId(output), output.unit].filter(Boolean).join(' · ') })) || [])
const primaryOutput = computed(() => {
  const id = props.modelValue.primaryOutput ?? props.defaults.primaryOutput
  return outputOptions.value.find(output => output.value === id)?.value || outputOptions.value[0]?.value
})
const summaryOutputs = computed(() => props.template ? summaryMetricOutputs(props.template, { presentation:{ ...props.defaults, ...props.modelValue } }).map(outputId) : [])
const summaryOptions = computed(() => outputOptions.value.filter(output => output.value !== primaryOutput.value).map(output => ({ ...output, disabled:summaryOutputs.value.length >= 2 && !summaryOutputs.value.includes(output.value) })))
function setSummaryOutputs(value: string[]) { change({ ...props.modelValue, summaryOutputs: value.slice(0, 2) }) }
function inheritSummary() { const next = { ...props.modelValue }; delete next.summaryOutputs; change(next) }
function setPrimaryOutput(value: string) { change({ ...props.modelValue, primaryOutput: value }) }
function inheritOutput() { const next = { ...props.modelValue }; delete next.primaryOutput; change(next) }
function change(value: Record<string, unknown>) { if (!props.disabled) emit('update:modelValue', value) }
function inherit() { const next = { ...props.modelValue }; delete next.decimals; change(next) }
function setDecimals(value: number | string | null) {
  if (value === null || value === '') { inherit(); return }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 8) change({ ...props.modelValue, decimals: value })
}
</script>
<style scoped>
.metric-display-clause { display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-2,8px); padding:var(--space-3,12px) 0 }
.metric-display-clause>.anticon { color:var(--ink-3) }
.metric-display-clause>.ant-select { min-width:160px }
.metric-display-clause>.ant-select-multiple { flex:1; min-width:180px; max-width:100% }
</style>
