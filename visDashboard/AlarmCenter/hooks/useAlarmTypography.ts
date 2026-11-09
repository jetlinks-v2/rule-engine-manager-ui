import { computed } from 'vue'

/** 对齐资源中心消息趋势的默认图表字体与辅助色，HTML 文字继续继承页面字体。 */
export function useAlarmTypography() {
  return computed(() => ({
    fontFamily: 'sans-serif',
    fontSize: 12,
    fontWeight: 400 as const,
    color: '#86909c',
  }))
}
