import { defineAsyncComponent } from 'vue'
import { config } from './config'

export const AlarmCenterHandlingStatistics = { name: config.type, component: defineAsyncComponent(() => import('./HandlingStatistics.vue')) }
export const AlarmCenterHandlingStatisticsConfig = [{ name: config.type, direct: true, component: defineAsyncComponent(() => import('./Config.vue')) }]
export const AlarmCenterHandlingStatisticsConfigProps = config
