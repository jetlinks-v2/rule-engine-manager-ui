import { defineAsyncComponent } from 'vue'
import { config } from './config'

export const AlarmCenterIotStatistics = { name: config.type, component: defineAsyncComponent(() => import('./IotStatistics.vue')) }
export const AlarmCenterIotStatisticsConfig = [{ name: config.type, direct: true, component: defineAsyncComponent(() => import('./Config.vue')) }]
export const AlarmCenterIotStatisticsConfigProps = config

