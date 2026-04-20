import { defineAsyncComponent } from 'vue'
import { alarmCountCardConfig } from './config'

const AlarmCountCard = {
  name: 'alarmCountCard',
  component: defineAsyncComponent(() => import('./AlarmCountCard.vue'))
}

const AlarmCountCardConfig = [
  {
    name: 'alarmCountCard',
    component: defineAsyncComponent(() => import('./Config.vue'))
  }
]

const AlarmCountCardConfigProps = {
  ...alarmCountCardConfig
}

export { AlarmCountCard, AlarmCountCardConfig, AlarmCountCardConfigProps }
