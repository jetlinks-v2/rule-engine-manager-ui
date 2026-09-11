/**
 * 场景资源选择与设备列表保持一致，不向用户展示平台代理或媒体接入专用产品。
 */
export const IOT_DEVICE_LIST_EXCLUDED_ACCESS_PROVIDERS = [
  'agent-device-gateway',
  'agent-media-device-gateway',
  'official-edge-gateway',
  'fixed-media',
  'gb28181-2016',
  'media-plugin',
  'onvif',
] as const
