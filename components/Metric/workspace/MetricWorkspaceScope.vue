<template>
  <a-alert v-if="sourceError" type="error" show-icon :message="t('sourcePickerUnavailable')" :description="sourceError" />
  <MetricScopePanel :context="panelContext" :pick-source="binding?.pickSource" :initial-reference="initialReference" :initial-template="initialTemplate" @apply-started="emit('applyStarted')" :detail-link-label="detailLinkLabel" @open-object="emit('openObject',$event)" @open-detail-link="(reference:MetricAlarmReference) => emit('openDetailLink', reference)"><template v-if="$slots['object-heading']" #object-heading><slot name="object-heading" /></template><template #object-actions><slot name="object-actions" /></template></MetricScopePanel>
  <component :is="binding.host" v-if="binding?.host" />
</template>
<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import MetricScopePanel from '../collection/MetricScopePanel.vue'
import { errorText } from '../service'
import { metricMessages } from '../messages'
import type { MetricAlarmReference, MetricTemplateReference, MetricContext, MetricDimensionProvider, MetricReference, MetricSourcePickerBinding,MetricWorkspaceSelection } from '../types'
const props = defineProps<{ provider: MetricDimensionProvider; context: MetricContext; initialReference?: MetricReference; initialTemplate?:MetricTemplateReference; detailLinkLabel?: string }>()
const emit = defineEmits<{ (event:'applyStarted'):void; (event: 'openDetailLink', reference: MetricAlarmReference): void;(event:'openObject',value:MetricWorkspaceSelection):void }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
let binding: MetricSourcePickerBinding | undefined
let sourceError = ''
// This keyed scope owns picker state and its host; switching owner destroys pending source drafts.
try { binding = props.provider.useSourcePicker(toRef(props, 'context')) } catch (cause) { sourceError = errorText(cause) }
const panelContext = computed(() => ({ ...props.context, readScopes:props.provider.readScopes?.(), editable: props.context.editable && !sourceError }))
</script>
