import { defineAsyncComponent } from 'vue'
import { newAlarmConfig } from './config'

const NewAlarm = {
  name: 'newAlarm',
  component: defineAsyncComponent(() => import('./NewAlarm.vue'))
}

const NewAlarmConfig = [
  {
    name: 'newAlarm',
    component: defineAsyncComponent(() => import('./Config.vue'))
  }
]

const NewAlarmConfigProps = {
  ...newAlarmConfig
}

export { NewAlarm, NewAlarmConfig, NewAlarmConfigProps }
