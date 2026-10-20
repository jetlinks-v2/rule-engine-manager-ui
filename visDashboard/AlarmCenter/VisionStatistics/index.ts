import { defineAsyncComponent } from 'vue'
import { config } from './config'

export const AlarmCenterVisionStatistics = { name: config.type, component: defineAsyncComponent(() => import('./VisionStatistics.vue')) }
export const AlarmCenterVisionStatisticsConfig = [{ name: config.type, direct: true, component: defineAsyncComponent(() => import('./Config.vue')) }]
export const AlarmCenterVisionStatisticsConfigProps = config

