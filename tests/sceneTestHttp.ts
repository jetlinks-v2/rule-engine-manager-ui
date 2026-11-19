/** 规则数据测试禁止访问任何后端；真实 HTTP 链路由浏览器测试负责。 */
type RequestHandler = (method: string, ...args: unknown[]) => unknown
let handler: RequestHandler | undefined
export const setSceneTestRequestHandler = (value?: RequestHandler) => { handler = value }
export const request = new Proxy({}, { get: (_, method) => (...args: unknown[]) => {
  if (handler) return handler(String(method), ...args)
  throw new Error('数据测试不允许调用 HTTP')
} })
