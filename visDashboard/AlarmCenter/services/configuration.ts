import type { AlarmDashboardApi } from '../../../api/alarmDashboard'
import { isMetricKind, type AlarmDashboardKind, type AlarmQuickAction } from '../dashboard.types'
import { countOf, invalidResponse, isRecord, resultOf } from './query'

export type AlarmRuleSource = 'iot' | 'vision'
export type AlarmConfigurationStatus = 'loading' | 'configured' | 'missing' | 'error' | 'forbidden'
export type AlarmConfigurationState = Record<AlarmRuleSource, AlarmConfigurationStatus>
export interface AlarmConfigurationHint {
  source: AlarmRuleSource
  status: 'missing'
  action?: string
}
export const ruleSources: AlarmRuleSource[] = ['iot', 'vision']
export const pendingConfiguration = (): AlarmConfigurationState => ({ iot: 'loading', vision: 'loading' })

/** 兼容平台拒绝响应和 HTTP 异常；权限失败必须与规则不存在区分。 */
function isForbidden(value: unknown): boolean {
  if (!isRecord(value)) return false
  return String(value.status ?? value.code) === '403'
    || (isRecord(value.response) && (String(value.response.status) === '403' || isForbidden(value.response.data)))
}

/** 物联规则是设备属性预处理配置，不能用告警记录数或通用告警配置数代替。 */
function hasIotRules(payload: unknown): boolean {
  const result = resultOf(payload)
  const rows = Array.isArray(result) ? result : isRecord(result) ? result.data ?? result.records : undefined
  if (!Array.isArray(rows) || rows.some(row => !isRecord(row))) throw invalidResponse()
  if (rows.length) return true
  return isRecord(result) && result.total !== undefined ? countOf(result.total) > 0 : false
}

/** 各来源独立失败；只有合法的成功响应确认无配置时才返回 missing。 */
export async function loadRuleConfiguration(
  api: AlarmDashboardApi, source: AlarmRuleSource, signal: AbortSignal,
): Promise<AlarmConfigurationStatus> {
  try {
    const response = await (source === 'iot' ? api.queryIotRules(signal) : api.countVisionRules(signal))
    signal.throwIfAborted()
    if (isForbidden(response)) return 'forbidden'
    if (isRecord(response) && (response.success === false || Number(response.status) >= 400)) throw invalidResponse()
    const exists = source === 'iot' ? hasIotRules(response) : countOf(response) > 0
    return exists ? 'configured' : 'missing'
  } catch (error) {
    signal.throwIfAborted()
    return isForbidden(error) ? 'forbidden' : 'error'
  }
}

/** 顶部指标只展示统计值；下方板块按来源提供引导，不修改或过滤统计数据。 */
export function configurationHintsFor(
  kind: AlarmDashboardKind, state: AlarmConfigurationState, actions: AlarmQuickAction[], visionEnabled = true,
): AlarmConfigurationHint[] {
  const sources: AlarmRuleSource[] = kind === 'QuickStart' || isMetricKind(kind) ? []
    : kind === 'IotStatistics' || kind === 'IotHandlingStatistics' ? ['iot']
      : kind === 'AlarmTrend' || kind === 'HandlingStatistics' ? ruleSources : ['vision']
  return sources.filter(source => source !== 'vision' || visionEnabled).flatMap(source => {
    const status = state[source]
    if (status !== 'missing') return []
    const key = source === 'iot' ? 'iotRules' : 'visionRules'
    return [{ source, status, action: actions.some(action => action.key === key && !action.disabled) ? key : undefined }]
  })
}
