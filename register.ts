import {useRulePermissionContext, useScenePermissionContext} from '@rule-engine-manager-ui/hook/usePermission'
import {EventEmitter, DeviceEmitterKey, ACTION_DATA} from '@rule-engine-manager-ui/views/Scene/Save/util';
import dataCapabilityProviders from './dataCapabilities'
import type { AgentCapabilityProviderResource } from '@jetlinks-web-core/layout/components/AiChat/routeCapabilityLoader'
import { ALARM_ANALYSIS_EXTENSION_KEY } from './agentCapabilities/alarmAnalysis/constants'
import {
    RULE_EDITOR_FLOWCHART_EXTENSION_KEY,
    RULE_EDITOR_FLOWCHART_MENU_ANCHORS,
} from './agentCapabilities/ruleEditor/constants'

type HomeAgentProviderLoader = () => Promise<unknown>

const homeAgentProviderKeyMap: Record<string, string> = {
    './views/DashBoard/homeAgentProvider.ts': 'rule-engine/DashBoard',
    './views/Instance/homeAgentProvider.ts': 'rule-engine/Instance'
}

const homeAgentProviderPaths: Record<string, string[]> = {
    'rule-engine/DashBoard': ['/alarms/dashboard', '/iot/Alarm/dashboard'],
    'rule-engine/Instance': ['/rule-engine/Instance', '/iot/rule-engine/Instance'],
}

const toHomeAgentProviderKey = (path: string) => (
    homeAgentProviderKeyMap[path] || path.replace('./views/', '').replace('/homeAgentProvider.ts', '')
)

const homeAgentProviderModules = import.meta.glob('./views/**/homeAgentProvider.ts') as Record<string, HomeAgentProviderLoader>
const homeAgentProviders = Object.fromEntries(
    Object.entries(homeAgentProviderModules).map(([path, loader]) => {
        const key = toHomeAgentProviderKey(path)
        return [key, {
            loader,
            activation: {
                version: 'general-agent-provider-activation/v1',
                scopes: [
                    { kind: 'menuCode', values: [key] },
                    { kind: 'routeName', values: key === 'rule-engine/DashBoard' ? [key, 'AlarmDashboard'] : [key] },
                    { kind: 'path', values: homeAgentProviderPaths[key] },
                ],
            },
        } satisfies AgentCapabilityProviderResource]
    })
)

export default {
    moduleId: 'rule-engine-manager-ui',
    components: {
        ruleInstance: defineAsyncComponent(() => import('./views/Instance/index.vue')),
        // 私有化运行时从该注册表加载场景菜单，不能只依赖 index.ts 的动态路由映射。
        scenePage: defineAsyncComponent(() => import('./views/SceneLinkage/index.vue')),
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
    homeAgentProviders,
    dataCapabilityProviders,
    generalAgentExtensions: {
        [ALARM_ANALYSIS_EXTENSION_KEY]: () => import('./agentCapabilities/alarmAnalysis/generalAgentExtension'),
        [RULE_EDITOR_FLOWCHART_EXTENSION_KEY]: {
            loader: () => import('./agentCapabilities/ruleEditor/generalAgentExtension'),
            activation: {
                version: 'general-agent-provider-activation/v1',
                scopes: [
                    { kind: 'path', values: [...RULE_EDITOR_FLOWCHART_MENU_ANCHORS] },
                    { kind: 'menuCode', values: [...RULE_EDITOR_FLOWCHART_MENU_ANCHORS] },
                ],
            },
        } satisfies AgentCapabilityProviderResource,
    }
}
