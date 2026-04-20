import alarmConfigImg from '@rule-engine-manager-ui/assets/alarm/alarm-config.png'

export const alarmConfigCardConfig = {
  name: '告警配置',
  type: 'alarmConfigCard',
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
    alarmConfigCard: {
      topTitle: '告警配置',
      bottomLeftTitle: '正常',
      bottomLeftStatus: 'success',
      bottomRightTitle: '禁用',
      bottomRightStatus: 'error',
      hoverTip: true,
      color: '#D3ADF7',
      type: 'all',
      isAutoRefresh: true,
      interval: 5,
      img: alarmConfigImg
    }
  }
}
