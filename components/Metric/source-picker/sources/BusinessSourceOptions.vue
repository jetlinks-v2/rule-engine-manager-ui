<template>
  <div v-if="state.selected.value" class="business-options">
    <div v-for="parameter in state.selected.value.command?.inputs || []" :key="parameter.id" class="business-options__parameter">
      <span>{{ parameter.name || parameter.id }}</span>
      <MetricParameterValue :parameter="{...parameter,valueType:{type:'string',...parameter.valueType}}" :model-value="state.parameters.value[parameter.id]" @update:model-value="state.parameters.value = {...state.parameters.value,[parameter.id]:$event}" />
    </div>
  </div>
</template>
<script setup lang="ts">
import MetricParameterValue from '../../MetricParameterValue.vue'
import type { BusinessSourcesState } from './useBusinessSources'
defineProps<{state:BusinessSourcesState}>()
</script>
<style scoped>
.business-options,.business-options__parameter { display:grid; gap:6px; min-width:0 }
.business-options { gap:12px; font-size:12px }
</style>
