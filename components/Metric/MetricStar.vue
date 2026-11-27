<template>
  <a-tooltip v-if="editable || featured" :title="t(editable ? featured ? 'unfeatureMetric' : 'featureMetric' : 'featuredMetric')">
    <a-button v-if="editable" type="text" size="small" class="metric-star" :class="{'is-featured':featured}" :aria-label="t(featured ? 'unfeatureMetric' : 'featureMetric')" :aria-pressed="featured" :aria-busy="!!busy" :disabled="busy || disabled" @click.stop="$emit('toggle')"><AIcon :type="busy ? 'LoadingOutlined' : featured ? 'StarFilled' : 'StarOutlined'" :spin="!!busy" /></a-button>
    <span v-else class="metric-star is-featured is-readonly" :aria-label="t('featuredMetric')"><AIcon type="StarFilled" /></span>
  </a-tooltip>
</template>
<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {metricMessages} from './messages'
defineProps<{featured:boolean;editable?:boolean;busy?:boolean;disabled?:boolean}>()
defineEmits<{(event:'toggle'):void}>()
const {t}=useI18n({useScope:'local',messages:metricMessages})
</script>
<style scoped>
.metric-star{color:var(--ink-3);flex:none;width:28px;height:28px;min-width:28px;padding:0}.metric-star.is-featured{color:var(--ant-warning-color,#d99a10)}.metric-star.is-readonly{display:inline-flex;align-items:center;justify-content:center}
</style>
