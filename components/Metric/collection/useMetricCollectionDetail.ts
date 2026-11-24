import { computed, ref, watch, type Ref } from 'vue'
import { metricApi } from '../api'
import { errorText } from '../service'
import type { MetricTemplate } from '../types'
import type { MetricCollectionRow } from './types'
import { stateLabels } from '../stateIntervals'

export function useMetricCollectionDetail(selected: Ref<MetricCollectionRow | undefined>) {
  const template = ref<MetricTemplate>(), loading = ref(false), error = ref('')
  const outputId=ref('')
  let generation = 0
  watch(selected, async row => {
    const current = ++generation
    template.value = undefined; error.value = ''
    if (!row) return
    outputId.value=row.output.metricId
    loading.value = true
    const target = { targetType:row.target.type, targetId:row.target.id }
    try {
      const definition = await metricApi.resultTemplate(row.configId, target)
      if (current === generation) template.value = definition
    } catch (cause) { if (current === generation) error.value = errorText(cause) }
    finally { if (current === generation) loading.value = false }
  })
  const labels = computed(() => selected.value && template.value ? stateLabels(template.value, selected.value.output.metricId) : [])
  const output=computed(()=>template.value?.outputs.find(item=>item.metricId===outputId.value))
  function selectOutput(id:string) { if(template.value?.outputs.some(item=>item.metricId===id))outputId.value=id }
  return { template, loading, error, labels, outputId,output,selectOutput }
}
