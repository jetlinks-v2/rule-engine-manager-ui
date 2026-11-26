import { useI18n } from 'vue-i18n'
import { getParseTerm } from '../../../../../api/scene'
import { queryLevel } from '../../../../../api/config'
import { getTargetTypes } from '../../../../../api/configuration'
import { ActionAlarmMode } from '../../../typings'

import { withAlarmTermOptions, type AlarmOptions } from './util'

/** 条件编辑器及预览共用系统级别/目标类型；字典仅在当前编辑会话内复用，失败后允许重试。 */
export function useSceneTermColumns() {
  const { t } = useI18n()
  let definitions: Promise<Omit<AlarmOptions, 'alarmState'>> | undefined
  async function queryTermColumns(rule: Record<string, any>) {
    const response = await getParseTerm(rule)
    const trigger = rule.trigger || {}
    const alarm = trigger.type === 'alarm' || (trigger.multi?.triggers || []).some((item: any) => item.trigger?.type === 'alarm')
    if (!alarm || !Array.isArray(response.result)) return response
    definitions ||= Promise.all([queryLevel(), getTargetTypes()]).then(([levels, types]) => ({
      level: (levels.result?.levels || []).map((item: { level: number; title: string }) => ({ id: item.level, name: item.title })),
      targetType: (types.result || []).map((item: { id: string; name: string }) => ({ id: item.id, name: item.name })),
    })).catch(error => { definitions = undefined; throw error })
    const options = {
      ...await definitions,
      alarmState: Object.values(ActionAlarmMode).map(id => ({ id, name: t(`IotSceneLinkage.alarmMode.${id}`) })),
    }
    return { ...response, result: withAlarmTermOptions(response.result, trigger.type, options) }
  }
  return { queryTermColumns }
}
