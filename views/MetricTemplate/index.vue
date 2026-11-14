<template>
  <MetricTemplateManager :editable="editable" :starters="starters" :pick-source="source?.pickSource" :source-context="sourceContext" :apply-template="applyTemplate" />
  <component v-if="source?.host" :is="source.host" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { MetricTemplateManager, type MetricContext } from '@jetlinks-web-core/components'
import { collectMetricResources } from '@jetlinks-web-core/components/Metric/extensions/registry'
import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'
import { useAuthStore } from '@jetlinks-web-core/store'
import { useProjectRouter } from '@jetlinks-web-core/hooks'


const auth = useAuthStore()
const editable = computed(() => auth.hasPermission('rule-engine/MetricTemplate:save'))
const provider = collectMetricResources().dimensions[0]?.provider
const sourceContext = ref<MetricContext>({ownerType:provider?.ownerType || '',ownerId:'',targetType:provider?.ownerType || ''})
const source = provider?.useSourcePicker(sourceContext)
const starters = [...moduleRegistry.getAllModules().values()].flatMap(module => Object.values(module.metricTemplateStarters || {}).flatMap(load => load()))
const router = useProjectRouter()
function applyTemplate(template:{id:string;version:string}) {
  void router.push({path:'/rule-engine/metrics',query:{metricApplyTemplate:template.id,metricApplyVersion:template.version}})
}
</script>
