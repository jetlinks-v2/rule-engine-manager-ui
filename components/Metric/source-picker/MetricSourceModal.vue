<template>
  <a-modal :open="state.open.value" :title="t(state.request.value?.purpose==='reference' ? 'addExistingMetric' : 'sourceTitle')" :width="640" :mask-closable="false" @cancel="state.cancel">
    <MetricSourceFields :state="state" />
    <template #footer><a-button @click="state.cancel">{{ t('cancel') }}</a-button><a-button v-if="!state.statistics.active.value && state.requiresConfirmation.value" type="primary" :disabled="!state.canConfirm.value" @click="state.confirm()">{{ t(state.request.value?.purpose==='reference' ? 'addSelectedMetric' : 'confirm') }}</a-button></template>
  </a-modal>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import MetricSourceFields from './MetricSourceFields.vue'
import { metricHostMessages } from './messages'
import type { MetricSourcePickerState } from './useMetricSourcePicker'
defineProps<{ state:MetricSourcePickerState }>()
const { t } = useI18n({ useScope:'local', messages:metricHostMessages })
</script>
