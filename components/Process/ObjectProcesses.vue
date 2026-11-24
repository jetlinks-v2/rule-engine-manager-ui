<template><ProcessObjectPanel v-if="canView" :object="object" :api="processApi" :permissions="permissions" /></template>
<script setup lang="ts">
import { computed } from 'vue'
import ProcessObjectPanel from '@jetlinks-web-core/components/Process/ProcessObjectPanel.vue'
import type { ProcessObject } from '@jetlinks-web-core/components/Process/types'
import { useAuthStore } from '@jetlinks-web-core/store'
import { processApi } from '../../api/process'
import { useProcessPermissions } from '../../hook/useProcessPermissions'
defineProps<{object:ProcessObject}>()
const permissions = useProcessPermissions(), auth = useAuthStore()
const canView = computed(() => auth.hasPermission('rule-engine/Process:view'))
</script>
