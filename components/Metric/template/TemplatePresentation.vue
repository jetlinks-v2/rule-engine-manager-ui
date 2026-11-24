<template>
  <div>
    <TemplateClause icon="AppstoreOutlined" :title="t('presentationProvider')">
      <a-select :value="resolved.id" :disabled="disabled" :options="options" :dropdown-match-select-width="false" @update:value="setProvider"><template #option="option"><SelectOption :label="option.label" :icon="option.icon" :description="option.description" /></template></a-select>
    </TemplateClause>
    <a-alert v-if="missing" type="warning" show-icon :message="t('presentationMissing')" />
    <MetricDisplayFields v-else :model-value="settings" :template="template" :provider="provider" :disabled="disabled" @update:model-value="setSettings" @failed="emit('failed')" />
  </div>
</template>
<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import MetricDisplayFields from '../extensions/MetricDisplayFields.vue'
import TemplateClause from './TemplateClause.vue'
import SelectOption from '@jetlinks-web-core/components/SelectOption/index.vue'
import { useMetricPresentation } from '../extensions/useMetricPresentation'
import { DEFAULT_METRIC_PRESENTATION } from '../extensions/registry'
import { normalizePresentation } from '../extensions/presentationSettings'
import { metricMessages } from '../messages'
import type { MetricLabel, MetricTemplate } from '../types'
const props = defineProps<{ template: MetricTemplate; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'update:template', value: MetricTemplate): void; (event: 'failed'): void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const { resources, resolved, provider, missing } = useMetricPresentation(toRef(props, 'template'))
const settings = computed(() => normalizePresentation(props.template.options?.presentation?.settings))
const resourceLabel = (label: MetricLabel) => typeof label === 'function' ? label() : label
const options = computed(() => [
  ...(missing.value ? [{ value:resolved.value.id, label:resolved.value.id, icon:'WarningOutlined', description:t('presentationMissing') }] : []),
  ...resources.value.presentations.map(item => ({ value:item.id, label:item.id === DEFAULT_METRIC_PRESENTATION ? t('defaultPresentation') : resourceLabel(item.provider.label), icon:'AppstoreOutlined', description:`${t('presentationOptionHint')} · ${item.id}` })),
])
function change(presentation: NonNullable<MetricTemplate['options']>['presentation']) {
  if (!props.disabled) emit('update:template', { ...props.template, options: { ...props.template.options, presentation } })
}
function setProvider(value: string) { change({ ...props.template.options?.presentation, provider: value }) }
function setSettings(value: Record<string, unknown>) { change({ ...props.template.options?.presentation, settings: value }) }
</script>
