import { queryDeviceBoundGroups_api, queryDeviceSpaceAreaBindings_api } from '../../../api/scene-resources'

export async function enrichDeviceOptionData(devices: Record<string, any>[]) {
  const ids = devices.map(device => String(device.id || '')).filter(Boolean)
  if (!ids.length) return devices

  const [areaBindings, groupBindings] = await Promise.all([
    queryDeviceSpaceAreaBindings_api(ids).catch(() => []),
    queryDeviceBoundGroups_api(ids).catch(() => ({})),
  ])
  const areasByDeviceId = areaBindings.reduce<Record<string, typeof areaBindings>>((result, binding) => {
    result[binding.deviceId] = [...(result[binding.deviceId] || []), binding]
    return result
  }, {})

  return devices.map(device => {
    const deviceId = String(device.id || '')
    const areas = areasByDeviceId[deviceId] || []
    const groups = groupBindings[deviceId] || []
    return {
      ...device,
      areaName: areas[0]?.area,
      areaBindings: areas,
      groupName: groups[0]?.name,
      groupBindings: groups.map(group => ({ id: group.id, name: group.name })),
    }
  })
}
