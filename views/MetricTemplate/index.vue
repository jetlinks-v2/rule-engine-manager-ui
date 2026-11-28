<template>
  <MetricTemplateManager :editable="editable" :starters="starters" :pick-source="source?.pickSource" :source-context="sourceContext" :apply-template="applyTemplate" />
  <component v-if="source?.host" :is="source.host" />
</template>

<script setup lang="ts">
import MetricTemplateManager from '../../components/Metric/template/MetricTemplateManager.vue'
import { useMetricSourceAdapter } from '../../components/Metric/source-picker/useMetricSourceAdapter'
import { computed, ref } from 'vue'
import { type MetricContext } from '@rule-engine-manager-ui/components/Metric'
import { collectMetricResources } from '../../components/Metric/extensions/registry'
import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'
import { useAuthStore } from '@jetlinks-web-core/store'
import { useProjectRouter } from '@jetlinks-web-core/hooks'


const auth = useAuthStore()
const editable = computed(() => auth.hasPermission('rule-engine/MetricTemplate:save'))
const provider = collectMetricResources().dimensions[0]?.provider
const sourceContext = ref<MetricContext>({ownerType:provider?.ownerType || '',ownerId:'',targetType:provider?.ownerType || ''})
const source = provider ? (provider.useSourcePicker || useMetricSourceAdapter)(sourceContext) : undefined
const starters = [...moduleRegistry.getAllModules().values()].flatMap(module => Object.values(module.metricTemplateStarters || {}).flatMap(load => typeof load === 'function' ? load() : []))
const router = useProjectRouter()
function applyTemplate(template:{id:string;version:string}) {
  void router.push({path:'/rule-engine/metrics',query:{metricApplyTemplate:template.id,metricApplyVersion:template.version}})
}
</script>
