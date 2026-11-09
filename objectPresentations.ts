import i18n from '@jetlinks-web-core/locales'
import { defineAsyncComponent } from 'vue'
import type { ObjectPresentation } from '@jetlinks-web-core/types/object-presentation'

const alarmRecordPresentation = defineAsyncComponent(
  () => import('./views/Alarm/Log/components/AlarmRecordPresentation.vue')
)

// Defer the menu dependency until navigation; menu discovery also loads this declaration.
const openAlarmLog = async (query: Record<string, string>) => {
  const { useMenuStore } = await import('@jetlinks-web-core/store/menu')
  const menu = useMenuStore()
  const detail = ['iot-user-device-list/Detail', 'iot-user/device/list/Detail', 'device/Instance/Detail'].find((code) =>
    menu.getMenu(code)
  )
  if (detail)
    menu.jumpPage(detail, {
      params: { id: query.targetId },
      query: { tab: detail === 'device/Instance/Detail' ? 'Alarm' : 'alarm' }
    })
  else menu.jumpPage('rule-engine/Alarm/Log', { query })
}

export default {
  alarmRecord: {
    typeId: 'alarmRecord',
    fields: [],
    record: { component: alarmRecordPresentation, itemHeight: 96 }
  },
  alarmOccurrence: {
    typeId: 'alarmOccurrence',
    fields: [],
    record: { component: alarmRecordPresentation, itemHeight: 72, expandable: false }
  },
  deviceAlarm: {
    typeId: 'device',
    queries: {
      alarmSummary: {
        nodeField: 'alarmCount',
        icon: 'AlertOutlined',
        parameters: defineAsyncComponent(() => import('./views/Alarm/Log/components/ObjectAlarmFocus.vue')),
        format: (value) => ({
          text: value == null ? '—' : String(value),
          tone: Number(value) > 0 ? 'error' : 'neutral'
        })
      }
    },
    lineage: true,
    fields: [
      {
        key: 'activeAlarms',
        label: () => i18n.global.t('ObjectPresentation.activeAlarms'),
        order: 20,
        display: 'metric',
        icon: 'AlertOutlined',
        query: { capability: 'alarmSummary', subjectKey: 'targetId', valueKey: 'alarmCount' },
        open: (object) =>
          openAlarmLog({
            tab: 'device',
            targetType: 'device',
            targetId: object.id,
            targetName: typeof object.name === 'string' ? object.name : object.id,
            state: 'warning'
          }),
        format: (value) => ({
          text: value == null ? '—' : String(value),
          tone: Number(value) > 0 ? 'error' : 'neutral'
        })
      }
    ]
  }
} satisfies Record<string, ObjectPresentation>
