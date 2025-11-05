import { useRulePermissionContext } from '@rule-engine-manager-ui/hook/usePermission'

export default {
  components: {
    ruleInstance: defineAsyncComponent(() => import('./views/Instance/index.vue')),
  },
  hooks: {
    useRulePermissionContext
  }
}
