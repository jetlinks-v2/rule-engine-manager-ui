<template><AlarmDashboardConfig :active-component="activeComponent" @change="(value, key) => $emit('change', value, key)" /></template>
<script setup lang="ts">
import AlarmDashboardConfig from '../components/AlarmDashboardConfig.vue'
import type { AlarmWidgetConfig, AlarmWidgetInfo } from '../dashboard.types'
defineProps<{ activeComponent: AlarmWidgetInfo }>()
defineEmits<{ change: [value: AlarmWidgetConfig, key: string] }>()
</script>

