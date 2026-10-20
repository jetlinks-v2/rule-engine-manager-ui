import { defineAsyncComponent } from 'vue'
import { config } from './config'

export const AlarmCenterTodayEvents = { name: config.type, component: defineAsyncComponent(() => import('./TodayEvents.vue')) }
export const AlarmCenterTodayEventsConfig = [{ name: config.type, direct: true, component: defineAsyncComponent(() => import('./Config.vue')) }]
export const AlarmCenterTodayEventsConfigProps = config

