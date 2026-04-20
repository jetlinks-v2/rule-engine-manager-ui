<template>
  <ProductCountCard
    :configData="configData"
    :typeOptions="typeOptions"
    type="alarmConfigCard"
  />
</template>

<script setup lang="ts" name="AlarmConfigCard">
import ProductCountCard from '../../DeviceManagement/ProductCountCard/Config.vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

const props = defineProps({
  configData: {
    type: Object,
    default: () => ({})
  }
})

const typeOptions = computed(() => [
  {
    value: 'all',
    label: $t('AlarmConfigCard.Config.100004-0'),
    name: $t('AlarmConfigCard.Config.100004-1')
  },
  {
    value: 'normal',
    label: $t('AlarmConfigCard.Config.100004-2'),
    name: $t('AlarmConfigCard.Config.100004-2')
  },
  {
    value: 'disabled',
    label: $t('AlarmConfigCard.Config.100004-3'),
    name: $t('AlarmConfigCard.Config.100004-3')
  }
])
</script>
