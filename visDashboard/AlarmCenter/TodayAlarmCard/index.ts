import { defineAsyncComponent } from 'vue'
import { todayAlarmCardConfig } from './config'

const TodayAlarmCard = {
  name: 'todayAlarmCard',
  component: defineAsyncComponent(() => import('./TodayAlarmCard.vue'))
}

const TodayAlarmCardConfig = [
  {
    name: 'todayAlarmCard',
    component: defineAsyncComponent(() => import('./Config.vue'))
  }
]

const TodayAlarmCardConfigProps = {
  ...todayAlarmCardConfig
}

export { TodayAlarmCard, TodayAlarmCardConfig, TodayAlarmCardConfigProps }
