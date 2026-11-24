import type { MetricDimensionProvider, MetricPresentationProvider, MetricTemplateStarter } from './components/Metric/types'
import type { ModuleResourceRecord } from '@jetlinks-web-core/types/module'

/** 指标扩展契约由规则模块拥有，core 仅提供通用资源注册机制。 */
declare module '@jetlinks-web-core/types/module' {
  interface ModuleResource {
    metricDimensions?: ModuleResourceRecord<MetricDimensionProvider>
    metricPresentations?: ModuleResourceRecord<MetricPresentationProvider>
    metricTemplateStarters?: ModuleResourceRecord<() => MetricTemplateStarter[]>
  }
}
