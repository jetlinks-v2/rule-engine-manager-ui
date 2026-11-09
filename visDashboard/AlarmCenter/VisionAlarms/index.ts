import { defineAsyncComponent } from 'vue'
import { config } from './config'

export const AlarmCenterVisionAlarms = { name: config.type, component: defineAsyncComponent(() => import('./VisionAlarms.vue')) }
export const AlarmCenterVisionAlarmsConfig = [{ name: config.type, direct: true, component: defineAsyncComponent(() => import('./Config.vue')) }]
export const AlarmCenterVisionAlarmsConfigProps = config

