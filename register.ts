import {useRulePermissionContext} from '@rule-engine-manager-ui/hook/usePermission'

export default {
    components: {
        ruleInstance: defineAsyncComponent(() => import('./views/Instance/index.vue')),
        AlarmDashboard: defineAsyncComponent(() => import('./views/DashBoard/index.vue')),
        AlarmConfig: defineAsyncComponent(() => import('./views/Alarm/Config/index.vue'))
    },
    hooks: {
        useRulePermissionContext
    }
}
