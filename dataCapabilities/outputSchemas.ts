import i18n from '@jetlinks-web-core/locales'
import type { CapabilitySchema } from '@jetlinks-web-core/data-capability'

const t = (key: string) => String(i18n.global.t(key))

const createFields = (prefix: string) => {
  const title = (key: string) => t(`${prefix}.${key}`)
  return {
    title,
    text: (key: string): CapabilitySchema => ({
      type: 'string',
      title: title(key),
    }),
    number: (key: string): CapabilitySchema => ({
      type: 'number',
      title: title(key),
    }),
    integer: (key: string, format?: string): CapabilitySchema => ({
      type: 'integer',
      title: title(key),
      ...(format ? { format } : {}),
    }),
    boolean: (key: string): CapabilitySchema => ({
      type: 'boolean',
      title: title(key),
    }),
    array: (
      key: string,
      properties: Record<string, CapabilitySchema>,
    ): CapabilitySchema => ({
      type: 'array',
      title: title(key),
      items: { type: 'object', properties },
    }),
  }
}

const device = createFields('AlarmDataCapability.output')
const vision = createFields('VisionAlarmDataCapability.output')

/** 编辑器以此公开契约生成可绑定字段；响应字段 key 保持稳定，title 只负责用户可见名称。 */
export const deviceAlarmOutputSchemas = {
  summary: {
    type: 'object',
    properties: {
      total: device.integer('total'),
      active: device.integer('active'),
      handled: device.integer('handled'),
      urgent: device.integer('urgent'),
      deviceCount: device.integer('deviceCount'),
      sampleTime: device.integer('sampleTime', 'timestamp-ms'),
    },
  },
  activeDeviceIds: {
    type: 'array',
    title: device.title('activeDeviceIdsRoot'),
    items: { type: 'string' },
  },
  rank: device.array('rankRoot', {
    rank: device.integer('rank'),
    deviceId: device.text('deviceId'),
    deviceName: device.text('deviceName'),
    count: device.integer('count'),
  }),
  list: device.array('root', {
    alarmId: device.text('alarmId'),
    deviceId: device.text('deviceId'),
    deviceName: device.text('deviceName'),
    alarmName: device.text('alarmName'),
    level: device.integer('level'),
    levelText: device.text('levelText'),
    state: device.text('state'),
    stateText: device.text('stateText'),
    content: device.text('content'),
    alarmTime: device.integer('alarmTime', 'timestamp-ms'),
    handleTime: device.integer('handleTime', 'timestamp-ms'),
    durationMillis: device.integer('durationMillis', 'duration-ms'),
  }),
} satisfies Record<string, CapabilitySchema>

const recognitionOutputSchema = vision.array('recognitions', {
  label: vision.text('recognitionLabel'),
  confidence: vision.number('confidence'),
  top: vision.number('top'),
  left: vision.number('left'),
  right: vision.number('right'),
  bottom: vision.number('bottom'),
  unit: vision.text('unit'),
})

/** 视联告警各数据源使用独立 schema，避免真实响应推断把技术字段名暴露给用户。 */
export const visionAlarmOutputSchemas = {
  summary: {
    type: 'object',
    properties: {
      total: vision.integer('total'),
      active: vision.integer('active'),
      handled: vision.integer('handled'),
      activeRate: vision.number('activeRate'),
      handledRate: vision.number('handledRate'),
      sampleTime: vision.integer('sampleTime', 'timestamp-ms'),
      alarmCount: vision.integer('alarmCount'),
      alarmCameraCount: vision.integer('alarmCameraCount'),
    },
  },
  trend: vision.array('trendRoot', {
    timestamp: vision.integer('timestamp', 'timestamp-ms'),
    count: vision.integer('count'),
  }),
  typeDistribution: vision.array('typeDistributionRoot', {
    typeId: vision.text('typeId'),
    typeName: vision.text('typeName'),
    count: vision.integer('count'),
    rate: vision.number('rate'),
  }),
  levelDistribution: vision.array('levelDistributionRoot', {
    level: vision.integer('level'),
    levelText: vision.text('levelText'),
    count: vision.integer('count'),
    rate: vision.number('rate'),
    isHighest: vision.boolean('isHighest'),
  }),
  sceneDistribution: vision.array('sceneDistributionRoot', {
    sceneId: vision.text('sceneId'),
    sceneName: vision.text('sceneName'),
    count: vision.integer('count'),
  }),
  sceneRank: vision.array('sceneRankRoot', {
    rank: vision.integer('rank'),
    sceneId: vision.text('sceneId'),
    sceneName: vision.text('sceneName'),
    count: vision.integer('count'),
    rate: vision.number('rate'),
  }),
  list: vision.array('listRoot', {
    alarmId: vision.text('alarmId'),
    typeId: vision.text('typeId'),
    typeName: vision.text('typeName'),
    channelId: vision.text('channelId'),
    channelName: vision.text('channelName'),
    location: vision.text('location'),
    level: vision.integer('level'),
    levelText: vision.text('levelText'),
    state: vision.text('state'),
    stateText: vision.text('stateText'),
    content: vision.text('content'),
    alarmTime: vision.integer('alarmTime', 'timestamp-ms'),
    handleTime: vision.integer('handleTime', 'timestamp-ms'),
    imageUrl: vision.text('imageUrl'),
    targetCount: vision.integer('targetCount'),
    confidence: vision.number('confidence'),
    canHandle: vision.boolean('canHandle'),
    recognitions: recognitionOutputSchema,
  }),
  levelTrend: vision.array('root', {
    timestamp: vision.integer('timestamp', 'timestamp-ms'),
    level: vision.integer('level'),
    levelText: vision.text('levelText'),
    count: vision.integer('count'),
    total: vision.integer('total'),
  }),
  handlingTrend: vision.array('handlingTrendRoot', {
    timestamp: vision.integer('timestamp', 'timestamp-ms'),
    activeCount: vision.integer('activeCount'),
    handledCount: vision.integer('handledCount'),
    handledRate: vision.number('handledRate'),
  }),
  channelRank: vision.array('channelRankRoot', {
    rank: vision.integer('rank'),
    channelId: vision.text('channelId'),
    channelName: vision.text('channelName'),
    count: vision.integer('count'),
    rate: vision.number('rate'),
  }),
  aiReview: {
    type: 'object',
    properties: {
      total: vision.integer('total'),
      valid: vision.integer('valid'),
      filtered: vision.integer('filtered'),
      validRate: vision.number('validRate'),
      previousValidRate: vision.number('previousValidRate'),
      validRateDelta: vision.number('validRateDelta'),
      filterRate: vision.number('filterRate'),
      startTime: vision.integer('startTime', 'timestamp-ms'),
      endTime: vision.integer('endTime', 'timestamp-ms'),
      sampleTime: vision.integer('sampleTime', 'timestamp-ms'),
    },
  },
  eventSummary: {
    type: 'object',
    properties: {
      total: vision.integer('total'),
      totalChangeRate: vision.number('totalChangeRate'),
      todayCreated: vision.integer('todayCreated'),
      todayCreatedChangeRate: vision.number('todayCreatedChangeRate'),
      active: vision.integer('active'),
      activeChangeRate: vision.number('activeChangeRate'),
      handled: vision.integer('handled'),
      handled24h: vision.integer('handled24h'),
      handled24hChangeRate: vision.number('handled24hChangeRate'),
      avgHandleDurationMillis: vision.integer('avgHandleDurationMillis', 'duration-ms'),
      avgHandleDurationChangeRate: vision.number('avgHandleDurationChangeRate'),
      activeRate: vision.number('activeRate'),
      handledRate: vision.number('handledRate'),
      sampleTime: vision.integer('sampleTime', 'timestamp-ms'),
    },
  },
  eventList: vision.array('eventListRoot', {
    alarmId: vision.text('alarmId'),
    source: vision.text('source'),
    categoryId: vision.text('categoryId'),
    categoryName: vision.text('categoryName'),
    deviceId: vision.text('deviceId'),
    deviceName: vision.text('deviceName'),
    channelId: vision.text('channelId'),
    channelName: vision.text('channelName'),
    location: vision.text('location'),
    level: vision.integer('level'),
    levelText: vision.text('levelText'),
    state: vision.text('state'),
    stateText: vision.text('stateText'),
    content: vision.text('content'),
    alarmTime: vision.integer('alarmTime', 'timestamp-ms'),
    handleTime: vision.integer('handleTime', 'timestamp-ms'),
    durationMillis: vision.integer('durationMillis', 'duration-ms'),
  }),
} satisfies Record<string, CapabilitySchema>
