import { defineAsyncComponent } from 'vue'
import { config } from './config'

export const AlarmCenterAlarmTrend = { name: config.type, component: defineAsyncComponent(() => import('./AlarmTrend.vue')) }
export const AlarmCenterAlarmTrendConfig = [{ name: config.type, direct: true, component: defineAsyncComponent(() => import('./Config.vue')) }]
export const AlarmCenterAlarmTrendConfigProps = config

