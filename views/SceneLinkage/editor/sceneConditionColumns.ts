import { parseSceneVariables, querySceneTermColumns } from '../../../api/scene-linkage'
import { buildRequest, type SceneConditionColumns, type SceneLinkageForm } from '../utils'

type SceneVariable = {
  id?: string
  column?: string
  termTypes?: Array<{ id?: string }>
  children?: SceneVariable[]
}

const resultData = (response: any): SceneVariable[] => {
  const result = response?.result ?? response
  return Array.isArray(result) ? result : result?.data || []
}

const flattenVariables = (variables: SceneVariable[]): SceneVariable[] => variables.flatMap(variable => [variable, ...flattenVariables(variable.children || [])])

const columnOf = (variable?: SceneVariable) => variable?.column || variable?.id

const timeTermType = (variable?: SceneVariable) => variable?.termTypes?.find(item => item.id?.includes('time'))?.id || variable?.termTypes?.find(item => item.id === 'btw')?.id

export const resolveSceneConditionColumns = async (form: SceneLinkageForm): Promise<SceneConditionColumns> => {
  if (!form.additionalConditions.length) return {}

  const draft = buildRequest(form)
  const deviceConditions = form.additionalConditions.filter(condition => condition.type === 'deviceProperty')
  const alarmStateConditions = form.additionalConditions.filter(condition => condition.type === 'alarmState')
  let actionIndex = 0
  const conditionActions = form.additionalConditions.flatMap(condition => {
    if (condition.type === 'timeRange') return []
    return [{ type: condition.type, action: actionIndex++ }]
  })
  const [termColumnsResponse, actionVariablesResponse] = await Promise.all([
    querySceneTermColumns(draft),
    // 解析最后一个条件动作即可获得此前所有串行动作输出，避免按条件逐条请求。
    conditionActions.length
      ? parseSceneVariables(draft, { branch: 0, branchGroup: 0, action: conditionActions.length })
      : Promise.resolve([]),
  ])
  const availableVariables = flattenVariables(resultData(termColumnsResponse))
  const actionVariables = flattenVariables(resultData(actionVariablesResponse))
  const timeVariable = availableVariables.find(variable => columnOf(variable) === '_now')
  const getConditionActionVariables = (type: string, occurrence: number) => {
    const conditionAction = conditionActions.filter(action => action.type === type)[occurrence]
    if (!conditionAction) return []
    const actionId = `branch_1_group_1_action_${conditionAction.action + 1}`
    return actionVariables.filter(variable => variable.id === actionId || variable.id?.startsWith(`${actionId}.`))
  }

  return {
    timeColumn: columnOf(timeVariable),
    timeTermType: timeTermType(timeVariable),
    devicePropertyColumns: deviceConditions.map((condition, index) => {
      const propertyId = `properties.${condition.propertyId}`
      const propertyVariables = getConditionActionVariables('deviceProperty', index)
        .filter(variable => [variable.id, variable.column]
          .filter(Boolean)
          .some(path => path === propertyId
            || path!.endsWith(`.${propertyId}`)
            || path!.startsWith(`${propertyId}.`)
            || path!.includes(`.${propertyId}.`)))
      // 原版 FilterGroup 用 parse-variables 的 id 作为 term.column；column 只是变量的局部路径，缺少动作前缀。
      const propertyVariable = propertyVariables.find(variable => !variable.children?.length
        && variable.termTypes?.some(termType => termType.id === condition.termType))
        || propertyVariables.find(variable => variable.termTypes?.some(termType => termType.id === condition.termType))
      return propertyVariable?.id
    }),
    alarmStateColumns: alarmStateConditions.map((_condition, index) => {
      const conditionAction = conditionActions.filter(action => action.type === 'alarmState')[index]
      const actionId = `branch_1_group_1_action_${(conditionAction?.action || 0) + 1}`
      const variables = getConditionActionVariables('alarmState', index)
      // 告警查询动作的布尔输出由后端声明，条件只能引用 parse-variables 返回的变量 ID。
      return variables.find(variable => (variable.id === actionId || variable.id?.startsWith(`${actionId}.`))
        && variable.termTypes?.some(termType => termType.id === 'eq'))?.id
    }),
  }
}
