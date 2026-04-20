export const alarmCountCardConfig = {
  name: '告警数量',
  type: 'alarmCountCard',
  componentProps: {
    style: {
      independence: false,
      gridLayout: {}
    },
    gridItem: {
      x: 0,
      y: 0,
      w: 2,
      h: 4,
      minW: 2,
      minH: 4
    },
    alarmCountCard: {
      topTitle: '告警统计',
      fallbackName: 'Total',
      iconType: 'WarningFilled',
      iconColor: '#df474f',
      valueColor: '#1f1f1f',
      mockValue: 3,
      emptyText: '请先绑定告警数量数据源'
    }
  }
}
