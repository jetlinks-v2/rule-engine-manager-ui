<script setup lang="ts">
import RemoteComponent from '@jetlinks-web-core/components/RemoteComponent/index.vue'
import type { DeviceProductSelection } from '@device-manager-ui/deviceScope'

defineOptions({ name: 'SceneDeviceProduct' })
const props = withDefaults(defineProps<{ rowKey?: string; detail?: DeviceProductSelection | Record<string, never> }>(), { rowKey: '', detail: () => ({}) })
const emit = defineEmits<{ 'update:rowKey': [value: string]; 'update:detail': [value: DeviceProductSelection]; change: [value: DeviceProductSelection] }>()
</script>
<template>
  <RemoteComponent remote-name="device-manager-ui" component-name="DeviceProductPicker"
    :component-props="{ rowKey: props.rowKey, detail: props.detail }"
    :component-events="{ 'update:rowKey': (value: string) => emit('update:rowKey', value), 'update:detail': (value: DeviceProductSelection) => emit('update:detail', value), change: (value: DeviceProductSelection) => emit('change', value) }" />
</template>
