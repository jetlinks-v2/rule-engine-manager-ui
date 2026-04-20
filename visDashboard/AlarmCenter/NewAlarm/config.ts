export const newAlarmConfig = {
  name: '最新告警',
  type: 'newAlarm',
  componentProps: {
    style: {
      independence: false,
      gridLayout: {}
    },
    gridItem: {
      x: 0,
      y: 0,
      w: 6,
      h: 5,
      minW: 6,
      minH: 5
    },
    newAlarm: {
      maxCount: 3,
      isAutoRefresh: true,
      interval: 5
    }
  }
}
