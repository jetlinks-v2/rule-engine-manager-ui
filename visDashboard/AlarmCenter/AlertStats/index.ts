import { defineAsyncComponent } from 'vue'
import { alertStatsConfig } from './config'

const AlertStats = {
  name: 'alertStats',
  component: defineAsyncComponent(() => import('./AlertStats.vue'))
}

const AlertStatsConfig = [
  {
    name: 'alertStats',
    component: defineAsyncComponent(() => import('./Config.vue'))
  }
]

const AlertStatsConfigProps = {
  ...alertStatsConfig
}

export { AlertStats, AlertStatsConfig, AlertStatsConfigProps }
