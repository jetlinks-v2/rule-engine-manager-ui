<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useRoute } from 'vue-router'
import MetricScopePanel from './MetricScopePanel.vue'
import { useMetricSourceAdapter } from '../source-picker/useMetricSourceAdapter'
import { metricReferenceFromQuery } from '../location'
import type { MetricAlarmReference, MetricContext, MetricReference, MetricSourcePicker, MetricTemplateReference, MetricWorkspaceSelection } from '../types'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ fill?: boolean; context: MetricContext; pickSource?: MetricSourcePicker; initialReference?: MetricReference; initialTemplate?: MetricTemplateReference; detailLinkLabel?: string }>()
const emit = defineEmits<{ applyStarted: []; openDetailLink: [reference: MetricAlarmReference]; openObject: [value: MetricWorkspaceSelection] }>()
const route = useRoute()
// The installed metric module owns picker state; dimension providers only describe their objects.
const picker = useMetricSourceAdapter(toRef(props, 'context'))
const reference = computed(() => props.initialReference ?? metricReferenceFromQuery(route.query, props.context))
</script>
<template>
  <MetricScopePanel v-bind="$attrs" :fill="fill" :context="context" :pick-source="pickSource || picker.pickSource" :initial-reference="reference" :initial-template="initialTemplate" :detail-link-label="detailLinkLabel" @apply-started="emit('applyStarted')" @open-detail-link="emit('openDetailLink', $event)" @open-object="emit('openObject', $event)">
    <template v-for="(_, key) in $slots" :key="key" #[key]="slotProps"><slot :name="key" v-bind="slotProps" /></template>
  </MetricScopePanel>
  <component v-if="!pickSource" :is="picker.host" />
</template>
