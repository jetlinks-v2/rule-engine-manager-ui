<template>
  <MetricNodeInspect v-if="entry?.record?.attributes.execution" :detail="{template,node,metricId:entry.value?.metricId || entry.record.attributes.execution.definitionId,step:entry.record.attributes.execution,value:recordedValue}" />
</template>
<script setup lang="ts">
import { computed } from 'vue'
import MetricNodeInspect from '../MetricNodeInspect.vue'
import type { MetricTemplate } from '../types'
import type { TemplateNode } from './designer'
import type { SimulationEntry } from './simulationPreview'
const props=defineProps<{template:MetricTemplate;node:TemplateNode;entry?:SimulationEntry}>()
// 只补当次已返回的依据；不从当前样本或另一个输出推断。
const recordedValue=computed(()=>props.entry?.value ? {...props.entry.value,evidence:props.entry.record?.attributes.execution?.value.evidence} : undefined)
</script>
