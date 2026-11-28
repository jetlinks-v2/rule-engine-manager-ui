<template>
  <a-select :value="value" :mode="multiple ? 'multiple' : undefined" :placeholder="placeholder" :disabled="disabled"
    :options="resources.items.value.map(item=>({value:item.id,label:item.name}))" :loading="resources.loading.value"
    show-search :filter-option="false" :max-tag-count="'responsive'" style="width:100%" :aria-label="label"
    @change="(value:string|string[])=>emit('change',value)" @search="resources.search" @popupScroll="resources.scroll" @dropdownVisibleChange="resources.open">
    <template #option="option"><div class="resource-option"><span>{{option.label}}</span><small>{{option.value}}</small></div></template>
    <template #notFoundContent><a-spin v-if="resources.loading.value" size="small" /><span v-else>{{ t(resources.error.value ? 'RuleTemplates.resourceFailed' : 'RuleTemplates.noResources') }}</span></template>
  </a-select>
  <span v-if="resources.error.value" class="resource-error" role="status">{{ t('RuleTemplates.resourceFailed') }}<a-button type="link" size="small" @click="resources.load()">{{ t('RuleTemplates.retry') }}</a-button></span>
</template>
<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {useResourceOptions} from './useResourceOptions'
defineProps<{resources:ReturnType<typeof useResourceOptions>;value?:string|string[];multiple?:boolean;placeholder?:string;disabled?:boolean;label:string}>()
const emit=defineEmits<{(event:'change',value:string|string[]):void}>()
const {t}=useI18n()
</script>
<style scoped>.resource-error{display:block;margin-top:6px;color:var(--ink-3);font-size:12px}.resource-option{display:flex;flex-direction:column;min-width:0}.resource-option small{color:var(--ink-3);font-size:12px;overflow:hidden;text-overflow:ellipsis}</style>
