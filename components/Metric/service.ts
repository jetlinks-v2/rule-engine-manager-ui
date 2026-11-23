import type { MetricApi, MetricConfig, MetricContext } from '@jetlinks-web-core/components/Metric/types'
import { copy } from '@jetlinks-web-core/components/Metric/service'

/** 一次新增只生成一个稳定引用位置；保存/启用重试沿用服务端返回的配置。 */
export function createConfig(context: MetricContext): MetricConfig {
  return {
    ownerType: context.ownerType, ownerId: context.ownerId,
    targetType: context.targetType || context.ownerType, targetId: context.targetId || context.ownerId,
    ...(context.inheritance ? { scope: 'children', targetType: context.inheritance.targetType, targetId: '*' } : {}),
    slot: crypto.randomUUID(), templateId: '', templateVersion: '',
    inputMappings: {}, parameters: {}, state: 'disabled', revision: 0
  }
}
export class MetricActivationError extends Error {
  constructor(public readonly configuration: MetricConfig, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'MetricActivationError'
  }
}
/** 先确认持久化，再启用；第二步失败携带已保存身份，不以新增来重试。 */
export async function saveAndActivate(
  api: Pick<MetricApi, 'saveConfig'>, config: MetricConfig, activate: boolean
): Promise<MetricConfig> {
  if (activate && config.id && config.state === 'enabled') return api.saveConfig(copy(config))
  const saved = await api.saveConfig({ ...copy(config), state: 'disabled' })
  if (!activate) return saved
  try { return await api.saveConfig({ ...saved, state: 'enabled' }) }
  catch (error) { throw new MetricActivationError(saved, error) }
}
