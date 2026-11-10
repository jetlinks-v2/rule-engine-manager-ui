export type DeviceVariable = {
  id: string
  name?: string
  fullName?: string
  description?: string
  options?: { productId?: string }
  children?: DeviceVariable[]
  disabled?: boolean
}

/** 按变量选设备只接受后端标记的同产品设备 ID；保留原始路径和分组供运行时取值。 */
export function selectDeviceVariables(nodes: DeviceVariable[], productId?: string): DeviceVariable[] {
  if (!productId) return []
  return nodes.flatMap<DeviceVariable>(node => {
    if (node.children?.length) {
      const children = selectDeviceVariables(node.children, productId)
      return children.length ? [{ ...node, disabled: true, children }] : []
    }
    return node.options?.productId === productId ? [{ ...node, disabled: false }] : []
  })
}
