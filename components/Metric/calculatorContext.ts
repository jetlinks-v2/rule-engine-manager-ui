import type { InjectionKey, Ref } from 'vue'
import type { MetricCalculatorDescriptor, MetricAggregationDescriptor } from './types'

/** 只读展示共享元数据；不依赖加载器或传输层。 */
export const metricCalculatorsKey: InjectionKey<Readonly<Ref<MetricCalculatorDescriptor[]>>> = Symbol('metric-calculators')
export const metricAggregationsKey: InjectionKey<Readonly<Ref<MetricAggregationDescriptor[]>>> = Symbol('metric-aggregations')
