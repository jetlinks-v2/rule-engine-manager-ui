/** 规则数据测试禁止访问任何后端；真实 HTTP 链路由浏览器测试负责。 */
export const request = new Proxy({}, { get: () => () => { throw new Error('数据测试不允许调用 HTTP') } })
