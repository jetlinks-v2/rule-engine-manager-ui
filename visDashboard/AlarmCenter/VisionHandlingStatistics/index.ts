import { defineAsyncComponent } from 'vue'
import { config } from './config'

export const AlarmCenterVisionHandlingStatistics = { name: config.type, component: defineAsyncComponent(() => import('./VisionHandlingStatistics.vue')) }
export const AlarmCenterVisionHandlingStatisticsConfig = [{ name: config.type, direct: true, component: defineAsyncComponent(() => import('./Config.vue')) }]
export const AlarmCenterVisionHandlingStatisticsConfigProps = config
