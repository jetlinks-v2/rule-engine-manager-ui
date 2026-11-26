import type { DataCapabilityProviderManifest } from '@jetlinks-web-core/data-capability'

/** 平台和独立播放器共用告警能力清单，不加载规则编辑器或平台启动逻辑。 */
export default {
    deviceMonitoring: {
        capabilityIds: [
            'alarm.device.summary',
            'alarm.device.active.ids',
            'alarm.device.rank',
            'alarm.device.list',
        ],
        loader: () => import('./deviceAlarmProvider'),
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
        loader: () => import('./visionAlarmProvider'),
    },
} satisfies DataCapabilityProviderManifest
