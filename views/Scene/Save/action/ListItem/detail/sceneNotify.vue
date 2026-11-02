<template>
  <span>{{ $t('IotSceneLinkage.action.sendNotify') }}：{{ recipientSummary }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
})
const { t } = useI18n()
const recipientSummary = computed(() => {
  const count = props.data?.configuration?.userIds?.length || 0
  return count ? t('IotSceneLinkage.detailNotify.recipientCount', { count }) : t('IotSceneLinkage.detailNotify.unconfigured')
})
</script>
