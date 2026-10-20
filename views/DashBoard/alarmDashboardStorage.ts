import CryptoJS from 'crypto-js'
import { dashboardKinds } from '../../visDashboard/AlarmCenter/dashboard.types'
import type { AlarmLayoutMode } from './alarmDashboardLayout'

/** 固定长度摘要保留原有作用域隔离，完整组件清单仅用于读取旧布局。 */
export function alarmDashboardStorageKeys(scope: string, saas: boolean, mode: AlarmLayoutMode) {
  const deployment = saas ? 'saas' : 'private'
  const scopeHash = CryptoJS.MD5(JSON.stringify([scope, deployment])).toString()
  return {
    key: `alarm-dashboard:v1:${scopeHash}:${mode}`,
    legacyKeys: [
      `alarm-center-dashboard-v1:${encodeURIComponent(scope)}:${deployment}:${mode}:${[...dashboardKinds].sort().join(',')}`,
    ],
  }
}
