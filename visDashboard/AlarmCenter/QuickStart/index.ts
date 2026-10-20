import { defineAsyncComponent } from 'vue'
import { config } from './config'

export const AlarmCenterQuickStart = { name: config.type, component: defineAsyncComponent(() => import('./QuickStart.vue')) }
export const AlarmCenterQuickStartConfig = [{ name: config.type, direct: true, component: defineAsyncComponent(() => import('./Config.vue')) }]
export const AlarmCenterQuickStartConfigProps = config

