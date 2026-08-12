import {useRulePermissionContext, useScenePermissionContext} from '@rule-engine-manager-ui/hook/usePermission'
import {EventEmitter, DeviceEmitterKey, ACTION_DATA} from '@rule-engine-manager-ui/views/Scene/Save/util';
import type { DataCapabilityProviderManifest } from '@jetlinks-web-core/data-capability'
import { ALARM_ANALYSIS_EXTENSION_KEY } from './agentCapabilities/alarmAnalysis/constants'

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
    moduleId: 'rule-engine-manager-ui',
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
    homeAgentProviders,
    dataCapabilityProviders: {
        deviceMonitoring: {
            capabilityIds: [
                'alarm.device.summary',
                'alarm.device.active.ids',
                'alarm.device.rank',
                'alarm.device.list',
            ],
            loader: () => import('./dataCapabilities/deviceAlarmProvider'),
        },
        visionMonitoring: {
            capabilityIds: [
                'alarm.vision.summary',
                'alarm.vision.trend',
                'alarm.vision.type.distribution',
                'alarm.vision.level.distribution',
                'alarm.vision.scene.distribution',
                'alarm.vision.scene.rank',
                'alarm.vision.list',
                'alarm.vision.level.trend',
                'alarm.vision.handling.trend',
                'alarm.vision.channel.rank',
                'alarm.vision.ai-review.summary',
                'alarm.event.summary',
                'alarm.event.list',
            ],
            loader: () => import('./dataCapabilities/visionAlarmProvider'),
        },
    } satisfies DataCapabilityProviderManifest,
    generalAgentExtensions: {
        [ALARM_ANALYSIS_EXTENSION_KEY]: () => import('./agentCapabilities/alarmAnalysis/generalAgentExtension')
    }
}
