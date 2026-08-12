import { alarmMetricsService } from './alarmMetrics.service'
import { alarmNoiseService } from './alarmNoise.service'
import {
  alarmRecordsService,
  consumeAlarmRecordEntryContext,
  type AlarmRecordEntryContext,
} from './alarmRecords.service'

export const alarmAnalysisService = {
  ...alarmMetricsService,
  ...alarmRecordsService,
  ...alarmNoiseService,
}

export {
  consumeAlarmRecordEntryContext,
  type AlarmRecordEntryContext,
}
