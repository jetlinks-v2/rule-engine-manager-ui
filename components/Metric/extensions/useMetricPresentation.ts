import { computed, type Ref } from 'vue'
import { useMetricResources } from './useMetricResources'
import { resolveMetricPresentation } from './registry'
import { presentationSettings } from './presentationSettings'
import type { MetricConfig, MetricTemplate } from '../types'

/** Resolve installed components reactively; result data and query ownership remain in Metric core. */
export function useMetricPresentation(template: Ref<MetricTemplate | undefined>, configuration?: Ref<MetricConfig | undefined>) {
  const resources = useMetricResources()
  const resolved = computed(() => resolveMetricPresentation(template.value?.options?.presentation?.provider, resources.value))
  const provider = computed(() => resolved.value.provider)
  const missing = computed(() => resolved.value.missing)
  const settings = computed(() => presentationSettings(template.value, configuration?.value))
  return { resources, resolved, provider, missing, settings }
}
