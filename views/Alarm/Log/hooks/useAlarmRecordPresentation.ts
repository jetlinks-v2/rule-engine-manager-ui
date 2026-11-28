import { computed } from 'vue'
import { createSharedComposable, useTimestamp } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import type { ObjectRecordPresentationProps } from '@jetlinks-web-core/types/object-presentation'
import { alarmEnum, alarmFacts, alarmTime, formatAlarmDuration, type AlarmSpan } from '../utils/alarmPresentation'

// One minute clock for all visible records; VueUse releases it when the last consumer leaves.
const useAlarmClock = createSharedComposable(() => useTimestamp({ interval: 60000 }))
const handledColors: Record<string, string> = { user: 'blue', system: 'green' }

export function useAlarmRecordPresentation(props: ObjectRecordPresentationProps) {
  const { t, locale } = useI18n()
  const now = useAlarmClock()
  const occurrence = computed(() => props.typeId === 'alarmOccurrence')
  const grouped = computed(() => occurrence.value && props.subject.typeId === 'alarmRecord')
  const facts = computed(() => alarmFacts(props.record, occurrence.value, now.value))
  const name = computed(() =>
    String(props.record.alarmName || props.record.alarmConfigName || props.record.name || t('AlarmPresentation.alarm'))
  )
  const description = computed(() => String(props.record.actualDesc || ''))
  const formatTime = (value: unknown, compact = false) => {
    const time = alarmTime(value)
    return time == null
      ? '—'
      : dayjs(time).format(compact ? (occurrence.value ? 'MM-DD HH:mm:ss' : 'MM-DD HH:mm') : 'YYYY-MM-DD HH:mm:ss')
  }
  const duration = (value: AlarmSpan, compact = true) =>
    formatAlarmDuration(value.to - value.from, locale.value, compact)
  const durationLabel = (value?: AlarmSpan) =>
    value &&
    t(`AlarmPresentation.${value.kind}`, {
      duration: duration(value)
    })
  const durationTitle = (value?: AlarmSpan) =>
    value &&
    t('AlarmPresentation.durationRange', {
      from: formatTime(value.from),
      to: formatTime(value.to),
      duration: formatAlarmDuration(value.to - value.from, locale.value, false, true)
    })
  const conclusion = computed(() => {
    const { duration: value, state, handleType } = facts.value
    if (occurrence.value)
      return value && value.to > value.from
        ? t('AlarmPresentation.triggerDuration', { duration: duration(value, false) })
        : ''
    if (value) {
      const key = value.kind === 'ongoing' ? 'ongoingFact' : handleType ? 'handledFact' : 'endedFact'
      return t(`AlarmPresentation.${key}`, { duration: duration(value, false), method: handleType })
    }
    return state.value === 'normal' ? t('AlarmPresentation.endedWithoutTime') : ''
  })
  const timeline = computed(() =>
    [...facts.value.timeline].reverse().map((moment) => ({
      ...moment,
      color:
        moment.kind === 'current'
          ? 'red'
          : moment.kind === 'handled'
          ? handledColors[alarmEnum(props.record.handleType).value] || 'gray'
          : 'orange',
      label:
        moment.kind === 'handled' && facts.value.handleType
          ? t('AlarmPresentation.handledBy', { method: facts.value.handleType })
          : t(`AlarmPresentation.${moment.kind}`),
      time: moment.kind === 'current' ? '' : formatTime(moment.at, true),
      fullTime: formatTime(moment.at),
      duration:
        moment.kind === 'first' || (moment.span?.kind === 'elapsed' && moment.span.to === moment.span.from)
          ? ''
          : durationLabel(moment.span),
      durationTitle: durationTitle(moment.span)
    }))
  )
  return {
    t,
    occurrence,
    grouped,
    name,
    description,
    facts,
    conclusion,
    timeline,
    formatTime,
    durationLabel,
    durationTitle,
    durationText: computed(() =>
      occurrence.value && facts.value.duration?.from === facts.value.duration?.to
        ? ''
        : durationLabel(facts.value.duration)
    ),
    compactTime: computed(() => formatTime(facts.value.latest, true)),
    fullTime: computed(() => formatTime(facts.value.latest))
  }
}
