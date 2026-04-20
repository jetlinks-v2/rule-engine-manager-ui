export const todayAlarmCardConfig = {
  name: '今日告警',
  type: 'todayAlarmCard',
  componentProps: {
    style: {
      independence: false,
      gridLayout: {}
    },
    gridItem: {
      x: 0,
      y: 0,
      w: 4,
      h: 5,
      minW: 3,
      minH: 5
    },
    todayAlarmCard: {
      topTitle: '今日告警',
      bottomTitle: '当月告警',
      hoverTitle: '告警量',
      hoverTip: true,
      color: '#D3ADF7',
      isAutoRefresh: true,
      interval: 5
    }
  }
}
