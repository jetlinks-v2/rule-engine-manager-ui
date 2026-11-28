import dayjs from 'dayjs'

export interface AlarmSpan {
  from: number
  to: number
  kind: 'elapsed' | 'ongoing' | 'ended'
}

export interface AlarmMoment {
  kind: 'first' | 'latest' | 'triggered' | 'handled' | 'current'
  at: number
  span?: AlarmSpan
}

export function alarmTime(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return
  if (typeof value === 'string' && !value.trim()) return
  const numeric = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  const time = dayjs(numeric).valueOf()
  return Number.isFinite(time) && time > 0 ? time : undefined
}

export function alarmEnum(value: unknown): { value: string; text: string } {
  if (value && typeof value === 'object' && 'value' in value && 'text' in value)
    return { value: String(value.value), text: String(value.text) }
  return { value: typeof value === 'string' ? value : '', text: typeof value === 'string' ? value : '' }
}

const span = (from: number | undefined, to: number | undefined, kind: AlarmSpan['kind']): AlarmSpan | undefined =>
  from != null && to != null && to >= from ? { from, to, kind } : undefined

/** A trigger is a point in its own cycle; the aggregate's current state never rewrites historical events. */
export function alarmFacts(record: Record<string, unknown>, occurrence: boolean, now: number) {
  const state = occurrence ? { value: '', text: '' } : alarmEnum(record.state)
  const first = alarmTime(occurrence ? record.cycleTime : record.alarmTime)
  const latest = alarmTime(occurrence ? record.alarmTime : record.lastAlarmTime) ?? (occurrence ? undefined : first)
  const handled = state.value === 'normal' ? alarmTime(record.handleTime) : undefined
  const end = handled != null && (latest == null || handled >= latest) ? handled : undefined
  const duration = occurrence
    ? span(first, latest, 'elapsed')
    : state.value === 'warning'
    ? span(first, now, 'ongoing')
    : state.value === 'normal'
    ? span(first, end, 'ended')
    : undefined
  const timeline: AlarmMoment[] = []
  if (occurrence) {
    if (latest != null) timeline.push({ kind: 'triggered', at: latest, span: duration })
  } else {
    if (first != null) timeline.push({ kind: 'first', at: first })
    if (latest != null && (first == null || latest > first))
      timeline.push({ kind: 'latest', at: latest, span: span(first, latest, 'elapsed') })
    if (end != null) timeline.push({ kind: 'handled', at: end, span: duration })
    else if (state.value === 'warning' && duration) timeline.push({ kind: 'current', at: now, span: duration })
  }
  return { state, first, latest, end, duration, timeline, handleType: alarmEnum(record.handleType).text }
}

/** Keep two useful units in compact text; tooltips retain the exact second count. */
export function formatAlarmDuration(milliseconds: number, locale: string, compact = false, exact = false): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return ''
  let seconds = Math.floor(milliseconds / 1000)
  const parts: { unit: 'hour' | 'minute' | 'second'; value: number }[] = []
  for (const [unit, size] of [
    ['hour', 3600],
    ['minute', 60],
    ['second', 1]
  ] as const) {
    const value = Math.floor(seconds / size)
    seconds %= size
    if (value) parts.push({ unit, value })
  }
  if (!parts.length) parts.push({ unit: 'second', value: 0 })
  return (exact ? parts : parts.slice(0, 2))
    .map(({ unit, value }) =>
      new Intl.NumberFormat(locale, {
        style: 'unit',
        unit,
        unitDisplay: compact ? 'narrow' : 'long'
      }).format(value)
    )
    .join(locale.startsWith('zh') ? '' : ' ')
}
