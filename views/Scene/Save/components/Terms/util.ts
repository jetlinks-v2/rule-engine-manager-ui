import i18n from '@jetlinks-web-core/locales/index'
import { BranchesThen } from '../../../typings'
import { omit } from 'lodash-es'
const $t = i18n.global.t
export const ContextKey = 'columnOptions'
export const ColumnOptionsMapKey = 'columnOptionsMap'
export const arrayParamsKey: Array<string | undefined> = ['nbtw', 'btw', 'in', 'nin', 'contains_all', 'contains_any', 'not_contains']
export const doubleParamsKey: Array<string | undefined> = ['nbtw','btw']
export const timeTypeKeys: Array<string | undefined> = ['time_gt_now', 'time_lt_now']
export const nullKeys: Array<string | undefined> = ['notnull', 'isnull']

export const handleParamsData = (data: any[], key: string = 'column', parentId?: string): any[] => {
  return data?.map((item, index) => {
    const hasChildren = !!item.children?.length

    let keyValue = item[key]

    if (hasChildren && key === 'column') {
      keyValue = item[key] + index
    }

    return {
      ...item,
      key: keyValue,
      disabled: hasChildren,
      children: handleParamsData(item.children, key, item[key])
    }
  }) || []
}

export const handleParamsDataMap = (data: any[], key: string = 'column', pId?: string) => {
  let _map = new Map()

  data?.forEach((item, index) => {
    const hasChildren = !!item.children?.length
    let keyValue = item[key]

    if (hasChildren && key === 'column') {
      keyValue = item[key] + index
    }

    _map.set(keyValue, {
      ...omit(item, ['children']),
      pId: pId,
    })

    if (hasChildren) {
      _map = new Map([..._map, ...handleParamsDataMap(item.children, key, item[key])])
    }
  })

  return _map
}

export const thenRules = [{
  validator(_: string, value: BranchesThen[]) {
    if (!value || (value && !value.length) || !value.some(item => item.actions && item.actions.length)) {
      return Promise.reject($t('Terms.util.9093424-0'))
    }
    return Promise.resolve();
  }
}]

type Option = { id: string | number; name: string }
export type SceneTermColumn = {
  column?: string
  dataType?: string
  options?: Option[]
  children?: SceneTermColumn[]
  others?: { _multiTriggerType?: string; [key: string]: unknown }
  [key: string]: unknown
}
export type AlarmOptions = { level: Option[]; targetType: Option[]; alarmState: Option[] }

/** 只补全告警事件源的枚举元数据，保留接口的操作符、事件源索引及设备字段。 */
export function withAlarmTermOptions(columns: SceneTermColumn[], triggerType: string, options: AlarmOptions): SceneTermColumn[] {
  return columns.map(column => {
    const type = column.others?._multiTriggerType || triggerType
    const values = type === 'alarm' ? options[column.column as keyof AlarmOptions] : undefined
    return {
      ...column,
      ...(values?.length && !column.options?.length ? { dataType: 'enum', options: values } : {}),
      ...(column.children ? { children: withAlarmTermOptions(column.children, type, options) } : {}),
    }
  })
}
