import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'
import { computed, ref, type Ref } from 'vue'
import type {
  CountSummaryCardInfo,
  CountSummaryCardProps,
  CountSummaryComponentConfig,
  CountSummaryDataItem,
  CountSummaryMetricViewModel
} from '../shared'
import { mergeCountSummaryConfig } from '../shared'

interface DashboardDataHookResult {
  dataSourceList: Ref<CountSummaryDataItem[]>
  getValue: (record: CountSummaryDataItem) => unknown
}

type DashboardDataHook = (
  props: Readonly<CountSummaryCardProps>,
  componentKey: string
) => DashboardDataHookResult

const createFallbackDashboardData = (): DashboardDataHookResult => ({
  dataSourceList: ref([]),
  getValue: () => undefined
})

const resolveDashboardDataHook = () => {
  const { useDashboardData } = moduleRegistry.getResource('visualization-dashboard-ui', 'hooks') as {
    useDashboardData?: DashboardDataHook
  }

  return {
    hook: useDashboardData,
    error: useDashboardData ? '' : '未注册 visualization-dashboard-ui 的仪表盘数据能力'
  }
}

const stringifyMetricValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return '--'
  }

  return `${value}`
}

export const useCountSummaryCard = (
  props: Readonly<CountSummaryCardProps>,
  componentKey: string,
  defaults: CountSummaryComponentConfig
) => {
  const { hook, error: hookError } = resolveDashboardDataHook()
  const dataState = hook ? hook(props, componentKey) : createFallbackDashboardData()

  const error = ref(hookError)

  const config = computed(() =>
    mergeCountSummaryConfig(
      defaults,
      props.info?.componentProps?.[componentKey] as Partial<CountSummaryComponentConfig> | undefined
    )
  )

  const hasBinding = computed(() => {
    const options = props.info?.extraProps?.options
    return Array.isArray(options) && options.length > 0
  })

  const hasSubscription = computed(() => {
    const subscriptions = props.info?.dataSourceProps
    return Array.isArray(subscriptions) && subscriptions.length > 0
  })

  const currentItem = computed(() => dataState.dataSourceList.value[0])

  const currentValue = computed(() => {
    const item = currentItem.value
    if (!item) {
      return undefined
    }

    if (item.isMock) {
      return item.value
    }

    return dataState.getValue(item) ?? item.value
  })

  const loading = computed(() => {
    if (props.isEdit || !hasBinding.value || !hasSubscription.value) {
      return false
    }

    const value = currentValue.value
    return value === undefined || value === null || value === ''
  })

  const empty = computed(() => !props.isEdit && !hasBinding.value && !error.value)

  const metric = computed<CountSummaryMetricViewModel>(() => {
    const label = config.value.customLabel
      || currentItem.value?.name
      || currentItem.value?.mappingName
      || config.value.fallbackName
    const previewValue = props.isEdit ? config.value.mockValue : currentValue.value

    return {
      topTitle: config.value.topTitle,
      badgeText: config.value.badgeText,
      tooltip: config.value.tooltip,
      label: `${label || config.value.fallbackName}`,
      value: stringifyMetricValue(previewValue ?? config.value.mockValue),
      iconType: config.value.iconType,
      iconColor: config.value.iconColor,
      valueColor: config.value.valueColor,
      emptyText: config.value.emptyText
    }
  })

  return {
    metric,
    loading,
    empty,
    error
  }
}
