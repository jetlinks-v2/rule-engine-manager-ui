import cronstrue from 'cronstrue'
import 'cronstrue/locales/zh_CN'
import i18n from '@jetlinks-web-core/locales/index'
import type { OperationTimer } from '../../Scene/typings'
import { handleTimerOptions } from '../../Scene/Save/components/Timer/util'
import { summaryField, summaryPlainText, validSummaryParts, type SummaryPart } from './summaryParts'

/** 复用已有 Cron 解释库展示定时规则；不能解释的表达式保留原文，不投影成默认时间。 */
export function timerNodeSummaryParts(timer: OperationTimer): SummaryPart[] {
  if (timer.trigger === 'cron' && timer.cron) {
    const locale = i18n.global.locale
    const language = typeof locale === 'string' ? locale : locale?.value || 'zh'
    try {
      return [summaryField(cronstrue.toString(timer.cron, { locale: language.startsWith('zh') ? 'zh_CN' : 'en', use24HourTimeFormat: true }))]
    } catch { return [summaryField(timer.cron)] }
  }
  const options = handleTimerOptions(timer)
  return validSummaryParts([summaryField(options.when), summaryPlainText(' '), summaryField(options.time), summaryPlainText(' '), summaryField(options.extraTime)])
}
