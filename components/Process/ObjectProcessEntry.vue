<template><a-button v-if="auth.hasPermission('rule-engine/Process:view')" @click="open = true">{{ t('processes') }}</a-button><a-drawer :open="open" :title="t('processes')" width="min(1100px,100vw)" destroy-on-close @close="open = false"><ObjectProcesses :object="object" /></a-drawer></template>
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@jetlinks-web-core/store'
import { processMessages } from '@jetlinks-web-core/components/Process/messages'
import type { ProcessObject } from '@jetlinks-web-core/components/Process'
import ObjectProcesses from './ObjectProcesses.vue'
defineProps<{object:ProcessObject}>()
const { t } = useI18n({useScope:'local',messages:processMessages}), auth = useAuthStore(), open = ref(false)
</script>
