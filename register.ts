import { useRulePermissionContext, useScenePermissionContext } from '@rule-engine-manager-ui/hook/usePermission'
import {EventEmitter, DeviceEmitterKey, ACTION_DATA} from '@rule-engine-manager-ui/views/Scene/Save/util';

export default {
  components: {
    ruleInstance: defineAsyncComponent(() => import('./views/Instance/index.vue')),
    scenePage: defineAsyncComponent(() => import('./views/Scene/index.vue')),
    sceneSavePage: defineAsyncComponent(() => import('./views/Scene/Save/index.vue')),
    sceneSaveAddButton: defineAsyncComponent(() => import('./views/Scene/Save/components/AddButton.vue')),
    sceneSaveTerms: defineAsyncComponent(() => import('./views/Scene/Save/components/Terms')),
  },
  hooks: {
    useRulePermissionContext,
    useScenePermissionContext
  },
  stores: {

  },
  utils: {
    EventEmitter, DeviceEmitterKey, ACTION_DATA
  }
}
