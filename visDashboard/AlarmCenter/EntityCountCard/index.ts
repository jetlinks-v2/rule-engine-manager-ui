import { defineAsyncComponent } from 'vue'
import { entityCountCardConfig } from './config'

const EntityCountCard = {
  name: 'entityCountCard',
  component: defineAsyncComponent(() => import('./EntityCountCard.vue'))
}

const EntityCountCardConfig = [
  {
    name: 'entityCountCard',
    component: defineAsyncComponent(() => import('./Config.vue'))
  }
]

const EntityCountCardConfigProps = {
  ...entityCountCardConfig
}

export { EntityCountCard, EntityCountCardConfig, EntityCountCardConfigProps }
