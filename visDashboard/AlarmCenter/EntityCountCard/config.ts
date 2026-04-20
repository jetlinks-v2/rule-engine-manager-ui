export const entityCountCardConfig = {
  name: '实体数量',
  type: 'entityCountCard',
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
    entityCountCard: {
      topTitle: '告警配置',
      customLabel: 'Device',
      fallbackName: 'Device',
      iconType: 'DeploymentUnitOutlined',
      iconColor: '#f08a18',
      valueColor: '#1f1f1f',
      mockValue: 96,
      emptyText: '请先绑定实体数量数据源'
    }
  }
}
