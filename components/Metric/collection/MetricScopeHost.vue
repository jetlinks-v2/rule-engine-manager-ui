<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MetricScopePanel from './MetricScopePanel.vue'
import { useMetricSourceAdapter } from '../source-picker/useMetricSourceAdapter'
import { metricReferenceFromQuery } from '../location'
import { useMetricLinks } from '../useMetricLinks'
import { metricMessages } from '../messages'
import type { MetricAlarmReference, MetricContext, MetricReference, MetricSourcePicker, MetricTemplateReference, MetricWorkspaceSelection } from '../types'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ fill?: boolean; context: MetricContext; pickSource?: MetricSourcePicker; initialReference?: MetricReference; initialTemplate?: MetricTemplateReference; detailLinkLabel?: string }>()
const emit = defineEmits<{ applyStarted: []; openDetailLink: [reference: MetricAlarmReference]; openObject: [value: MetricWorkspaceSelection] }>()
const route = useRoute()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
const links = useMetricLinks()
const detailLabel = computed(() => props.detailLinkLabel ?? (links.workspaceEnabled.value ? t('openWorkspace') : undefined))
function openDetail(reference: MetricAlarmReference) {
  if (props.detailLinkLabel) emit('openDetailLink', reference)
  else links.openWorkspace(reference)
}
// The installed metric module owns picker state; dimension providers only describe their objects.
const picker = useMetricSourceAdapter(toRef(props, 'context'))
const reference = computed(() => props.initialReference ?? metricReferenceFromQuery(route.query, props.context))
</script>
<template>
  <MetricScopePanel v-bind="$attrs" :fill="fill" :context="context" :pick-source="pickSource || picker.pickSource" :initial-reference="reference" :initial-template="initialTemplate" :detail-link-label="detailLabel" @apply-started="emit('applyStarted')" @open-detail-link="openDetail" @open-object="emit('openObject', $event)">
    <template v-for="(_, key) in $slots" :key="key" #[key]="slotProps"><slot :name="key" v-bind="slotProps" /></template>
  </MetricScopePanel>
  <component v-if="!pickSource" :is="picker.host" />
</template>
