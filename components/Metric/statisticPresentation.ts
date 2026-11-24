import type { MetricTemplateOutput, MetricValue } from './types'
import { metricMessages } from './messages'
import { durationParts } from './template/window'
import { durationUnitText } from './template/durationPresentation'

export const statisticMessages = {
  zh:{...metricMessages.zh,statistic_level:'数值统计',statistic_total:'合计',statistic_count:'样本计数',statistic_extent:'极差',statistic_variance:'总体方差',statistic_deviation:'总体标准差',statistic_rate:'变化速度',statisticPoints:'最近 {count} 条',statisticRecent:'最近 {duration}',statisticPp:'百分点',statisticZero:'零基线'},
  en:{...metricMessages.en,statistic_level:'Value statistic',statistic_total:'Total',statistic_count:'Sample count',statistic_extent:'Range',statistic_variance:'Population variance',statistic_deviation:'Population standard deviation',statistic_rate:'Rate of change',statisticPoints:'Last {count} readings',statisticRecent:'Last {duration}',statisticPp:'pp',statisticZero:'Zero baseline'},
}

type Translate = (key:string,values?:Record<string,string|number>)=>string
export function statisticDuration(value:string|undefined,t:Translate):string | undefined {
  const parts=durationParts(value)
  return parts && parts.amount>0 ? `${parts.amount} ${durationUnitText(parts.unit,parts.amount,t)}` : undefined
}

/** 实际结果的单位优先。其余单位来自固定模板的后端描述，不根据算法编码猜测。 */
export function metricStatisticUnit(output:MetricTemplateOutput|undefined,t:Translate,value?:Pick<MetricValue,'unit'>,fallback?:string):string | undefined {
  if (value?.unit) return value.unit
  const meaning=output?.resultSemantics
  if (!meaning) return output?.unit || fallback
  if (meaning.statistic.unitRule==='count') return undefined
  const unit=meaning.unit?.replace(/\bpp\b/g,t('statisticPp'))
  if (meaning.statistic.unitRule==='perTime') {
    const time=durationParts(meaning.timeUnit || undefined)
    const denominator=time?.amount===1 ? durationUnitText(time.unit,1,t) : statisticDuration(meaning.timeUnit || undefined,t)
    return unit && denominator ? `${unit} / ${denominator}` : output?.unit || fallback
  }
  // 无法推导时保留用户明确声明的完整输出单位，不把它再当输入单位变换。
  return unit || output?.unit || fallback
}

export function metricStatisticBaseline(output?:MetricTemplateOutput):'centered'|'zero'|undefined {
  const kind=output?.resultSemantics?.statistic.characteristic
  return kind==='rate' ? 'centered' : ['variance','deviation','extent','count'].includes(kind || '') ? 'zero' : undefined
}

/** 仅增加正号，不转换高精度数值字符串，也不把正负方向解读为好坏。 */
export function metricStatisticSigned(text:string,value:unknown,output?:MetricTemplateOutput):string {
  return output?.resultSemantics?.statistic.characteristic==='rate' && (typeof value==='number' || typeof value==='string') && text!=='—' && Number(value)>0 ? `+${text}` : text
}
