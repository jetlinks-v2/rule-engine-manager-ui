import { defineAsyncComponent } from 'vue'
import { alarmConfigCardConfig } from './config'

const AlarmConfigCard = {
  name: 'alarmConfigCard',
  component: defineAsyncComponent(() => import('./AlarmConfigCard.vue'))
}

const AlarmConfigCardConfig = [
  {
    name: 'alarmConfigCard',
    component: defineAsyncComponent(() => import('./Config.vue'))
  }
]

const AlarmConfigCardConfigProps = {
  ...alarmConfigCardConfig
}

export { AlarmConfigCard, AlarmConfigCardConfig, AlarmConfigCardConfigProps }
