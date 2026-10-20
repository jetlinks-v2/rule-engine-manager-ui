import { defineAsyncComponent } from 'vue'
import { config } from './config'

export const AlarmCenterIotAlarms = { name: config.type, component: defineAsyncComponent(() => import('./IotAlarms.vue')) }
export const AlarmCenterIotAlarmsConfig = [{ name: config.type, direct: true, component: defineAsyncComponent(() => import('./Config.vue')) }]
export const AlarmCenterIotAlarmsConfigProps = config

