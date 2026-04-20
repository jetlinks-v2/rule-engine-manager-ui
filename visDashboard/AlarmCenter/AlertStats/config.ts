export const alertStatsConfig = {
  name: '告警统计',
  type: 'alertStats',
  componentProps: {
    style: {
      independence: false,
      gridLayout: {}
    },
    gridItem: {
      x: 0,
      y: 0,
      w: 12,
      h: 16,
      minW: 6,
      minH: 8
    },
    alertStats: {
      topTitle: '设备告警统计',
      targetType: ['device'],
      quickBtn: true,
      defaultType: 'week',
      hoverTip: true,
      hoverTitle: '告警量',
      color: '#ADC6FF',
      isAutoRefresh: true,
      interval: 5
    }
  }
}
