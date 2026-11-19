import {
  getAiVisualAlarmTask, queryAiVisualAlarmTasks,
  type AiVisualAlarmTask, type AiVisualAlarmTaskOption,
} from '../../../api/scene-linkage'
import { normalizeResult } from '../utils'

export const VISUAL_ALARM_PAGE_SIZE = 30
export type VisualAlarmTaskScope = { sceneId?: string; taskTarget?: string }
export type SelectedVisualAlarmTaskIssue = 'unavailable' | 'loadFailed'

function assertSuccess(response: unknown) {
  const value = response as { success?: boolean; status?: number }
  if (value?.success === false || (value?.status != null && value.status !== 200)) {
    throw Object.assign(new Error('Visual alarm task query failed'), { status: value.status })
  }
}

/** 任务引用保持迁移前的 ID，展示字段从触发配置和首个告警操作提取。 */
export function toVisualAlarmTaskOption(task: AiVisualAlarmTask): AiVisualAlarmTaskOption | undefined {
  const config = task.trigger?.config
  if (task.type !== 'visualAlarm' || !config?.sceneId || !config.taskTarget) return undefined
  const alarm = task.actions?.find(action => action.type === 'alarm')?.config
  return {
    id: task.id, name: task.name || task.id, sceneId: config.sceneId,
    taskTargets: [{ value: config.taskTarget, text: config.taskTarget }],
    sourceCount: config.targets?.length || 0, alarmLevel: alarm?.alarmLevel,
    timerPeriodSpec: alarm?.timerPeriodSpec, state: task.enabled ? 'enabled' : 'disabled',
  }
}

/** 历史已选任务独立按 ID 回读，不受当前分页影响；读权限仍由任务接口校验。 */
export async function loadVisualAlarmTaskPage(pageIndex: number, scope: VisualAlarmTaskScope = {}, selectedId?: string, keyword = '') {
  const search = keyword.trim()
  const response = await queryAiVisualAlarmTasks({
    pageIndex, pageSize: VISUAL_ALARM_PAGE_SIZE,
    sorts: [{ name: 'createTime', order: 'desc' }, { name: 'id', order: 'asc' }],
    terms: search ? [{ column: 'name', termType: 'like', value: `%${search}%` },
      { column: 'id', termType: 'like', value: `%${search}%`, type: 'or' }] : [],
  }, scope)
  assertSuccess(response)
  const page = normalizeResult<AiVisualAlarmTask>(response)
  const tasks = page.data.flatMap(task => {
    const option = toVisualAlarmTaskOption(task)
    return option ? [option] : []
  })
  let selectedTaskIssue: SelectedVisualAlarmTaskIssue | undefined
  if (pageIndex === 0 && selectedId && !tasks.some(task => task.id === selectedId)) {
    try {
      const response = await getAiVisualAlarmTask(selectedId)
      assertSuccess(response)
      const raw = (response as { result?: AiVisualAlarmTask }).result || response as unknown as AiVisualAlarmTask
      const selected = toVisualAlarmTaskOption(raw)
      if (selected && (!scope.sceneId || selected.sceneId === scope.sceneId)
        && (!scope.taskTarget || selected.taskTargets.some(target => target.value === scope.taskTarget))) tasks.unshift(selected)
      else selectedTaskIssue = 'unavailable'
    } catch (error) {
      // 历史引用可能被删除或撤权；保留已授权的分页结果，不将旧引用伪造为有效任务。
      const status = (error as { status?: number; response?: { status?: number } })?.response?.status
        ?? (error as { status?: number })?.status
      selectedTaskIssue = status === 403 || status === 404 ? 'unavailable' : 'loadFailed'
    }
  }
  return { data: tasks, total: page.total, hasMore: (pageIndex + 1) * VISUAL_ALARM_PAGE_SIZE < page.total, selectedTaskIssue }
}
