import CryptoJS from 'crypto-js'
import { legacyDashboardKinds, type AlarmCapabilities } from '../../visDashboard/AlarmCenter/dashboard.types'
import type { AlarmLayoutMode } from './alarmDashboardLayout'

/** 固定长度摘要保留原有作用域隔离，完整组件清单仅用于读取旧布局。 */
export function alarmDashboardStorageKeys(scope: string, saas: boolean, mode: AlarmLayoutMode, capabilities?: Pick<AlarmCapabilities, 'events' | 'vision'>) {
  const deployment = saas ? 'saas' : 'private'
  const scopeHash = CryptoJS.MD5(JSON.stringify([scope, deployment])).toString()
  // 不用精简组件集合恢复完整布局，防止画布清掉用户仍需要保留的旧记录。
  const restricted = capabilities && (!capabilities.events || !capabilities.vision)
  return {
    key: `alarm-dashboard:v1:${scopeHash}:${mode}${restricted ? `:sources:${Number(capabilities.events)}${Number(capabilities.vision)}` : ''}`,
    legacyKeys: restricted ? [] : [
      `alarm-center-dashboard-v1:${encodeURIComponent(scope)}:${deployment}:${mode}:${[...legacyDashboardKinds].sort().join(',')}`,
    ],
  }
}
