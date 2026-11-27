import { metricMessages } from '../messages'
import { ruleDependencies, type TemplateRule } from './designer'
import type { MetricTemplate } from '../types'

/** 配置与只读说明共用语句；统计名称和参数仍取自后端目录。 */
export const windowMessages = {
  ja:{...metricMessages.ja,time_event:'データ時刻',time_hybrid:'データ時刻（なければ処理時刻）',timeEventHint:'データ自体の時刻に基づいてウィンドウに割り当て',windowExpectedUnset:'ウィンドウごとの想定データ件数を設定',windowCapacityUnset:'ウィンドウごとに保持する最大データ件数を設定',windowDataLead:'対象：',windowSourceEnd:'、取得範囲：',windowTimeDataEnd:'のデータから',windowCountDataEnd:'から',windowCalculate:'計算',windowSentenceEnd:'。',windowTimeLead:'取得の基準：',windowTimeEnd:'。',windowExpectedLead:'ウィンドウごとの想定件数：',windowExpectedEnd:'件。充足率の評価に使用します。',windowCapacityLead:'ウィンドウごとの保持上限：',windowCapacityEnd:'件。上限を超えると新しいデータを保持します。',windowCapacityHelp:'上限を超えると新しいデータを保持し、高頻度の報告によるメモリー使用量を制限します。',windowStatisticsInputs:'入力データ',windowStatisticUnavailable:'集計方式の説明を取得できません'},
  zh:{...metricMessages.zh,time_event:'数据时间',time_hybrid:'数据时间（缺失时使用处理时间）',timeEventHint:'按数据自身的时间归入窗口',windowExpectedUnset:'设置每个窗口的期望数据条数',windowCapacityUnset:'设置每个窗口保留的数据条数上限',windowDataLead:'取',windowSourceEnd:'',windowTimeDataEnd:'的数据，',windowCountDataEnd:'，',windowCalculate:'计算',windowSentenceEnd:'。',windowTimeLead:'按',windowTimeEnd:'取数。',windowExpectedLead:'每个窗口预期收到',windowExpectedEnd:'条数据，用于评估覆盖率。',windowCapacityLead:'每个窗口最多保留',windowCapacityEnd:'条数据，超出时保留较新的数据。',windowCapacityHelp:'超过上限时保留较新的数据，避免高频上报持续占用更多内存。',windowStatisticsInputs:'输入数据',windowStatisticUnavailable:'暂时无法读取统计方式说明'},
  en:{...metricMessages.en,time_event:'Data time',time_hybrid:'Data time (falling back to processing time)',windowExpectedUnset:'Set expected readings per window',windowCapacityUnset:'Set maximum retained readings per window',windowDataLead:'For',windowSourceEnd:', use',windowTimeDataEnd:'of data to',windowCountDataEnd:'to',windowCalculate:'calculate',windowSentenceEnd:'.',windowTimeLead:'Select readings by',windowTimeEnd:'.',windowExpectedLead:'Expect',windowExpectedEnd:'readings per window to assess coverage.',windowCapacityLead:'Keep at most',windowCapacityEnd:'readings per window; retain newer readings when exceeded.',windowCapacityHelp:'Keep the most recent readings when the limit is exceeded, bounding memory use for frequent reports.',windowStatisticsInputs:'input data',windowStatisticUnavailable:'Statistic details are currently unavailable'},
}

export function windowSourceLabel(template:MetricTemplate,rule:TemplateRule,separator:string):string {
  const ids=rule.sourceMetric ? [rule.sourceMetric] : ruleDependencies(rule)
  return ids.map(id=>template.inputDefinitions.find(item=>item.id===id)?.name || template.definitions.find(item=>item.id===id)?.name || id).join(separator)
}
