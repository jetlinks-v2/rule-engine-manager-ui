import cronstrue from 'cronstrue'
import 'cronstrue/locales/zh_CN'
import i18n from '@jetlinks-web-core/locales/index'
import type { TimerCalendarTag } from '../../Scene/Save/components/Timer/useTimerCalendarTags'
import type { OperationTimer } from '../../Scene/typings'
import { handleTimerOptions } from '../../Scene/Save/components/Timer/util'
import { summaryField, summaryPlainText, validSummaryParts, type SummaryPart } from './summaryParts'

/** 复用已有 Cron 解释库展示定时规则；不能解释的表达式保留原文，不投影成默认时间。 */
export function timerNodeSummaryParts(timer: OperationTimer, calendarTags: TimerCalendarTag[] = []): SummaryPart[] {
  if (timer.trigger === 'multi') {
    const specs = timer.multi?.spec || []
    if (!specs.length) return [summaryField(i18n.global.t('IotSceneLinkage.trigger.date'))]
    const relation = i18n.global.t(timer.multi?.type === 'and' ? 'IotSceneLinkage.rule.and' : 'IotSceneLinkage.rule.or')
    // 日历的每条规则有独立时间和执行模式，不能把多条规则压成同一个时间段。
    return specs.flatMap((spec, index) => {
      const options = handleTimerOptions(spec as OperationTimer)
      const names = (spec.scheduleTags || []).map((id: string) => calendarTags.find(tag => tag.id === id)?.name || i18n.global.t('IotSceneLinkage.timer.calendarCondition'))
      const parts = validSummaryParts([
        summaryField(names.join('、') || i18n.global.t('IotSceneLinkage.timer.calendarCondition')),
        summaryPlainText(' '), summaryField(options.time), summaryPlainText(' '), summaryField(options.extraTime),
      ])
      return [
        ...(index ? [summaryPlainText(` ${relation} `)] : []),
        ...(specs.length > 1 ? [summaryPlainText('（')] : []), ...parts,
        ...(specs.length > 1 ? [summaryPlainText('）')] : []),
      ]
    })
  }
  if ((timer.trigger === 'cron' || !timer.trigger) && timer.cron) {
    const locale = i18n.global.locale
    const language = typeof locale === 'string' ? locale : locale?.value || 'zh'
    try {
      return [summaryField(cronstrue.toString(timer.cron, { locale: language.startsWith('zh') ? 'zh_CN' : 'en', use24HourTimeFormat: true }))]
    } catch { return [summaryField(timer.cron)] }
  }
  if (!timer.trigger && !timer.once && !timer.period && !timer.when?.length) return []
  const options = handleTimerOptions(timer)
  return validSummaryParts([summaryField(options.when), summaryPlainText(' '), summaryField(options.time), summaryPlainText(' '), summaryField(options.extraTime)])
}
