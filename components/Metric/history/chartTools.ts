import type { InjectionKey, ShallowRef } from 'vue'
import type { TimeZoomControls } from '@jetlinks-web-core/hooks/Echarts/useTimeZoom'

export interface MetricChartToolsState { controls?:TimeZoomControls; hint?:string; limited?:boolean }
export const metricChartToolsKey:InjectionKey<ShallowRef<MetricChartToolsState | undefined>> = Symbol('metric-chart-tools')
