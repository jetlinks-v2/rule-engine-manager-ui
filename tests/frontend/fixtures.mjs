export const metadata = {
  properties: [
    {
      id: 'temperature',
      name: '温度',
      valueType: { type: 'int', unit: 'celsius' },
      expands: { type: ['read', 'write', 'report'] },
    },
    {
      id: 'enabled',
      name: '开关',
      valueType: { type: 'boolean', trueText: '开启', falseText: '关闭' },
      expands: { type: ['read', 'write', 'report'] },
    },
  ],
  functions: [
    {
      id: 'start',
      name: '启动',
      inputs: [{ id: 'duration', name: '持续时间', valueType: { type: 'int' }, expands: { required: true } }],
      output: { type: 'boolean' },
    },
  ],
  events: [
    {
      id: 'alarm',
      name: '超温事件',
      valueType: {
        type: 'object',
        properties: [{ id: 'value', name: '温度值', valueType: { type: 'int' } }],
      },
    },
  ],
  tags: [{ id: 'location', name: '位置', valueType: { type: 'string' } }],
}
export const products = [
  {
    id: 'p-full',
    name: '测试温控产品',
    state: 1,
    deviceType: { value: 'device', text: '直连设备' },
    accessName: 'MQTT',
    classifiedId: 'category-1',
    metadata: JSON.stringify(metadata),
  },
  {
    id: 'p-read',
    name: '只读产品',
    state: 1,
    deviceType: { value: 'device', text: '直连设备' },
    metadata: JSON.stringify({ properties: [{ ...metadata.properties[0], expands: { type: ['read'] } }] }),
  },
  {
    id: 'p-empty',
    name: '空物模型产品',
    state: 1,
    deviceType: { value: 'device', text: '直连设备' },
    metadata: '{}',
  },
]
export const devices = products.flatMap((p) =>
  [1, 2].map((index) => ({
    id: `${p.id}-d${index}`,
    name: `${p.name}设备${index}`,
    productId: p.id,
    productName: p.name,
    metadata: p.metadata,
    state: { value: 'online', text: '在线' },
    online: true,
  })),
)
export const triggerProviders = [
  ['manual', '手动触发'],
  ['device', '设备触发'],
  ['timer', '定时触发'],
  ['collector', '采集器触发'],
  ['alarm', '告警触发'],
  ['multi', '多触发'],
  ['ai-event', '视觉事件'],
].map(([provider, name]) => ({ provider, name, description: name }))
export const actionProviders = [
  ['device', '设备指令'],
  ['device-data', '获取设备信息'],
  ['delay', '延迟执行'],
  ['sceneNotify', '消息通知'],
  ['collector', '采集器输出'],
  ['alarm-record-query', '查询告警记录'],
  ['notify', '旧版通知'],
  ['alarm', '触发告警'],
].map(([provider, name]) => ({ provider, name, description: name }))
const terms = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'isnull', 'notnull', 'btw'].map((id) => ({
  id,
  name:
    {
      eq: '等于',
      neq: '不等于',
      gt: '大于',
      gte: '大于等于',
      lt: '小于',
      lte: '小于等于',
      in: '包含',
      nin: '不包含',
      btw: '范围内',
    }[id] || id,
}))
export const columns = [
  {
    id: 'deviceId',
    column: 'deviceId',
    name: '设备ID',
    fullName: '设备ID',
    type: 'string',
    dataType: 'string',
    termTypes: terms,
    options: [],
  },
  {
    id: 'properties.temperature',
    column: 'properties.temperature',
    name: '温度',
    fullName: '温度',
    type: 'int',
    dataType: 'int',
    metadata: true,
    termTypes: terms,
    options: [],
  },
  {
    id: 'properties.enabled',
    column: 'properties.enabled',
    name: '开关',
    fullName: '开关',
    type: 'boolean',
    dataType: 'boolean',
    metadata: true,
    termTypes: terms,
    options: { bool: { trueText: '开启', trueValue: true, falseText: '关闭', falseValue: false } },
  },
  { id: 'timestamp', column: 'timestamp', name: '时间', type: 'date', dataType: 'date', termTypes: terms },
]
export const copy = (value) => JSON.parse(JSON.stringify(value))
/** 模拟服务仅保存浏览器实际提交的规则，详情和列表始终读取同一份数据。 */
export function createFixtureBackend() {
  const state = { rules: new Map(), requests: [], saves: [], unexpected: [], failNextSave: false, delayMs: 0 }
  const page = (rows) => ({ data: rows, total: rows.length, pageIndex: 0, pageSize: 20 })
  const filter = (rows, body) => {
    const conditions = (body?.terms || []).flatMap((t) => t.terms || [t])
    return rows.filter((row) =>
      conditions.every(
        (t) =>
          !['id', 'productId', 'product_id', 'name'].includes(t.column) ||
          !t.value ||
          (t.termType === 'like'
            ? String(row[t.column] || '').includes(String(t.value).replaceAll('%', ''))
            : Array.isArray(t.value)
            ? t.value.includes(row[t.column])
            : row[t.column] === t.value),
      ),
    )
  }
  async function handle(method, path, body, query) {
    const request = { method, path, body: copy(body || {}), query: Object.fromEntries(query) }
    state.requests.push(request)
    if (path.endsWith('/_execute')) throw new Error('禁止调用后端执行接口')
    if ((path === '/scene' && method === 'POST') || (/^\/scene\/[^/]+$/.test(path) && method === 'PUT')) {
      if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs))
      if (state.failNextSave) {
        state.failNextSave = false
        return { status: 500, success: false, message: '模拟保存失败' }
      }
      const id = method === 'PUT' ? path.split('/').pop() : `test-scene-${state.rules.size + 1}`
      const value = {
        ...copy(body),
        id,
        state: state.rules.get(id)?.state || { value: 'disable', text: '禁用' },
      }
      state.rules.set(id, value)
      state.saves.push(copy(value))
      return value
    }
    if (path === '/scene/detail/_query' || path === '/scene/_query' || path === '/scene/_query/')
      return page(filter([...state.rules.values()], body))
    if (/^\/scene\/[^/]+\/?$/.test(path) && method === 'GET') return state.rules.get(path.split('/')[2]) || {}
    if (method === 'DELETE' && path.startsWith('/scene/')) {
      state.rules.delete(path.split('/')[2])
      return true
    }
    if (path === '/scene/trigger/supports') return triggerProviders
    if (path === '/scene/action/supports') return actionProviders
    if (path === '/scene/parse-term-column') return columns
    if (path === '/scene/parse-variables') {
      const variables = [
        {
          id: 'scene',
          name: '触发输出的数据',
          fullName: '触发输出的数据',
          children: [
            ...(body?.trigger?.device
              ? [
                  {
                    id: 'scene.deviceId',
                    name: '设备ID',
                    fullName: '触发输出的数据/设备ID',
                    type: 'string',
                    options: { productId: body.trigger.device.productId },
                  },
                ]
              : []),
            { id: 'scene.timestamp', name: '系统时间', type: 'date' },
          ],
        },
      ]
      const branch = body?.branches?.[Number(query.get('branch') || 0)]
      const group = branch?.then?.[Number(query.get('branchGroup') || 0)]
      if (group?.parallel === false && Number(query.get('action')) > 0)
        variables.push({
          id: 'action_0',
          name: '前序动作输出',
          children: [
            { id: 'action_0.deviceId', name: '设备ID', options: { productId: 'p-full' } },
            { id: 'action_0.success', name: '执行是否成功', type: 'boolean' },
          ],
        })
      return variables
    }
    if (path === '/scene/aggregation/supports') return []
    if (path === '/protocol/units') return [{ id: 'celsius', name: '摄氏度', symbol: '℃' }]
    if (path.includes('/category/') && path.includes('tree'))
      return {
        categories: [{ id: 'category-1', name: '测试分类', children: [] }],
        total: products.length,
        unclassified: 2,
      }
    if (/^\/device-product\/[^/]+$/.test(path) && method === 'GET')
      return products.find((p) => p.id === path.split('/').pop()) || {}
    if (path.includes('product') && path.includes('_query'))
      return path.includes('no-paging') ? filter(products, body) : page(filter(products, body))
    if (path.includes('/device/product/') && method === 'GET')
      return products.find((p) => p.id === path.split('/').pop()) || products[0]
    if ((path.includes('device-instance') || path.includes('/device/instance/')) && path.includes('_query'))
      return path.includes('no-paging') ? filter(devices, body) : page(filter(devices, body))
    if (/^\/device-instance\/[^/]+(?:\/detail)?$/.test(path) && method === 'GET')
      return devices.find((d) => d.id === path.split('/')[2]) || {}
    if (path.includes('_count')) return 2
    if (path.includes('group') && path.includes('_query')) return [{ id: 'group-1', name: '测试分组' }]
    if (path.includes('space') && path.includes('_query'))
      return [{ id: 'space-1', name: '测试空间', parentId: '' }]
    if (path === '/device/group/device/_summary/_batch')
      return body.map((item) => ({
        id: item.id,
        deviceCount: filter(devices, item.query).length,
        total: filter(devices, item.query).length,
        online: filter(devices, item.query).length,
      }))
    if (path.includes('organization') && (path.includes('_query') || path.endsWith('/tree')))
      return [{ id: 'org-1', name: '测试组织', children: [] }]
    if (path.includes('/notify/channel/all-for-save'))
      return [
        {
          provider: 'scene',
          id: 'scene',
          name: '场景通知',
          channels: [{ id: 'channel-1', name: '站内通知', channelProvider: 'inside-mail' }],
        },
      ]
    if (path.includes('/notify') && path.includes('user'))
      return page([
        {
          id: 'user-1',
          name: '测试用户',
          username: 'tester',
          email: 'tester@example.test',
          telephone: '13800000000',
        },
      ])
    if (path.includes('calendar')) return [{ id: 'calendar-1', name: '测试日历' }]
    if (path.includes('alarm') && path.includes('_query'))
      return page([{ id: 'alarm-1', name: '测试告警', state: { value: 'enabled', text: '启用' } }])
    if (path.includes('/dictionary')) return []
    if (path.includes('/authorize/me')) return { id: 'user-1', name: '测试用户', permissions: [] }
    if (path.includes('/settings')) return {}
    state.unexpected.push(request)
    throw new Error(`未声明的模拟接口: ${method} ${path}`)
  }
  return { state, handle }
}
