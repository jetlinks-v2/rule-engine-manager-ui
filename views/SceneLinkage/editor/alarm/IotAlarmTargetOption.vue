<template>
  <span :class="['iot-target-option', { 'iot-target-option--single-line': singleLine, 'iot-target-option--description-hidden': !showDescription }]">
    <img v-if="showPhoto" class="iot-target-option__image" :src="photoUrl" alt="" @error="handlePhotoError" />
    <span v-else class="iot-target-option__icon"><AIcon :type="iconType" /></span>
    <span class="iot-target-option__content">
      <span class="iot-target-option__heading">
        <a-tooltip :title="option.label">
          <span class="iot-target-option__title">{{ option.label }}</span>
        </a-tooltip>
        <a-badge v-if="isDevice && state.label" :status="state.badge" :text="state.label" />
      </span>
      <a-tooltip
        v-if="showDescription && description"
        :title="description"
        placement="right"
        :overlayStyle="{ pointerEvents: 'none' }"
      >
        <span class="iot-target-option__description">{{ description }}</span>
      </a-tooltip>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  option: { type: Object as PropType<Record<string, any>>, required: true },
  type: { type: String as PropType<'auto' | 'product' | 'device' | 'alarm'>, default: 'auto' },
  singleLine: { type: Boolean, default: false },
  showDescription: { type: Boolean, default: true },
})

const { t } = useI18n()
const data = computed<Record<string, any>>(() => props.option.data || props.option)
const failedPhotoUrl = ref('')
const photoUrl = computed(() => String(data.value.photoUrl || ''))
const showPhoto = computed(() => Boolean(photoUrl.value) && failedPhotoUrl.value !== photoUrl.value)
const isDevice = computed(() => props.type === 'device' || (props.type === 'auto' && Boolean(data.value.productId || data.value.productName || data.value.areaBindings || data.value.groupBindings)))
const isAlarm = computed(() => props.type === 'alarm')
const iconType = computed(() => isAlarm.value ? 'AlertOutlined' : isDevice.value ? 'DeploymentUnitOutlined' : 'AppstoreOutlined')
const detailText = (field: 'manufacturer' | 'model' | 'deviceType' | 'accessName' | 'area' | 'group', value: unknown) =>
  value === undefined || value === null || value === '' ? '' : t(`IotSceneLinkage.optionDetail.${field}`, { value: String(value) })

const state = computed(() => {
  const raw = data.value.state || data.value.status || (data.value.online === true ? 'online' : data.value.online === false ? 'offline' : '')
  const value = String(raw?.value || raw || '')
  const normalized = value === 'notActive' ? 'disabled' : value
  if (!['online', 'offline', 'disabled'].includes(normalized)) return { label: raw?.text || '', badge: 'default' as const }
  return {
    label: t(`IotDeviceMeta.connection.${normalized}`),
    badge: normalized === 'online' ? 'success' as const : normalized === 'disabled' ? 'warning' as const : 'default' as const,
  }
})

const description = computed(() => {
  if (isAlarm.value) return String(data.value.detail || data.value.description || '')
  if (!isDevice.value) {
    return [
      detailText('manufacturer', data.value.manufacturerName || data.value.manufacturer || data.value.vendorName || data.value.vendor),
      detailText('model', data.value.modelName || data.value.model),
      data.value.deviceType?.text || data.value.deviceType,
      data.value.accessName,
    ].filter(Boolean).join(' · ')
  }
  const groupNames = (data.value.groupBindings || data.value.groups || [])
    .map((item: any) => item?.name || item?.text || item)
    .filter(Boolean)
    .join('、')
  return [
    detailText('area', data.value.areaName || data.value.spaceName || data.value.area?.name || data.value.extensions?.spaceName),
    detailText('group', data.value.groupName || data.value.deviceGroupName || data.value.group?.name || groupNames),
  ].filter(Boolean).join(' · ')
})

function handlePhotoError() {
  failedPhotoUrl.value = photoUrl.value
}
</script>

<style scoped>
.iot-target-option { display: flex; gap: var(--space-2, 8px); align-items: center; min-width: 0; width: 100%; padding: var(--space-1, 4px) 0; }
.iot-target-option__image, .iot-target-option__icon { display: grid; flex: none; place-items: center; width: 28px; height: 28px; border-radius: var(--radius-jet-sm, 8px); }
.iot-target-option__image { object-fit: cover; background: var(--ant-color-fill-quaternary); }
.iot-target-option__icon { color: #1e5eff; background: #e8f0ff; font-size: 16px; }
.iot-target-option__content { display: grid; flex: 1; gap: 4px; min-width: 0; line-height: 1.35; }
.iot-target-option__heading { display: flex; gap: 8px; align-items: center; min-width: 0; }
.iot-target-option__title { flex: 1; min-width: 0; overflow: hidden; color: var(--ant-color-text); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.iot-target-option__heading :deep(.ant-badge) { flex: none; margin-left: auto; }
.iot-target-option__heading :deep(.ant-badge-status-text) { color: var(--ant-color-text-secondary); font-size: 12px; font-weight: 400; }
.iot-target-option__description { display: -webkit-box; max-height: 36px; overflow: hidden; color: var(--ant-color-text-tertiary, #86909c) !important; font-size: 12px; font-weight: 400 !important; line-height: 18px; text-overflow: ellipsis; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.iot-target-option--single-line .iot-target-option__content { display: flex; gap: 10px; align-items: center; }
.iot-target-option--single-line .iot-target-option__heading { flex: none; max-width: 42%; }
.iot-target-option--single-line .iot-target-option__description { flex: 1; min-width: 0; width: auto; max-height: 26px; -webkit-line-clamp: 1; }
.iot-target-option--description-hidden .iot-target-option__heading { flex: 1; width: 100%; max-width: none; }
</style>
