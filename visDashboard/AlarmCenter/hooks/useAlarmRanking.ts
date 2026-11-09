import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AlarmDimension, AlarmRankItem } from '../dashboard.types'

interface AlarmRankingOptions {
  open: boolean
  items: AlarmRankItem[]
  dimension: AlarmDimension
  preview: boolean
}

/** 基于完整排行就地搜索，保留原名次；轮询只校正失效页码，不重置搜索。 */
export function useAlarmRanking(props: AlarmRankingOptions) {
  const { t, locale } = useI18n()
  const keyword = ref('')
  const current = ref(1)
  const pageSize = ref(20)
  const rankedRows = computed(() => props.items.map((item, index) => ({
    ...item, rank: index + 1,
    name: props.preview && item.name.startsWith('preview.') ? t('alarmDashboard.' + item.name) : item.name,
  })))
  const rows = computed(() => {
    const search = keyword.value.trim().toLowerCase()
    return search ? rankedRows.value.filter(item => item.name.toLowerCase().includes(search)) : rankedRows.value
  })
  const searchPlaceholder = computed(() => t('alarmDashboard.rankSearchPlaceholder', {
    name: t('alarmDashboard.rankName.' + props.dimension),
  }))
  const emptyDescription = computed(() => t(keyword.value.trim() ? 'alarmDashboard.noMatchingRank' : 'alarmDashboard.noStatistics'))
  const columns = computed(() => [
    { title: t('alarmDashboard.rank'), dataIndex: 'rank', key: 'rank', width: 72 },
    { title: t('alarmDashboard.rankName.' + props.dimension), dataIndex: 'name', key: 'name', ellipsis: true },
    { title: t('alarmDashboard.count'), dataIndex: 'count', key: 'count', width: 120, align: 'right' as const,
      customRender: ({ text }: { text: number }) => text.toLocaleString(locale.value) },
  ])
  const pagination = computed(() => ({
    current: current.value, pageSize: pageSize.value, total: rows.value.length,
    showSizeChanger: true, pageSizeOptions: ['20', '50', '100'],
    showTotal: (total: number) => t('alarmDashboard.rankTotal', { total }),
    onChange: (page: number, size: number) => {
      current.value = size === pageSize.value ? page : 1
      pageSize.value = size
    },
  }))
  watch(keyword, () => { current.value = 1 })
  watch([() => props.dimension, () => props.open], () => { keyword.value = ''; current.value = 1 })
  watch([() => rows.value.length, pageSize], ([total, size]) => {
    current.value = Math.min(current.value, Math.max(1, Math.ceil(total / size)))
  })
  return { keyword, rows, columns, pagination, searchPlaceholder, emptyDescription }
}
