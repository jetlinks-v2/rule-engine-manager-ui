import { request } from '@jetlinks-web/core'
import type { ExpressionFunction } from '@jetlinks-web-core/components/Expression/types'

/** 指标宿主声明函数目录；查询权限与本地化均由模板服务负责。 */
export async function metricExpressionFunctions(): Promise<ExpressionFunction[]> {
  const response: { result: ExpressionFunction[]; status?: number; message?: string } = await request.get(
    '/metric/templates/expression/functions', undefined, { hiddenError: true })
  if (response.status && response.status >= 400) throw new Error(response.message || String(response.status))
  return response.result
}
