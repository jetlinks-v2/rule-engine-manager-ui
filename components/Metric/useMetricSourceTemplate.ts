import { computed, inject, watch, type InjectionKey, type Ref } from 'vue'
import { useDiagnosticQuery } from '@jetlinks-web-core/hooks/useDiagnosticQuery'
import { metricSourceTemplate } from './valueSemantics'
import type { MetricConfig, MetricContext, MetricSourceDescription, MetricSourcePicker, MetricTemplate } from './types'

export const metricSourcePickerKey:InjectionKey<Readonly<Ref<MetricSourcePicker | undefined>>> = Symbol('metric-source-picker')

/** 详情按绑定身份读取来源元数据；实时结果变化不重查，关闭或换对象后忽略迟到响应。 */
export function useMetricSourceTemplate(template:Ref<MetricTemplate | undefined>, configuration:Ref<MetricConfig | undefined>, context:Ref<MetricContext | undefined>, active:Ref<boolean>, picker = inject(metricSourcePickerKey, undefined)) {
  const query = useDiagnosticQuery<Record<string,MetricSourceDescription>>()
  const key = computed(() => active.value && context.value && configuration.value && Object.keys(configuration.value.inputMappings).length && picker?.value?.describe
    ? JSON.stringify([context.value.ownerType,context.value.ownerId,context.value.targetType,context.value.targetId,context.value.scope,configuration.value.id,configuration.value.inputMappings]) : '')
  watch([key,() => picker?.value?.describe], () => {
    if (!key.value) { query.clear(); return }
    const describe = picker!.value!.describe!, owner = context.value!, mappings = configuration.value!.inputMappings
    void query.run(() => describe(owner,mappings),true)
  }, { immediate:true })
  return computed(() => template.value && query.data.value ? metricSourceTemplate(template.value,query.data.value) : template.value)
}
