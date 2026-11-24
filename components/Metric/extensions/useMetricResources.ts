import { computed, onScopeDispose, ref } from 'vue'
import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'
import { collectMetricResources } from './registry'

/** Reconcile through the existing registry notification; no discovery polling or separate singleton. */
export function useMetricResources() {
  const version = ref(0)
  const unsubscribe = moduleRegistry.onChange(() => { version.value++ })
  onScopeDispose(unsubscribe)
  return computed(() => { version.value; return collectMetricResources() })
}
