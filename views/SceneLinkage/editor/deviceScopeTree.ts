export type DeviceScope = {
  selector: 'fixed' | 'space' | 'device-group' | 'org' | 'all' | 'tag' | 'context' | 'relation'
  selectorValues: Array<{ value: any; name?: string }>
  options?: { view?: 'space' | 'device-group' | 'org' | 'custom' | 'all' | 'tag' | 'context' | 'relation'; names?: string[]; tagName?: string }
  source?: string
  upperKey?: string
  productId?: string
  productName?: string
}
export type DeviceOption = { id: string; name: string; productId: string; productName: string; spaceName?: string; online: boolean; statusText: string; status: 'success' | 'error' | 'default' }
export type SpaceNode = { key: string; title: string; icon?: string; children?: SpaceNode[] }
export type ScopeMode = DeviceScope['selector']
export const UNBOUND_SPACE_KEY = '__scene-unbound-space__'

export type DeviceScopeModalProps = {
  open: boolean; title: string; width: number; embedded: boolean; detailed: boolean
  multiple: boolean; lockProduct: boolean; scopeModes: ScopeMode[]; disabledScopeModes?: ScopeMode[]; productId: string
  modelValue: DeviceScope; validate?: (device: DeviceOption, scope?: DeviceScope) => boolean | Promise<boolean>
}
export type DeviceScopeEvents = {
  (event: 'cancel'): void
  (event: 'save', value: DeviceScope): void
  (event: 'select-device', value: DeviceOption): void
  (event: 'select-devices', value: DeviceOption[]): void
}

type ScopeCountRequest = { id: string; query: { terms: Array<{ column: string; termType: string; value: unknown }> } }
export const ALL_DEVICES_COUNT_KEY = '__scene-all-devices__'
/** 统计父节点包含子节点的设备并去重；勾选仍保留原生 selectorValues，不展开设备 ID。 */
export function buildScopeCountRequests(mode: ScopeMode, nodes: SpaceNode[]): ScopeCountRequest[] {
  if (['tag', 'context', 'relation'].includes(mode)) return []
  const requests: ScopeCountRequest[] = []
  const visit = (node: SpaceNode): string[] => {
    const ids = [node.key, ...(node.children || []).flatMap(visit)]
    const term = node.key === '' ? undefined : node.key === UNBOUND_SPACE_KEY
      ? { column: 'id', termType: 'space-bind$any$not', value: '__any_space_binding__' }
      : mode === 'org'
        ? { column: 'id', termType: 'dim-assets', value: { assetType: 'device', targets: ids.map(id => ({ type: 'org', id })) } }
        : { column: 'id', termType: mode === 'device-group' ? 'dev-group' : 'space-bind$device', value: ids }
    requests.push({ id: node.key || ALL_DEVICES_COUNT_KEY, query: { terms: term ? [term] : [] } })
    return ids
  }
  nodes.forEach(visit)
  return requests
}

/** 搜索保留命中节点的祖先；命中父节点时保留整棵子树。 */
export function filterScopeTree(nodes: SpaceNode[], keyword: string): SpaceNode[] {
  const text = keyword.trim().toLocaleLowerCase()
  if (!text) return nodes
  return nodes.flatMap(node => {
    if (node.title.toLocaleLowerCase().includes(text)) return [node]
    const children = filterScopeTree(node.children || [], text)
    return children.length ? [{ ...node, children }] : []
  })
}
