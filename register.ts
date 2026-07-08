import {useRulePermissionContext, useScenePermissionContext} from '@rule-engine-manager-ui/hook/usePermission'
import {EventEmitter, DeviceEmitterKey, ACTION_DATA} from '@rule-engine-manager-ui/views/Scene/Save/util';

type HomeAgentProviderLoader = () => Promise<unknown>

const homeAgentProviderKeyMap: Record<string, string> = {
    './views/DashBoard/homeAgentProvider.ts': 'rule-engine/DashBoard',
    './views/Instance/homeAgentProvider.ts': 'rule-engine/Instance'
}

const toHomeAgentProviderKey = (path: string) => (
    homeAgentProviderKeyMap[path] || path.replace('./views/', '').replace('/homeAgentProvider.ts', '')
)

const homeAgentProviderModules = import.meta.glob('./views/**/homeAgentProvider.ts') as Record<string, HomeAgentProviderLoader>
const homeAgentProviders = Object.fromEntries(
    Object.entries(homeAgentProviderModules).map(([path, loader]) => [
        toHomeAgentProviderKey(path),
        loader
    ])
)

export default {
    components: {
        ruleInstance: defineAsyncComponent(() => import('./views/Instance/index.vue')),
        scenePage: defineAsyncComponent(() => import('./views/Scene/index.vue')),
        sceneSavePage: defineAsyncComponent(() => import('./views/Scene/Save/index.vue')),
        sceneSaveAddButton: defineAsyncComponent(() => import('./views/Scene/Save/components/AddButton.vue')),
        sceneSaveTerms: defineAsyncComponent(() => import('./views/Scene/Save/components/Terms')),
        AlarmDashboard: defineAsyncComponent(() => import('./views/DashBoard/index.vue')),
        AlarmConfig: defineAsyncComponent(() => import('./views/Alarm/Config/index.vue')),
        AlarmConfiguration: defineAsyncComponent(() => import('./views/Alarm/Configuration/index.vue')),
        AlarmConfigurationSave: defineAsyncComponent(() => import('./views/Alarm/Configuration/Save/index.vue')),
        AlarmConfigurationLog: defineAsyncComponent(() => import('./views/Alarm/Log/index.vue')),
        AlarmConfigurationLogDetail: defineAsyncComponent(() => import('./views/Alarm/Log/Detail/index.vue')),
        AlarmConfigurationLogRecord: defineAsyncComponent(() => import('./views/Alarm/Log/Record/index.vue')),
    },
    hooks: {
        useRulePermissionContext,
        useScenePermissionContext
    },
    stores: {},
    utils: {
        EventEmitter, DeviceEmitterKey, ACTION_DATA
    },
    homeAgentProviders
}
