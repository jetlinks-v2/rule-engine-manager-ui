import type { MetricAggregationDescriptor } from '../types'
import type { TemplateWindow } from './window'

/** 展示只投影引擎声明，未知配置保留原标识，不伪造能力或说明。 */
export function aggregationIcon(value:string | undefined,catalog:MetricAggregationDescriptor[] = []):string {
  return catalog.find(item=>item.id === value)?.icon || 'BarChartOutlined'
}

export function aggregationName(value:string,catalog:MetricAggregationDescriptor[] = []):string {
  return catalog.find(item=>item.id === value)?.name || value
}

export function aggregationOptions(catalog:MetricAggregationDescriptor[],mode:TemplateWindow['mode'],unavailable:string) {
  return catalog.map(item => ({ value:item.id, label:item.name, icon:item.icon, formula:item.documentation?.formula,
    symbols:item.documentation?.symbols, disabled:!item.windowModes.includes(mode || 'none'),
    description:item.windowModes.includes(mode || 'none') ? item.description : unavailable }))
}
