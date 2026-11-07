import alarm from './alarm.vue'
import device from './device.vue'
import notify from './notify.vue'
import collector from './collector.vue'
import deviceData from './device-data.vue'
import sceneNotify from './sceneNotify.vue'
import alarmRecordQuery from './alarmRecordQuery.vue'
import LegacyActionSummary from '../../LegacyActionSummary.vue'
import type { Component } from 'vue'

const actionDetails: Record<string, Component> = {
  alarm,
  device,
  notify,
  collector,
  'device-data': deviceData,
  sceneNotify,
  'alarm-record-query': alarmRecordQuery,
}

/** 未迁移的历史 Provider 仍展示可理解摘要，避免规则树出现空白节点。 */
export default new Proxy(actionDetails, {
  get(target, key: string | symbol) {
    return typeof key === 'string' ? target[key] || LegacyActionSummary : Reflect.get(target, key)
  },
})
