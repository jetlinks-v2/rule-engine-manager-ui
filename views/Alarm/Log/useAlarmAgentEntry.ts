import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { consumeAlarmRecordEntryContext } from '@rule-engine-manager-ui/agentCapabilities/alarmAnalysis/alarmAnalysis.service'
import { queryRawAlarmRecord } from '@rule-engine-manager-ui/agentCapabilities/alarmAnalysis/alarmData.service'
import type { UnknownRecord } from '@rule-engine-manager-ui/agentCapabilities/alarmAnalysis/alarmData.mapper'

/** Consumes one-time agent navigation state and revalidates the record through the normal permission path. */
export function useAlarmAgentEntry(onRecord: (record: UnknownRecord) => void | Promise<void>) {
  const route = useRoute()
  let requestVersion = 0

  watch(
    () => route.query.agentEntry,
    async (value) => {
      const version = ++requestVersion
      const entryKey = typeof value === 'string' ? value : ''
      if (!entryKey) return
      const menuCode = String(route.name || route.path || 'rule-engine/Alarm/Log')
      const entry = consumeAlarmRecordEntryContext(entryKey, menuCode)
      if (!entry) return
      try {
        const record = await queryRawAlarmRecord(entry.source, entry.alarmRecordId)
        if (version === requestVersion && record) await onRecord(record)
      } catch {
        // Expired, deleted, or newly forbidden records safely fall back to the normal alarm list.
      }
    },
    { immediate: true },
  )
}
