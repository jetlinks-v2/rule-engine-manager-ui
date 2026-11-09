<template><AlarmWidget kind="QuickStart" :info="info" :is-edit="isEdit" :style="style" /></template>
<script setup lang="ts">
import AlarmWidget from '../components/AlarmWidget.vue'
import type { StyleValue } from 'vue'
import type { AlarmWidgetInfo } from '../dashboard.types'
withDefaults(defineProps<{ info?: AlarmWidgetInfo; isEdit?: boolean; style?: StyleValue }>(), { isEdit: false })
</script>

