type QuickTimerDraft = {
  triggerKind: string
  repeatMode?: string
  repeatCustomMode?: string
  repeatWeekdays?: number[]
  repeatMonthDays?: number[]
  repeatTime?: string
  dateTime?: string
  interval?: number
}

/** 快速定时的局部确认与总保存共用校验；详细模式的空日期代表每天，不适用此规则。 */
export function quickTimerValidation(draft: QuickTimerDraft): string | undefined {
  if (draft.triggerKind === 'date' && !draft.dateTime) return 'IotSceneLinkage.message.dateRequired'
  if (draft.triggerKind === 'repeat') {
    if (!draft.repeatTime) return 'IotSceneLinkage.message.repeatTimeRequired'
    if (draft.repeatMode === 'custom' && !(draft.repeatCustomMode === 'weekly' ? draft.repeatWeekdays : draft.repeatMonthDays)?.length) return 'IotSceneLinkage.message.repeatDateRequired'
  }
  if (draft.triggerKind === 'interval' && (!Number.isInteger(draft.interval) || !draft.interval || draft.interval < 1)) return 'IotSceneLinkage.message.repeatTimeRequired'
}
