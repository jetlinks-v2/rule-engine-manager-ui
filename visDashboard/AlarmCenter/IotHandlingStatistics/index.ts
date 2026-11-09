import { defineAsyncComponent } from 'vue'
import { config } from './config'

export const AlarmCenterIotHandlingStatistics = { name: config.type, component: defineAsyncComponent(() => import('./IotHandlingStatistics.vue')) }
export const AlarmCenterIotHandlingStatisticsConfig = [{ name: config.type, direct: true, component: defineAsyncComponent(() => import('./Config.vue')) }]
export const AlarmCenterIotHandlingStatisticsConfigProps = config
